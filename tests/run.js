// Minimal, dependency-free test harness for the app's pure logic modules (parser, serializer,
// diff engine, risk analyzer, sanitizer, validator, rule ops). No test framework - just
// assertions, run in a real browser (these modules are ES modules resolved via the import map
// in index.html, same mechanism the app itself uses). Open tests/index.html via any static
// server to run, or drive it with Playwright and read `window.__TEST_RESULTS__`.
import { parseSysmonConfig } from '../src/utils/xmlParser.js'
import { serializeSysmonConfig } from '../src/utils/xmlSerializer.js'
import { diffNetworks } from '../src/utils/diffEngine.js'
import { findOperatorMismatches, findOverlyBroadRules, findOrphanedRules } from '../src/utils/riskAnalyzer.js'
import { sanitizeNetwork, wrapLooseRules } from '../src/utils/sanitizer.js'
import { validateNetwork } from '../src/utils/validator.js'
import { detectConflicts, createRuleFromForm } from '../src/utils/ruleOps.js'
import {
  unionMerge, intersectionMerge, differentialMerge, hierarchicalMerge,
  detectOnmatchConflicts, resolveOnmatchConflict,
  detectGroupRelationConflicts, resolveGroupRelationConflict,
  detectHashAlgorithmConflict, findRedundantConditions, removeConditionLine,
  assembleMergedNetwork,
} from '../src/utils/mergeEngine.js'

const results = { total: 0, passed: 0, failed: 0, failures: [] }
const resultsEl = document.getElementById('results')

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}

function test(name, fn) {
  results.total += 1
  const line = document.createElement('div')
  try {
    fn()
    results.passed += 1
    line.className = 'pass'
    line.textContent = `✓ ${name}`
  } catch (err) {
    results.failed += 1
    results.failures.push({ name, error: err.message })
    line.className = 'fail'
    line.textContent = `✗ ${name} - ${err.message}`
  }
  resultsEl.appendChild(line)
}

function finish() {
  const summary = document.getElementById('summary')
  summary.textContent = `${results.passed}/${results.total} passed` + (results.failed ? ` (${results.failed} failed)` : '')
  summary.className = results.failed ? 'fail' : 'pass'
  document.title = `${results.failed ? 'FAIL' : 'PASS'} - Sysmon Config Matrix Tests`
  document.body.dataset.status = results.failed ? 'fail' : 'pass'
  window.__TEST_RESULTS__ = results
}

// ---------------------------------------------------------------------------------------------
// xmlParser.js
// ---------------------------------------------------------------------------------------------

test('parser: onmatch and condition attributes read correctly (regression: attributesGroupName double-wrap)', () => {
  const xml = '<Sysmon schemaversion="4.90"><EventFiltering><ProcessCreate onmatch="exclude"><Image condition="contains">\\cmd.exe</Image></ProcessCreate></EventFiltering></Sysmon>'
  const result = parseSysmonConfig(xml)
  assert(!result.error, `expected no parse error, got: ${result.error}`)
  assert(result.rules.length === 1, `expected 1 rule, got ${result.rules.length}`)
  assert(result.rules[0].onmatch === 'exclude', `expected onmatch 'exclude', got '${result.rules[0].onmatch}'`)
  assert(result.rules[0].filters[0].condition === 'contains', `expected condition 'contains', got '${result.rules[0].filters[0].condition}'`)
})

test('parser: extracts rules nested inside a malformed duplicated wrapper tag', () => {
  const xml = '<Sysmon schemaversion="4.90"><EventFiltering><EventFiltering><ProcessCreate onmatch="exclude"><ProcessCreate onmatch="exclude"><Image condition="contains">\\a.exe</Image></ProcessCreate><CommandLine condition="contains">\\b.exe</CommandLine></ProcessCreate></EventFiltering></EventFiltering></Sysmon>'
  const result = parseSysmonConfig(xml)
  assert(result.rules.length === 2, `expected 2 rules (outer + inner), got ${result.rules.length}`)
  assert(result.warnings.some((w) => w.toLowerCase().includes('malformed')), 'expected a malformed-nesting warning')
})

test('parser: reattaches own-line comment as leading, same-line comment as trailing', () => {
  const xml = '<?xml version="1.0"?><Sysmon schemaversion="4.90"><EventFiltering>\n<!-- leading note -->\n<NetworkConnect onmatch="exclude"><DestinationPort condition="is">443</DestinationPort><!-- trailing note --></NetworkConnect></EventFiltering></Sysmon>'
  const result = parseSysmonConfig(xml)
  const rule = result.rules[0]
  assert(rule.comment === 'leading note', `expected rule.comment 'leading note', got ${JSON.stringify(rule.comment)}`)
  assert(rule.filters[0].comment === 'trailing note', `expected filter.comment 'trailing note', got ${JSON.stringify(rule.filters[0].comment)}`)
})

