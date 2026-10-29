import { html } from '../lib/react.js'
import { H, P, Ul, Kbd, Callout, CodeBlock, Faq, DevNote } from '../components/HelpPrimitives.js'
import {
  Rocket, LayoutGrid, ListChecks, ShieldAlert, FileArchive, Bookmark, MessageCircleQuestion, Bot,
  GitMerge, ScanSearch,
} from '../components/icons.js'
import { ALL_EVENT_IDS, EVENT_ID_LABELS, TAG_BY_EVENT_ID, CONDITIONS, COMMON_FIELDS_BY_TAG } from '../utils/eventSchema.js'

// NB: htm parses these template strings as mini-HTML, so any literal "<...>" text (e.g. a
// mention of the <RuleGroup> tag) must be passed as a plain JS string via ${'...'} rather than
// written inline, or htm will try to parse it as a real child element instead of text.
function tag(name) {
  return html`<${Kbd}>${`<${name}>`}</${Kbd}>`
}
function code(text) {
  return html`<${Kbd}>${text}</${Kbd}>`
}

function GettingStarted() {
  return html`<div>
    <${P}>The sidebar's drop zone (top-left) accepts Sysmon configuration XML files one at a time or in a batch - drag several files onto it at once, or click it to browse and multi-select. Any filename works - the bundled samples just happen to follow a ${code('Config<Name>.xml')} convention.</${P}>
    <${P}>Each imported file becomes a "network" card in the sidebar with its own color swatch, rule count, and notice count. Networks persist to your browser's local storage automatically, so reloading the page won't lose your work - use the sidebar's <b>Undo</b> / <b>Redo</b> buttons to step back through imports, edits, and deletions in the current session.</${P}>

    <${DevNote}>
      Dropping/browsing a file calls ${code('FileImport.js')}, which reads it with the browser's ${code('File.text()')} and hands the raw XML string to the Zustand store action ${code('useStore().importFile(fileName, xmlText)')} (${code('src/store/useStore.js')}). That action calls ${code('parseSysmonConfig()')} in ${code('src/utils/xmlParser.js')} - a hand-rolled, comment-preserving parser built on ${code('fast-xml-parser')}'s ${code('preserveOrder')} mode (not a generic XSD-validated parse) - and stores the resulting ${code('{ schemaversion, globals, rules, warnings, ... }')} object as one entry in the ${code('networks')} array. Every mutating store action re-serializes that whole array to ${code('localStorage')} under the key ${code('sysmon-matrix::networks::v1')}; <b>Undo/Redo</b> just pop/push deep clones of that array to/from an in-memory ${code('history.past')} / ${code('history.future')} stack (also in ${code('useStore.js')}) - nothing server-side, nothing async.
    </${DevNote}>

    <${H}>Why messy or malformed XML won't lose rules</${H}>
    <${P}>Real-world Sysmon configs are rarely tidy: inconsistent indentation, optional ${tag('RuleGroup')} wrapping, mixed tag casing, and even genuinely malformed nesting (one bundled sample has a ${tag('ProcessCreate')} block accidentally duplicated inside itself). The parser is deliberately tolerant:</${P}>
    <${Ul}>
      <li>It walks the whole document recursively instead of assuming a fixed depth, so a rule nested somewhere unexpected is still found and extracted - a notice is logged, but nothing is dropped.</li>
      <li>${code('onmatch')} and ${code('condition')} attribute values are matched case-insensitively and normalized (e.g. ${code('onmatch="Exclude"')} becomes ${code('exclude')}) so the rest of the app's logic never silently mis-fires on mixed casing.</li>
      <li>Tag/field name casing is left exactly as the source had it (so nothing is lost), with a notice logged - use <b>Sanitize & Standardize Casing</b> (see the Risk Analyzer & Sanitizer topic) when you want that cleaned up on purpose.</li>
      <li>Comments - banner headers, per-rule notes, inline trailing notes - are reattached to whatever they most likely document and survive edits and re-exports. See the Export topic for details.</li>
    </${Ul}>
    <${Callout} tone="info" title="Where to see what the parser noticed">
      Each network's "N notices" link in the sidebar, and the Dashboard tab's per-network card, list every warning the parser logged for that file (unusual casing, malformed nesting it compensated for, fields it didn't recognize, etc.). None of these block the import - they're informational.
    </${Callout}>
    <${Callout} tone="tip">
      Load a couple of near-identical configs (e.g. the same baseline deployed to two environments) to see the Side-by-Side Diff tab report "no differences" - a quick way to confirm two environments really are in sync before you dig further.
    </${Callout}>
  </div>`
}

function MatrixViewTopic() {
  return html`<div>
    <${P}>The Matrix View tab is the unified comparison surface: every Sysmon Event ID that at least one loaded network has rules for becomes a row, and every network is a column. Each cell shows how many <b>include</b> and <b>exclude</b> rules that network has for that Event ID (green = include, red = exclude, grey "N off" = suppressed rules present, "—" = none).</${P}>
    <${P}>Click anywhere on a row to expand it. The expanded row shows, per network, every matching rule's filters (field, condition, value), any attached comment, MITRE ATT&CK tags, and per-rule controls to suppress (eye icon) or permanently delete (trash icon) it.</${P}>

    <${H}>Filtering</${H}>
    <${Ul}>
      <li><b>Keyword search</b> - matches against both the field name and the value of every filter (e.g. typing ${code('mimikatz')} finds any rule whose condition value contains it).</li>
      <li><b>Event ID</b> - narrows the matrix to a single row.</li>
      <li><b>include / exclude</b> - only shows rules with that ${code('onmatch')}.</li>
      <li><b>GroupRelation</b> - only shows rules whose enclosing ${tag('RuleGroup')} (if any) uses ${code('or')} or ${code('and')}.</li>
      <li><b>MITRE ATT&CK technique</b> - only shows rules auto-tagged (or manually tagged) with the chosen technique ID.</li>
    </${Ul}>
    <${P}>Filters narrow what each cell counts and what the expanded breakdown shows, but a row stays visible even if nothing in it currently matches (its cells just show "—") - so you can see at a glance which Event IDs have zero matches for your current filter versus which ones were never populated at all.</${P}>

    <${H}>Risk badges on rows</${H}>
    <${P}>A small shield-alert icon next to an Event ID means the Risk Analyzer flagged something for that row - see the dedicated topic for exactly what it's checking. The toolbar's top-right corner also totals every mismatch and broad-rule flag across all loaded networks, so you can tell at a glance whether anything needs attention before you've expanded a single row.</${P}>

    <${DevNote}>
      ${code('MatrixView.js')} builds its rows/cells straight from the already-parsed ${code('networks')} array in memory - no XML is touched here at all. The grid itself comes from ${code('buildMatrix()')} in ${code('src/utils/diffEngine.js')} (one row per known Event ID, one cell per network, counting ${code('include')}/${code('exclude')} rules whose ${code('eventIds')} includes that row); the risk badges come from ${code('buildRiskIndex()')} in ${code('src/utils/riskAnalyzer.js')}. Both are wrapped in ${code('useMemo')} keyed on the ${code('networks')} array, so they only recompute when a rule is actually added/edited/removed/suppressed - not on every filter keystroke. Edits made in the expanded row's inline form (${code('RuleEditForm')}) call ${code('useStore().updateRule(networkId, ruleId, updates)')}, which also re-derives that rule's MITRE suggestions via ${code('suggestMitreTechniques()')} (${code('src/utils/mitreMap.js')}).
    </${DevNote}>
  </div>`
}

