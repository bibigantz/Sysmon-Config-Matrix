// Programmatic, deterministic multi-network merge engine for the Merge & Policy Builder
// (src/components/MergeWorkspace.js). Everything here is plain structural XML-model manipulation
// (reusing the same normalized { schemaversion, globals, rules } shape the parser/serializer use
// elsewhere in the app) - no AI/LLM involved anywhere in this file or its callers.
import { EVENT_TAGS } from './eventSchema.js'
import { suggestMitreTechniques } from './mitreMap.js'

let mergeIdCounter = 0
function nextMergeId() {
  mergeIdCounter += 1
  return `merge-${Date.now().toString(36)}-${mergeIdCounter}`
}

// The atomic unit every merge algorithm operates on: one condition line, with its full lineage
// (which rule/RuleGroup it came from, which source network) kept alongside it so dedup/conflict
// detection and attribution comments can all work off this flat list instead of re-walking the
// nested rule structure every time.
export function collectFilterEntries(network) {
  const out = []
  for (const rule of network.rules || []) {
    if (rule.disabled) continue
    for (const f of rule.filters) {
      out.push({
        eventTag: rule.eventTag,
        eventIds: rule.eventIds,
        onmatch: rule.onmatch,
        ruleGroupName: rule.ruleGroupName || null,
        groupRelation: rule.groupRelation || null,
        orphaned: !!rule.orphaned,
        field: f.field,
        condition: f.condition,
        value: f.value,
        sourceNetworkId: network.id,
        sourceNetworkName: network.name,
      })
    }
  }
  return out
}

// Exact dedup key for one condition line: same field, same operator, same target value.
export function filterSignature(entry) {
  return `${entry.field}::${entry.condition}::${entry.value}`
}

function bucketKey(entry) {
  return `${entry.eventTag}::${entry.onmatch}`
}

// Groups flat condition-line entries back into rule objects (one per distinct eventTag +
// onmatch + RuleGroup/groupRelation combination), the inverse of collectFilterEntries - the
// shared "assembly" step every merge mode below ends with.
export function groupEntriesIntoRules(entries) {
  const groups = new Map()
  for (const e of entries) {
    const key = `${e.eventTag}::${e.onmatch}::${e.ruleGroupName || ''}::${e.groupRelation || ''}`
    if (!groups.has(key)) {
      groups.set(key, {
        eventTag: e.eventTag,
        eventIds: e.eventIds,
        onmatch: e.onmatch,
        ruleGroupName: e.ruleGroupName,
        groupRelation: e.groupRelation,
        filters: [],
      })
    }
    groups.get(key).filters.push({ field: e.field, condition: e.condition, value: e.value, comment: e.comment || null })
  }
  return [...groups.values()].map((g) => ({
    id: nextMergeId(),
    eventTag: g.eventTag,
    eventIds: g.eventIds || EVENT_TAGS[g.eventTag]?.ids || [],
    onmatch: g.onmatch,
    ruleGroupName: g.ruleGroupName,
    groupRelation: g.groupRelation,
    comment: null,
    filters: g.filters,
    mitre: suggestMitreTechniques(g.eventTag, g.filters),
    manualMitre: [],
    disabled: false,
    orphaned: false,
  }))
}

function attributionComment(sources, total) {
  const names = [...sources]
  if (names.length === total && total > 1) return `Present in all ${total} merged networks`
  return `Merged from ${names.join(', ')}`
}

// ---- Mode A: Union / Additive merge ----
// Combines every rule across every source network, deduplicating identical condition lines
// (same field + condition + value within the same Event tag + onmatch) so the result doesn't
// bloat with repeats of the same line pulled from multiple networks.
export function unionMerge(networks) {
  const buckets = new Map() // bucketKey -> Map(filterSig -> { entry, sources: Set })
  for (const net of networks) {
    for (const entry of collectFilterEntries(net)) {
      const bKey = bucketKey(entry)
      const sig = filterSignature(entry)
      if (!buckets.has(bKey)) buckets.set(bKey, new Map())
      const bucket = buckets.get(bKey)
      if (bucket.has(sig)) {
        bucket.get(sig).sources.add(entry.sourceNetworkName)
      } else {
        bucket.set(sig, { entry, sources: new Set([entry.sourceNetworkName]) })
      }
    }
  }
  const entries = []
  for (const bucket of buckets.values()) {
    for (const { entry, sources } of bucket.values()) {
      entries.push({ ...entry, comment: attributionComment(sources, networks.length) })
    }
  }
  return groupEntriesIntoRules(entries)
}

