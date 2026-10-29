import { html, useState, useMemo, useEffect, useRef } from '../lib/react.js'
import { useStore } from '../store/useStore.js'
import { Card, CardHeader, CardBody, Button, Pill, Checkbox, Modal, PageIntro } from './ui.js'
import {
  Upload, Plus, Trash2, RotateCcw, ScanSearch, CircleCheck, AlertTriangle, ShieldAlert,
  GitCompareArrows, FileWarning, Save,
} from './icons.js'
import { highlightYaml } from '../utils/yamlHighlight.js'
import { parseSigmaRule } from '../utils/sigmaParser.js'
import { translateSigmaToSysmon } from '../utils/sigmaToSysmon.js'
import { auditAllNetworks, buildInjectionPlan } from '../utils/sigmaAudit.js'
import { serializeSysmonConfig } from '../utils/xmlSerializer.js'
import { diffLines, diffSummary } from '../utils/lineDiff.js'

const BLANK_TEMPLATE = `title: New Detection Rule
id:
status: experimental
description:
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\\example.exe'
  condition: selection
level: medium
tags:
  - attack.execution
`

// Same textarea-over-highlighted-<pre> technique as RawEditorExport.js's HighlightedXmlEditor,
// just pointed at the YAML highlighter instead of the XML one.
function HighlightedYamlEditor({ value, onChange }) {
  const taRef = useRef(null)
  const preRef = useRef(null)
  const highlighted = useMemo(() => highlightYaml(value), [value])

  function syncScroll() {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop
      preRef.current.scrollLeft = taRef.current.scrollLeft
    }
  }

  const sharedClass = 'absolute inset-0 w-full h-full m-0 overflow-auto whitespace-pre-wrap break-words font-mono text-xs p-3 box-border'

  return html`<div class="relative w-full h-[50vh] rounded-md border border-slate-300 bg-white dark:border-zinc-700 dark:bg-zinc-950">
    <pre ref=${preRef} aria-hidden="true" class=${`${sharedClass} pointer-events-none text-slate-900 dark:text-zinc-100`} dangerouslySetInnerHTML=${{ __html: highlighted }}></pre>
    <textarea
      ref=${taRef}
      class=${`${sharedClass} resize-none bg-transparent text-transparent caret-slate-900 dark:caret-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:ring-inset`}
      value=${value}
      spellcheck="false"
      onScroll=${syncScroll}
      onChange=${(e) => onChange(e.target.value)}
    ></textarea>
  </div>`
}

// Collapses long unchanged stretches down to a "N unchanged lines" separator, keeping a few
// lines of context around every change - a 1200-line config diffed against itself plus one new
// rule shouldn't render 1200 rows.
function collapseContext(rows, context = 3) {
  const keep = new Set()
  rows.forEach((r, i) => {
    if (r.type !== 'equal') {
      for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k += 1) keep.add(k)
    }
  })
  const out = []
  let i = 0
  while (i < rows.length) {
    if (keep.has(i)) {
      out.push(rows[i])
      i += 1
      continue
    }
    let j = i
    while (j < rows.length && !keep.has(j)) j += 1
    out.push({ type: 'skip', count: j - i })
    i = j
  }
  return out
}

function DiffTable({ rows }) {
  return html`<div class="max-h-[50vh] overflow-auto rounded border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
    <table class="w-full border-collapse font-mono text-[11px]">
      <tbody>
        ${rows.map((r, i) => {
          if (r.type === 'skip') {
            return html`<tr key=${i}><td colSpan=${2} class="bg-slate-50 px-2 py-1 text-center text-slate-400 dark:bg-zinc-900/60 dark:text-zinc-600">⋯ ${r.count} unchanged line${r.count === 1 ? '' : 's'} ⋯</td></tr>`
          }
          const leftTone = r.type === 'remove' ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'text-slate-600 dark:text-zinc-400'
          const rightTone = r.type === 'add' ? 'bg-green-100 text-green-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'text-slate-600 dark:text-zinc-400'
          return html`<tr key=${i}>
            <td class=${`w-1/2 whitespace-pre-wrap break-all border-r border-slate-200 px-2 align-top dark:border-zinc-800 ${leftTone}`}>${r.left ?? ''}</td>
            <td class=${`w-1/2 whitespace-pre-wrap break-all px-2 align-top ${rightTone}`}>${r.right ?? ''}</td>
          </tr>`
        })}
      </tbody>
    </table>
  </div>`
}

