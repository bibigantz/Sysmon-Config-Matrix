// Computes a structural diff between two normalized network configs, bucketed by
// Event Tag + onmatch. Each filter line is reduced to a signature so we can tell apart:
//   - lines only in A ("removed" relative to B)
//   - lines only in B ("added" relative to B)
//   - lines with the same field+condition but a different value in each ("modified")
//   - lines that match exactly ("unchanged")
import { TAG_BY_EVENT_ID, ALL_EVENT_IDS } from './eventSchema.js'

function filterSignature(f) {
  return `${f.field}::${f.condition}`
}
function fullSignature(f) {
  return `${f.field}::${f.condition}::${f.value}`
}

function bucketRules(rules) {
  const buckets = new Map() // key: eventTag::onmatch -> filters[]
  for (const rule of rules) {
    const key = `${rule.eventTag}::${rule.onmatch}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(...rule.filters.map((f) => ({ ...f, ruleId: rule.id, orphaned: !!rule.orphaned })))
  }
  return buckets
}

export function diffNetworks(networkA, networkB) {
  const bucketsA = bucketRules(networkA.rules || [])
  const bucketsB = bucketRules(networkB.rules || [])
  const allKeys = new Set([...bucketsA.keys(), ...bucketsB.keys()])

  const results = []
  for (const key of allKeys) {
    const [eventTag, onmatch] = key.split('::')
    const filtersA = bucketsA.get(key) || []
    const filtersB = bucketsB.get(key) || []

    const exactA = new Set(filtersA.map(fullSignature))
    const exactB = new Set(filtersB.map(fullSignature))
    const fieldCondA = new Map(filtersA.map((f) => [filterSignature(f), f]))
    const fieldCondB = new Map(filtersB.map((f) => [filterSignature(f), f]))

    const added = []
    const removed = []
    const modified = []
    const unchanged = []

    for (const f of filtersB) {
      const sig = fullSignature(f)
      if (exactA.has(sig)) {
        unchanged.push(f)
      } else if (fieldCondA.has(filterSignature(f))) {
        modified.push({ field: f.field, condition: f.condition, from: fieldCondA.get(filterSignature(f)).value, to: f.value })
      } else {
        added.push(f)
      }
    }
    for (const f of filtersA) {
      const sig = fullSignature(f)
      if (!exactB.has(sig) && !fieldCondB.has(filterSignature(f))) {
        removed.push(f)
      }
    }

    if (added.length || removed.length || modified.length || unchanged.length) {
      const anyOrphaned = [...added, ...removed, ...unchanged].some((f) => f.orphaned)
      results.push({ eventTag, onmatch, added, removed, modified, unchanged, anyOrphaned })
    }
  }

  results.sort((a, b) => a.eventTag.localeCompare(b.eventTag) || a.onmatch.localeCompare(b.onmatch))

  const summary = results.reduce(
    (acc, r) => {
      acc.added += r.added.length
      acc.removed += r.removed.length
      acc.modified += r.modified.length
      return acc
    },
    { added: 0, removed: 0, modified: 0 }
  )

  return { results, summary }
}

// Builds the Matrix View data: rows = all Sysmon event IDs, columns = networks,
// cell = { includeCount, excludeCount, ruleCount }
export function buildMatrix(networks) {
  return ALL_EVENT_IDS.map((eventId) => {
    const tag = TAG_BY_EVENT_ID[eventId]
    const cells = networks.map((net) => {
      const matching = (net.rules || []).filter((r) => r.eventIds.includes(eventId))
      return {
        networkId: net.id,
        ruleCount: matching.length,
        includeCount: matching.filter((r) => r.onmatch === 'include').length,
        excludeCount: matching.filter((r) => r.onmatch === 'exclude').length,
        filterCount: matching.reduce((sum, r) => sum + r.filters.length, 0),
      }
    })
    return { eventId, tag, cells }
  })
}