// ---- Mode B: Intersection merge ----
// Keeps only condition lines that exist, byte-for-byte identical (same Event tag + onmatch +
// field + condition + value), in EVERY selected network - a mandatory baseline every environment
// already independently enforces.
export function intersectionMerge(networks) {
  if (networks.length < 2) return []
  const seen = new Map() // bucketKey||sig -> { entry, networkIds: Set }
  for (const net of networks) {
    for (const entry of collectFilterEntries(net)) {
      const key = `${bucketKey(entry)}||${filterSignature(entry)}`
      if (!seen.has(key)) seen.set(key, { entry, networkIds: new Set() })
      seen.get(key).networkIds.add(net.id)
    }
  }
  const entries = [...seen.values()]
    .filter((v) => v.networkIds.size === networks.length)
    .map((v) => ({ ...v.entry, comment: `Common baseline - present in all ${networks.length} selected networks` }))
  return groupEntriesIntoRules(entries)
}

// ---- Mode C: Differential / override merge ----
// Rules present in networkA but absent (by exact condition-line signature) from networkB -
// isolates what makes A's policy diverge from B's (e.g. OT-only exclusions on top of a shared
// corporate baseline).
export function differentialMerge(networkA, networkB) {
  const sigsB = new Set(collectFilterEntries(networkB).map((e) => `${bucketKey(e)}||${filterSignature(e)}`))
  const onlyInA = collectFilterEntries(networkA)
    .filter((e) => !sigsB.has(`${bucketKey(e)}||${filterSignature(e)}`))
    .map((e) => ({ ...e, comment: `Only in ${networkA.name} (not present in ${networkB.name})` }))
  return groupEntriesIntoRules(onlyInA)
}

// ---- Mode D: Hierarchical policy inheritance ----
// The base/master network's header, schemaversion, HashAlgorithms, and every other global option
// pass through completely untouched; overlay networks only ever ADD condition lines the base
// doesn't already have (same dedup rule as Union) - the base's own rules are never rewritten or
// reformatted, just carried through as-is.
export function hierarchicalMerge(baseNetwork, overlayNetworks) {
  const seen = new Set(collectFilterEntries(baseNetwork).map((e) => `${bucketKey(e)}||${filterSignature(e)}`))
  const injected = []
  for (const overlay of overlayNetworks) {
    for (const entry of collectFilterEntries(overlay)) {
      const key = `${bucketKey(entry)}||${filterSignature(entry)}`
      if (seen.has(key)) continue
      seen.add(key)
      injected.push({ ...entry, comment: `Injected from ${overlay.name} (subnet overlay)` })
    }
  }
  return {
    schemaversion: baseNetwork.schemaversion,
    globals: baseNetwork.globals,
    globalComments: baseNetwork.globalComments,
    headerComment: baseNetwork.headerComment,
    rules: [...baseNetwork.rules, ...groupEntriesIntoRules(injected)],
  }
}

// ---- Conflict detection ----

// Same Event tag + field + target value, but a DIFFERENT onmatch across source networks (e.g.
// Network A excludes mimikatz.exe while Network B includes it) - these silently cancel or
// duplicate each other's intent if merged naively, so they're surfaced for an explicit choice
// instead of being auto-resolved.
export function detectOnmatchConflicts(networks) {
  const map = new Map() // eventTag::field::value -> Map(onmatch -> Set(networkName))
  for (const net of networks) {
    for (const e of collectFilterEntries(net)) {
      const key = `${e.eventTag}::${e.field}::${e.value}`
      if (!map.has(key)) map.set(key, new Map())
      const byOnmatch = map.get(key)
      if (!byOnmatch.has(e.onmatch)) byOnmatch.set(e.onmatch, new Set())
      byOnmatch.get(e.onmatch).add(net.name)
    }
  }
  const conflicts = []
  for (const [key, byOnmatch] of map) {
    if (byOnmatch.size > 1) {
      const [eventTag, field, value] = key.split('::')
      conflicts.push({
        id: `conflict-onmatch-${key}`,
        type: 'onmatch',
        eventTag,
        field,
        value,
        sides: [...byOnmatch.entries()].map(([onmatch, names]) => ({ onmatch, networks: [...names] })),
      })
    }
  }
  return conflicts
}