function statusPill(status, broad) {
  if (status === 'covered') return html`<${Pill} tone="green"><${CircleCheck} size=${11} /> Covered${broad ? ' (broad)' : ''}</${Pill}>`
  if (status === 'gap') return html`<${Pill} tone="red"><${AlertTriangle} size=${11} /> Gap Detected</${Pill}>`
  return html`<${Pill} tone="amber"><${FileWarning} size=${11} /> Unmappable</${Pill}>`
}

// Single-organization approval modal: original vs proposed XML, diff preview, confirm/cancel.
function PatchPreviewModal({ network, branches, ruleComment, onClose, onConfirm }) {
  const plan = useMemo(() => (network ? buildInjectionPlan(branches, network, ruleComment) : null), [network, branches, ruleComment])
  const originalXml = useMemo(() => (network ? serializeSysmonConfig(network) : ''), [network])
  const proposedXml = useMemo(
    () => (network && plan ? serializeSysmonConfig({ ...network, rules: [...network.rules, ...plan.newRules] }) : originalXml),
    [network, plan, originalXml]
  )
  const rows = useMemo(() => collapseContext(diffLines(originalXml, proposedXml)), [originalXml, proposedXml])
  const summary = useMemo(() => diffSummary(rows.flatMap((r) => (r.type === 'skip' ? [] : [r]))), [rows])

  return html`<${Modal} open=${!!network} onClose=${onClose} title=${network ? `Preview Patch - ${network.name}` : ''} wide=${true}>
    ${
      network
        ? html`<div class="space-y-3">
            ${
              plan.alreadyCovered
                ? html`<div class="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"><${CircleCheck} size=${14} /> This network already covers the Sigma rule - nothing to inject.</div>`
                : html`<div class="flex items-center gap-3 text-xs">
                    <span class="text-slate-500 dark:text-zinc-500">Original (left) vs. proposed (right) <code class="font-mono">EventFiltering</code> XML:</span>
                    <${Pill} tone="green">+${summary.added} line${summary.added === 1 ? '' : 's'}</${Pill}>
                  </div>`
            }
            ${!plan.alreadyCovered ? html`<${DiffTable} rows=${rows} />` : null}
            <div class="flex gap-2 pt-1">
              <${Button} variant="default" disabled=${plan.alreadyCovered} onClick=${() => onConfirm(network, plan)} title="Apply the inserted rule(s) to this network's model">
                <${Save} size=${13} /> Confirm & Update Config
              </${Button}>
              <${Button} variant="secondary" onClick=${onClose} title="Discard this preview without changing anything">Cancel</${Button}>
            </div>
          </div>`
        : null
    }
  </${Modal}>`
}

function BatchRow({ network, branches, ruleComment, selected, onToggle }) {
  const [expanded, setExpanded] = useState(false)
  const plan = useMemo(() => buildInjectionPlan(branches, network, ruleComment), [network, branches, ruleComment])
  const originalXml = useMemo(() => serializeSysmonConfig(network), [network])
  const proposedXml = useMemo(() => serializeSysmonConfig({ ...network, rules: [...network.rules, ...plan.newRules] }), [network, plan])
  const rows = useMemo(() => (expanded ? collapseContext(diffLines(originalXml, proposedXml)) : []), [expanded, originalXml, proposedXml])

  return html`<div class="rounded border border-slate-200 dark:border-zinc-800">
    <div class="flex items-center gap-2 p-2">
      <${Checkbox} checked=${selected} onChange=${onToggle} />
      <span class="flex-1 text-sm text-slate-900 dark:text-zinc-100">${network.name}</span>
      <${Pill}>${network.schemaversion || 'n/a'}</${Pill}>
      <${Pill} tone="violet">+${plan.newRules.length} rule${plan.newRules.length === 1 ? '' : 's'}</${Pill}>
      <button class="text-xs text-sky-600 hover:underline dark:text-sky-400" onClick=${() => setExpanded((e) => !e)}>${expanded ? 'Hide diff' : 'Show diff'}</button>
    </div>
    ${expanded ? html`<div class="border-t border-slate-200 dark:border-zinc-800"><${DiffTable} rows=${rows} /></div>` : null}
  </div>`
}