function RuleManagementTopic() {
  return html`<div>
    <${H}>Global Rule Injector</${H}>
    <${P}>Open it from the sidebar's <b>Add Rule to All / Selected</b> button, or the Global Rule Injector tab directly. Pick your target networks either with the sidebar's per-network checkboxes (and the ${code('all')} / ${code('none')} shortcuts) or the "Target networks" panel on the right of the tab - both control the same selection.</${P}>
    <${Ul}>
      <li><b>Form Builder mode</b> - choose an Event tag and ${code('onmatch')}, then add one or more field / condition / value rows with <b>Add condition</b>.</li>
      <li><b>Raw XML mode</b> - paste a snippet directly, e.g.:</li>
    </${Ul}>
    <${CodeBlock} code=${'<ProcessCreate onmatch="exclude">\n  <CommandLine condition="contains">mimikatz</CommandLine>\n</ProcessCreate>'} />
    <${P}>Either way, click <b>Preview conflicts & build rule</b> before applying - see Conflict & Duplicate Detection below. Once you're happy with the preview, <b>Apply to N networks</b> commits it to every selected target.</${P}>

    <${DevNote}>
      <b>Preview conflicts & build rule</b> calls ${code('createRuleFromForm()')} (Form Builder mode) or ${code('parseRawSnippet()')} (Raw XML mode) in ${code('src/utils/ruleOps.js')}. ${code('parseRawSnippet()')} is a thin wrapper: it drops your pasted snippet into a throwaway ${code('<Sysmon><EventFiltering>...</EventFiltering></Sysmon>')} shell and runs it through the exact same ${code('parseSysmonConfig()')} used for whole-file imports - so a pasted rule gets identical tolerant-parsing/casing/warning behavior as an imported config. The preview's conflict list comes from ${code('detectConflicts()')} in the same file, which compares the candidate rule's filter signature (${code('filterSetSignature()')} - a sorted ${code('field::condition::value')} join) against each target network's existing, non-suppressed rules of the same Event tag + ${code('onmatch')}. <b>Apply to N networks</b> calls ${code('useStore().applyRuleToNetworks(rule, targetIds)')}, which clones the rule with a fresh id per target and appends it to each target network's ${code('rules')} array.
    </${DevNote}>

    <${H}>Global Rule Remover / Suppressor</${H}>
    <${P}>Opened from the sidebar's <b>Remove / Suppress Rule</b> button. Pick target networks the same way as the injector, then search either by:</${P}>
    <${Ul}>
      <li><b>Keyword / Field</b> - a free-text value or field name, optionally narrowed by Event tag and/or ${code('onmatch')}.</li>
      <li><b>Raw XML snippet</b> - paste a rule and it matches networks whose rule has the exact same set of filters.</li>
    </${Ul}>
    <${P}>Check/uncheck individual matches (or use select all / none), then choose one of two actions:</${P}>
    <${Ul}>
      <li><b>Delete selected</b> - removes the rule outright. This is permanent (aside from Undo for the current session).</li>
      <li><b>Comment out (suppress) selected</b> - keeps the rule in the app, marked disabled. It stops counting toward active include/exclude totals, shows greyed-out with a "suppressed" tag everywhere, and exports as an inert, clearly-labeled XML comment instead of a live tag - nothing is lost, and the exported file documents exactly what was turned off and when.</li>
    </${Ul}>
    <${Callout} tone="tip" title="Re-enabling a suppressed rule">
      Open Matrix View, expand the row for that rule's Event ID, find it under the right network column (it's greyed out with a "suppressed" pill), and click the eye icon to re-enable it. There's no separate "restore" screen - the eye icon toggles both ways.
    </${Callout}>

    <${DevNote}>
      <b>Search</b> calls ${code('findMatchingRules()')} (keyword/field/tag/onmatch, a plain array filter over every target network's ${code('rules')}) or ${code('findRulesBySnippet()')} (parses your pasted snippet with the same ${code('parseRawSnippet()')} as the Injector, then matches by exact filter signature) - both in ${code('src/utils/ruleFinder.js')}. <b>Delete selected</b> calls ${code('useStore().deleteRulesAcrossNetworks(refs)')}, which filters those rule ids out of each affected network's ${code('rules')} array. <b>Comment out (suppress) selected</b> calls ${code('useStore().setRulesDisabled(refs, true)')}, which just flips each rule's ${code('disabled')} flag in place - the rule object itself (filters, comment, MITRE tags) is untouched, which is why re-enabling it later restores it exactly. The eye icon in Matrix View calls the single-rule equivalent, ${code('toggleRuleDisabled(networkId, ruleId)')}.
    </${DevNote}>

    <${H}>Conflict & Duplicate Detection</${H}>
    <${P}>Every time you preview a rule in the Injector, it's checked against each target network's <i>existing, non-suppressed</i> rules of the same Event tag and ${code('onmatch')}:</${P}>
    <${Ul}>
      <li><b>Duplicate</b> - a network already has a rule with the exact same set of field/condition/value filters. Applying anyway creates a second, redundant copy.</li>
      <li><b>Conflict</b> - a network has a rule matching the same field and condition but a <i>different</i> value - applying your rule won't remove the old one, so both will be active side by side (often not what you want for something like a single ${code('DestinationPort')} exclusion).</li>
      <li><b>No conflicts detected</b> - a green check means this exact rule doesn't already exist in that network.</li>
    </${Ul}>
    <${P}>This check runs automatically on preview - there's nothing to switch on - and it's purely informational: you can still apply even if conflicts are flagged, since sometimes a conflicting rule is exactly what you intend.</${P}>
  </div>`
}

