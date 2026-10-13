import { html, useState, useEffect, useRef, useMemo } from '../lib/react.js'
import { useStore } from '../store/useStore.js'
import { Card, CardHeader, CardBody, Button, Select, Pill } from './ui.js'
import { Download, FileArchive, Save, AlertTriangle, Sparkles, Unlink } from './icons.js'
import { serializeSysmonConfig } from '../utils/xmlSerializer.js'
import { validateNetwork } from '../utils/validator.js'
import { highlightXml } from '../utils/xmlHighlight.js'
import { downloadText } from '../utils/download.js'

// A syntax-highlighted editable XML view, built the classic lightweight way: an invisible
// <textarea> (transparent text, visible caret) stacked exactly on top of a highlighted <pre>,
// scroll-synced. The highlighted markup carries its own `dark:` classes, so it looks right in
// both themes with no re-highlight needed on theme switch.
function HighlightedXmlEditor({ value, onChange }) {
  const taRef = useRef(null)
  const preRef = useRef(null)
  const highlighted = useMemo(() => highlightXml(value), [value])

  function syncScroll() {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop
      preRef.current.scrollLeft = taRef.current.scrollLeft
    }
  }

  const sharedClass = 'absolute inset-0 w-full h-full m-0 overflow-auto whitespace-pre-wrap break-words font-mono text-xs p-3 box-border'

  return html`<div class="relative w-full h-[55vh] rounded-md border border-slate-300 bg-white dark:border-zinc-700 dark:bg-zinc-950">
    <pre
      ref=${preRef}
      aria-hidden="true"
      class=${`${sharedClass} pointer-events-none text-slate-900 dark:text-zinc-100`}
      dangerouslySetInnerHTML=${{ __html: highlighted }}
    ></pre>
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

const STYLE_OPTIONS = [
  { value: 'standard', label: 'Standard (flat rules)' },
  { value: 'swiftonsecurity', label: 'SwiftOnSecurity style (RuleGroup per tag)' },
  { value: 'olaf-hartong', label: 'Olaf Hartong modular style' },
]

async function downloadZip(networks, style) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const n of networks) {
    const xml = serializeSysmonConfig(n, style)
    zip.file(`${n.name.replace(/[^a-z0-9_-]+/gi, '_')}.xml`, xml)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sysmon-configs-${Date.now()}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function RawEditorExport() {
  const networks = useStore((s) => s.networks)
  const replaceRawXml = useStore((s) => s.replaceRawXml)
  const sanitizeNetwork = useStore((s) => s.sanitizeNetwork)
  const wrapLooseRules = useStore((s) => s.wrapLooseRules)
  const [activeId, setActiveId] = useState(networks[0]?.id || '')
  const [style, setStyle] = useState('standard')
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const [sanitizeResult, setSanitizeResult] = useState(null)

  const active = networks.find((n) => n.id === activeId) || networks[0]

  useEffect(() => {
    // Switching to a different network (or export style): full reset, including any
    // Sanitize/Wrap confirmation message from the previously-selected network.
    if (active) setDraft(serializeSysmonConfig(active, style))
    setSaved(false)
    setSanitizeResult(null)
  }, [active?.id, style])

  useEffect(() => {
    // Same network, but its content changed elsewhere - e.g. a sidebar-level bulk action like
    // "Wrap Loose Rules into RuleGroups" or "Sanitize All Networks" run while this tab stays
    // open. Every mutating store action produces a new network object, so this keeps the draft
    // in sync with the model without clobbering a Sanitize/Wrap confirmation this component's
    // own buttons just set (that reset only happens above, on an actual network switch).
    if (active) setDraft(serializeSysmonConfig(active, style))
  }, [active])

  function refreshDraftFromModel() {
    const updated = useStore.getState().networks.find((n) => n.id === active.id)
    setDraft(serializeSysmonConfig(updated, style))
  }

  function handleSanitize() {
    const changes = sanitizeNetwork(active.id)
    setSanitizeResult({ label: 'Sanitized', changes })
    if (changes.length) refreshDraftFromModel()
  }

  function handleWrapLooseRules() {
    const changes = wrapLooseRules(active.id)
    setSanitizeResult({ label: 'Wrapped', changes })
    if (changes.length) refreshDraftFromModel()
  }

  if (!networks.length) {
    return html`<div class="py-16 text-center text-sm text-slate-500 dark:text-zinc-500">No networks loaded.</div>`
  }

  const issues = active ? validateNetwork(active) : []
  const errorCount = issues.filter((i) => i.severity === 'error').length

  return html`<div class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
    <${Card}>
      <${CardHeader} className="flex items-center justify-between">
        <${Select} value=${activeId || active?.id} onChange=${setActiveId} options=${networks.map((n) => ({ value: n.id, label: n.name }))} />
        <div class="flex items-center gap-2">
          ${errorCount ? html`<${Pill} tone="red"><${AlertTriangle} size=${11} /> ${errorCount} error${errorCount > 1 ? 's' : ''}</${Pill}>` : html`<${Pill} tone="green">valid</${Pill}>`}
          <${Button} size="sm" variant="secondary" onClick=${handleSanitize} title="Normalize tag/attribute casing to the official Sysmon schema">
            <${Sparkles} size=${13} /> Sanitize & Standardize Casing
          </${Button}>
          <${Button} size="sm" variant="secondary" onClick=${handleWrapLooseRules} title="Organizes floating/orphaned Include/Exclude conditions the parser auto-wrapped into clean, named RuleGroup structures">
            <${Unlink} size=${13} /> Wrap Loose Rules into RuleGroups
          </${Button}>
          <${Button} size="sm" variant="secondary" onClick=${() => active && setDraft(serializeSysmonConfig(active, style))} title="Discard this draft and re-serialize fresh XML from the current model">Regenerate from model</${Button}>
          <${Button} size="sm" onClick=${() => { replaceRawXml(active.id, draft); setSaved(true) }} title="Parse this draft and save it back into the network model">
            <${Save} size=${13} /> ${saved ? 'Saved ✓' : 'Save edits'}
          </${Button}>
        </div>
      </${CardHeader}>
      ${
        sanitizeResult !== null
          ? html`<div class="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] dark:border-zinc-800 dark:bg-zinc-950/60">
              ${
                sanitizeResult.changes.length
                  ? html`<div class="text-emerald-600 mb-1 dark:text-emerald-400">${sanitizeResult.label} ${sanitizeResult.changes.length} item${sanitizeResult.changes.length > 1 ? 's' : ''}:</div>
                    <ul class="space-y-0.5 text-slate-500 font-mono max-h-20 overflow-y-auto dark:text-zinc-400">
                      ${sanitizeResult.changes.map((c, i) => html`<li key=${i}>${c}</li>`)}
                    </ul>`
                  : html`<div class="text-slate-500 dark:text-zinc-500">Nothing to change.</div>`
              }
            </div>`
          : null
      }
      <${CardBody}>
        <${HighlightedXmlEditor} value=${draft} onChange=${(v) => { setDraft(v); setSaved(false) }} />
      </${CardBody}>
    </${Card}>

    <div class="space-y-4">
      <${Card}>
        <${CardHeader}><span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Export format</span></${CardHeader}>
        <${CardBody} className="space-y-2">
          <${Select} value=${style} onChange=${setStyle} options=${STYLE_OPTIONS} className="w-full" />
          <${Button} className="w-full" onClick=${() => active && downloadText(`${active.name}.xml`, serializeSysmonConfig(active, style))} title="Download the active network as a single XML file">
            <${Download} size=${14} /> Download this network
          </${Button}>
          <${Button} variant="secondary" className="w-full" onClick=${() => downloadZip(networks, style)} title="Download every loaded network bundled into one .zip file">
            <${FileArchive} size=${14} /> Export all as .zip
          </${Button}>
        </${CardBody}>
      </${Card}>

      <${Card}>
        <${CardHeader}><span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Validation</span></${CardHeader}>
        <${CardBody} className="space-y-1 max-h-72 overflow-y-auto">
          ${
            issues.length
              ? issues.map(
                  (i, idx) => html`<div key=${idx} class="text-[11px] text-slate-600 dark:text-zinc-400">
                    <${Pill} tone=${i.severity === 'error' ? 'red' : i.severity === 'warning' ? 'amber' : 'sky'}>${i.severity}</${Pill}> ${i.message}
                  </div>`
                )
              : html`<div class="text-xs text-emerald-600 dark:text-emerald-400">No issues found.</div>`
          }
        </${CardBody}>
      </${Card}>
    </div>
  </div>`
}