// Rules sharing a RuleGroup name (or, lacking one, their Event tag) but disagreeing on
// groupRelation ("and" vs "or") across source networks.
export function detectGroupRelationConflicts(networks) {
  const map = new Map() // groupKey -> Map(groupRelation -> Set(networkName))
  for (const net of networks) {
    for (const rule of net.rules || []) {
      if (rule.disabled || !rule.groupRelation) continue
      const key = rule.ruleGroupName || rule.eventTag
      if (!map.has(key)) map.set(key, new Map())
      const byRel = map.get(key)
      if (!byRel.has(rule.groupRelation)) byRel.set(rule.groupRelation, new Set())
      byRel.get(rule.groupRelation).add(net.name)
    }
  }
  const conflicts = []
  for (const [groupKeyName, byRel] of map) {
    if (byRel.size > 1) {
      conflicts.push({
        id: `conflict-grouprelation-${groupKeyName}`,
        type: 'grouprelation',
        groupKey: groupKeyName,
        sides: [...byRel.entries()].map(([groupRelation, names]) => ({ groupRelation, networks: [...names] })),
      })
    }
  }
  return conflicts
}

function globalValueConflict(networks, globalKey, type) {
  const values = new Map() // value -> Set(networkName)
  for (const net of networks) {
    const v = (globalKey === 'schemaversion' ? net.schemaversion : net.globals?.[globalKey]) || ''
    const normalized = v.trim() || '(not set)'
    if (!values.has(normalized)) values.set(normalized, new Set())
    values.get(normalized).add(net.name)
  }
  if (values.size <= 1) return null
  return {
    id: `conflict-${type}`,
    type,
    options: [...values.entries()].map(([value, names]) => ({ value, networks: [...names] })),
  }
}

export const detectHashAlgorithmConflict = (networks) => globalValueConflict(networks, 'HashAlgorithms', 'hash')
export const detectSchemaVersionConflict = (networks) => globalValueConflict(networks, 'schemaversion', 'schema')

export function detectAllConflicts(networks) {
  return {
    onmatch: detectOnmatchConflicts(networks),
    grouprelation: detectGroupRelationConflicts(networks),
    hash: detectHashAlgorithmConflict(networks),
    schema: detectSchemaVersionConflict(networks),
  }
}

// ---- Conflict resolution (pure: old rules array in, new rules array out) ----

function ruleMatchesOnmatchSide(rule, conflict, onmatch) {
  return (
    rule.eventTag === conflict.eventTag &&
    rule.onmatch === onmatch &&
    rule.filters.some((f) => f.field === conflict.field && f.value === conflict.value)
  )
}

// action: 'keep-include' | 'keep-exclude' | 'keep-both' | 'merge-or'
export function resolveOnmatchConflict(rules, conflict, action) {
  if (action === 'keep-both') return rules

  if (action === 'merge-or') {
    const groupName = `Resolved: ${conflict.eventTag} ${conflict.field}="${conflict.value}"`
    return rules.map((r) =>
      conflict.sides.some((s) => ruleMatchesOnmatchSide(r, conflict, s.onmatch)) ? { ...r, ruleGroupName: groupName, groupRelation: 'or' } : r
    )
  }

  const keepOnmatch = action.replace('keep-', '')
  const out = []
  for (const r of rules) {
    if (r.eventTag === conflict.eventTag && r.onmatch !== keepOnmatch && r.filters.some((f) => f.field === conflict.field && f.value === conflict.value)) {
      const filters = r.filters.filter((f) => !(f.field === conflict.field && f.value === conflict.value))
      if (filters.length) out.push({ ...r, filters })
      continue
    }
    out.push(r)
  }
  return out
}