function MergeBuilderTopic() {
  return html`<div>
    <${Callout} tone="info" title="100% deterministic - no AI involved">
      Every merge mode, conflict detector, and the redundancy check on this tab is plain set-operation/structural-regrouping
      code (${code('src/utils/mergeEngine.js')}) - the same kind of logic as the Diff Viewer or Risk Analyzer, not an LLM.
    </${Callout}>

    <${DevNote}>
      Every merge mode first flattens each source network into one condition-line-at-a-time entries via ${code('collectFilterEntries()')}, dedupes/compares using ${code('filterSignature()')} (${code('field::condition::value')}), then reassembles rule objects with ${code('groupEntriesIntoRules()')} - the shared pipeline every mode below ends with. <b>Run Merge</b> calls, by mode: ${code('unionMerge()')} (keep every distinct line, attribute sources), ${code('intersectionMerge()')} (keep only lines present in every source), ${code('differentialMerge(A, B)')} (lines in A absent from B), or ${code('hierarchicalMerge(base, overlays)')} (carry the base network through untouched, only add missing lines from overlays) - all in ${code('src/utils/mergeEngine.js')}. Conflict detection (${code('detectOnmatchConflicts()')}, ${code('detectGroupRelationConflicts()')}, ${code('detectHashAlgorithmConflict()')}, ${code('detectSchemaVersionConflict()')}) and the redundancy heuristic (${code('findRedundantConditions()')}, a same-field string-prefix check) run automatically right after; each resolution button calls ${code('resolveOnmatchConflict()')} or ${code('resolveGroupRelationConflict()')}, which are pure functions re-applied from scratch against the original merge output on every click (never mutated in place), which is why changing your mind never corrupts an earlier decision. <b>Save as new workspace network</b> serializes with ${code('assembleMergedNetwork()')} then feeds that XML back through ${code('parseSysmonConfig()')} - the identical import path as a dropped file.
    </${DevNote}>

    <${H}>1. Select input sources and a base</${H}>
    <${P}>Check 2 or more networks in the left panel (or drop/browse fresh ${code('.xml')} files right there - they're imported and immediately selectable). Click the crown icon on any checked network to mark it the <b>Base / Primary</b>: it's required for Hierarchical mode, used as Source A for Differential mode, and used as the schema/hash tiebreak default for Union and Intersection when there's no explicit conflict resolution.</${P}>

    <${H}>2. Pick a merge mode</${H}>
    <${Ul}>
      <li><b>Union / Additive</b> - every unique rule across all sources; identical condition lines (same field + condition + value, within the same Event tag + onmatch) are deduplicated so the same line pulled from 3 networks doesn't appear 3 times.</li>
      <li><b>Intersection</b> - keeps only condition lines present, byte-for-byte identical, in <i>every</i> selected source - a mandatory shared baseline.</li>
      <li><b>Differential / Override</b> - condition lines in the base (Source A) that are missing from the other selected source (Source B). Use the "Swap A ↔ B" shortcut to flip direction.</li>
      <li><b>Hierarchical Inheritance</b> - the base network's header, ${code('schemaversion')}, and ${code('HashAlgorithms')} pass through completely untouched; overlay networks only ever ADD condition lines the base doesn't already have.</li>
    </${Ul}>

    <${H}>3. Run Merge, then resolve conflicts</${H}>
    <${P}>Clicking <b>Run Merge</b> both computes the output and scans every selected source for conflicts. Every resolution choice is re-applied from scratch against the original merge output each time you change your mind, so clicking around freely never corrupts an earlier decision:</${P}>
    <${Ul}>
      <li><b>Onmatch conflicts</b> - e.g. one source excludes ${code('mimikatz.exe')} while another includes it under the same Event tag. Four buttons: <i>Keep Source A</i>, <i>Keep Source B</i>, <i>Keep Both (Separate Rules)</i>, or <i>Merge into RuleGroup (OR)</i> (tags both sides with a shared RuleGroup name and ${code('groupRelation="or"')}).</li>
      <li><b>GroupRelation mismatches</b> - the same RuleGroup/Event tag using ${code('and')} in one source and ${code('or')} in another; pick which value wins for the output.</li>
      <li><b>HashAlgorithms / schema version mismatches</b> - a dropdown lists every distinct value seen across every source so you choose the one unified value for the merged output.</li>
    </${Ul}>
    <${Callout} tone="tip" title="Redundancy / Overlap Check">
      A separate panel flags (never auto-removes) a narrower ${code('contains')}/${code('begin with')} condition whose value is already covered by a broader one on the same field - e.g. ${code('begin with "C:\\Windows\\Temp\\sub"')} once ${code('contains "C:\\Windows\\Temp"')} already exists. This is a string-prefix heuristic, not a semantic guarantee, so it's a one-click "Remove narrower line" button, not an automatic deletion.
    </${Callout}>

    <${H}>4. Source attribution and output</${H}>
    <${P}>Every merged condition line is commented with where it came from (e.g. "Merged from ConfigOT.xml, ConfigCorp.xml" or "Only in ConfigOT.xml (not present in ConfigCorp.xml)") - preserved through to export like any other rule comment. The live preview re-serializes on every change in any export style, and shows the same validity badge as the Raw Editor.</${P}>
    <${P}><b>Save as new workspace network</b> feeds the merged XML back through the normal import/parse pipeline - the exact same validation path as any uploaded file - and adds it to the sidebar; <b>Download</b> exports ${code('ConfigMerged.xml')} directly.</${P}>
  </div>`
}

