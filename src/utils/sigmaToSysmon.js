// Translates a parsed Sigma rule (see sigmaParser.js) into one or more candidate Sysmon filter
// sets ("branches"), each independently sufficient to catch the behavior the Sigma rule detects.
//
// Scope/approximations (flagged via `warnings`, same philosophy as xmlParser.js/mitreMap.js -
// nothing is silently dropped, but exotic cases are approximated rather than fully modeled):
//   - The `detection.condition` boolean expression supports the common Sigma grammars: a bare
//     selection name, "and"/"or" chains, "not <selection>", and "1 of x*" / "all of x*" / "of
//     them" wildcards. Arbitrary parenthesized nesting is not parsed - parens are stripped only
//     when they wrap the whole expression.
//   - A selection block's fields are ANDed into one rule (matching how this app's own XML parser
//     already flattens <Rule> sub-grouping into its parent rather than modeling AND/OR trees -
//     see xmlParser.js). "selection and not filter" maps naturally onto Sysmon's onmatch
//     include/exclude pair.
//   - Regex (`|re`), base64, and a handful of other modifiers have no native Sysmon filter
//     equivalent; they're approximated (regex -> contains on the raw pattern) or skipped, always
//     with a warning.
import { EVENT_TAGS, TAG_BY_EVENT_ID } from './eventSchema.js'
import { FIELD_ALIASES, FORCE_CONTAINS_FIELDS, MODIFIER_CONDITION, UNSUPPORTED_MODIFIERS, LOGSOURCE_TO_EVENTTAG } from './sigmaMapping.js'

function resolveEventTag(logsource, selectionValues) {
  const category = String(logsource.category || '').toLowerCase().trim()
  const product = String(logsource.product || '').toLowerCase().trim()
  const service = String(logsource.service || '').toLowerCase().trim()

  if (category && LOGSOURCE_TO_EVENTTAG[category]) {
    const eventTag = LOGSOURCE_TO_EVENTTAG[category]
    return { eventTag, eventIds: EVENT_TAGS[eventTag].ids }
  }

  if (!category && (service === 'sysmon' || product === 'windows')) {
    for (const sel of selectionValues) {
      const maps = Array.isArray(sel) ? sel : [sel]
      for (const m of maps) {
        if (!m || typeof m !== 'object' || Array.isArray(m)) continue
        for (const key of Object.keys(m)) {
          if (key.split('|')[0].toLowerCase() === 'eventid') {
            const raw = Array.isArray(m[key]) ? m[key][0] : m[key]
            const id = parseInt(raw, 10)
            const tag = TAG_BY_EVENT_ID[id]
            if (tag) return { eventTag: tag, eventIds: EVENT_TAGS[tag].ids }
          }
        }
      }
    }
  }
  return null
}

function splitFieldKey(key) {
  const parts = key.split('|')
  return { field: parts[0], modifiers: parts.slice(1).map((m) => m.toLowerCase()) }
}

// Infers a Sysmon condition from a bare (unmodified) Sigma value's wildcard shape: Sigma allows
// `*` wildcards with no explicit modifier, e.g. `Image: '*\mimikatz.exe'`.
function wildcardCondition(raw) {
  const v = String(raw)
  if (!v.includes('*')) return { condition: 'is', value: v }
  const leading = v.startsWith('*')
  const trailing = v.endsWith('*') && v.length > 1
  const stripped = v.replace(/^\*/, '').replace(/\*$/, '')
  if (leading && trailing) return { condition: 'contains', value: stripped }
  if (leading) return { condition: 'end with', value: stripped }
  if (trailing) return { condition: 'begin with', value: stripped }
  // Wildcard only in the middle: Sysmon has no mid-string wildcard condition, so approximate with
  // "contains" on the longest literal segment either side of the wildcard.
  const segments = v.split('*').filter(Boolean).sort((a, b) => b.length - a.length)
  return { condition: 'contains', value: segments[0] || v }
}

const ANY_VARIANT = { is: 'is any', contains: 'contains any', excludes: 'excludes any' }

// Sysmon only has a "<cond> any" (';'-separated alternatives) form for is/contains/excludes -
// there is no "begin with any" / "end with any" / "more than any". Joining multiple OR'd values
// into one "end with" filter's value would silently produce a filter that can never match (it'd
// require the string to end with the literal joined blob). Broadening to "contains any" instead
// keeps every alternative catchable - less precise than the original Sigma rule, but never
// silently wrong - and is always flagged via `warnings`.
function anyVariantOrFallback(condition, field, warnings) {
  if (ANY_VARIANT[condition]) return ANY_VARIANT[condition]
  warnings.push(`Field "${field}": Sysmon has no "${condition} any" condition for matching a list of values - broadened to "contains any" (substring match) so every alternative is still caught; this is less precise than the original Sigma rule.`)
  return 'contains any'
}

