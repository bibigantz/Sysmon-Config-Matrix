// Tolerant, comment-preserving Sysmon XML parser.
//
// Real-world Sysmon configs are frequently messy: inconsistent indentation, tabs mixed with
// spaces, comments dropped anywhere, duplicate/mis-nested tags (we've seen configs that nest
// <EventFiltering><ProcessCreate><ProcessCreate>...), <RuleGroup> wrappers that may or may not
// be present, mixed tag/attribute casing, loose/orphaned conditions with no enclosing event tag,
// and ordering that varies between tools that generated them. Rather than relying on a fixed
// depth or exact casing, this walks the parsed tree recursively (in document order, via
// fast-xml-parser's `preserveOrder` mode) and pulls out every recognizable event rule and every
// comment wherever they are found, recording a warning any time it has to compensate for
// something odd.
//
// Comments are reattached to the rule/filter/global-option they most likely document. Real
// configs mix two styles: a comment on its *own line* almost always documents whatever comes
// *after* it ("<!-- Event ID 3: Network Connection -->\n<NetworkConnect>..."), while a comment
// glued onto the end of the *same line* as the previous tag documents that previous tag
// ("<DestinationPort>443</DestinationPort><!-- catches C2 on 443 -->"). We can't tell those
// apart from the parsed tree alone (both are just "a comment node"), so a quick pre-pass over
// the raw text records, for every comment in the document, whether anything but whitespace
// precedes it on its line - that's what `groupAndAttachComments` uses to pick a direction.
//
// Loose / orphaned rule handling (see requirements/schema-notes.md for the full writeup):
// Some hand-edited or copy-pasted configs end up with filter condition tags (<Image
// condition="contains">...) with no enclosing event tag at all, non-standard <Include>/<Exclude>
// wrapper tags (not real Sysmon syntax - onmatch is an attribute, not a wrapper element), or
// otherwise well-formed event tags sitting outside <EventFiltering> entirely. None of these are
// dropped: loose filter conditions are grouped into a synthesized rule (best-guess event tag,
// inferred from which known tag's documented fields they match), and anything found outside its
// expected structural position is kept and flagged `orphaned: true` so the UI can surface it and
// the "Wrap Loose Rules into RuleGroups" sanitizer action can clean it up on request.

import { XMLParser } from 'fast-xml-parser'
import { EVENT_TAGS, GLOBAL_TAGS, COMMON_FIELDS_BY_TAG } from './eventSchema.js'
import { suggestMitreTechniques } from './mitreMap.js'

const EVENT_TAG_LOOKUP = Object.fromEntries(Object.keys(EVENT_TAGS).map((t) => [t.toLowerCase(), t]))
const GLOBAL_TAG_LOOKUP = Object.fromEntries(GLOBAL_TAGS.map((t) => [t.toLowerCase(), t]))

function resolveEventTag(tag) {
  return EVENT_TAG_LOOKUP[tag.toLowerCase()]
}
function resolveGlobalTag(tag) {
  return GLOBAL_TAG_LOOKUP[tag.toLowerCase()]
}
function isIncludeExcludeWrapper(tag) {
  return /^include$|^exclude$/i.test(tag)
}

// Reverse index: field name (lowercase) -> every known event tag that documents it, so a loose
// filter run with no enclosing tag can be matched back to the most likely event type.
const FIELD_TO_TAGS = (() => {
  const map = {}
  for (const [tag, fields] of Object.entries(COMMON_FIELDS_BY_TAG)) {
    for (const field of fields) {
      const key = field.toLowerCase()
      if (!map[key]) map[key] = []
      map[key].push(tag)
    }
  }
  return map
})()