function RiskAnalyzerTopic() {
  return html`<div>
    <${H}>Operator mismatch warnings</${H}>
    <${P}>The analyzer groups every filter across every loaded network by Event tag + ${code('onmatch')} + field + value (case-insensitive). If the <i>same</i> target value shows up under different ${code('condition')} operators in different networks - say Network A excludes ${code('cmd.exe')} with ${code('contains')} while Network B excludes it with ${code('is')} - that's flagged as an operator mismatch, because those two operators don't actually catch the same set of real-world values (${code('is')} requires an exact match; ${code('contains')} matches any path containing that substring).</${P}>
    <${P}>You'll see a count in the Matrix View toolbar, a shield icon on the affected row, and - when you expand that row - a detail panel listing exactly which network uses which operator for that value.</${P}>
    <${Callout} tone="warning">
      An operator mismatch usually means one environment is quietly under-protected (or over-logging) relative to the others for what was presumably meant to be the same rule. It's worth reconciling to a single operator unless the difference is deliberate.
    </${Callout}>

    <${DevNote}>
      All three checks live in ${code('src/utils/riskAnalyzer.js')} and run on plain in-memory rule objects - no XML parsing happens here. ${code('findOperatorMismatches()')} buckets every filter by ${code('eventTag::onmatch::field::value')} (value lowercased/trimmed) and flags any bucket where more than one distinct ${code('condition')} shows up. ${code('findOverlyBroadRules()')} flags ${code('contains')}/${code('contains any')}/${code('contains all')}/${code('begin with')}/${code('end with')} filters whose value is under 6 characters and doesn't look path-like (no ${code('\\')}/${code('/')} and no file-extension-shaped ending) - a plain regex heuristic, not a real-world false-positive simulation. ${code('findOrphanedRules()')} just surfaces rules the parser already flagged ${code('orphaned: true')} on import. ${code('buildRiskIndex()')} runs all three and indexes the results by Event ID/rule id for ${code('MatrixView.js')} to look up without re-scanning per cell.
    </${DevNote}>

    <${H}>Overly broad rule warnings</${H}>
    <${P}>Flags any filter using a broad-match condition (${code('contains')}, ${code('contains any')}, ${code('contains all')}, ${code('begin with')}, ${code('end with')}) against a short value (under 6 characters) that doesn't look like a path or filename (no backslash/forward-slash and no file-extension-shaped ending). Something like excluding ${code('CommandLine contains "cmd"')} will match almost anything that merely mentions "cmd" anywhere, which can both flood logs and quietly suppress genuine detections.</${P}>
    <${P}>For ${code('DriverLoad')} / ${code('ImageLoad')} exclude rules specifically, the warning calls out an extra consequence: an overly broad exclusion there risks silently dropping legitimate drivers or images far beyond what was intended.</${P}>
    <${P}>Flagged lines show a small amber "broad" pill in the Matrix View's expanded row detail - hover it for the specific reason.</${P}>

    <${H}>Sanitize & Standardize Casing</${H}>
    <${P}>Available per-network from the Raw Editor / Export tab's toolbar, or for every loaded network at once via the sidebar's <b>Sanitize All Networks</b> button. It rewrites:</${P}>
    <${Ul}>
      <li>Event tag casing to the official form (e.g. ${tag('processcreate')} → ${tag('ProcessCreate')}).</li>
      <li>Known field name casing (e.g. ${tag('commandline')} → ${tag('CommandLine')}, ${tag('targetfilename')} → ${tag('TargetFilename')}). Fields the app doesn't recognize are left untouched rather than guessed at.</li>
      <li>Global option tag casing (e.g. ${tag('hashalgorithms')} → ${tag('HashAlgorithms')}), and the ${code('HashAlgorithms')} value's own casing (e.g. ${code('md5')} → ${code('MD5')}).</li>
    </${Ul}>
    <${P}>After running it, a change list shows exactly what was rewritten (or confirms there was nothing to change). This is separate from - and a complement to - the automatic, silent lowercasing the parser already does for ${code('onmatch')}/${code('condition')} <i>values</i> on import (that happens regardless, because the app's internal logic depends on it); Sanitize is specifically for the cosmetic/schema-compliance casing of tag and field <i>names</i>, which is left as-authored until you explicitly ask for it.</${P}>

    <${DevNote}>
      ${code('sanitizeNetwork()')} in ${code('src/utils/sanitizer.js')} rewrites casing only - it looks up each tag/field/condition/onmatch lowercased against a canonical lowercase→correct-case table built from ${code('eventSchema.js')}'s own exports (${code('EVENT_TAGS')}, ${code('GLOBAL_TAGS')}, ${code('COMMON_FIELDS_BY_TAG')}, ${code('CONDITIONS')}) - unrecognized fields are left untouched rather than guessed at, and it returns a plain ${code('{ network, changes }')} pair rather than mutating anything. ${code('wrapLooseRules()')} (same file) just clears each ${code('orphaned')} flag and assigns a descriptive ${code('ruleGroupName')} - the rule's actual event tag/filters were already decided back at import time by the parser's own best-guess logic (see Getting Started). The store actions ${code('sanitizeNetwork(id)')}/${code('sanitizeAllNetworks()')}/${code('wrapLooseRules(id)')}/${code('wrapLooseRulesAllNetworks()')} just call these and commit the result if anything actually changed.
    </${DevNote}>
  </div>`
}

