// "Sanitize & Standardize Casing" - rewrites a network's tag/attribute casing to match the
// official Sysmon schema casing, without touching the data itself. The parser (xmlParser.js) is
// deliberately tolerant of mis-cased input so nothing is ever lost on import; this utility is
// the explicit, user-triggered cleanup step for turning that tolerated-but-nonstandard casing
// into schema-correct output.
import { EVENT_TAGS, GLOBAL_TAGS, COMMON_FIELDS_BY_TAG, CONDITIONS, ONMATCH_VALUES } from './eventSchema.js'

const CANONICAL_EVENT_TAGS = Object.fromEntries(Object.keys(EVENT_TAGS).map((t) => [t.toLowerCase(), t]))
const CANONICAL_GLOBAL_TAGS = Object.fromEntries(GLOBAL_TAGS.map((t) => [t.toLowerCase(), t]))
const CANONICAL_FIELDS = Object.fromEntries(
  [...new Set(Object.values(COMMON_FIELDS_BY_TAG).flat())].map((f) => [f.toLowerCase(), f])
)
const CANONICAL_CONDITIONS = Object.fromEntries(CONDITIONS.map((c) => [c.toLowerCase(), c]))

function canonicalTag(tag) {
  return CANONICAL_EVENT_TAGS[tag.toLowerCase()] || tag
}
function canonicalField(field) {
  // Unknown/undocumented fields are left untouched rather than guessed at.
  return CANONICAL_FIELDS[field.toLowerCase()] || field
}
function canonicalCondition(condition) {
  return CANONICAL_CONDITIONS[(condition || 'is').toLowerCase()] || condition
}
function canonicalOnmatch(onmatch) {
  const lower = (onmatch || 'include').toLowerCase()
  return ONMATCH_VALUES.includes(lower) ? lower : onmatch
}
function canonicalGlobalKey(key) {
  return CANONICAL_GLOBAL_TAGS[key.toLowerCase()] || key
}

// HashAlgorithms values are conventionally written in uppercase (MD5,SHA256,IMPHASH) in the
// official docs/examples; normalize casing there too without changing which algorithms are set.
function canonicalHashAlgorithms(value) {
  return value
    .split(',')
    .map((a) => a.trim().toUpperCase())
    .join(',')
}

// Returns { network: <sanitized copy>, changes: string[] } - the caller decides what to do with
// the change list (e.g. show it to the user as confirmation of what was normalized).
export function sanitizeNetwork(network) {
  const changes = []

  const rules = network.rules.map((rule) => {
    const newTag = canonicalTag(rule.eventTag)
    const newOnmatch = canonicalOnmatch(rule.onmatch)
    if (newTag !== rule.eventTag) changes.push(`<${rule.eventTag}> → <${newTag}>`)
    if (newOnmatch !== rule.onmatch) changes.push(`onmatch="${rule.onmatch}" → onmatch="${newOnmatch}"`)

    const filters = rule.filters.map((f) => {
      const newField = canonicalField(f.field)
      const newCondition = canonicalCondition(f.condition)
      if (newField !== f.field) changes.push(`<${f.field}> → <${newField}>`)
      if (newCondition !== f.condition) changes.push(`condition="${f.condition}" → condition="${newCondition}"`)
      return { ...f, field: newField, condition: newCondition }
    })

    return { ...rule, eventTag: newTag, eventIds: EVENT_TAGS[newTag]?.ids || rule.eventIds, onmatch: newOnmatch, filters }
  })

  const globals = {}
  const globalComments = { ...(network.globalComments || {}) }
  for (const [key, value] of Object.entries(network.globals || {})) {
    const newKey = canonicalGlobalKey(key)
    if (newKey !== key) {
      changes.push(`<${key}> → <${newKey}>`)
      if (globalComments[key] !== undefined) {
        globalComments[newKey] = globalComments[key]
        delete globalComments[key]
      }
    }
    const newValue = newKey === 'HashAlgorithms' ? canonicalHashAlgorithms(value) : value
    if (newValue !== value) changes.push(`<HashAlgorithms> value "${value}" → "${newValue}"`)
    globals[newKey] = newValue
  }

  return {
    network: { ...network, rules, globals, globalComments },
    changes: [...new Set(changes)],
  }
}

// "Wrap Loose Rules into RuleGroups" - the parser already auto-wraps every loose/orphaned
// condition it finds into a synthesized, schema-valid rule (never discarding anything) and
// flags it `orphaned: true` so the UI can warn about it. This utility is the explicit,
// user-triggered step that accepts those auto-wrapped rules as permanent: it gives each one a
// descriptive RuleGroup name and clears the `orphaned` flag, so the amber "loose rule" warnings
// go away once an analyst has actually reviewed the best-guess event tag and wrapping.
export function wrapLooseRules(network) {
  const changes = []
  const rules = network.rules.map((rule) => {
    if (!rule.orphaned) return rule
    const groupName = rule.ruleGroupName || `Auto-wrapped ${rule.eventTag} (was loose/orphaned)`
    changes.push(`<${rule.eventTag} onmatch="${rule.onmatch}"> (${rule.filters.length} condition${rule.filters.length === 1 ? '' : 's'}) → wrapped into RuleGroup "${groupName}"`)
    return {
      ...rule,
      orphaned: false,
      ruleGroupName: groupName,
      groupRelation: rule.groupRelation || 'or',
    }
  })
  return {
    network: { ...network, rules },
    changes,
  }
}
