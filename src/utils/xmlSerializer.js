// Serializes the normalized { schemaversion, globals, rules } model back into pretty,
// consistently-indented Sysmon XML. Byte-for-byte round-tripping of the original messy source
// (exact whitespace/tag order) is intentionally not a goal here -- what matters is producing
// clean, valid, deployable output. Comments captured by the parser ARE preserved (re-emitted
// next to the rule/filter/global option they were attached to), and rules marked `disabled`
// (suppressed via the Global Rule Remover) are emitted as inert, human-readable XML comments
// instead of live tags, so a suppressed rule's history isn't lost on export.

import { GLOBAL_TAGS } from './eventSchema.js'

function escapeXml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// XML comments may not contain "--". Neutralize it without otherwise mangling the text.
function escapeComment(str) {
  return String(str).replaceAll('--', '- -')
}

function indent(level) {
  return '  '.repeat(level)
}

function commentBlock(text, level) {
  return escapeComment(text)
    .split('\n')
    .map((line) => `${indent(level)}<!-- ${line} -->`)
}

const BANNERS = {
  standard: null,
  swiftonsecurity: [
    'Sysmon Configuration',
    'Format: SwiftOnSecurity-style (https://github.com/SwiftOnSecurity/sysmon-config)',
    'Rules are grouped with <RuleGroup> blocks per event type for easy auditing.',
  ],
  'olaf-hartong': [
    'Sysmon Configuration',
    'Format: Olaf Hartong "sysmon-modular" style (https://github.com/olafhartong/sysmon-modular)',
    'Each event type is kept as an isolated, independently-auditable module.',
  ],
}

function groupKey(rule) {
  // Orphaned rules are kept in their own group even if they'd otherwise match an existing one,
  // so the auto-wrap note below is only ever attached to rules that actually needed it.
  return [rule.eventTag, rule.onmatch, rule.ruleGroupName || '', rule.groupRelation || '', rule.orphaned ? 'orphaned' : ''].join('::')
}

// `bare` renders a filter's own comment as plain trailing text instead of wrapping it in its own
// <!-- --> - required when the whole line is going to be embedded inside another XML comment
// (the disabled-rule block below), since a nested "-->" would terminate that outer comment early.
function serializeFilterLine(f, level, { bare = false } = {}) {
  const cond = f.condition && f.condition !== 'is' ? ` condition="${escapeXml(f.condition)}"` : ''
  const base = `${indent(level)}<${f.field}${cond}>${escapeXml(f.value)}</${f.field}>`
  if (!f.comment) return base
  const commentText = f.comment.replaceAll('\n', ' | ')
  return bare ? `${base} // ${commentText}` : `${base} <!-- ${escapeComment(commentText)} -->`
}

function serializeRuleGroupBody(rules, level) {
  const lines = []
  const active = rules.filter((r) => !r.disabled)
  const disabled = rules.filter((r) => r.disabled)

  const groups = new Map()
  for (const rule of active) {
    const key = groupKey(rule)
    if (!groups.has(key)) groups.set(key, { rule, filters: [], comments: new Set() })
    const g = groups.get(key)
    g.filters.push(...rule.filters)
    if (rule.comment) g.comments.add(rule.comment)
  }
  for (const { rule, filters, comments } of groups.values()) {
    if (rule.orphaned) {
      lines.push(...commentBlock('Auto-wrapped by Sysmon Config Matrix: originally a loose/orphaned rule with no (or a non-standard) enclosing structure - now a proper tag. Run "Wrap Loose Rules into RuleGroups" to confirm and clear this note.', level))
    }
    for (const c of comments) lines.push(...commentBlock(c, level))
    lines.push(`${indent(level)}<${rule.eventTag} onmatch="${rule.onmatch}">`)
    for (const f of filters) lines.push(serializeFilterLine(f, level + 1))
    lines.push(`${indent(level)}</${rule.eventTag}>`)
  }

  // Suppressed rules are kept, one at a time (not merged), as a single commented-out block so
  // exactly what was disabled - and why - stays legible and reversible. The entire tag (open,
  // filters, close) must be INSIDE the comment, not just the header line above it, or the "rule"
  // would actually re-import as live, active XML - defeating the point of suppressing it.
  for (const rule of disabled) {
    const header = [rule.comment, `SUPPRESSED via Sysmon Config Matrix (${new Date().toISOString().slice(0, 10)}) - re-enable in the app to restore.`]
      .filter(Boolean)
      .join('\n')
    const bodyLines = [
      `${indent(level + 1)}<${rule.eventTag} onmatch="${rule.onmatch}">`,
      ...rule.filters.map((f) => serializeFilterLine(f, level + 2, { bare: true })),
      `${indent(level + 1)}</${rule.eventTag}>`,
    ]
    lines.push(`${indent(level)}<!--`)
    lines.push(escapeComment([header, ...bodyLines].join('\n')))
    lines.push(`${indent(level)}-->`)
  }

  return lines
}

