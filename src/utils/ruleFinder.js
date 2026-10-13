// Search helpers for the Global Rule Remover / Suppressor modal: find rules across every
// (or a chosen subset of) networks by keyword/field/event-tag, or by pasting a raw XML snippet
// to match on exact filter content.
import { parseRawSnippet, filterSetSignature } from './ruleOps.js'

export function findMatchingRules(networks, { eventTag, onmatch, keyword }) {
  const kw = (keyword || '').trim().toLowerCase()
  if (!eventTag && !onmatch && !kw) return []

  const matches = []
  for (const net of networks) {
    for (const rule of net.rules || []) {
      if (eventTag && rule.eventTag !== eventTag) continue
      if (onmatch && rule.onmatch !== onmatch) continue
      if (kw) {
        const hit = rule.filters.some((f) => f.field.toLowerCase().includes(kw) || f.value.toLowerCase().includes(kw))
        if (!hit) continue
      }
      matches.push({ networkId: net.id, networkName: net.name, rule })
    }
  }
  return matches
}

export function findRulesBySnippet(networks, snippetXml) {
  const { error, rules: parsed } = parseRawSnippet(snippetXml)
  if (error) return { error, matches: [] }

  const signatures = new Set(parsed.map((r) => `${r.eventTag}::${r.onmatch}::${filterSetSignature(r.filters)}`))
  const matches = []
  for (const net of networks) {
    for (const rule of net.rules || []) {
      const sig = `${rule.eventTag}::${rule.onmatch}::${filterSetSignature(rule.filters)}`
      if (signatures.has(sig)) matches.push({ networkId: net.id, networkName: net.name, rule })
    }
  }
  return { error: null, matches }
}
