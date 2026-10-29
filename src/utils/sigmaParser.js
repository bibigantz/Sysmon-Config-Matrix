// Parses the active Sigma YAML text in the Auditor's editor into a normalized rule shape, using
// the project's own minimal YAML subset parser (see yamlLite.js). Validates only the handful of
// top-level fields sigmaToSysmon.js actually needs - this is not a full Sigma spec validator
// (no schema/UUID/date format checks), consistent with the rest of this app's parsers.
import { parseYamlLite } from './yamlLite.js'

export function parseSigmaRule(yamlText) {
  const { value, error } = parseYamlLite(yamlText || '')
  if (error) return { error: `YAML syntax error: ${error}`, rule: null, warnings: [] }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Expected a YAML mapping at the top level (title, logsource, detection, ...).', rule: null, warnings: [] }
  }

  const warnings = []
  if (!value.title) warnings.push('No "title" field - using "Untitled Sigma Rule".')
  if (!value.logsource) warnings.push('No "logsource:" block found - the Sysmon event type can only be inferred from an explicit EventID field inside detection, if present.')
  if (!value.detection || typeof value.detection !== 'object') {
    return { error: 'Missing required "detection:" block.', rule: null, warnings }
  }

  return {
    error: null,
    warnings,
    rule: {
      title: value.title || 'Untitled Sigma Rule',
      id: value.id || null,
      status: value.status || null,
      level: value.level || null,
      description: value.description || null,
      logsource: value.logsource || {},
      detection: value.detection,
      tags: Array.isArray(value.tags) ? value.tags : [],
      falsepositives: Array.isArray(value.falsepositives)
        ? value.falsepositives
        : value.falsepositives
        ? [value.falsepositives]
        : [],
    },
  }
}
