// Smart Condition & Wildcard Risk Analyzer - cross-network consistency and over-broad-match
// heuristics surfaced in the Matrix View.
const BROAD_CONDITIONS = new Set(['contains', 'contains any', 'contains all', 'begin with', 'end with'])
const DRIVER_IMAGE_TAGS = new Set(['DriverLoad', 'ImageLoad'])

function looksPathLike(value) {
  return /[\\/]/.test(value) || /\.\w{2,4}$/.test(value)
}

// Finds cases where the *same* target value (same event tag, onmatch, field, and value) is
// matched with a *different* condition operator in different networks - e.g. Network A excludes
// "cmd.exe" with `contains` while Network B excludes it with `is`, which silently changes what
// actually gets caught between environments.
export function findOperatorMismatches(networks) {
  const byTarget = new Map()
  for (const net of networks) {
    for (const rule of net.rules || []) {
      if (rule.disabled) continue
      for (const f of rule.filters) {
        const key = `${rule.eventTag}::${rule.onmatch}::${f.field}::${f.value.trim().toLowerCase()}`
        if (!byTarget.has(key)) byTarget.set(key, [])
        byTarget.get(key).push({ networkId: net.id, networkName: net.name, condition: f.condition, ruleId: rule.id, eventTag: rule.eventTag, eventIds: rule.eventIds })
      }
    }
  }

  const mismatches = []
  for (const [key, entries] of byTarget) {
    const conditions = new Set(entries.map((e) => e.condition))
    if (conditions.size > 1) {
      const [eventTag, onmatch, field, value] = key.split('::')
      mismatches.push({ eventTag, onmatch, field, value, eventIds: entries[0].eventIds, entries })
    }
  }
  return mismatches
}

// Flags filters that use a broad-match condition (contains/begin with/end with) against a short,
// non-path-like value - a common cause of unexpected log flooding, or (for driver/image load
// exclusions) accidentally excluding legitimate drivers/images far beyond what was intended.
export function findOverlyBroadRules(networks, { minLength = 6 } = {}) {
  const flagged = []
  for (const net of networks) {
    for (const rule of net.rules || []) {
      if (rule.disabled) continue
      for (const f of rule.filters) {
        if (!BROAD_CONDITIONS.has(f.condition)) continue
        const v = f.value.trim()
        if (!v || v.length >= minLength || looksPathLike(v)) continue
        const driverRisk = rule.onmatch === 'exclude' && DRIVER_IMAGE_TAGS.has(rule.eventTag)
        flagged.push({
          networkId: net.id,
          networkName: net.name,
          ruleId: rule.id,
          eventTag: rule.eventTag,
          eventIds: rule.eventIds,
          onmatch: rule.onmatch,
          field: f.field,
          condition: f.condition,
          value: v,
          reason: driverRisk
            ? `Short "${f.condition}" match ("${v}") on a driver/image exclusion risks dropping legitimate drivers or images far beyond what was intended.`
            : `Short, non-path "${f.condition}" match ("${v}") can over-match unrelated events and flood logs.`,
        })
      }
    }
  }
  return flagged
}

// Finds rules the parser had to auto-wrap because they were found loose/orphaned - a filter
// condition with no enclosing event tag, a non-standard <Include>/<Exclude> wrapper, or an
// otherwise well-formed event tag sitting outside <EventFiltering> entirely. Nothing is ever
// dropped (see xmlParser.js), but these are worth surfacing as a structural risk: the best-guess
// event tag assigned to a loose filter run is a heuristic, not a certainty, until an analyst
// reviews it (via "Wrap Loose Rules into RuleGroups").
export function findOrphanedRules(networks) {
  const flagged = []
  for (const net of networks) {
    for (const rule of net.rules || []) {
      if (!rule.orphaned) continue
      flagged.push({
        networkId: net.id,
        networkName: net.name,
        ruleId: rule.id,
        eventTag: rule.eventTag,
        eventIds: rule.eventIds,
        onmatch: rule.onmatch,
        filterCount: rule.filters.length,
      })
    }
  }
  return flagged
}

// Convenience: index all three analyses by Event ID/rule so the Matrix View can show a per-row
// or per-rule badge without each cell having to re-run the analysis.
export function buildRiskIndex(networks) {
  const mismatches = findOperatorMismatches(networks)
  const broad = findOverlyBroadRules(networks)
  const orphaned = findOrphanedRules(networks)

  const mismatchByEventId = new Map()
  for (const m of mismatches) {
    for (const id of m.eventIds) {
      if (!mismatchByEventId.has(id)) mismatchByEventId.set(id, [])
      mismatchByEventId.get(id).push(m)
    }
  }

  const broadByRuleId = new Map()
  const broadByEventId = new Map()
  for (const b of broad) {
    if (!broadByRuleId.has(b.ruleId)) broadByRuleId.set(b.ruleId, [])
    broadByRuleId.get(b.ruleId).push(b)
    for (const id of b.eventIds) {
      if (!broadByEventId.has(id)) broadByEventId.set(id, [])
      broadByEventId.get(id).push(b)
    }
  }

  const orphanedByEventId = new Map()
  for (const o of orphaned) {
    for (const id of o.eventIds) {
      if (!orphanedByEventId.has(id)) orphanedByEventId.set(id, [])
      orphanedByEventId.get(id).push(o)
    }
  }

  return { mismatches, broad, orphaned, mismatchByEventId, broadByRuleId, broadByEventId, orphanedByEventId }
}