function BatchApprovalModal({ open, gapNetworks, branches, ruleComment, onClose, onConfirmBatch }) {
  const [selected, setSelected] = useState(new Set())
  useEffect(() => {
    if (open) setSelected(new Set(gapNetworks.map((n) => n.networkId)))
    // eslint-disable-next-line
  }, [open])

  function toggle(id) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  function confirmAll() {
    const chosen = gapNetworks.filter((row) => selected.has(row.networkId)).map((row) => row.network)
    onConfirmBatch(chosen)
    onClose()
  }

  return html`<${Modal} open=${open} onClose=${onClose} title="Approve & Inject - All Gaps" wide=${true}>
    <div class="space-y-3">
      <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-500">
        <span>${gapNetworks.length} network${gapNetworks.length === 1 ? '' : 's'} with a gap - ${selected.size} selected for injection</span>
        <div class="flex gap-2">
          <button class="text-sky-600 hover:underline dark:text-sky-400" onClick=${() => setSelected(new Set(gapNetworks.map((n) => n.networkId)))}>select all</button>
          <button class="text-slate-500 hover:underline dark:text-zinc-500" onClick=${() => setSelected(new Set())}>select none</button>
        </div>
      </div>
      <div class="max-h-[50vh] space-y-2 overflow-y-auto">
        ${gapNetworks.map(
          (row) => html`<${BatchRow}
            key=${row.networkId}
            network=${row.network}
            branches=${branches}
            ruleComment=${ruleComment}
            selected=${selected.has(row.networkId)}
            onToggle=${() => toggle(row.networkId)}
          />`
        )}
        ${gapNetworks.length === 0 ? html`<div class="text-xs italic text-slate-500 dark:text-zinc-500">No gap networks to review.</div>` : null}
      </div>
      <div class="flex gap-2 pt-1">
        <${Button} disabled=${!selected.size} onClick=${confirmAll} title="Apply the selected networks' rule insertions">
          <${Save} size=${13} /> Confirm & Update ${selected.size || ''} Config${selected.size === 1 ? '' : 's'}
        </${Button}>
        <${Button} variant="secondary" onClick=${onClose}>Cancel</${Button}>
      </div>
    </div>
  </${Modal}>`
}

