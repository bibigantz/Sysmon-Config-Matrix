# Handling messy / unordered real-world Sysmon XML

Notes on what `src/utils/xmlParser.js` has to compensate for, based on the sample configs in
`requirements/examples/` and Sysmon configs seen in the wild generally.

## Structural issues observed

1. **Mis-nested duplicate tags.** `ConfigCorpHQ.xml` (and its near-identical siblings
   `ConfigOTProduction.xml` / `ConfigCloudVPC.xml`) contain a genuinely malformed block:
   ```xml
   <EventFiltering>
     <EventFiltering>
       <ProcessCreate onmatch="exclude">
         <ProcessCreate onmatch="exclude">
           <Image condition="contains">\CcmExec.exe</Image>
           ...
   ```
   A tool that generated this duplicated the wrapper tag by mistake. The parser does not assume
   a fixed depth for `<EventFiltering>` or event tags - `walkChildren()` recursively walks the
   whole subtree (via `fast-xml-parser`'s `preserveOrder` mode, so document order and comments
   are preserved too) and pulls out every recognizable event tag wherever it's found, logging a
   warning instead of failing or silently dropping the inner rules.

2. **Optional `<RuleGroup>` wrapping.** Some configs (SwiftOnSecurity-style, like
   `ConfigDMZBaseline.xml`) wrap related rules in `<RuleGroup name="..." groupRelation="or|and">`;
   others omit it entirely and put event tags directly under `<EventFiltering>`. The parser
   carries `ruleGroupName` / `groupRelation` as inherited context while descending, so both
   styles produce the same normalized rule shape.