function ExportTopic() {
  return html`<div>
    <${H}>Export formats</${H}>
    <${P}>Set from the dropdown on the Raw Editor / Export tab, then use <b>Download this network</b> for a single file or <b>Export all as .zip</b> to bundle every loaded network at once:</${P}>
    <${Ul}>
      <li><b>Standard (flat rules)</b> - rules grouped by Event tag + ${code('onmatch')}, no ${tag('RuleGroup')} wrapping.</li>
      <li><b>SwiftOnSecurity style</b> - each Event tag family wrapped in its own named ${code('<RuleGroup groupRelation="or">')}, mirroring that community project's layout conventions.</li>
      <li><b>Olaf Hartong modular style</b> - similar ${tag('RuleGroup')} wrapping, named as independent "modules" per Event tag.</li>
    </${Ul}>
    <${Callout} tone="info">
      These styles are convenience formatting for readability/auditing, not a byte-for-byte reproduction of either community project - the underlying rules are identical either way.
    </${Callout}>

    <${DevNote}>
      All three styles are produced by one function, ${code('serializeSysmonConfig(network, style)')} in ${code('src/utils/xmlSerializer.js')} - it walks the in-memory ${code('{ schemaversion, globals, rules }')} model and prints clean, consistently-indented XML text; the ${code('style')} argument only changes whether/how rules get wrapped in named ${tag('RuleGroup')} blocks (${code('serializeRuleGroupBody()')}), not the underlying filter data. Disabled rules are emitted as a single commented-out block (so they re-import as inert, not as live rules) rather than a live tag with a note above it. <b>Download this network</b> calls ${code('downloadText()')} (${code('src/utils/download.js')} - a plain ${code('Blob')} + object URL, no network request); <b>Export all as .zip</b> does the same per network through the ${code('jszip')} package. Everything here is synchronous, client-side, and never leaves the browser.
    </${DevNote}>

    <${H}>Comment preservation</${H}>
    <${P}>Banner headers above ${tag('Sysmon')}, comments documenting a global option or a rule, and inline trailing notes on individual filter lines are all preserved through import → edit/inject/suppress → export. Internal ticket links and analyst notes written as XML comments survive the full round trip - they're reattached to whichever rule, filter, or global option they most likely document (own-line comments document what follows; same-line trailing comments document what preceded them on that line).</${P}>
    <${P}>Suppressing a rule doesn't erase its comment either - a suppressed rule exports as a single commented-out block carrying both its original comment (if any) and a ${code('SUPPRESSED via Sysmon Config Matrix (<date>)')} marker, so the exported file is self-documenting about what was turned off, when, and why.</${P}>
    <${Callout} tone="warning">
      Exact whitespace and tag <i>order</i> from the original file are not preserved byte-for-byte - re-exported XML is always clean and consistently indented. Comments are what's guaranteed to survive; original formatting quirks are not.
    </${Callout}>

    <${H}>Air-gapped mode</${H}>
    <${P}>This copy of the app ships with ${code('./vendor/')} already populated and defaults to using it, so React, Zustand, and every other dependency load from local files with zero internet access out of the box - no setup needed on a fresh/air-gapped machine.</${P}>
    <${Ul}>
      <li>If you ever change a dependency version, re-run ${code('python requirements/vendor-deps.py')} once while online from the project folder to refresh ${code('./vendor/')}.</li>
      <li>Ship the whole project folder - including ${code('vendor/')} - to the air-gapped network; any static file server works, no Node.js required.</li>
      <li>The CDN/Offline badge in the top bar (next to the theme toggle) shows which mode is active and lets you switch to <b>CDN (esm.sh)</b> instead if this particular machine has internet and you want the latest patch versions - or load the app with ${code('?modules=cdn')} in the URL. The choice is remembered per browser.</li>
    </${Ul}>
    <${Callout} tone="tip">
      The badge's color tells you which mode is active at a glance (amber = offline/vendor, sky = CDN). If a teammate reports the app "won't load" on an air-gapped machine, the first thing to check is whether ${code('vendor/')} was actually copied over along with the rest of the folder.
    </${Callout}>
  </div>`
}

function CheatSheetTopic() {
  const rows = ALL_EVENT_IDS.map((id) => ({ id, tag: TAG_BY_EVENT_ID[id], label: EVENT_ID_LABELS[id] }))
  return html`<div>
    <${P}>This table is generated directly from the app's own schema reference data, so it can't drift out of sync with what the Matrix View, Rule Injector, and validator actually use.</${P}>
    <${DevNote}>
      Literally the same constants, rendered: ${code('ALL_EVENT_IDS')}, ${code('TAG_BY_EVENT_ID')}, ${code('EVENT_ID_LABELS')}, ${code('CONDITIONS')}, and ${code('COMMON_FIELDS_BY_TAG')} are all exported straight from ${code('src/utils/eventSchema.js')} - the single reference file that ${code('xmlParser.js')}, ${code('ruleOps.js')}, ${code('validator.js')}, ${code('sanitizer.js')}, and ${code('sigmaToSysmon.js')} (see the Sigma Auditor topic) all import from. There is no separate "docs" copy of this data to go stale.
    </${DevNote}>
    <div class="overflow-x-auto rounded-md border border-slate-200 mb-4 dark:border-zinc-800">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-zinc-900 dark:text-zinc-500">
            <th class="px-3 py-2">Event ID</th>
            <th class="px-3 py-2">Config tag</th>
            <th class="px-3 py-2">Description</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            (r) => html`<tr key=${r.id} class="border-t border-slate-200 dark:border-zinc-800">
              <td class="px-3 py-2 font-mono text-slate-500 dark:text-zinc-500">${r.id}</td>
              <td class="px-3 py-2 font-mono text-sky-700 dark:text-sky-400">${`<${r.tag}>`}</td>
              <td class="px-3 py-2 text-slate-700 dark:text-zinc-300">${r.label}</td>
            </tr>`
          )}
        </tbody>
      </table>
    </div>

    <${H}>Condition operators</${H}>
    <${P}>Every value accepted by the ${code('condition')} attribute, as used throughout the Matrix View filters, Rule Injector, and Rule Remover:</${P}>
    <div class="flex flex-wrap gap-1.5 mb-4">
      ${CONDITIONS.map((c) => html`<span key=${c} class="rounded border border-slate-300 bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">${c}</span>`)}
    </div>

    <${H}>Common fields by Event tag</${H}>
    <${P}>The fields offered in the Rule Injector's Form Builder for each Event tag (unrecognized fields from imported configs are still kept, just not offered as suggestions here):</${P}>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${Object.entries(COMMON_FIELDS_BY_TAG).map(
        ([t, fields]) => html`<div key=${t} class="rounded-md border border-slate-200 p-2.5 dark:border-zinc-800">
          <div class="font-mono text-xs text-sky-700 mb-1 dark:text-sky-400">${`<${t}>`}</div>
          <div class="flex flex-wrap gap-1">
            ${fields.map((f) => html`<span key=${f} class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">${f}</span>`)}
          </div>
        </div>`
      )}
    </div>
  </div>`
}