test('parser: header banner comment is captured (not swallowed by the XML declaration)', () => {
  const xml = '<?xml version="1.0"?><!-- banner text --><Sysmon schemaversion="4.90"><EventFiltering></EventFiltering></Sysmon>'
  const result = parseSysmonConfig(xml)
  assert(result.headerComment === 'banner text', `expected 'banner text', got ${JSON.stringify(result.headerComment)}`)
})

test('parser: normalizes mixed onmatch/condition casing without losing data', () => {
  const xml = '<Sysmon schemaversion="4.90"><EventFiltering><ProcessCreate onmatch="EXCLUDE"><Image condition="CONTAINS">\\x.exe</Image></ProcessCreate></EventFiltering></Sysmon>'
  const result = parseSysmonConfig(xml)
  assert(result.rules[0].onmatch === 'exclude', `expected lowercase 'exclude', got '${result.rules[0].onmatch}'`)
  assert(result.rules[0].filters[0].condition === 'contains', `expected lowercase 'contains', got '${result.rules[0].filters[0].condition}'`)
})

test('parser: case-insensitively recognizes global tags regardless of source casing', () => {
  const xml = '<Sysmon schemaversion="4.90"><hashalgorithms>md5,sha256</hashalgorithms><EventFiltering></EventFiltering></Sysmon>'
  const result = parseSysmonConfig(xml)
  assert(result.globals.HashAlgorithms === 'md5,sha256', `expected globals.HashAlgorithms to be set, got ${JSON.stringify(result.globals)}`)
})

// ---------------------------------------------------------------------------------------------
// xmlSerializer.js
// ---------------------------------------------------------------------------------------------