export function resolveGroupRelationConflict(rules, conflict, chosenRelation) {
  return rules.map((r) => {
    const key = r.ruleGroupName || r.eventTag
    return key === conflict.groupKey ? { ...r, groupRelation: chosenRelation } : r
  })
}

// ---- Redundancy / overlap heuristic (flag only - never auto-deletes) ----

// Within the same Event tag + onmatch bucket, flags a narrower condition on the same field whose
// value is already covered by a broader contains/begin-with condition on that field (e.g. a
// `begin with "C:\Windows\Temp\sub"` line is redundant once `contains "C:\Windows\Temp"` exists).
// This is a heuristic (string-prefix overlap), not a semantic guarantee - it's surfaced for a
// human decision, never auto-removed.
export function findRedundantConditions(rules) {
  const flagged = []
  const byBucket = new Map()
  for (const rule of rules) {
    const key = `${rule.eventTag}::${rule.onmatch}`
    if (!byBucket.has(key)) byBucket.set(key, [])
    for (const f of rule.filters) byBucket.get(key).push({ ...f, ruleId: rule.id })
  }
  for (const [key, filters] of byBucket) {
    for (const a of filters) {
      if (!['contains', 'begin with'].includes(a.condition)) continue
      for (const b of filters) {
        // Note: deliberately does NOT skip pairs that share a ruleId - Union merge regroups every
        // condition line for the same Event tag + onmatch (+ RuleGroup) into one rule object, so
        // two lines pulled from different source networks very often end up as two filters on the
        // very same merged rule. Only an actual self-comparison (the same filter entry) is skipped.
        if (a === b || a.field !== b.field) continue
        if (b.value.length <= a.value.length) continue
        if (!b.value.toLowerCase().startsWith(a.value.toLowerCase())) continue
        flagged.push({
          bucket: key,
          field: a.field,
          broad: { condition: a.condition, value: a.value, ruleId: a.ruleId },
          narrow: { condition: b.condition, value: b.value, ruleId: b.ruleId },
          reason: `"${a.value}" (${a.condition}) already covers "${b.value}" (${b.condition}) on the same field - the narrower line may be redundant.`,
        })
      }
    }
  }
  return flagged
}

export function removeConditionLine(rules, ruleId, field, value) {
  return rules
    .map((r) => (r.id === ruleId ? { ...r, filters: r.filters.filter((f) => !(f.field === field && f.value === value)) } : r))
    .filter((r) => r.filters.length > 0)
}

// ---- Final assembly ----

// Wraps a merge mode's output `rules` array into a full, exportable network-shaped object.
// Hierarchical merges already carry their own schemaversion/globals/headerComment (preserved
// verbatim from the base network per the spec); the other three modes synthesize a header and
// apply whatever hash/schema value the Conflict Resolution panel's dropdowns picked (falling back
// to the first source network's values if there was no conflict to resolve).
export function assembleMergedNetwork(mode, sourceNetworks, rules, { resolvedHash, resolvedSchema, name } = {}) {
  if (mode === 'hierarchy') {
    const base = sourceNetworks[0]
    return {
      name: name || 'ConfigMerged',
      schemaversion: base.schemaversion,
      globals: base.globals,
      globalComments: base.globalComments,
      headerComment: base.headerComment,
      rules,
      warnings: [],
    }
  }

  const first = sourceNetworks[0]
  const modeLabel = { union: 'Union / Additive', intersection: 'Intersection (common baseline)', differential: 'Differential / Override' }[mode] || mode
  const banner = [
    'Sysmon Configuration - Merged via Sysmon Config Matrix Merge & Policy Builder',
    `Merge mode: ${modeLabel}`,
    `Source networks: ${sourceNetworks.map((n) => n.name).join(', ')}`,
    `Generated: ${new Date().toISOString()}`,
  ].join('\n')

  return {
    name: name || 'ConfigMerged',
    schemaversion: resolvedSchema || first.schemaversion || '4.90',
    globals: { ...first.globals, ...(resolvedHash ? { HashAlgorithms: resolvedHash } : {}) },
    globalComments: first.globalComments || {},
    headerComment: banner,
    rules,
    warnings: [],
  }
}