function AiAssistantTopic() {
  return html`<div>
    <${Callout} tone="info" title="100% local, never cloud">
      The AI Detection Assistant and its connection settings never call OpenAI, Anthropic, Google, or any other cloud
      API - every request goes only to the base URL you configure on the <b>Local AI Config</b> tab, which should point at
      a local or LAN-hosted Ollama / Open WebUI (or any OpenAI-compatible local server). The rest of the app (diffing,
      injection, exporting) works fully with the AI disconnected or never configured at all.
    </${Callout}>

    <${H}>Connecting a local model</${H}>
    <${P}>On the <b>Local AI Config</b> tab, set the Base API URL (${code('http://localhost:11434')} for native Ollama, ${code('http://localhost:8080/api')} for Open WebUI, or any other reachable LAN address), optionally a bearer token, then click <b>Test Connection & Fetch Models</b> to populate the model dropdown and flip the top-bar badge to "Connected". Settings persist to ${code('localStorage')} across reloads.</${P}>
    <${Callout} tone="warning" title="If the test fails">
      This is almost always CORS: the browser blocks the request unless the local server explicitly allows this page's
      origin. For Ollama, start it with ${code('OLLAMA_ORIGINS=*')} set; for Open WebUI, enable allowed origins in its admin
      settings. The AI Config tab has a dedicated troubleshooting box with the exact steps.
    </${Callout}>

    <${DevNote}>
      All of it routes through ${code('src/utils/aiClient.js')}, which has no hardcoded cloud host anywhere in it by design. <b>Test Connection & Fetch Models</b> calls ${code('detectAndFetchModels()')}, which tries Ollama's native ${code('/api/tags')} first, then falls back to OpenAI-compatible ${code('/v1/models')} / ${code('/models')} / ${code('/api/models')} (auto-detecting the server "style" unless you pin one). Every assistant action calls ${code('chatCompletion()')}, which POSTs to ${code('/api/chat')} (Ollama) or ${code('/chat/completions')} / ${code('/v1/chat/completions')} (OpenAI-style) with your configured model/temperature/token settings - this <i>is</i> the one place in the whole app where an LLM, not deterministic code, produces the output. The Rule Generator's reply is run through ${code('extractXmlSnippet()')} (pulls a markdown-fenced XML code block, or failing that a bare ${tag('Tag')}...${tag('/Tag')} run, out of free text), then handed to the exact same ${code('parseRawSnippet()')} + ${code('detectConflicts()')} pipeline the manual Global Rule Injector uses (see Rule Management) - the model's output is never trusted or injected directly, only ever as a parsed, conflict-checked candidate rule you still explicitly apply.
    </${DevNote}>

    <${H}>What the AI Detection Assistant tab does</${H}>
    <${Ul}>
      <li><b>Gap Analysis</b> - sends a structured summary of the Matrix View (per-Event-ID rule counts, validation notices, risk-analyzer findings - never raw XML) and asks for an executive-style report on coverage gaps and bypass risks across every loaded network.</li>
      <li><b>Rule Generator</b> - type a request in plain English; the model's XML response is parsed with the same engine the Global Rule Injector uses, previewed with conflict/duplicate detection against your selected target networks, then injected with one click.</li>
      <li><b>Explain & FP Analysis</b> - pick an existing rule (or paste a snippet) and either ask for a plain-English explanation with MITRE ATT&CK mapping, or a false-positive-risk review with a hardened alternative suggestion.</li>
    </${Ul}>
    <${Callout} tone="tip">
      MITRE technique IDs and rule XML suggested by the AI are a starting point, same as the built-in heuristic MITRE
      tagging (see Matrix View topic) - review before relying on them, since local model quality varies by model/size.
    </${Callout}>
  </div>`
}

function FaqTopic() {
  return html`<div>
  <${Faq} items=${[
    {
      q: 'What does the "Dev Mode" button at the top of this Help window do?',
      a: 'It reveals purple "Developer Mode" boxes throughout every topic on this page, each naming the exact file(s) and function(s) that actually run for the action just described - e.g. which store action, which utils/*.js function, whether an LLM is involved anywhere. It only affects what this Help window shows (persisted to localStorage so it stays on across reloads); it changes nothing about how the app itself behaves.',
    },
    {
      q: 'A rule I imported with onmatch="Exclude" (capitalized) now shows as lowercase - did it change?',
      a: "Only its displayed casing. The parser always normalizes onmatch and condition attribute values to lowercase on import, because the app's matching logic depends on it internally. Tag and field name casing, by contrast, is left exactly as the source had it until you explicitly run Sanitize & Standardize Casing.",
    },
    {
      q: 'I suppressed a rule - where did it go?',
      a: 'Nowhere - it\'s still there, just inert. Suppressed rules stay visible everywhere (greyed out, tagged "suppressed") and no longer count toward active include/exclude totals in the Matrix View. Re-enable them any time with the eye icon in the row\'s expanded detail, and they export as a clearly labeled, commented-out XML block rather than disappearing.',
    },
    {
      q: 'Side-by-Side Diff shows +0 / -0 / ~0 for two networks I compared - is that broken?',
      a: 'No - it means the two networks have identical rules, field for field, for every bucket (Event tag + onmatch) that exists in either one. That\'s expected for near-identical baselines deployed to multiple environments.',
    },
    {
      q: 'My source XML had weird or duplicated nesting - did I lose any rules?',
      a: "No. The parser recursively searches the whole document rather than assuming a fixed structure, so a rule nested somewhere unusual (including inside a duplicated wrapper tag) is still found and extracted. Check that network's notices if you want to see exactly what the parser had to compensate for.",
    },
    {
      q: 'Can I run this with no internet access at all?',
      a: 'Yes, and it works that way by default - see the Air-Gapped Mode section under Exporting & Air-Gapped Deployment. This folder already ships with vendor/ populated, so a fresh copy on an air-gapped machine loads everything locally with no setup. If you change dependency versions, re-run requirements/vendor-deps.py once while online to refresh vendor/.',
    },
    {
      q: 'If I edit a rule or suppress it, do my ticket links / analyst comments in the XML survive?',
      a: 'Yes - comments are preserved through the full edit → inject/suppress → export cycle, reattached to whichever rule, filter, or global option they most likely document. See Comment Preservation under the Export topic for exactly how that works.',
    },
    {
      q: 'The Sigma Auditor says a network is "Covered" - does that guarantee the rule can\'t be bypassed?',
      a: 'No - coverage there is a heuristic field/condition/value match against your existing rules, not a real Sysmon execution or a semantic guarantee (the same honest caveat as the Risk Analyzer\'s "broad rule" and "operator mismatch" checks). Treat a Gap as a reliable signal something is missing, and treat Covered as "likely already handled, worth a quick manual look" rather than a proof.',
    },
  ]} />

    <${DevNote}>
      Quick map of where things live, for anyone extending this app: all network/rule data and undo history lives in one Zustand store, ${code('useStore')} (${code('src/store/useStore.js')}), persisted to ${code('localStorage')} key ${code('sysmon-matrix::networks::v1')}. Three small sibling stores hold UI-only preferences the same way: ${code('useThemeStore')} (color theme), ${code('useAiStore')} (Local AI connection settings), and ${code('useHelpDevStore')} (this Dev Mode toggle). Every XML in/out goes through exactly two files - ${code('utils/xmlParser.js')} (parse) and ${code('utils/xmlSerializer.js')} (serialize) - so every feature on every tab (Injector, Remover, Merge Builder, Sanitizer, AI Assistant, Sigma Auditor) reads/writes the same normalized ${code('{ eventTag, onmatch, filters, ... }')} rule shape rather than each tab touching raw XML itself.
    </${DevNote}>
  </div>`
}