// Best-effort guess at which event tag a group of loose/orphaned fields belongs to: whichever
// known tag documents the most of them. Always resolves to a real EVENT_TAGS key (never leaves
// an orphaned rule with no tag at all) so it still has a home in the Matrix View; ties fall back
// to EVENT_TAGS' own (ProcessCreate-first) key order for a deterministic, sensible default.
function guessEventTagForFields(fieldNames) {
  const votes = new Map()
  for (const field of fieldNames) {
    for (const tag of FIELD_TO_TAGS[field.toLowerCase()] || []) {
      votes.set(tag, (votes.get(tag) || 0) + 1)
    }
  }
  let best = 'ProcessCreate'
  let bestScore = 0
  for (const tag of Object.keys(EVENT_TAGS)) {
    const score = votes.get(tag) || 0
    if (score > bestScore) {
      bestScore = score
      best = tag
    }
  }
  return best
}

let ruleCounter = 0
function nextId(prefix) {
  ruleCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${ruleCounter}`
}

function buildParser() {
  return new XMLParser({
    // NB: do not set attributesGroupName explicitly - ':@' is already the library's default
    // grouping key in preserveOrder mode, and setting it again double-wraps attributes
    // (node[':@'][':@'] instead of node[':@']), which silently breaks every attribute read.
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    commentPropName: '#comment',
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
    ignoreDeclaration: true,
  })
}

// For every `<!--` in the raw document, in order, records whether it starts its own line
// (nothing but spaces/tabs between the previous newline and it) - see note above.
function computeCommentOwnLineFlags(xmlText) {
  const flags = []
  const re = /<!--/g
  let m
  while ((m = re.exec(xmlText))) {
    let i = m.index - 1
    while (i >= 0 && (xmlText[i] === ' ' || xmlText[i] === '\t')) i -= 1
    flags.push(i < 0 || xmlText[i] === '\n' || xmlText[i] === '\r')
  }
  return flags
}

// --- preserveOrder tree helpers --------------------------------------------------------------
// Every node in a preserveOrder tree is `{ [tagName]: children[], ':@'?: attrs }`, except
// comment nodes which are `{ '#comment': [{'#text': '...'}] }` and text leaves `{'#text': '...'}`.

function nodeTag(node) {
  return Object.keys(node).find((k) => k !== ':@')
}
function getAttrs(node) {
  return node[':@'] || {}
}
function attrCI(attrs, name) {
  const key = Object.keys(attrs).find((k) => k.toLowerCase() === `@_${name}`.toLowerCase())
  return key ? attrs[key] : undefined
}
function isComment(node) {
  return nodeTag(node) === '#comment'
}
function commentText(node) {
  return (node['#comment'] || [])
    .map((c) => c['#text'] ?? '')
    .join('')
    .trim()
}
function isFilterLeaf(children) {
  return Array.isArray(children) && children.every((c) => nodeTag(c) === '#text')
}
function getTextValue(children) {
  return (children || [])
    .filter((c) => nodeTag(c) === '#text')
    .map((c) => c['#text'])
    .join('')
}

// Splits a children array into { node, leading, trailing } items. Each comment is attached as
// a trailing note on the preceding sibling only if it's a same-line inline comment (per
// `flagsCtx`); otherwise (the common case) it's carried forward as a leading note on whatever
// follows. Comments with nothing to attach to on either side (an element that is 100% comments)
// are returned separately as `dangling` so they are never silently discarded.
function groupAndAttachComments(children, flagsCtx) {
  const items = []
  const dangling = []
  let carryLeading = null

  for (const child of children) {
    if (isComment(child)) {
      const ownLine = flagsCtx.flags[flagsCtx.cursor] ?? true
      flagsCtx.cursor += 1
      const text = commentText(child)
      if (!text) continue
      if (!ownLine && items.length) {
        const last = items[items.length - 1]
        last.trailing = last.trailing ? `${last.trailing}\n${text}` : text
      } else {
        carryLeading = carryLeading ? `${carryLeading}\n${text}` : text
      }
    } else {
      items.push({ node: child, leading: carryLeading, trailing: null })
      carryLeading = null
    }
  }
  if (carryLeading) dangling.push(carryLeading)
  return { items, dangling }
}

function joinComment(...parts) {
  const joined = parts.filter(Boolean).join('\n')
  return joined || null
}

// Builds the synthesized rule for a run of loose/orphaned filter conditions found with no
// enclosing event tag (grouping, in `context`'s inherited onmatch - from a <RuleGroup>, or from
// a non-standard <Include>/<Exclude> wrapper, if any - and a best-guess event tag).
function synthesizeOrphanRule(looseRun, context, warnings) {
  const guessedTag = guessEventTagForFields(looseRun.map((f) => f.field))
  const onmatch = (context.inheritedOnmatch || 'include').toLowerCase()
  warnings.push(
    `Found ${looseRun.length} loose/orphaned filter condition(s) with no enclosing event tag - auto-wrapped as <${guessedTag} onmatch="${onmatch}">. Use "Wrap Loose Rules into RuleGroups" to confirm and clean this up.`
  )
  return {
    id: nextId('rule'),
    eventTag: guessedTag,
    eventIds: EVENT_TAGS[guessedTag].ids,
    onmatch,
    ruleGroupName: context.ruleGroupName || null,
    groupRelation: context.groupRelation || 'or',
    filters: looseRun,
    comment: null,
    mitre: suggestMitreTechniques(guessedTag, looseRun),
    manualMitre: [],
    disabled: false,
    orphaned: true,
  }
}

// Processes exactly one { node, leading, trailing } item and returns whatever it contributed:
// fully-formed rules, filters that belong to an enclosing event tag (only when `expectFilters` is
// true), or - when a bare filter condition is found with `expectFilters` false - a single
// `looseFilter` for the caller to accumulate into a run (see walkChildren).
function processNode(item, context, warnings, depth, flagsCtx, expectFilters) {
  const { node, leading, trailing } = item
  const tag = nodeTag(node)
  const empty = { rules: [], filters: [], dangling: [], looseFilter: null }
  if (!tag || tag === '#text') return empty
  const ownComment = joinComment(leading, trailing)
  const kids = node[tag]
  const attrs = getAttrs(node)
  const rules = []
  const filters = []
  const dangling = []

  // Non-standard <Include>/<Exclude> wrapper tags: not real Sysmon syntax (onmatch is an
  // attribute on the event tag itself, not a separate wrapper element), but real-world/hand-
  // edited configs do sometimes have them. Treat the wrapper as implying onmatch for anything
  // inside it, and flag everything nested as orphaned/loose regardless of how well-formed it is.
  if (isIncludeExcludeWrapper(tag)) {
    warnings.push(`Found a non-standard <${tag}> wrapper tag (not valid Sysmon syntax - onmatch belongs on the event tag itself) - its contents were extracted and flagged as orphaned/loose.`)
    const nextContext = { ...context, inheritedOnmatch: tag.toLowerCase(), orphaned: true }
    const sub = walkChildren(kids, nextContext, warnings, depth + 1, flagsCtx, false)
    rules.push(...sub.rules)
    if (ownComment) dangling.push(ownComment)
    dangling.push(...sub.dangling)
    return { rules, filters, dangling, looseFilter: null }
  }

  if (tag === 'RuleGroup') {
    const nextContext = {
      ...context,
      ruleGroupName: attrs['@_name'] || context.ruleGroupName || null,
      groupRelation: attrCI(attrs, 'groupRelation') || context.groupRelation || 'or',
    }
    const sub = walkChildren(kids, nextContext, warnings, depth + 1, flagsCtx, false)
    rules.push(...sub.rules)
    filters.push(...sub.filters)
    if (ownComment) dangling.push(ownComment)
    dangling.push(...sub.dangling)
    return { rules, filters, dangling, looseFilter: null }
  }

  if (tag === 'Rule') {
    // Per-event <Rule groupRelation="and|or"> sub-grouping of conditions. We flatten its
    // conditions into the parent rule rather than modeling AND/OR condition trees separately.
    // Propagates expectFilters unchanged: inside an event tag, its conditions are legitimate;
    // outside one, they're still orphaned, same as everything else at that level.
    const sub = walkChildren(kids, context, warnings, depth + 1, flagsCtx, expectFilters)
    filters.push(...sub.filters)
    rules.push(...sub.rules)
    if (ownComment) dangling.push(ownComment)
    dangling.push(...sub.dangling)
    return { rules, filters, dangling, looseFilter: null }
  }

  const canonicalTag = resolveEventTag(tag)
  if (canonicalTag) {
    if (canonicalTag !== tag) {
      warnings.push(`Tag <${tag}> has non-standard casing (expected <${canonicalTag}>) - values were kept as-is. Use "Sanitize & Standardize Casing" to normalize.`)
    }
    const onmatchRaw = attrCI(attrs, 'onmatch')
    const onmatch = (onmatchRaw || context.inheritedOnmatch || 'include').toLowerCase()
    const sub = walkChildren(kids, context, warnings, depth + 1, flagsCtx, true)
    const comment = joinComment(ownComment, ...sub.dangling)
    rules.push({
      id: nextId('rule'),
      eventTag: canonicalTag,
      eventIds: EVENT_TAGS[canonicalTag].ids,
      onmatch,
      ruleGroupName: context.ruleGroupName || null,
      groupRelation: context.groupRelation || null,
      filters: sub.filters,
      comment,
      mitre: suggestMitreTechniques(canonicalTag, sub.filters),
      manualMitre: [],
      disabled: false,
      orphaned: !!context.orphaned,
    })
    if (sub.rules.length) {
      warnings.push(`Found rule(s) nested inside <${tag}> (malformed structure) - they were still extracted as separate rules.`)
      rules.push(...sub.rules)
    }
    return { rules, filters, dangling, looseFilter: null }
  }

  if (isFilterLeaf(kids)) {
    const filterObj = {
      field: tag,
      condition: (attrCI(attrs, 'condition') || 'is').toLowerCase(),
      value: getTextValue(kids),
      comment: ownComment,
    }
    if (expectFilters) {
      filters.push(filterObj)
      return { rules, filters, dangling, looseFilter: null }
    }
    // No enclosing event tag at this level - hand back to the caller to accumulate into a run
    // (several consecutive loose fields are almost always meant to be one rule) rather than
    // synthesizing a separate one-filter rule per field.
    return { rules, filters, dangling, looseFilter: filterObj }
  }

  // Unknown wrapper (e.g. a malformed duplicated <EventFiltering>) - descend and bubble up
  // whatever is found inside rather than dropping it.
  const sub = walkChildren(kids, context, warnings, depth + 1, flagsCtx, expectFilters)
  rules.push(...sub.rules)
  filters.push(...sub.filters)
  if (ownComment) dangling.push(ownComment)
  dangling.push(...sub.dangling)
  return { rules, filters, dangling, looseFilter: null }
}

// Recursively walks an EventFiltering (or RuleGroup/Rule/malformed-wrapper) subtree in document
// order, returning every rule and filter found anywhere inside it. `expectFilters` is true only
// while directly inside an already-resolved event tag's own children - that's the one place a
// bare filter condition is legitimate; everywhere else, consecutive bare filters are grouped and
// synthesized into an orphaned rule instead of being discarded.
function walkChildren(childrenArray, context, warnings, depth, flagsCtx, expectFilters = false) {
  if (depth > 16 || !Array.isArray(childrenArray)) return { rules: [], filters: [], dangling: [] }
  const { items, dangling } = groupAndAttachComments(childrenArray, flagsCtx)
  const rules = []
  const filters = []
  let looseRun = []

  for (const item of items) {
    const result = processNode(item, context, warnings, depth, flagsCtx, expectFilters)
    if (result.looseFilter) {
      looseRun.push(result.looseFilter)
      continue
    }
    if (looseRun.length) {
      rules.push(synthesizeOrphanRule(looseRun, context, warnings))
      looseRun = []
    }
    rules.push(...result.rules)
    filters.push(...result.filters)
    dangling.push(...result.dangling)
  }
  if (looseRun.length) {
    rules.push(synthesizeOrphanRule(looseRun, context, warnings))
  }

  return { rules, filters, dangling }
}

function extractSysmonLevel(sysmonChildren, warnings, flagsCtx) {
  const { items } = groupAndAttachComments(sysmonChildren, flagsCtx)
  const globals = {}
  const globalComments = {}
  const rules = []
  let eventFilteringCount = 0

  for (const item of items) {
    const { node, leading, trailing } = item
    const tag = nodeTag(node)
    if (!tag || tag === '#text') continue
    const comment = joinComment(leading, trailing)

    const canonicalGlobal = resolveGlobalTag(tag)
    if (canonicalGlobal) {
      if (canonicalGlobal !== tag) {
        warnings.push(`Tag <${tag}> has non-standard casing (expected <${canonicalGlobal}>). Use "Sanitize & Standardize Casing" to normalize.`)
      }
      globals[canonicalGlobal] = getTextValue(node[tag])
      if (comment) globalComments[canonicalGlobal] = comment
      continue
    }

    if (tag.toLowerCase() === 'eventfiltering') {
      eventFilteringCount += 1
      if (comment) globalComments.EventFiltering = joinComment(globalComments.EventFiltering, comment)
      const sub = walkChildren(node[tag], {}, warnings, 0, flagsCtx, false)
      rules.push(...sub.rules)
      continue
    }

    // A rule-shaped tag (event tag, RuleGroup, Rule, or a non-standard Include/Exclude wrapper)
    // sitting directly under <Sysmon>, outside any <EventFiltering> - still extract it rather
    // than silently dropping it, flagged as orphaned/loose.
    const looksLikeRuleContent = Boolean(resolveEventTag(tag)) || tag === 'RuleGroup' || tag === 'Rule' || isIncludeExcludeWrapper(tag)
    if (looksLikeRuleContent) {
      warnings.push(`Found <${tag}> directly under <Sysmon>, outside <EventFiltering> - it was still extracted and flagged as orphaned/loose.`)
      const result = processNode(item, { orphaned: true }, warnings, 0, flagsCtx, false)
      rules.push(...result.rules)
      continue
    }
  }

  if (eventFilteringCount === 0) warnings.push('No <EventFiltering> block found - this config only sets global options.')
  if (eventFilteringCount > 1) warnings.push(`Found ${eventFilteringCount} top-level <EventFiltering> blocks (duplicated); all were merged.`)

  return { globals, globalComments, rules }
}

export function parseSysmonConfig(xmlText, meta = {}) {
  const warnings = []
  const parser = buildParser()
  let rootArray
  try {
    rootArray = parser.parse(xmlText)
  } catch (err) {
    return { error: `XML failed to parse: ${err.message}`, warnings, rawXml: xmlText }
  }

  const flagsCtx = { flags: computeCommentOwnLineFlags(xmlText), cursor: 0 }
  const { items: rootItems } = groupAndAttachComments(rootArray, flagsCtx)
  const sysmonItem = rootItems.find((it) => nodeTag(it.node).toLowerCase() === 'sysmon')
  if (!sysmonItem) {
    return { error: 'No <Sysmon> root element found.', warnings, rawXml: xmlText }
  }

  const sysmonTag = nodeTag(sysmonItem.node)
  const attrs = getAttrs(sysmonItem.node)
  const schemaversion = attrCI(attrs, 'schemaversion') || null
  const { globals, globalComments, rules } = extractSysmonLevel(sysmonItem.node[sysmonTag], warnings, flagsCtx)

  return {
    schemaversion,
    globals,
    globalComments,
    rules,
    warnings,
    headerComment: sysmonItem.leading || null,
    rawXml: xmlText,
    byteSize: xmlText.length,
    ...meta,
  }
}