test('serializer: emits onmatch and condition attributes', () => {
  const network = { schemaversion: '4.90', globals: {}, rules: [{ id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', filters: [{ field: 'Image', condition: 'contains', value: '\\x.exe' }] }] }
  const xml = serializeSysmonConfig(network, 'standard')
  assert(xml.includes('<ProcessCreate onmatch="exclude">'), 'expected the ProcessCreate/onmatch tag in the output')
  assert(xml.includes('condition="contains"'), 'expected the condition attribute in the output')
})

test('serializer: suppressed rule exports as a labeled comment block, not a live tag', () => {
  const network = { schemaversion: '4.90', globals: {}, rules: [{ id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', disabled: true, filters: [{ field: 'Image', condition: 'contains', value: '\\x.exe' }] }] }
  const xml = serializeSysmonConfig(network, 'standard')
  assert(xml.includes('SUPPRESSED via Sysmon Config Matrix'), 'expected a SUPPRESSED marker comment')
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '')
  assert(!withoutComments.includes('<ProcessCreate'), 'suppressed rule must not appear as a live, uncommented tag')
})

test('serializer: a suppressed rule whose filter has its own comment stays validly commented out', () => {
  const network = { schemaversion: '4.90', globals: {}, rules: [{ id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', disabled: true, comment: 'ticket JIRA-123', filters: [{ field: 'Image', condition: 'contains', value: 'x.exe', comment: 'legacy exclusion' }] }] }
  const xml = serializeSysmonConfig(network, 'standard')
  // A nested <!-- --> around the filter's own comment would terminate the outer comment early,
  // leaving the rule tag live outside it - assert there's exactly one comment open/close pair
  // wrapping the whole block, not multiple.
  const commentOpens = (xml.match(/<!--/g) || []).length
  const commentCloses = (xml.match(/-->/g) || []).length
  assert(commentOpens === commentCloses, `mismatched comment delimiters: ${commentOpens} opens vs ${commentCloses} closes`)
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '')
  assert(!withoutComments.includes('<ProcessCreate'), 'suppressed rule leaked out of its comment block as live XML')
  assert(xml.includes('legacy exclusion') && xml.includes('ticket JIRA-123'), 'expected both comments to survive inside the suppressed block')
})

test('serializer: preserves a filter-level inline comment on export', () => {
  const network = { schemaversion: '4.90', globals: {}, rules: [{ id: 'r1', eventTag: 'NetworkConnect', onmatch: 'exclude', filters: [{ field: 'DestinationPort', condition: 'is', value: '443', comment: 'catches C2 on 443' }] }] }
  const xml = serializeSysmonConfig(network, 'standard')
  assert(xml.includes('catches C2 on 443'), 'expected the filter comment to survive serialization')
})

// ---------------------------------------------------------------------------------------------
// diffEngine.js
// ---------------------------------------------------------------------------------------------

test('diffEngine: classifies unchanged / modified / added filters correctly', () => {
  const a = { rules: [{ id: 'a1', eventTag: 'ProcessCreate', onmatch: 'exclude', filters: [
    { field: 'Image', condition: 'contains', value: 'a.exe' },
    { field: 'CommandLine', condition: 'contains', value: 'cmd /c' },
  ] }] }
  const b = { rules: [{ id: 'b1', eventTag: 'ProcessCreate', onmatch: 'exclude', filters: [
    { field: 'Image', condition: 'contains', value: 'a.exe' },
    { field: 'CommandLine', condition: 'contains', value: 'powershell' },
    { field: 'DestinationPort', condition: 'is', value: '4444' },
  ] }] }
  const diff = diffNetworks(a, b)
  const bucket = diff.results[0]
  assert(bucket.unchanged.length === 1, `expected 1 unchanged, got ${bucket.unchanged.length}`)
  assert(bucket.modified.length === 1, `expected 1 modified, got ${bucket.modified.length}`)
  assert(bucket.added.length === 1, `expected 1 added, got ${bucket.added.length}`)
  assert(bucket.removed.length === 0, `expected 0 removed, got ${bucket.removed.length}`)
})

test('diffEngine: identical networks report zero differences', () => {
  const rules = [{ id: 'x', eventTag: 'ProcessCreate', onmatch: 'exclude', filters: [{ field: 'Image', condition: 'contains', value: 'a.exe' }] }]
  const diff = diffNetworks({ rules }, { rules: rules.map((r) => ({ ...r, id: 'y' })) })
  assert(diff.summary.added === 0 && diff.summary.removed === 0 && diff.summary.modified === 0, `expected all-zero summary, got ${JSON.stringify(diff.summary)}`)
})

// ---------------------------------------------------------------------------------------------
// riskAnalyzer.js
// ---------------------------------------------------------------------------------------------

test('riskAnalyzer: flags the same value matched with different operators across networks', () => {
  const nets = [
    { id: 'n1', name: 'A', rules: [{ id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', eventIds: [1], filters: [{ field: 'Image', condition: 'contains', value: 'cmd.exe' }] }] },
    { id: 'n2', name: 'B', rules: [{ id: 'r2', eventTag: 'ProcessCreate', onmatch: 'exclude', eventIds: [1], filters: [{ field: 'Image', condition: 'is', value: 'cmd.exe' }] }] },
  ]
  const mismatches = findOperatorMismatches(nets)
  assert(mismatches.length === 1, `expected 1 mismatch, got ${mismatches.length}`)
})

test('riskAnalyzer: does not flag the same operator used consistently', () => {
  const nets = [
    { id: 'n1', name: 'A', rules: [{ id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', eventIds: [1], filters: [{ field: 'Image', condition: 'contains', value: 'cmd.exe' }] }] },
    { id: 'n2', name: 'B', rules: [{ id: 'r2', eventTag: 'ProcessCreate', onmatch: 'exclude', eventIds: [1], filters: [{ field: 'Image', condition: 'contains', value: 'cmd.exe' }] }] },
  ]
  assert(findOperatorMismatches(nets).length === 0, 'expected no mismatch when operators agree')
})

test('riskAnalyzer: flags a short, non-path "contains" value as overly broad', () => {
  const nets = [{ id: 'n1', name: 'A', rules: [{ id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', eventIds: [1], filters: [{ field: 'CommandLine', condition: 'contains', value: 'cmd' }] }] }]
  assert(findOverlyBroadRules(nets).length === 1, 'expected the short value to be flagged as overly broad')
})

test('riskAnalyzer: does not flag a path-like "contains" value as overly broad', () => {
  const nets = [{ id: 'n1', name: 'A', rules: [{ id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', eventIds: [1], filters: [{ field: 'CommandLine', condition: 'contains', value: '\\temp\\' }] }] }]
  assert(findOverlyBroadRules(nets).length === 0, 'expected a path-like value not to be flagged')
})

// ---------------------------------------------------------------------------------------------
// sanitizer.js
// ---------------------------------------------------------------------------------------------

test('sanitizer: rewrites mis-cased tag/field/global names to canonical Sysmon casing', () => {
  const network = {
    rules: [{ id: 'r1', eventTag: 'processcreate', onmatch: 'exclude', filters: [{ field: 'commandline', condition: 'contains', value: 'x' }] }],
    globals: { hashalgorithms: 'md5,sha256' },
    globalComments: {},
  }
  const { network: fixed, changes } = sanitizeNetwork(network)
  assert(fixed.rules[0].eventTag === 'ProcessCreate', `expected canonical tag 'ProcessCreate', got '${fixed.rules[0].eventTag}'`)
  assert(fixed.rules[0].filters[0].field === 'CommandLine', `expected canonical field 'CommandLine', got '${fixed.rules[0].filters[0].field}'`)
  assert(fixed.globals.HashAlgorithms === 'MD5,SHA256', `expected uppercased hash list, got '${fixed.globals.HashAlgorithms}'`)
  assert(changes.length > 0, 'expected a non-empty change list')
})

test('sanitizer: reports no changes for already-canonical input', () => {
  const network = { rules: [{ id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', filters: [{ field: 'CommandLine', condition: 'contains', value: 'x' }] }], globals: {}, globalComments: {} }
  const { changes } = sanitizeNetwork(network)
  assert(changes.length === 0, `expected no changes, got ${JSON.stringify(changes)}`)
})

// ---------------------------------------------------------------------------------------------
// validator.js
// ---------------------------------------------------------------------------------------------

test('validator: flags an invalid condition operator', () => {
  const network = { rules: [{ id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', filters: [{ field: 'Image', condition: 'bogus-op', value: 'x' }] }], globals: {}, warnings: [] }
  const issues = validateNetwork(network)
  assert(issues.some((i) => i.severity === 'error' && i.message.includes('bogus-op')), 'expected an error flagging the invalid condition')
})

test('validator: does not flag a well-formed rule', () => {
  const network = { schemaversion: '4.90', rules: [{ id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', filters: [{ field: 'Image', condition: 'contains', value: 'cmd.exe' }] }], globals: {}, warnings: [] }
  const issues = validateNetwork(network)
  assert(issues.filter((i) => i.severity === 'error').length === 0, `expected no errors, got ${JSON.stringify(issues)}`)
})

// ---------------------------------------------------------------------------------------------
// ruleOps.js
// ---------------------------------------------------------------------------------------------

test('ruleOps: detectConflicts distinguishes duplicate vs. value conflict vs. none', () => {
  const candidate = createRuleFromForm({ eventTag: 'ProcessCreate', onmatch: 'exclude', filters: [{ field: 'Image', condition: 'contains', value: 'dup.exe' }] })
  const targets = [
    { id: 'dup', name: 'Dup', rules: [{ eventTag: 'ProcessCreate', onmatch: 'exclude', disabled: false, filters: [{ field: 'Image', condition: 'contains', value: 'dup.exe' }] }] },
    { id: 'conf', name: 'Conf', rules: [{ eventTag: 'ProcessCreate', onmatch: 'exclude', disabled: false, filters: [{ field: 'Image', condition: 'contains', value: 'other.exe' }] }] },
    { id: 'none', name: 'None', rules: [] },
  ]
  const conflicts = detectConflicts(candidate, targets)
  assert(conflicts.find((c) => c.networkId === 'dup').type === 'duplicate', 'expected a duplicate conflict')
  assert(conflicts.find((c) => c.networkId === 'conf').type === 'conflict', 'expected a value conflict')
  assert(conflicts.find((c) => c.networkId === 'none').type === 'none', 'expected no conflict')
})

test('ruleOps: a suppressed (disabled) rule is not treated as an existing duplicate', () => {
  const candidate = createRuleFromForm({ eventTag: 'ProcessCreate', onmatch: 'exclude', filters: [{ field: 'Image', condition: 'contains', value: 'dup.exe' }] })
  const targets = [{ id: 'n1', name: 'N', rules: [{ eventTag: 'ProcessCreate', onmatch: 'exclude', disabled: true, filters: [{ field: 'Image', condition: 'contains', value: 'dup.exe' }] }] }]
  const conflicts = detectConflicts(candidate, targets)
  assert(conflicts[0].type === 'none', `expected a suppressed rule to be ignored, got '${conflicts[0].type}'`)
})

// ---------------------------------------------------------------------------------------------
// Loose / orphaned rule handling (xmlParser.js, sanitizer.js, riskAnalyzer.js, diffEngine.js)
// ---------------------------------------------------------------------------------------------

test('parser: loose filter conditions with no enclosing event tag are auto-wrapped, not dropped', () => {
  const xml = '<Sysmon schemaversion="4.90"><EventFiltering><RuleGroup groupRelation="or"><Image condition="contains">\\loose.exe</Image><CommandLine condition="contains">loose cmd</CommandLine></RuleGroup></EventFiltering></Sysmon>'
  const result = parseSysmonConfig(xml)
  assert(result.rules.length === 1, `expected the two loose fields to be grouped into 1 synthesized rule, got ${result.rules.length}`)
  const rule = result.rules[0]
  assert(rule.orphaned === true, 'expected the synthesized rule to be flagged orphaned')
  assert(rule.filters.length === 2, `expected both loose filters to be kept, got ${rule.filters.length}`)
  assert(rule.eventTag === 'ProcessCreate', `expected the Image+CommandLine combo to be guessed as ProcessCreate, got '${rule.eventTag}'`)
  assert(result.warnings.some((w) => w.toLowerCase().includes('loose')), 'expected a warning about the loose conditions')
})

test('parser: a well-formed rule and a loose run in the same RuleGroup are kept separate, neither dropped', () => {
  const xml = '<Sysmon schemaversion="4.90"><EventFiltering><RuleGroup groupRelation="or"><NetworkConnect onmatch="exclude"><DestinationPort condition="is">443</DestinationPort></NetworkConnect><QueryName condition="contains">example.com</QueryName></RuleGroup></EventFiltering></Sysmon>'
  const result = parseSysmonConfig(xml)
  assert(result.rules.length === 2, `expected 2 rules (1 real NetworkConnect + 1 synthesized orphan), got ${result.rules.length}`)
  const real = result.rules.find((r) => r.eventTag === 'NetworkConnect')
  const orphan = result.rules.find((r) => r.orphaned)
  assert(real && !real.orphaned, 'the well-formed NetworkConnect rule must not be flagged orphaned')
  assert(orphan && orphan.filters[0].field === 'QueryName', 'the loose QueryName condition must be preserved in the synthesized orphan rule')
})

test('parser: non-standard <Exclude> wrapper tags are detected, onmatch inherited, contents flagged orphaned', () => {
  const xml = '<Sysmon schemaversion="4.90"><EventFiltering><Exclude><ProcessCreate><Image condition="contains">\\noisy.exe</Image></ProcessCreate></Exclude></EventFiltering></Sysmon>'
  const result = parseSysmonConfig(xml)
  assert(result.rules.length === 1, `expected 1 rule, got ${result.rules.length}`)
  const rule = result.rules[0]
  assert(rule.onmatch === 'exclude', `expected onmatch inherited from <Exclude>, got '${rule.onmatch}'`)
  assert(rule.orphaned === true, 'expected contents of a non-standard <Exclude> wrapper to be flagged orphaned')
  assert(result.warnings.some((w) => w.includes('non-standard') && w.includes('Exclude')), 'expected a warning about the non-standard wrapper tag')
})

test('parser: a well-formed event tag found outside <EventFiltering> is still extracted and flagged orphaned', () => {
  const xml = '<Sysmon schemaversion="4.90"><EventFiltering></EventFiltering><ProcessCreate onmatch="exclude"><Image condition="contains">\\stray.exe</Image></ProcessCreate></Sysmon>'
  const result = parseSysmonConfig(xml)
  assert(result.rules.length === 1, `expected the stray ProcessCreate to still be extracted, got ${result.rules.length} rule(s)`)
  assert(result.rules[0].orphaned === true, 'expected a rule found outside <EventFiltering> to be flagged orphaned')
  assert(result.rules[0].filters[0].value === '\\stray.exe', 'expected the stray rule\'s filter value to be preserved')
})

test('parser: a comment directly above a loose condition is preserved on the synthesized rule\'s filter', () => {
  const xml = '<Sysmon schemaversion="4.90"><EventFiltering><RuleGroup groupRelation="or">\n<!-- ticket SOC-456: legacy exclusion, needs re-wrapping -->\n<Image condition="contains">\\legacy.exe</Image></RuleGroup></EventFiltering></Sysmon>'
  const result = parseSysmonConfig(xml)
  const rule = result.rules.find((r) => r.orphaned)
  assert(rule, 'expected a synthesized orphaned rule')
  assert(rule.filters[0].comment === 'ticket SOC-456: legacy exclusion, needs re-wrapping', `expected the comment to be preserved on the loose filter, got ${JSON.stringify(rule.filters[0].comment)}`)
})

test('serializer: an orphaned rule still exports as valid, well-formed XML that re-parses cleanly', () => {
  const xml = '<Sysmon schemaversion="4.90"><EventFiltering><Image condition="contains">\\loose.exe</Image></EventFiltering></Sysmon>'
  const parsed = parseSysmonConfig(xml)
  assert(parsed.rules.length === 1 && parsed.rules[0].orphaned, 'expected one synthesized orphaned rule from the fixture')
  const exported = serializeSysmonConfig({ schemaversion: '4.90', globals: {}, rules: parsed.rules }, 'standard')
  assert(exported.includes('Auto-wrapped by Sysmon Config Matrix'), 'expected an auto-wrap transparency note in the export')
  const reparsed = parseSysmonConfig(exported)
  assert(!reparsed.error, `re-parsing the exported XML should succeed, got error: ${reparsed.error}`)
  assert(reparsed.rules.length === 1 && reparsed.rules[0].filters[0].value === '\\loose.exe', 'the loose condition must survive an export/re-import round trip without being duplicated or lost')
})

test('sanitizer: "Wrap Loose Rules into RuleGroups" clears the orphaned flag and assigns a RuleGroup name', () => {
  const network = { rules: [{ id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', orphaned: true, ruleGroupName: null, groupRelation: 'or', filters: [{ field: 'Image', condition: 'contains', value: 'x.exe' }] }], globals: {}, globalComments: {} }
  const { network: wrapped, changes } = wrapLooseRules(network)
  assert(changes.length === 1, `expected 1 change reported, got ${changes.length}`)
  assert(wrapped.rules[0].orphaned === false, 'expected the orphaned flag to be cleared')
  assert(!!wrapped.rules[0].ruleGroupName, 'expected a RuleGroup name to be assigned')
})

test('sanitizer: "Wrap Loose Rules" is a no-op when there are no orphaned rules', () => {
  const network = { rules: [{ id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', orphaned: false, filters: [{ field: 'Image', condition: 'contains', value: 'x.exe' }] }], globals: {}, globalComments: {} }
  const { changes } = wrapLooseRules(network)
  assert(changes.length === 0, `expected no changes, got ${JSON.stringify(changes)}`)
})

test('riskAnalyzer: findOrphanedRules flags only rules marked orphaned', () => {
  const nets = [{ id: 'n1', name: 'A', rules: [
    { id: 'r1', eventTag: 'ProcessCreate', onmatch: 'exclude', eventIds: [1], orphaned: true, filters: [] },
    { id: 'r2', eventTag: 'ProcessCreate', onmatch: 'exclude', eventIds: [1], orphaned: false, filters: [] },
  ] }]
  const flagged = findOrphanedRules(nets)
  assert(flagged.length === 1 && flagged[0].ruleId === 'r1', `expected only the orphaned rule to be flagged, got ${JSON.stringify(flagged)}`)
})

test('diffEngine: a bucket containing an orphaned rule is marked anyOrphaned for the UI badge', () => {
  const a = { rules: [{ id: 'a1', eventTag: 'ProcessCreate', onmatch: 'exclude', orphaned: true, filters: [{ field: 'Image', condition: 'contains', value: 'x.exe' }] }] }
  const b = { rules: [{ id: 'b1', eventTag: 'ProcessCreate', onmatch: 'exclude', orphaned: true, filters: [{ field: 'Image', condition: 'contains', value: 'x.exe' }] }] }
  const diff = diffNetworks(a, b)
  assert(diff.results[0].anyOrphaned === true, 'expected the bucket to be marked anyOrphaned')
})

// ---------------------------------------------------------------------------------------------
// mergeEngine.js (Merge & Policy Builder) - deterministic merge, conflict, and redundancy logic
// ---------------------------------------------------------------------------------------------

function mkRule(overrides) {
  return {
    id: overrides.id || `r-${Math.random().toString(36).slice(2, 8)}`,
    eventTag: 'ProcessCreate',
    eventIds: [1],
    onmatch: 'exclude',
    ruleGroupName: null,
    groupRelation: null,
    comment: null,
    filters: [],
    mitre: [],
    manualMitre: [],
    disabled: false,
    orphaned: false,
    ...overrides,
  }
}

test('mergeEngine (Union): identical condition lines from multiple networks are deduplicated, not duplicated', () => {
  const netA = { id: 'a', name: 'ConfigA.xml', rules: [mkRule({ filters: [{ field: 'CommandLine', condition: 'contains', value: 'mimikatz' }] })] }
  const netB = { id: 'b', name: 'ConfigB.xml', rules: [mkRule({ filters: [{ field: 'CommandLine', condition: 'contains', value: 'mimikatz' }] })] }
  const netC = { id: 'c', name: 'ConfigC.xml', rules: [mkRule({ filters: [{ field: 'CommandLine', condition: 'contains', value: 'procdump' }] })] }
  const merged = unionMerge([netA, netB, netC])
  assert(merged.length === 1, `expected one merged ProcessCreate/exclude rule, got ${merged.length}`)
  assert(merged[0].filters.length === 2, `expected 2 deduplicated condition lines (mimikatz once, procdump once), got ${merged[0].filters.length}`)
  const values = merged[0].filters.map((f) => f.value).sort()
  assert(JSON.stringify(values) === JSON.stringify(['mimikatz', 'procdump']), `unexpected filter values: ${JSON.stringify(values)}`)
})

test('mergeEngine (Union): same value with a different condition operator is kept as two distinct lines', () => {
  const netA = { id: 'a', name: 'A', rules: [mkRule({ filters: [{ field: 'Image', condition: 'contains', value: 'cmd.exe' }] })] }
  const netB = { id: 'b', name: 'B', rules: [mkRule({ filters: [{ field: 'Image', condition: 'is', value: 'cmd.exe' }] })] }
  const merged = unionMerge([netA, netB])
  assert(merged[0].filters.length === 2, `expected contains+is to be kept as 2 distinct lines, got ${merged[0].filters.length}`)
})

test('mergeEngine (Intersection): only the condition line present in every network survives', () => {
  const netA = { id: 'a', name: 'A', rules: [mkRule({ filters: [{ field: 'CommandLine', condition: 'contains', value: 'mimikatz' }, { field: 'CommandLine', condition: 'contains', value: 'onlyA' }] })] }
  const netB = { id: 'b', name: 'B', rules: [mkRule({ filters: [{ field: 'CommandLine', condition: 'contains', value: 'mimikatz' }] })] }
  const netC = { id: 'c', name: 'C', rules: [mkRule({ filters: [{ field: 'CommandLine', condition: 'contains', value: 'mimikatz' }] })] }
  const merged = intersectionMerge([netA, netB, netC])
  assert(merged.length === 1, `expected 1 rule, got ${merged.length}`)
  assert(merged[0].filters.length === 1 && merged[0].filters[0].value === 'mimikatz', `expected only the common "mimikatz" line, got ${JSON.stringify(merged[0].filters)}`)
})

test('mergeEngine (Differential): A-minus-B keeps only lines unique to A', () => {
  const netA = { id: 'a', name: 'OT.xml', rules: [mkRule({ filters: [{ field: 'Image', condition: 'contains', value: 'plc-tool.exe' }, { field: 'Image', condition: 'contains', value: 'shared.exe' }] })] }
  const netB = { id: 'b', name: 'Corp.xml', rules: [mkRule({ filters: [{ field: 'Image', condition: 'contains', value: 'shared.exe' }] })] }
  const diff = differentialMerge(netA, netB)
  assert(diff.length === 1, `expected 1 rule, got ${diff.length}`)
  assert(diff[0].filters.length === 1 && diff[0].filters[0].value === 'plc-tool.exe', `expected only the OT-only line, got ${JSON.stringify(diff[0].filters)}`)
  assert(diff[0].filters[0].comment.includes('OT.xml') && diff[0].filters[0].comment.includes('Corp.xml'), 'expected a source-attribution comment naming both networks')
})

test('mergeEngine (Hierarchical): base header/schema/hash pass through untouched; overlay only adds new lines', () => {
  const base = {
    id: 'base', name: 'Master.xml', schemaversion: '4.90',
    globals: { HashAlgorithms: 'SHA256' }, globalComments: {}, headerComment: 'Master banner',
    rules: [mkRule({ id: 'base-r1', filters: [{ field: 'Image', condition: 'contains', value: 'base.exe' }] })],
  }
  const overlay = { id: 'ov', name: 'Subnet.xml', rules: [mkRule({ filters: [{ field: 'Image', condition: 'contains', value: 'subnet-only.exe' }] })] }
  const result = hierarchicalMerge(base, [overlay])
  assert(result.schemaversion === '4.90', 'expected base schemaversion preserved')
  assert(result.globals.HashAlgorithms === 'SHA256', 'expected base HashAlgorithms preserved')
  assert(result.headerComment === 'Master banner', 'expected base header comment preserved')
  assert(result.rules[0] === base.rules[0], 'expected the base rule object to be carried through unmodified (same reference)')
  assert(result.rules.length === 2, `expected base rule + 1 injected overlay rule, got ${result.rules.length}`)
  assert(result.rules[1].filters[0].comment.includes('Subnet.xml'), 'expected the injected line to carry a source-attribution comment')
})

test('mergeEngine: detectOnmatchConflicts flags an include-vs-exclude mismatch on the same value', () => {
  const netA = { id: 'a', name: 'A', rules: [mkRule({ onmatch: 'exclude', filters: [{ field: 'Image', condition: 'is', value: 'mimikatz.exe' }] })] }
  const netB = { id: 'b', name: 'B', rules: [mkRule({ onmatch: 'include', filters: [{ field: 'Image', condition: 'is', value: 'mimikatz.exe' }] })] }
  const conflicts = detectOnmatchConflicts([netA, netB])
  assert(conflicts.length === 1, `expected 1 onmatch conflict, got ${conflicts.length}`)
  assert(conflicts[0].sides.length === 2, 'expected both onmatch sides represented')
})

test('mergeEngine: resolveOnmatchConflict "keep-include" removes the conflicting exclude line without touching unrelated rules', () => {
  const netA = { id: 'a', name: 'A', rules: [mkRule({ id: 'ra', onmatch: 'exclude', filters: [{ field: 'Image', condition: 'is', value: 'mimikatz.exe' }] })] }
  const netB = { id: 'b', name: 'B', rules: [mkRule({ id: 'rb', onmatch: 'include', filters: [{ field: 'Image', condition: 'is', value: 'mimikatz.exe' }] })] }
  const conflicts = detectOnmatchConflicts([netA, netB])
  const merged = unionMerge([netA, netB])
  const resolved = resolveOnmatchConflict(merged, conflicts[0], 'keep-include')
  assert(resolved.every((r) => r.onmatch !== 'exclude'), 'expected the exclude-side rule to be removed entirely once its only filter was removed')
  assert(resolved.some((r) => r.onmatch === 'include'), 'expected the include-side rule to remain')
})

test('mergeEngine: resolveOnmatchConflict "merge-or" tags both sides with a shared RuleGroup + groupRelation="or"', () => {
  const netA = { id: 'a', name: 'A', rules: [mkRule({ onmatch: 'exclude', filters: [{ field: 'Image', condition: 'is', value: 'x.exe' }] })] }
  const netB = { id: 'b', name: 'B', rules: [mkRule({ onmatch: 'include', filters: [{ field: 'Image', condition: 'is', value: 'x.exe' }] })] }
  const conflicts = detectOnmatchConflicts([netA, netB])
  const merged = unionMerge([netA, netB])
  const resolved = resolveOnmatchConflict(merged, conflicts[0], 'merge-or')
  assert(resolved.every((r) => r.groupRelation === 'or'), 'expected every affected rule to carry groupRelation "or"')
  const names = new Set(resolved.map((r) => r.ruleGroupName))
  assert(names.size === 1, `expected both sides to share one RuleGroup name, got ${JSON.stringify([...names])}`)
})

test('mergeEngine: detectGroupRelationConflicts + resolveGroupRelationConflict', () => {
  const netA = { id: 'a', name: 'A', rules: [mkRule({ ruleGroupName: 'Suspicious', groupRelation: 'and', filters: [{ field: 'Image', condition: 'is', value: 'x.exe' }] })] }
  const netB = { id: 'b', name: 'B', rules: [mkRule({ ruleGroupName: 'Suspicious', groupRelation: 'or', filters: [{ field: 'Image', condition: 'is', value: 'y.exe' }] })] }
  const conflicts = detectGroupRelationConflicts([netA, netB])
  assert(conflicts.length === 1 && conflicts[0].groupKey === 'Suspicious', 'expected 1 GroupRelation conflict keyed on the shared RuleGroup name')
  const merged = unionMerge([netA, netB])
  const resolved = resolveGroupRelationConflict(merged, conflicts[0], 'and')
  assert(resolved.every((r) => r.groupRelation === 'and'), 'expected every rule in the "Suspicious" group to now use "and"')
})

test('mergeEngine: detectHashAlgorithmConflict surfaces every distinct HashAlgorithms value and its networks', () => {
  const netA = { id: 'a', name: 'A', rules: [], globals: { HashAlgorithms: 'MD5,SHA256' } }
  const netB = { id: 'b', name: 'B', rules: [], globals: { HashAlgorithms: 'SHA256,IMPHASH' } }
  const conflict = detectHashAlgorithmConflict([netA, netB])
  assert(conflict && conflict.options.length === 2, `expected 2 distinct HashAlgorithms values, got ${JSON.stringify(conflict)}`)
})

test('mergeEngine: findRedundantConditions flags a narrower begin-with line already covered by a broader contains', () => {
  const rules = [mkRule({ id: 'r1', onmatch: 'exclude', filters: [
    { field: 'TargetFilename', condition: 'contains', value: 'C:\\Windows\\Temp' },
  ] }), mkRule({ id: 'r2', onmatch: 'exclude', filters: [
    { field: 'TargetFilename', condition: 'begin with', value: 'C:\\Windows\\Temp\\sub' },
  ] })]
  const flagged = findRedundantConditions(rules)
  assert(flagged.length === 1, `expected 1 redundancy flag, got ${flagged.length}`)
  assert(flagged[0].narrow.ruleId === 'r2', 'expected the narrower (longer, more specific) line to be the one flagged for removal')
})

test('mergeEngine: findRedundantConditions still catches overlap when both lines land in the SAME merged rule (regression)', () => {
  // Union merge regroups same Event tag + onmatch + RuleGroup lines into one rule object, so the
  // broad/narrow pair below are two filters on the SAME rule - the heuristic must not skip this
  // just because they share a ruleId (that was a real bug: it used to skip same-ruleId pairs).
  const netA = { id: 'a', name: 'A', rules: [mkRule({ filters: [{ field: 'CommandLine', condition: 'contains', value: 'C:\\Windows\\Temp' }] })] }
  const netB = { id: 'b', name: 'B', rules: [mkRule({ filters: [{ field: 'CommandLine', condition: 'begin with', value: 'C:\\Windows\\Temp\\sub' }] })] }
  const merged = unionMerge([netA, netB])
  assert(merged.length === 1, `expected both lines to merge into a single rule, got ${merged.length} rules`)
  const flagged = findRedundantConditions(merged)
  assert(flagged.length === 1, `expected the overlap to still be flagged even though both lines share one rule, got ${flagged.length}`)
})

test('mergeEngine: removeConditionLine removes only the targeted line and drops the rule if it becomes empty', () => {
  const rules = [mkRule({ id: 'r1', filters: [{ field: 'Image', condition: 'contains', value: 'only.exe' }] })]
  const after = removeConditionLine(rules, 'r1', 'Image', 'only.exe')
  assert(after.length === 0, 'expected the rule to be dropped once its only filter was removed')
})

test('mergeEngine + xmlSerializer + xmlParser: a full Union merge round-trips through serialize -> re-parse with no errors', () => {
  const netA = { id: 'a', name: 'ConfigA', schemaversion: '4.90', globals: { HashAlgorithms: 'SHA256' }, globalComments: {}, rules: [mkRule({ filters: [{ field: 'CommandLine', condition: 'contains', value: 'mimikatz' }] })] }
  const netB = { id: 'b', name: 'ConfigB', schemaversion: '4.90', globals: { HashAlgorithms: 'SHA256' }, globalComments: {}, rules: [mkRule({ onmatch: 'include', eventTag: 'NetworkConnect', eventIds: [3], filters: [{ field: 'DestinationPort', condition: 'is', value: '4444' }] })] }
  const merged = unionMerge([netA, netB])
  const assembled = assembleMergedNetwork('union', [netA, netB], merged, { name: 'ConfigMerged' })
  const xml = serializeSysmonConfig(assembled, 'standard')
  const reparsed = parseSysmonConfig(xml)
  assert(!reparsed.error, `expected the merged output to re-parse without error, got: ${reparsed.error}`)
  assert(reparsed.rules.length === 2, `expected 2 rules to survive the round trip, got ${reparsed.rules.length}`)
})

finish()