function SigmaAuditorTopic() {
  return html`<div>
    <${P}>The Sigma Auditor tab answers one question: "if I deployed this Sigma detection rule, would it actually fire against each of my loaded Sysmon configs?" - and if not, lets you preview and inject the exact Sysmon XML needed to close that gap, with a side-by-side diff and an explicit approval step before anything is changed.</${P}>

    <${H}>1. Get a Sigma rule into the editor</${H}>
    <${Ul}>
      <li><b>Import .yml</b> - pick a ${code('.yml')}/${code('.yaml')} file from disk. A <b>Reset to Original</b> button appears once you've imported, to discard your edits and restore exactly what was imported.</li>
      <li><b>New Blank Rule</b> - loads a minimal starter template (${code('title')}/${code('logsource')}/${code('detection')}/${code('level')}/${code('tags')}) you can edit from scratch.</li>
      <li>Or just paste/type YAML directly into the editor - there's no requirement to import a file first.</li>
      <li><b>Clear</b> empties the editor entirely.</li>
    </${Ul}>
    <${P}>The editor is a live, syntax-highlighted YAML workspace - edit the pasted/imported rule freely before running anything against your networks. A status line under the editor validates the YAML on every keystroke (green check or a red parse error), so you know immediately if something's malformed, without having to click anything first.</${P}>

    <${H}>2. Run Sysmon Audit</${H}>
    <${P}>Clicking this parses whatever's currently in the editor and translates its ${code('detection:')} block into one or more candidate Sysmon filter sets, then checks every loaded network for coverage. The result is frozen until you click the button again - editing the YAML afterward doesn't change the audit table until you re-run it (this is deliberate: it stops the table updating out from under you mid-edit).</${P}>
    <${Callout} tone="warning" title="This is a translation, not a Sigma execution engine">
      Only a common, practical subset of Sigma is translated: field modifiers (${code('contains')}, ${code('startswith')}/${code('endswith')}, bare ${code('*')} wildcards, the ${code('all')} modifier, list values), and ${code('detection.condition')} grammars (a bare selection, ${code('and')}/${code('or')} chains, ${code('not')}, ${code('1 of x*')}/${code('all of x*')}). Regex (${code('|re')}) and base64 modifiers have no native Sysmon equivalent and are approximated or skipped - always with a visible warning, never silently. Anything this app can't confidently translate is flagged rather than guessed at.
    </${Callout}>

    <${DevNote}>
      "Run Sysmon Audit" calls ${code('parseSigmaRule()')} (${code('src/utils/sigmaParser.js')}), which itself calls ${code('parseYamlLite()')} - a hand-rolled, indentation-based YAML subset parser written for this app (${code('src/utils/yamlLite.js')}; no external YAML library was added). The on-the-fly validation under the editor runs that exact same parser on every keystroke via ${code('useMemo')}, so "valid YAML" there means the same parser that will ultimately drive the audit, not a separate lint pass. The parsed rule then goes to ${code('translateSigmaToSysmon()')} (${code('src/utils/sigmaToSysmon.js')}), which: resolves ${code('logsource.category')} to a Sysmon event tag via a lookup table in ${code('src/utils/sigmaMapping.js')} (falling back to scanning for an explicit ${code('EventID')} field when there's no category); splits ${code('detection.condition')} into OR-branches with ${code('resolveConditionBranches()')}; and converts each selection's fields/modifiers into Sysmon ${code('{ field, condition, value }')} filters with ${code('valueToFilters()')}. Nothing here calls an LLM - it's entirely deterministic lookup tables and string/regex logic, same philosophy as ${code('xmlParser.js')}.
    </${DevNote}>

    <${H}>3. Read the Audit & Remediation table</${H}>
    <${Ul}>
      <li><b>🟢 Covered</b> - an existing, active ${code('include')} rule for the right Event tag already matches (or broadly matches) this Sigma rule's criteria in that network.</li>
      <li><b>🔴 Gap Detected</b> - no existing rule in that network would catch it.</li>
      <li><b>Unmappable</b> - the Sigma rule's ${code('logsource')} doesn't correspond to anything Sysmon can log at all (e.g. Windows Security Event log or PowerShell Script Block logging categories) - there's nothing for this app to audit or inject for that network, by design.</li>
    </${Ul}>
    <${Callout} tone="info" title="\"Covered\" is a heuristic, not a guarantee">
      Coverage is decided by field + condition-polarity + substring-overlap matching against your existing rules - the same kind of "good enough" heuristic as the Risk Analyzer's operator-mismatch/broad-rule checks, not a real Sysmon rule evaluation engine. A "(broad)" suffix on the Covered pill means the Sigma rule's criteria couldn't be translated into concrete filters at all, so coverage there only reflects "this Event ID is logged in some form," not the specific behavior.
    </${Callout}>

    <${H}>4. Preview Patch and approve</${H}>
    <${P}>For any Gap (or Unmappable row, there's no action - nothing to patch), <b>Preview Patch</b> opens a modal with the exact Sysmon XML that would be added: the existing config on the left, the proposed version with new lines highlighted on the right, long unchanged stretches collapsed to keep it readable. Nothing is written anywhere until you click <b>Confirm & Update Config</b> - <b>Cancel</b> discards the preview with no effect.</${P}>
    <${P}>To handle every gap at once, use <b>Approve & Inject All Gaps</b> at the top of the panel: it lists every gap network with a checkbox (uncheck any you don't want touched yet) and a per-row <b>Show diff</b> toggle, then <b>Confirm & Update N Configs</b> applies all the checked ones in one action.</${P}>
    <${P}>Injected rules show up immediately everywhere else in the app - Matrix View, Side-by-Side Diff, Export - exactly like a rule added through the Global Rule Injector, including Undo/Redo support and heuristic MITRE tagging. Coverage status in the audit table updates live as soon as you inject, without needing to click Run Sysmon Audit again.</${P}>

    <${DevNote}>
      Coverage checking and the injection plan both live in ${code('src/utils/sigmaAudit.js')}. ${code('auditAllNetworks()')}/${code('auditNetwork()')} compare each candidate branch's filters against a network's active ${code('include')} rules of the same Event tag, using field-name + condition-polarity + case-insensitive substring overlap (${code('existingFilterCovers()')}) - deliberately conservative tone in the UI copy because this is a heuristic, not a Sysmon simulation. <b>Preview Patch</b>/batch rows call ${code('buildInjectionPlan()')}, which de-duplicates against existing exact filter signatures (reusing ${code('filterSetSignature()')} from ${code('ruleOps.js')}, the same dedup key the Global Rule Injector's conflict detector uses) and shapes each new rule with ${code('suggestMitreTechniques()')} (${code('mitreMap.js')}) so it renders identically to any other rule everywhere else in the app. The diff itself is computed by ${code('diffLines()')} in ${code('src/utils/lineDiff.js')} - a hand-rolled O(n·m) LCS line-diff (no diff library added) run against ${code('serializeSysmonConfig()')} output for the before/after network; a local helper collapses long unchanged runs to a "N unchanged lines" separator for readability. <b>Confirm & Update Config</b> (single or batch) calls nothing new at all - it's the exact same store action every other feature uses, ${code('useStore().applyRuleToNetworks(rule, [networkId])')}, called once per generated rule. The live-updating coverage table after injection is just ${code('auditAllNetworks()')} re-running inside a ${code('useMemo')} keyed on the (reactive) ${code('networks')} array - no extra wiring needed for that to "just work".
    </${DevNote}>

    <${H}>Translating Sigma's AND/OR/NOT into Sysmon include/exclude</${H}>
    <${P}>Sigma's ${code('detection.condition: selection and not filter')} pattern - a positive match with a negative filter block for false-positive reduction - maps naturally onto Sysmon's own ${code('onmatch="include"')} / ${code('onmatch="exclude"')} pair, and the auditor generates both halves together. A condition like ${code('1 of selection*')} (match if <i>any</i> of several named selections matches) becomes multiple independent candidate branches - mirroring how several separate same-Event-tag ${tag('ProcessCreate')} blocks are already OR'd against each other by Sysmon itself.</${P}>
    <${CodeBlock} lang="yaml" code=${'detection:\n  selection:\n    CommandLine|contains: \'powershell -enc\'\n  filter:\n    User|endswith: \'$\'\n  condition: selection and not filter'} />
    <${P}>...translates to an ${code('include')} rule for the ${code('selection')} criteria plus a separate ${code('exclude')} rule for the ${code('filter')} criteria, both injected together.</${P}>
  </div>`
}

