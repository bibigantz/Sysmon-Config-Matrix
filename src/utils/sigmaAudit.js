// Audits a translated Sigma rule (see sigmaToSysmon.js) against every loaded network's existing
// Sysmon rules, and builds the remediation rule set for networks with a gap.
//
// Coverage is necessarily heuristic (same spirit as riskAnalyzer.js's "broad rule" detection):
// Sysmon's filter engine isn't executed, so "does an existing rule already catch this?" is
// answered by field + condition-polarity + substring-overlap matching rather than a real
// evaluation. This is flagged in the UI copy, not presented as a guarantee.
import { filterSetSignature } from './ruleOps.js'
import { suggestMitreTechniques } from './mitreMap.js'

// Conditions that can plausibly *catch* a value (as opposed to narrowing/negating one) - only
// these are considered when checking whether an existing filter covers a candidate filter.
const COVERING_CONDITIONS = new Set(['is', 'is any', 'contains', 'contains any', 'contains all', 'begin with', 'end with', 'more than', 'less than', 'image'])

function valuesOverlap(a, b) {
  const av = a.toLowerCase().trim()
  const bv = b.toLowerCase().trim()
  if (!av || !bv) return false
  return av === bv || av.includes(bv) || bv.includes(av)
}

function existingFilterCovers(existing, candidate) {
  if (existing.field.toLowerCase() !== candidate.field.toLowerCase()) return false
  if (!COVERING_CONDITIONS.has(existing.condition)) return false
  return existing.value.split(';').some((part) => valuesOverlap(part, candidate.value))
}

function ruleCoversFilters(rule, candidateFilters) {
  if (!candidateFilters.length) return true // no translatable criteria - presence of any active rule for the event type counts as (broad) coverage
  return candidateFilters.every((cf) => rule.filters.some((ef) => existingFilterCovers(ef, cf)))
}

// Checks one network against every branch (OR-alternative) of the translated Sigma rule.
// Returns { status: 'covered'|'gap', broad, matchedRules }. `broad` flags a match where the
// Sigma rule's criteria couldn't be translated into concrete filters at all, so coverage only
// reflects "this event type is logged", not the specific behavior.
export function auditNetwork(branches, network) {
  const activeIncludeRules = (network.rules || []).filter((r) => !r.disabled && r.onmatch === 'include')
  for (const branch of branches) {
    if (!branch.include) continue
    const matchRules = activeIncludeRules.filter((r) => r.eventTag === branch.include.eventTag)
    const covering = matchRules.filter((r) => ruleCoversFilters(r, branch.include.filters))
    if (covering.length) {
      return { status: 'covered', broad: !branch.include.filters.length, matchedRules: covering }
    }
  }
  return { status: 'gap', broad: false, matchedRules: [] }
}

export function auditAllNetworks(branches, networks) {
  if (!branches.length) {
    return networks.map((n) => ({ networkId: n.id, networkName: n.name, schemaversion: n.schemaversion, status: 'unmappable', broad: false, matchedRules: [] }))
  }
  return networks.map((n) => ({ networkId: n.id, networkName: n.name, schemaversion: n.schemaversion, ...auditNetwork(branches, n) }))
}

function shapeRule({ eventTag, eventIds, onmatch, filters, comment }) {
  return {
    eventTag,
    eventIds,
    onmatch,
    filters,
    comment,
    ruleGroupName: null,
    groupRelation: null,
    mitre: suggestMitreTechniques(eventTag, filters),
    manualMitre: [],
    disabled: false,
    orphaned: false,
  }
}

// Builds the fully-shaped rule objects (ready for the store's applyRuleToNetworks) needed to
// bring `network` to Covered: skips branches already covered, and skips any branch whose exact
// filter signature already exists so re-running the auditor after a partial fix doesn't pile up
// duplicates. Returns { newRules, alreadyCovered }.
export function buildInjectionPlan(branches, network, ruleComment) {
  const audit = auditNetwork(branches, network)
  if (audit.status === 'covered') return { newRules: [], alreadyCovered: true }

  const existingSignatures = new Set(
    (network.rules || []).filter((r) => !r.disabled).map((r) => `${r.eventTag}::${r.onmatch}::${filterSetSignature(r.filters)}`)
  )
  const newRules = []

  for (const branch of branches) {
    if (branch.include) {
      const sig = `${branch.include.eventTag}::include::${filterSetSignature(branch.include.filters)}`
      if (!existingSignatures.has(sig)) {
        newRules.push(shapeRule({ ...branch.include, comment: ruleComment }))
        existingSignatures.add(sig)
      }
    }
    for (const ex of branch.excludes) {
      const sig = `${ex.eventTag}::exclude::${filterSetSignature(ex.filters)}`
      if (!existingSignatures.has(sig)) {
        newRules.push(shapeRule({ ...ex, comment: `${ruleComment} (false-positive exclusion from the Sigma rule's "filter" block)` }))
        existingSignatures.add(sig)
      }
    }
  }
  return { newRules, alreadyCovered: false }
}