export function SigmaAuditor() {
  const networks = useStore((s) => s.networks)
  const applyRuleToNetworks = useStore((s) => s.applyRuleToNetworks)

  const [yamlText, setYamlText] = useState(BLANK_TEMPLATE)
  const [originalYamlText, setOriginalYamlText] = useState(null)
  const [importedFileName, setImportedFileName] = useState(null)
  const [committed, setCommitted] = useState(null)
  const [previewNetworkId, setPreviewNetworkId] = useState(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [lastInjected, setLastInjected] = useState(null)
  const inputRef = useRef(null)

  // "Validate the syntax on the fly" - cheap re-parse on every edit, shown next to the editor.
  // The actual Sigma -> Sysmon translation only (re-)runs when "Run Sysmon Audit" is clicked.
  const liveParse = useMemo(() => parseSigmaRule(yamlText), [yamlText])

  function ruleComment() {
    if (!committed?.sigmaRule) return 'Auto-injected via the Sigma-to-Sysmon Auditor'
    const { title, id } = committed.sigmaRule
    return `Auto-injected via Sigma-to-Sysmon Auditor from Sigma rule "${title}"${id ? ` (${id})` : ''}`
  }

  function runAudit() {
    const parsed = parseSigmaRule(yamlText)
    setLastInjected(null)
    if (parsed.error) {
      setCommitted({ error: parsed.error, parseWarnings: parsed.warnings, translation: null, sigmaRule: null })
      return
    }
    const translation = translateSigmaToSysmon(parsed.rule)
    setCommitted({ error: null, parseWarnings: parsed.warnings, translation, sigmaRule: parsed.rule })
  }

  const auditResults = useMemo(() => {
    if (!committed || committed.error || !committed.translation || committed.translation.error) return null
    return auditAllNetworks(committed.translation.branches, networks).map((r) => ({ ...r, network: networks.find((n) => n.id === r.networkId) }))
  }, [committed, networks])

  const gapRows = useMemo(() => (auditResults || []).filter((r) => r.status === 'gap'), [auditResults])

  function handleImportFile(file) {
    file.text().then((text) => {
      setYamlText(text)
      setOriginalYamlText(text)
      setImportedFileName(file.name)
      setCommitted(null)
    })
  }

  function handleNewBlank() {
    setYamlText(BLANK_TEMPLATE)
    setOriginalYamlText(null)
    setImportedFileName(null)
    setCommitted(null)
  }

  function handleClear() {
    setYamlText('')
    setCommitted(null)
  }

  function injectRules(network, planArg) {
    const plan = planArg || buildInjectionPlan(committed.translation.branches, network, ruleComment())
    for (const rule of plan.newRules) applyRuleToNetworks(rule, [network.id])
    return plan.newRules.length
  }

  const previewRow = previewNetworkId ? (auditResults || []).find((r) => r.networkId === previewNetworkId) : null

  return html`<div class="space-y-4">
    <${PageIntro} icon=${ScanSearch}>
      Paste, import, or write a Sigma detection rule, then audit it against every loaded Sysmon config to see which
      networks would already catch it (🟢 Covered), which wouldn't (🔴 Gap Detected), and which don't apply at all
      (logsource not Sysmon-coverable). For any gap, <b>Preview Patch</b> shows the exact XML to inject with a
      side-by-side diff - nothing is written until you confirm.
    </${PageIntro}>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <${Card}>
      <${CardHeader} className="flex flex-wrap items-center gap-2">
        <span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Sigma Workspace</span>
        <div class="ml-auto flex items-center gap-1.5">
          <${Button} size="sm" variant="secondary" onClick=${() => inputRef.current?.click()} title="Import a .yml Sigma rule file">
            <${Upload} size=${13} /> Import .yml
          </${Button}>
          <input ref=${inputRef} type="file" accept=".yml,.yaml" class="hidden" onChange=${(e) => e.target.files[0] && handleImportFile(e.target.files[0])} />
          <${Button} size="sm" variant="secondary" onClick=${handleNewBlank} title="Start a new blank Sigma rule from a template">
            <${Plus} size=${13} /> New Blank Rule
          </${Button}>
          <${Button} size="sm" variant="outline" onClick=${handleClear} title="Empty the editor">
            <${Trash2} size=${13} /> Clear
          </${Button}>
          ${
            originalYamlText != null
              ? html`<${Button} size="sm" variant="outline" onClick=${() => setYamlText(originalYamlText)} title="Discard edits and restore the imported file's original text">
                  <${RotateCcw} size=${13} /> Reset to Original
                </${Button}>`
              : null
          }
        </div>
      </${CardHeader}>
      <${CardBody} className="space-y-2">
        ${importedFileName ? html`<div class="text-[11px] text-slate-500 dark:text-zinc-500">Imported from <span class="font-mono">${importedFileName}</span></div>` : null}
        <${HighlightedYamlEditor} value=${yamlText} onChange=${(v) => setYamlText(v)} />
        <div class="flex items-center justify-between">
          <div class="text-[11px]">
            ${
              liveParse.error
                ? html`<span class="flex items-center gap-1 text-red-600 dark:text-red-400"><${AlertTriangle} size=${12} /> ${liveParse.error}</span>`
                : html`<span class="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><${CircleCheck} size=${12} /> Valid YAML${liveParse.rule ? ` - "${liveParse.rule.title}"` : ''}</span>`
            }
          </div>
          <${Button} onClick=${runAudit} title="Parse the current editor text and check it against every loaded network">
            <${ScanSearch} size=${14} /> Run Sysmon Audit
          </${Button}>
        </div>
      </${CardBody}>
    </${Card}>

    <${Card}>
      <${CardHeader} className="flex items-center justify-between">
        <span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Audit & Remediation</span>
        ${
          gapRows.length
            ? html`<${Button} size="sm" onClick=${() => setBatchOpen(true)} title="Review and inject the remediation rule(s) into every network with a gap, in one batch">
                <${GitCompareArrows} size=${13} /> Approve & Inject All Gaps (${gapRows.length})
              </${Button}>`
            : null
        }
      </${CardHeader}>
      <${CardBody} className="space-y-3">
        ${
          !committed
            ? html`<div class="py-10 text-center text-sm text-slate-500 dark:text-zinc-500">Run a Sysmon Audit to see coverage across loaded networks.</div>`
            : committed.error || committed.translation?.error
            ? html`<div class="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400"><${AlertTriangle} size=${14} class="mt-0.5 shrink-0" /><span>${committed.error || committed.translation.error}</span></div>`
            : html`<div class="space-y-3">
                <div class="flex flex-wrap items-center gap-1.5 text-xs">
                  <span class="text-slate-500 dark:text-zinc-500">Target:</span>
                  <${Pill} tone="sky">${committed.translation.eventTag} (${committed.translation.eventIds.join('/')})</${Pill}>
                  <${Pill}>${committed.translation.branches.length} OR-branch${committed.translation.branches.length === 1 ? '' : 'es'}</${Pill}>
                </div>
                ${
                  committed.parseWarnings.length || committed.translation.warnings.length
                    ? html`<details class="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-700/40 dark:bg-amber-500/10 dark:text-amber-300">
                        <summary class="cursor-pointer font-semibold">${committed.parseWarnings.length + committed.translation.warnings.length} translation note(s) - click to expand</summary>
                        <ul class="mt-1 space-y-0.5">
                          ${[...committed.parseWarnings, ...committed.translation.warnings].map((w, i) => html`<li key=${i}>${w}</li>`)}
                        </ul>
                      </details>`
                    : null
                }
                ${lastInjected ? html`<div class="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><${CircleCheck} size=${12} /> ${lastInjected}</div>` : null}

                <div class="overflow-x-auto rounded-md border border-slate-200 dark:border-zinc-800">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-zinc-900 dark:text-zinc-500">
                        <th class="px-3 py-2">Organization</th>
                        <th class="px-3 py-2">Schema</th>
                        <th class="px-3 py-2">Coverage Status</th>
                        <th class="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${(auditResults || []).map(
                        (r) => html`<tr key=${r.networkId} class="border-t border-slate-200 dark:border-zinc-800">
                          <td class="px-3 py-2 text-slate-800 dark:text-zinc-200">
                            <span class="inline-flex items-center gap-1.5">
                              <span class="h-2 w-2 rounded-full" style=${{ background: r.network?.color }}></span>${r.networkName}
                            </span>
                          </td>
                          <td class="px-3 py-2 font-mono text-xs text-slate-500 dark:text-zinc-500">${r.schemaversion || 'n/a'}</td>
                          <td class="px-3 py-2">${statusPill(r.status, r.broad)}</td>
                          <td class="px-3 py-2">
                            ${
                              r.status === 'gap'
                                ? html`<${Button} size="sm" variant="secondary" onClick=${() => setPreviewNetworkId(r.networkId)} title="Preview the Sysmon XML patch for this organization">
                                    <${GitCompareArrows} size=${12} /> Preview Patch
                                  </${Button}>`
                                : r.status === 'covered'
                                ? html`<span class="text-[11px] text-slate-500 dark:text-zinc-500">No action needed.</span>`
                                : html`<span class="text-[11px] text-slate-500 dark:text-zinc-500" title="Sigma rule's logsource could not be mapped to a Sysmon event type">Cannot audit.</span>`
                            }
                          </td>
                        </tr>`
                      )}
                      ${(auditResults || []).length === 0 ? html`<tr><td colSpan=${4} class="px-3 py-6 text-center text-sm text-slate-500 dark:text-zinc-500">No networks loaded.</td></tr>` : null}
                    </tbody>
                  </table>
                </div>
              </div>`
        }
      </${CardBody}>
    </${Card}>

    ${
      committed?.translation && !committed.error && !committed.translation.error
        ? html`<${PatchPreviewModal}
            network=${previewRow?.network || null}
            branches=${committed.translation.branches}
            ruleComment=${ruleComment()}
            onClose=${() => setPreviewNetworkId(null)}
            onConfirm=${(network, plan) => {
              const n = injectRules(network, plan)
              setLastInjected(`Injected ${n} rule${n === 1 ? '' : 's'} into "${network.name}".`)
              setPreviewNetworkId(null)
            }}
          />
          <${BatchApprovalModal}
            open=${batchOpen}
            gapNetworks=${gapRows}
            branches=${committed.translation.branches}
            ruleComment=${ruleComment()}
            onClose=${() => setBatchOpen(false)}
            onConfirmBatch=${(nets) => {
              let totalRules = 0
              for (const network of nets) totalRules += injectRules(network)
              setLastInjected(`Injected rules into ${nets.length} network${nets.length === 1 ? '' : 's'} (${totalRules} rule${totalRules === 1 ? '' : 's'} total).`)
            }}
          />`
        : null
    }
    </div>
  </div>`
}