export const HELP_TOPICS = [
  {
    id: 'getting-started',
    label: 'Getting Started & Ingestion',
    icon: Rocket,
    keywords: ['import', 'upload', 'drag', 'drop', 'malformed', 'messy', 'parser', 'normalize', 'troubleshoot'],
    render: GettingStarted,
  },
  {
    id: 'matrix-view',
    label: 'Matrix View & Comparison',
    icon: LayoutGrid,
    keywords: ['matrix', 'compare', 'event id', 'filter', 'search', 'mitre', 'onmatch', 'grouprelation', 'badge'],
    render: MatrixViewTopic,
  },
  {
    id: 'rule-management',
    label: 'Rule Management',
    icon: ListChecks,
    keywords: ['injector', 'remover', 'suppress', 'delete', 'conflict', 'duplicate', 'add rule', 'raw xml', 'form builder'],
    render: RuleManagementTopic,
  },
  {
    id: 'merge-builder',
    label: 'Merge & Policy Builder',
    icon: GitMerge,
    keywords: ['merge', 'combine', 'union', 'intersection', 'differential', 'hierarchical', 'base', 'overlay', 'conflict resolution', 'redundancy', 'policy'],
    render: MergeBuilderTopic,
  },
  {
    id: 'sigma-auditor',
    label: 'Sigma-to-Sysmon Auditor',
    icon: ScanSearch,
    keywords: ['sigma', 'yaml', 'detection rule', 'coverage', 'gap', 'audit', 'preview patch', 'inject', 'diff', 'logsource', 'condition'],
    render: SigmaAuditorTopic,
  },
  {
    id: 'risk-sanitizer',
    label: 'Risk Analyzer & Sanitizer',
    icon: ShieldAlert,
    keywords: ['risk', 'mismatch', 'broad', 'wildcard', 'sanitize', 'casing', 'standardize', 'contains'],
    render: RiskAnalyzerTopic,
  },
  {
    id: 'export',
    label: 'Exporting & Air-Gapped Deployment',
    icon: FileArchive,
    keywords: ['export', 'zip', 'swiftonsecurity', 'olaf hartong', 'comment', 'air-gapped', 'offline', 'vendor', 'cdn'],
    render: ExportTopic,
  },
  {
    id: 'cheat-sheet',
    label: 'Sysmon Quick Reference',
    icon: Bookmark,
    keywords: ['cheat sheet', 'event id', 'condition', 'operator', 'field', 'reference', 'schema'],
    render: CheatSheetTopic,
  },
  {
    id: 'ai-assistant',
    label: 'Local AI & LLM Assistant',
    icon: Bot,
    keywords: ['ai', 'llm', 'ollama', 'open webui', 'local ai', 'gap analysis', 'rule generator', 'mitre', 'false positive', 'cors'],
    render: AiAssistantTopic,
  },
  {
    id: 'faq',
    label: 'FAQ',
    icon: MessageCircleQuestion,
    keywords: ['faq', 'question', 'troubleshoot', 'help'],
    render: FaqTopic,
  },
]