function valueToFilters(field, modifiers, rawValue, warnings) {
  const aliasField = FIELD_ALIASES[field.toLowerCase()]
  const targetField = aliasField || field
  const forceContains = !!aliasField && FORCE_CONTAINS_FIELDS.has(field.toLowerCase())

  for (const m of modifiers) {
    if (UNSUPPORTED_MODIFIERS.has(m)) {
      warnings.push(`Field "${field}": modifier "${m}" has no native Sysmon equivalent - approximated using the remaining modifiers/value as-is.`)
    }
  }

  if (modifiers.includes('base64') || modifiers.includes('base64offset')) {
    warnings.push(`Field "${field}": the "base64" modifier can't be decoded into a static Sysmon filter value - this condition was skipped.`)
    return []
  }

  const hasRe = modifiers.includes('re')
  const hasAll = modifiers.includes('all')
  const baseModifier = modifiers.find((m) => MODIFIER_CONDITION[m])
  const values = Array.isArray(rawValue) ? rawValue : [rawValue]
  const stringValues = values.map((v) => (v == null ? '' : String(v)))

  if (forceContains) {
    return stringValues.map((v) => ({ field: targetField, condition: 'contains', value: v }))
  }

  if (hasRe) {
    warnings.push(`Field "${field}": "re" (regex) modifier has no native Sysmon equivalent - approximated with "contains" on the raw pattern; verify manually.`)
    return stringValues.map((v) => ({ field: targetField, condition: 'contains', value: v }))
  }

  const resolveWildcards = !baseModifier
  const condition = baseModifier ? MODIFIER_CONDITION[baseModifier] : null

  if (values.length > 1) {
    if (hasAll) {
      // AND semantics: emit one filter per value - filters within one Sysmon rule tag are
      // already treated as ANDed throughout this app (see xmlParser.js's <Rule> flattening note).
      if (condition === 'contains') return stringValues.map((v) => ({ field: targetField, condition: 'contains', value: v }))
      return stringValues.map((v) => {
        const resolved = resolveWildcards ? wildcardCondition(v) : { condition, value: v }
        return { field: targetField, condition: resolved.condition, value: resolved.value }
      })
    }
    // OR semantics (default for a Sigma value list): Sysmon's "<condition> any" variants expect
    // a single filter whose value is a ';'-separated list of alternatives.
    if (resolveWildcards) {
      const shapes = stringValues.map(wildcardCondition)
      const firstCond = shapes[0].condition
      if (shapes.some((s) => s.condition !== firstCond)) {
        warnings.push(`Field "${field}": list values use inconsistent wildcard patterns (mixed begin/end/contains) - approximated using "${firstCond}" for every value.`)
      }
      return [{ field: targetField, condition: anyVariantOrFallback(firstCond, field, warnings), value: shapes.map((s) => s.value).join(';') }]
    }
    return [{ field: targetField, condition: anyVariantOrFallback(condition, field, warnings), value: stringValues.join(';') }]
  }

  const v = stringValues[0]
  if (resolveWildcards) {
    const shape = wildcardCondition(v)
    return [{ field: targetField, condition: shape.condition, value: shape.value }]
  }
  return [{ field: targetField, condition, value: v }]
}

function mapToFilters(map, warnings) {
  const filters = []
  for (const [rawKey, rawValue] of Object.entries(map)) {
    const { field, modifiers } = splitFieldKey(rawKey)
    if (field.toLowerCase() === 'eventid') continue // metadata only - implied by the eventTag itself, not a filterable Sysmon field
    filters.push(...valueToFilters(field, modifiers, rawValue, warnings))
  }
  return filters
}

