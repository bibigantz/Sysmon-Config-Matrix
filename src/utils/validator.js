// Lightweight Sysmon schema validation. Flags issues an engineer would want to know about
// before deploying a config, without needing the official XSD.
import { EVENT_TAGS, CONDITIONS, ONMATCH_VALUES, COMMON_FIELDS_BY_TAG, KNOWN_SCHEMA_VERSIONS } from './eventSchema.js'

const NUMERIC_FIELDS = new Set(['DestinationPort', 'SourcePort', 'GrantedAccess'])

export function validateNetwork(network) {
  const issues = []

  if (!network.schemaversion) {
    issues.push({ severity: 'warning', message: 'Missing schemaversion attribute on <Sysmon> root.' })
  } else if (!KNOWN_SCHEMA_VERSIONS.includes(network.schemaversion)) {
    issues.push({ severity: 'warning', message: `Unrecognized schemaversion "${network.schemaversion}" - verify this is a supported Sysmon release.` })
  }

  if (network.globals?.HashAlgorithms) {
    const algos = network.globals.HashAlgorithms.split(',').map((a) => a.trim().toUpperCase())
    const valid = new Set(['MD5', 'SHA1', 'SHA256', 'IMPHASH', '*'])
    for (const a of algos) {
      if (!valid.has(a)) {
        issues.push({ severity: 'error', message: `Unknown hash algorithm "${a}" in <HashAlgorithms>.` })
      }
    }
  }

  for (const rule of network.rules || []) {
    if (!EVENT_TAGS[rule.eventTag]) {
      issues.push({ severity: 'error', message: `Unknown event tag <${rule.eventTag}>.`, ruleId: rule.id })
    }
    if (!ONMATCH_VALUES.includes(rule.onmatch)) {
      issues.push({ severity: 'error', message: `<${rule.eventTag}> has invalid onmatch="${rule.onmatch}" (expected include/exclude).`, ruleId: rule.id })
    }
    const knownFields = new Set(COMMON_FIELDS_BY_TAG[rule.eventTag] || [])
    if (rule.filters.length === 0) {
      issues.push({ severity: 'warning', message: `<${rule.eventTag} onmatch="${rule.onmatch}"> has no filter conditions.`, ruleId: rule.id })
    }
    for (const f of rule.filters) {
      if (!CONDITIONS.includes(f.condition)) {
        issues.push({ severity: 'error', message: `Invalid condition operator "${f.condition}" on field "${f.field}".`, ruleId: rule.id })
      }
      if (knownFields.size && !knownFields.has(f.field)) {
        issues.push({ severity: 'info', message: `Field "${f.field}" is not a commonly documented field for <${rule.eventTag}>.`, ruleId: rule.id })
      }
      if (NUMERIC_FIELDS.has(f.field) && f.value && !/^0x[0-9a-f]+$|^\d+$/i.test(f.value.trim())) {
        issues.push({ severity: 'warning', message: `Field "${f.field}" expects a numeric or hex value, got "${f.value}".`, ruleId: rule.id })
      }
      if (!f.value || f.value.trim() === '') {
        issues.push({ severity: 'warning', message: `Field "${f.field}" has an empty match value.`, ruleId: rule.id })
      }
    }
  }

  for (const w of network.warnings || []) {
    issues.push({ severity: 'info', message: w })
  }

  return issues
}

export function validationCounts(issues) {
  return {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length,
  }
}