// Renders a single rule (independent of any network/RuleGroup context) as a standalone XML
// snippet - used to hand one rule's exact tag/condition/value content to the local AI assistant
// for explanation/false-positive analysis without serializing the whole network.
export function serializeRuleSnippet(rule) {
  const lines = [`<${rule.eventTag} onmatch="${rule.onmatch}">`]
  for (const f of rule.filters) lines.push(serializeFilterLine(f, 1))
  lines.push(`</${rule.eventTag}>`)
  return lines.join('\n')
}

export function serializeSysmonConfig(network, style = 'standard') {
  const { schemaversion, globals = {}, globalComments = {}, rules = [] } = network
  const lines = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')

  const banner = BANNERS[style]
  if (banner) {
    lines.push('<!--')
    for (const l of banner) lines.push(`  ${l}`)
    lines.push(`  Network: ${network.name || 'Unnamed'}`)
    lines.push(`  Exported: ${new Date().toISOString()}`)
    lines.push('-->')
  }
  if (network.headerComment) {
    lines.push(...commentBlock(network.headerComment, 0))
  }

  lines.push(`<Sysmon schemaversion="${escapeXml(schemaversion || '4.90')}">`)
  for (const g of GLOBAL_TAGS) {
    if (globals[g] !== undefined && globals[g] !== '') {
      if (globalComments[g]) lines.push(...commentBlock(globalComments[g], 1))
      lines.push(`${indent(1)}<${g}>${escapeXml(globals[g])}</${g}>`)
    }
  }

  if (globalComments.EventFiltering) lines.push(...commentBlock(globalComments.EventFiltering, 1))
  lines.push(`${indent(1)}<EventFiltering>`)

  if (style === 'standard') {
    lines.push(...serializeRuleGroupBody(rules, 2))
  } else {
    // SwiftOnSecurity / Olaf Hartong style: wrap each distinct event tag family in its own
    // named <RuleGroup groupRelation="or"> for readability, mirroring those community projects'
    // conventions (not a byte-for-byte reproduction of either project).
    const byTag = new Map()
    for (const rule of rules) {
      if (!byTag.has(rule.eventTag)) byTag.set(rule.eventTag, [])
      byTag.get(rule.eventTag).push(rule)
    }
    for (const [tag, tagRules] of byTag.entries()) {
      const groupName = style === 'olaf-hartong' ? `${tag} module` : `${tag} rules`
      lines.push(`${indent(2)}<RuleGroup name="${escapeXml(groupName)}" groupRelation="or">`)
      lines.push(...serializeRuleGroupBody(tagRules, 3))
      lines.push(`${indent(2)}</RuleGroup>`)
    }
  }

  lines.push(`${indent(1)}</EventFiltering>`)
  lines.push('</Sysmon>')
  return lines.join('\n')
}