// Returns an array of OR-alternative filter arrays for one selection block: usually exactly one
// (a plain field map), but a Sigma selection can itself be a list of maps (OR'd alternatives).
function selectionToFilterBranches(selectionValue, warnings) {
  if (selectionValue == null) return [[]]
  if (Array.isArray(selectionValue)) {
    if (selectionValue.every((v) => v && typeof v === 'object' && !Array.isArray(v))) {
      return selectionValue.map((v) => mapToFilters(v, warnings))
    }
    warnings.push('A selection used a plain keyword list (no field names) - approximated as a "CommandLine contains" check for each value; review manually.')
    return [selectionValue.map((v) => ({ field: 'CommandLine', condition: 'contains', value: String(v) }))]
  }
  if (typeof selectionValue === 'object') return [mapToFilters(selectionValue, warnings)]
  return [[]]
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function expandWildcardNames(token, selectionNames) {
  if (token.toLowerCase() === 'them') return selectionNames
  if (!token.includes('*')) return [token]
  const re = new RegExp(`^${token.split('*').map(escapeRegExp).join('.*')}$`, 'i')
  const matches = selectionNames.filter((n) => re.test(n))
  return matches.length ? matches : [token]
}

// Resolves detection.condition into a flat list of OR-branches, each `{ positive, negative }`
// naming the selections that must (positive) or must not (negative) match for that branch to
// fire. See the module header for the subset of Sigma condition grammar this supports.
export function resolveConditionBranches(conditionStr, selectionNames, warnings) {
  let cond = conditionStr.trim()
  while (cond.startsWith('(') && cond.endsWith(')')) cond = cond.slice(1, -1).trim()

  const ofMatch = cond.match(/^(1|all)\s+of\s+(.+)$/i)
  if (ofMatch) {
    const [, qty, pat] = ofMatch
    const names = expandWildcardNames(pat.trim(), selectionNames)
    if (qty.toLowerCase() === 'all') return [{ positive: names, negative: [] }]
    return names.map((n) => ({ positive: [n], negative: [] }))
  }

  if (/\s+or\s+/i.test(cond)) {
    return cond.split(/\s+or\s+/i).flatMap((p) => resolveConditionBranches(p, selectionNames, warnings))
  }

  const positive = []
  const negative = []
  for (const part of cond.split(/\s+and\s+/i).map((p) => p.trim()).filter(Boolean)) {
    const notMatch = part.match(/^not\s+(.+)$/i)
    if (notMatch) {
      negative.push(...expandWildcardNames(notMatch[1].trim(), selectionNames))
      continue
    }
    const nestedOf = part.match(/^(1|all)\s+of\s+(.+)$/i)
    if (nestedOf) {
      const names = expandWildcardNames(nestedOf[2].trim(), selectionNames)
      if (nestedOf[1].toLowerCase() === 'all') {
        positive.push(...names)
      } else {
        positive.push(names[0])
        if (names.length > 1) warnings.push(`Condition term "${part}" ("1 of ...") inside an AND was approximated using only "${names[0]}" - review manually.`)
      }
      continue
    }
    positive.push(...expandWildcardNames(part, selectionNames))
  }
  return [{ positive, negative }]
}

// Returns { error, warnings, eventTag, eventIds, branches }. Each branch is
// `{ include: {eventTag, eventIds, onmatch:'include', filters} | null, excludes: [...same shape, onmatch:'exclude'] }`.
export function translateSigmaToSysmon(sigmaRule) {
  const warnings = []
  const empty = { error: null, warnings, eventTag: null, eventIds: [], branches: [] }
  if (!sigmaRule || !sigmaRule.detection) return { ...empty, error: 'Sigma rule has no detection: block.' }

  const detection = sigmaRule.detection
  const selectionNames = Object.keys(detection).filter((k) => k !== 'condition')
  if (!selectionNames.length) return { ...empty, error: 'detection: block has no selection definitions.' }

  const resolved = resolveEventTag(sigmaRule.logsource || {}, selectionNames.map((n) => detection[n]))
  if (!resolved) {
    return { ...empty, error: `Could not map logsource ${JSON.stringify(sigmaRule.logsource || {})} to a Sysmon event type - this Sigma rule may target a non-Sysmon log source (e.g. Windows Security log, PowerShell logging).` }
  }
  const { eventTag, eventIds } = resolved

  const filtersBySelection = {}
  for (const name of selectionNames) {
    filtersBySelection[name] = selectionToFilterBranches(detection[name], warnings)
  }

  const conditionStr = detection.condition ? String(detection.condition) : selectionNames[0]
  const orBranches = resolveConditionBranches(conditionStr, selectionNames, warnings)

  const branches = []
  for (const ob of orBranches) {
    let positiveFilters = []
    for (const selName of ob.positive) {
      const subBranches = filtersBySelection[selName]
      if (!subBranches || !subBranches.length) {
        warnings.push(`Selection "${selName}" referenced in condition but has no translatable fields - skipped.`)
        continue
      }
      if (subBranches.length > 1) warnings.push(`Selection "${selName}" has multiple internal alternatives (list-of-maps) - only the first was used; review manually.`)
      positiveFilters = positiveFilters.concat(subBranches[0])
    }

    const excludes = []
    for (const selName of ob.negative) {
      const subBranches = filtersBySelection[selName]
      if (!subBranches || !subBranches.length) {
        warnings.push(`Negated selection "${selName}" has no translatable fields - skipped.`)
        continue
      }
      excludes.push({ eventTag, eventIds, onmatch: 'exclude', filters: subBranches[0] })
    }

    branches.push({
      include: { eventTag, eventIds, onmatch: 'include', filters: positiveFilters },
      excludes,
    })
  }

  return { error: null, warnings, eventTag, eventIds, branches }
}