3. **Mixed casing** - `onmatch="Exclude"`, `<image>` instead of `<Image>`, `<HASHALGORITHMS>`,
   attribute names in a different case than their canonical form, etc. Two different responses
   depending on whether correctness or cosmetics are at stake:
   - **Values that drive internal logic** (the `onmatch` attribute's value, a filter's `condition`
     attribute's value) are tolerantly matched case-insensitively and always normalized to
     lowercase *during parsing*, because every comparison elsewhere in the app (Matrix View
     counts, risk analysis, diffing) assumes exactly `'include'`/`'exclude'` and the lowercase
     condition strings - silently failing those comparisons on mis-cased input would be a
     correctness bug, not a cosmetic one.
   - **Tag/field names and the casing of other attribute names** are left exactly as the source
     had them during parsing (matched case-insensitively just so nothing is lost), and a warning
     is logged. Rewriting those to canonical casing is the explicit, user-triggered **"Sanitize &
     Standardize Casing"** action (`src/utils/sanitizer.js`) instead of a silent parse-time
     rewrite, so an analyst can see exactly what would change before it does.

4. **Inconsistent condition attributes.** `condition="contains"` is explicit in most configs, but
   the Sysmon schema defaults to `is` when the attribute is omitted. The parser always fills in
   `condition: 'is'` when absent so downstream diff/matrix logic never has to special-case a
   missing attribute.

5. **Comments anywhere, in two different styles.** Real configs mix "own-line" documentation
   comments (`<!-- Event ID 3: Network Connection -->` on its own line, documenting whatever comes
   *after* it) with same-line trailing comments
   (`<DestinationPort>443</DestinationPort><!-- catches C2 on 443 -->`, documenting whatever came
   *before* it on that line). Both exist in `ConfigCorpHQ.xml`. `fast-xml-parser`'s `preserveOrder`
   mode exposes every comment as a plain sibling node with no distinguishing information, so
   `xmlParser.js` does a cheap separate pass over the raw text (`computeCommentOwnLineFlags()`)
   recording, for every `<!--` in the document in order, whether only whitespace precedes it on
   its line. `groupAndAttachComments()` consumes those flags in lock-step with the comments it
   encounters during the (document-order) tree walk to decide which direction to attach each one.
   Getting this backwards (i.e. always preferring one direction) silently reattaches nearly every
   documentation comment in a real config to the wrong neighboring tag - this was caught and fixed
   during development by actually re-exporting a sample and diffing the comment positions against
   the source, not by inspection alone.

6. **Legacy registry tags.** Pre-3.3 schema configs use `<CreateKey>`, `<SetValue>`,
   `<DeleteKey>`, `<DeleteValue>`, `<RenameKey>` instead of the modern combined
   `<RegistryEvent>`. All five are mapped to Event IDs 12/13/14 in `eventSchema.js` so they show
   up correctly in the Matrix View alongside modern configs.

7. **Unknown/undocumented fields.** Rather than rejecting a rule because it contains a field name
   that isn't in `COMMON_FIELDS_BY_TAG`, the parser keeps the field and adds an `info`-level
   validation note (`validator.js`) - keeping the user's data intact is more important than strict
   schema conformance.

8. **The XML declaration (`<?xml version="1.0" ...?>`).** `fast-xml-parser` is configured with
   `ignoreDeclaration: true` so this never shows up as a sibling node competing with the real
   `<Sysmon>` root and `<!-- banner -->` comment for position in the root-level comment-attachment
   pass above (it did, before this was added - the header banner comment was silently lost because
   it was being attached to the declaration node instead of to `<Sysmon>`).

9. **Loose / orphaned conditions and rules.** Real-world (especially hand-edited or
   copy-pasted-between-tools) configs sometimes have content in the wrong structural place:
   - A filter condition tag (`<Image condition="contains">...`) sitting directly inside
     `<EventFiltering>` or `<RuleGroup>` with **no enclosing event tag at all** - usually because
     someone forgot to wrap it, or deleted the wrapper while editing. See
     `requirements/examples/ConfigLooseRules.xml` for a worked fixture.
   - A non-standard `<Include>` / `<Exclude>` **wrapper element** - not real Sysmon syntax
     (`onmatch` is an attribute on the event tag itself, not a separate wrapping element), but
     occasionally produced by hand-editing or by tools that mimic a different EDR's config dialect.
   - An otherwise well-formed event tag (`<ProcessCreate>`, `<DriverLoad>`, ...) sitting **outside
     `<EventFiltering>` entirely** - e.g. directly under `<Sysmon>` as a stray sibling.

   None of these are dropped. `xmlParser.js` tracks, while walking, whether it's currently
   *inside* a resolved event tag's own children (`expectFilters`) - the one place a bare filter
   condition is legitimate. Everywhere else, consecutive bare filter conditions are accumulated
   into a run and synthesized into one rule (`synthesizeOrphanRule()`) rather than discarded one
   at a time; a non-standard `<Include>`/`<Exclude>` wrapper is treated like a `<RuleGroup>` that
   also implies `onmatch` for anything inside it; and a stray rule-shaped tag found directly under
   `<Sysmon>` is extracted the same way a properly-placed one would be. In every case the result is
   marked `orphaned: true` on the rule object.

   **Guessing the event tag for a loose run.** A bare filter condition alone doesn't say which
   event type it belongs to - `Image` alone is used by half the schema. `guessEventTagForFields()`
   looks up, for every field in the run, which known event tags document it
   (`COMMON_FIELDS_BY_TAG`'s reverse index) and picks whichever tag covers the most fields in that
   run (ties favor `ProcessCreate`, the most common/general tag, for a deterministic result). This
   is a *best-effort heuristic* - like the MITRE tagging and risk-analyzer heuristics elsewhere in
   this app - not a certainty, which is exactly why orphaned rules stay visibly flagged (an amber
   "Loose Rule / Unwrapped" badge in Matrix View, the Diff Viewer, and the Global Rule Remover's
   results) until an analyst reviews and accepts them.

   **Clearing the flag.** "Wrap Loose Rules into RuleGroups" (`src/utils/sanitizer.js`,
   `wrapLooseRules()` - available per-network in Raw Editor/Export, or for every loaded network at
   once via the sidebar) is the explicit, user-triggered step that accepts the parser's best-guess
   wrapping as correct: it assigns each orphaned rule a descriptive `RuleGroup` name and clears
   `orphaned`. Until that's run, every export still produces valid, schema-compliant XML either
   way (the serializer always emits a real `<Tag onmatch="...">...</Tag>` block, orphaned or not)
   - it additionally prepends an `Auto-wrapped by Sysmon Config Matrix` comment to any
     still-orphaned rule's block so the exported file itself documents that it needs review, and
   that note disappears once "Wrap Loose Rules" has been run.

   **Global Rule Injector / Remover compatibility.** Orphaned rules are modeled as ordinary rule
   objects (same `eventTag`/`onmatch`/`filters` shape as any other rule, just with `orphaned: true`
   and a heuristic tag) - so the existing conflict-detection, keyword search, and raw-XML-snippet
   matching in `ruleOps.js`/`ruleFinder.js` target and match them exactly like structured rules,
   with no special-casing needed.

## What IS preserved on edit/export, and what isn't

Comments are preserved: the banner header above `<Sysmon>`, per-global-option comments (e.g. "
Enable DNS query logging" above `<DnsLookup>`), per-rule leading comments, and same-line inline
comments on individual filter lines all survive import -> edit/injection/suppression -> re-export,
reattached using the heuristic above. Byte-for-byte round-tripping of exact whitespace and tag
*order* is **not** attempted - the serializer (`xmlSerializer.js`) always emits clean, consistently
indented XML grouped by event tag + onmatch (or wrapped in generated `<RuleGroup>` blocks for the
SwiftOnSecurity / Olaf Hartong export styles). This is a deliberate trade-off: the tool is for
*managing and deploying* rules (where an analyst's documentation and ticket links matter a lot),
not for preserving a specific file's historical formatting (which doesn't).

## Local AI / LLM integration (air-gapped, no cloud calls)

The AI Detection Assistant (`src/components/AiAssistant.js`, `AiConfigPage.js`, `AiStatusBadge.js`,
`src/store/useAiStore.js`, `src/utils/aiClient.js`) is designed so that **no code path can reach a
cloud API**, by construction rather than by configuration: `aiClient.js` only ever builds a request
URL by concatenating the user-supplied `baseUrl` with a handful of relative, well-known local-server
paths (`/api/tags`, `/api/chat`, `/v1/models`, `/chat/completions`, ...) - there is no hardcoded
hostname anywhere in that file, so there's nothing to "point back at a cloud provider" even
accidentally. The default `baseUrl` (`http://localhost:11434`) is the standard native-Ollama port.

**Why auto-detect two API shapes instead of one.** Local-LLM servers in the wild split roughly into
two camps: Ollama's own native API (`/api/tags` to list models, `/api/chat` to generate, with
`options.temperature`/`options.top_p`/`options.num_predict`), and an OpenAI-compatible surface that
Open WebUI, LM Studio, and llama.cpp's server all converge on (`/v1/models` or `/models`,
`/chat/completions` or `/v1/chat/completions`, with top-level `temperature`/`top_p`/`max_tokens`).
Rather than make the analyst pick the right one from a dropdown before anything works, "Test
Connection" tries Ollama-native first (cheap, single `GET`), then falls back to the OpenAI-compatible
paths - the detected style is cached (`detectedStyle` in `useAiStore`) so every subsequent chat
request uses the right shape without re-probing. An explicit override (`apiStyle: 'ollama' |
'openai'`) is still exposed on the AI Config tab for servers that respond ambiguously to both.

**Why requests are built from a structured summary, not raw XML, for Gap Analysis.** Feeding an
entire multi-network XML dump to a small/quantized local model risks exceeding its context window
and produces vague, unfocused summaries. `AiAssistant.js`'s `buildGapAnalysisBrief()` instead reuses
the same derived data the Matrix View and Risk Analyzer already compute (`buildMatrix()`,
`buildRiskIndex()`, `validateNetwork()`) and formats it as compact text - deterministic, small, and
exactly the facts a gap-analysis prompt needs.

**Why the Rule Generator re-parses the model's output through `ruleOps.js` instead of trusting it.**
A local LLM's XML output is free text, not a guaranteed-valid Sysmon rule. `extractXmlSnippet()`
pulls the first fenced/bare XML block out of the response, then `parseRawSnippet()` (the same
parser the Global Rule Injector's Raw XML mode uses) validates it structurally; only a successfully
parsed rule reaches the existing conflict-detection/preview/inject pipeline. A malformed or
non-XML response surfaces as a clear parse error with the raw text still shown, instead of silently
injecting something broken.

**Offline-mode interaction.** The AI feature is unrelated to - and fully independent of - the
CDN/vendor import-map toggle described above: a fully air-gapped deployment can run with
`?modules=vendor` (no CDN access for React/Zustand/etc.) *and* a configured local Ollama/Open WebUI
endpoint on the same LAN, since neither path ever reaches the public internet. Conversely, the rest
of the app (parsing, diffing, injection, export) has zero dependency on the AI connection; every
AI-calling action is reached only from the AI Detection Assistant tab and fails gracefully (status
badge flips to "Offline", a notice is shown) if the local server isn't reachable.

Rules suppressed via the Global Rule Remover are serialized as a single commented-out block (not
merged with other rules) with a `SUPPRESSED via Sysmon Config Matrix (<date>)` marker, so a
suppressed rule's original fields and any pre-existing comment are both still readable - and
reversible, by re-enabling it in the app - directly from the exported file.

## Merge & Policy Builder engine (deterministic, no AI)

`src/utils/mergeEngine.js` implements the four merge modes (Union, Intersection, Differential,
Hierarchical Inheritance) and the Conflict Resolution / Redundancy panels behind the Merge &
Combine tab (`src/components/MergeWorkspace.js`) as plain set operations and structural rule
regrouping over the same normalized `{ schemaversion, globals, rules }` model everything else in
this app uses - there is no AI/LLM call anywhere in this file or any function it calls.

**The atomic unit is a condition line, not a rule.** `collectFilterEntries(network)` flattens every
non-suppressed rule's filters into one flat list, each entry carrying its Event tag, onmatch,
RuleGroup name/relation, and source network - because the spec's dedup/intersection/diff semantics
("identical condition lines", "rules present in A but missing from B") are naturally per-line, not
per-rule: two rules with the same Event tag/onmatch but a different mix of filters shouldn't be
treated as "the same rule" or "a totally different rule" wholesale. `groupEntriesIntoRules()` is
the inverse step every mode ends with, re-bucketing the (possibly deduplicated/filtered) flat list
back into rule objects by Event tag + onmatch + RuleGroup name/relation - the same bucketing key
`xmlSerializer.js` and `diffEngine.js` already use elsewhere, so merged output serializes exactly
like any hand-built or imported network.

**Why dedup/diff/intersect compare `field::condition::value`, not just `value`.** Two lines with
the same target value but a different condition operator (`contains "cmd"` vs `is "cmd"`) are not
equivalent - they match different real-world event sets (see the Risk Analyzer's operator-mismatch
check above, which is the same principle). Treating them as "the same line" during Union would
silently drop one network's actual behavior; keeping the operator in the signature means Union
dedup only ever removes a line that is truly byte-for-byte redundant.

**Why Conflict Resolution recomputes from the original merge output every time, instead of mutating
state in place.** A naive implementation would apply `resolveOnmatchConflict()` directly to the
"current" rules array and keep mutating it as the analyst clicks around. That's unsafe: if an
analyst picks "Keep Source A", then changes their mind and clicks "Keep Source B", the second call
would try to remove lines that the first call already deleted, silently producing the wrong result
(or deleting *everything* for that condition) depending on click order. `MergeWorkspace.js` instead
keeps the raw per-mode merge output (`baseMergedRules`) frozen, and a `resolutionChoices` map of
`conflictId -> choice`; the *displayed* rules are a pure `useMemo` recomputation that replays every
current choice against that same frozen input every render. Every choice is therefore idempotent
and freely reversible in any order, with zero risk of double-applying a mutation - the same reason
`useAiStore`'s request handling and `useStore`'s undo/redo both prefer deriving state over mutating
it incrementally.

**Why the redundancy heuristic only flags, never auto-removes.** `findRedundantConditions()` treats
a narrower `contains`/`begin with` value as "possibly redundant" if a broader condition on the same
field is a case-insensitive prefix of it (e.g. `contains "C:\Windows\Temp"` vs `begin with
"C:\Windows\Temp\sub"`). This is a plain string-prefix heuristic, not a semantic guarantee - Sysmon
condition operators don't compose that simply in every case (e.g. `contains` vs `image` match
different parts of a value), so flagging-with-a-one-click-removal-button (rather than silently
deleting) keeps a human in the loop for the one part of this feature that isn't a hard guarantee,
consistent with how the MITRE heuristic tagging and overly-broad-rule warnings elsewhere in the app
are also surfaced as suggestions rather than automatic edits.

**Why Hierarchical mode is implemented separately from Union instead of as a parameterized
variant.** Union rebuilds every rule from scratch via `groupEntriesIntoRules()`, which is exactly
what Hierarchical mode must NOT do to the base network - the spec requires the master's header,
`schemaversion`, and `HashAlgorithms` to pass through untouched, and in practice that also means the
base's *rules* should be carried through as the literal objects already on that network (preserving
whatever RuleGroup names/relations/comments they already had) rather than re-bucketed and
reconstructed. `hierarchicalMerge()` therefore only ever computes net-new injected lines (same dedup
signature as Union) and concatenates them onto `baseNetwork.rules` unchanged, instead of folding the
base into the same flatten-and-regroup pipeline.

**Why "Save as new workspace network" re-serializes and re-imports instead of pushing the in-memory
rule objects directly into the store.** `handleSave()` calls `serializeSysmonConfig()` then the
store's normal `importFile()` - the exact same path a hand-authored or hand-edited XML file takes -
rather than constructing a network object in memory and inserting it directly. This guarantees a
merged config is held to the identical validation/tolerant-parsing round-trip as any other imported
file (so a structurally invalid merge result would surface the same way a bad hand-edit would,
rather than slipping into the workspace unchecked) and gets a fresh id/color from the store's
existing network-creation logic for free.
