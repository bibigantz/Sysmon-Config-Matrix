// Operations for the Global Rule Injector: building a rule from the form builder or raw XML,
// and detecting duplicate/conflicting rules already present in target networks before applying.
import { EVENT_TAGS } from './eventSchema.js'
import { parseSysmonConfig } from './xmlParser.js'
import { suggestMitreTechniques } from './mitreMap.js'

let counter = 0
function nextId() {
  counter += 1
  return `rule-${Date.now().toString(36)}-${counter}`
}

export function createRuleFromForm({ eventTag, onmatch, filters }) {
  if (!EVENT_TAGS[eventTag]) throw new Error(`Unknown event tag: ${eventTag}`)
  const cleanFilters = filters.filter((f) => f.field && f.value !== '').map((f) => ({ ...f, comment: null }))
  return {
    id: nextId(),
    eventTag,
    eventIds: EVENT_TAGS[eventTag].ids,
    onmatch,
    ruleGroupName: null,
    groupRelation: null,
    comment: null,
    filters: cleanFilters,
    mitre: suggestMitreTechniques(eventTag, cleanFilters),
    manualMitre: [],
    disabled: false,
    orphaned: false,
  }
}

// Parses a raw <ProcessCreate onmatch="exclude">...</ProcessCreate> style snippet (or several
// concatenated) by wrapping it in a minimal Sysmon/EventFiltering shell, then returns the
// extracted rules.
export function parseRawSnippet(xmlSnippet) {
  const wrapped = `<Sysmon schemaversion="4.90"><EventFiltering>${xmlSnippet}</EventFiltering></Sysmon>`
  const result = parseSysmonConfig(wrapped)
  if (result.error) return { error: result.error, rules: [] }
  if (!result.rules.length) return { error: 'No recognizable Sysmon event rule tags were found in the snippet.', rules: [] }
  return { error: null, rules: result.rules }
}

export function filterSetSignature(filters) {
  return filters
    .map((f) => `${f.field}::${f.condition}::${f.value}`)
    .sort()
    .join('|')
}

// Checks a candidate rule against each target network's existing rules.
// Returns one entry per target network describing what was found.
export function detectConflicts(candidateRule, targetNetworks) {
  const candidateSig = filterSetSignature(candidateRule.filters)
  return targetNetworks.map((net) => {
    const sameBucket = (net.rules || []).filter(
      (r) => !r.disabled && r.eventTag === candidateRule.eventTag && r.onmatch === candidateRule.onmatch
    )
    const exactDuplicate = sameBucket.find((r) => filterSetSignature(r.filters) === candidateSig)
    if (exactDuplicate) {
      return { networkId: net.id, networkName: net.name, type: 'duplicate', message: 'An identical rule already exists in this network.' }
    }

    const valueConflicts = []
    for (const existing of sameBucket) {
      for (const ef of existing.filters) {
        for (const cf of candidateRule.filters) {
          if (ef.field === cf.field && ef.condition === cf.condition && ef.value !== cf.value) {
            valueConflicts.push(`${cf.field} (${cf.condition}): existing="${ef.value}" vs new="${cf.value}"`)
          }
        }
      }
    }
    if (valueConflicts.length) {
      return { networkId: net.id, networkName: net.name, type: 'conflict', message: `Same field/condition with a different value: ${valueConflicts.join('; ')}` }
    }

    return { networkId: net.id, networkName: net.name, type: 'none', message: 'No conflicts detected.' }
  })
}
