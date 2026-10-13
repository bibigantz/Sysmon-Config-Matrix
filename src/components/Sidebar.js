import { html, useState } from '../lib/react.js'
import { useStore } from '../store/useStore.js'
import { FileImport } from './FileImport.js'
import { RuleRemoverModal } from './RuleRemoverModal.js'
import { Button, TextInput, Checkbox } from './ui.js'
import { Trash2, Pencil, Check, Wand2, RotateCcw, RotateCw, Shield, Ban, Sparkles, Unlink } from './icons.js'

function NetworkRow({ net }) {
  const removeNetwork = useStore((s) => s.removeNetwork)
  const renameNetwork = useStore((s) => s.renameNetwork)
  const selectedForBulk = useStore((s) => s.selectedForBulk)
  const toggleBulkSelection = useStore((s) => s.toggleBulkSelection)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(net.name)

  const ruleCount = net.rules?.length || 0
  const errorCount = (net.warnings || []).length

  return html`<div class="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800/70">
    <${Checkbox} checked=${selectedForBulk.has(net.id)} onChange=${() => toggleBulkSelection(net.id)} />
    <span class="h-2.5 w-2.5 shrink-0 rounded-full" style=${{ background: net.color }}></span>
    ${
      editing
        ? html`<${TextInput} value=${name} onChange=${setName} className="flex-1 min-w-0 py-0.5" />
           <button class="text-emerald-600 dark:text-emerald-400" title="Save the new name" onClick=${() => { renameNetwork(net.id, name); setEditing(false) }}><${Check} size=${14} /></button>`
        : html`<div class="flex-1 min-w-0">
            <div class="truncate text-sm text-slate-900 dark:text-zinc-100">${net.name}</div>
            <div class="truncate text-[10px] text-slate-500 dark:text-zinc-500">${ruleCount} rules${errorCount ? html` · ${errorCount} notice${errorCount > 1 ? 's' : ''}` : ''}</div>
          </div>
          <button class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100" title="Rename this network" onClick=${() => setEditing(true)}><${Pencil} size=${13} /></button>
          <button class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400" title="Remove this network from the workspace" onClick=${() => confirm(`Remove network "${net.name}"?`) && removeNetwork(net.id)}><${Trash2} size=${13} /></button>`
    }
  </div>`
}

export function Sidebar() {
  const networks = useStore((s) => s.networks)
  const selectedForBulk = useStore((s) => s.selectedForBulk)
  const setBulkSelection = useStore((s) => s.setBulkSelection)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const history = useStore((s) => s.history)
  const sanitizeAllNetworks = useStore((s) => s.sanitizeAllNetworks)
  const wrapLooseRulesAllNetworks = useStore((s) => s.wrapLooseRulesAllNetworks)
  const [removerOpen, setRemoverOpen] = useState(false)
  const [sanitizeMsg, setSanitizeMsg] = useState(null)
  const [wrapMsg, setWrapMsg] = useState(null)

  return html`<aside class="flex w-72 shrink-0 flex-col gap-4 border-r border-slate-200 bg-white p-4 overflow-y-auto dark:border-zinc-800 dark:bg-zinc-950">
    <div class="flex items-center gap-2">
      <${Shield} size=${20} class="text-sky-600 dark:text-sky-400" />
      <div>
        <div class="text-sm font-semibold text-slate-900 leading-tight dark:text-zinc-100">Sysmon Config Matrix</div>
        <div class="text-[10px] text-slate-500 leading-tight dark:text-zinc-500">Multi-Manager</div>
      </div>
    </div>

    <${FileImport} />

    <div>
      <div class="mb-1.5 flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">Networks (${networks.length})</span>
        <div class="flex gap-2 text-[11px]">
          <button class="text-sky-600 hover:underline dark:text-sky-400" onClick=${() => setBulkSelection(networks.map((n) => n.id))} title="Select every network for global actions">all</button>
          <button class="text-slate-500 hover:underline dark:text-zinc-500" onClick=${() => setBulkSelection([])} title="Deselect all networks">none</button>
        </div>
      </div>
      <div class="flex flex-col gap-0.5">
        ${networks.map((n) => html`<${NetworkRow} key=${n.id} net=${n} />`)}
        ${networks.length === 0 ? html`<div class="text-xs text-slate-500 italic px-2 py-3 dark:text-zinc-500">No networks loaded yet.</div>` : null}
      </div>
    </div>

    <div class="mt-auto flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-zinc-800">
      <div class="flex gap-2">
        <${Button} variant="secondary" size="sm" className="flex-1" disabled=${!history.past.length} onClick=${undo} title="Undo the last change">
          <${RotateCcw} size=${13} /> Undo
        </${Button}>
        <${Button} variant="secondary" size="sm" className="flex-1" disabled=${!history.future.length} onClick=${redo} title="Redo the last undone change">
          <${RotateCw} size=${13} /> Redo
        </${Button}>
      </div>
      <${Button} size="sm" onClick=${() => setActiveTab('inject')} title="Go to the Global Rule Injector to add a rule to every network or a chosen subset">
        <${Wand2} size=${14} /> Add Rule to All / Selected
      </${Button}>
      <${Button} size="sm" variant="secondary" onClick=${() => setRemoverOpen(true)} title="Open the Global Rule Remover to search for and delete or suppress rules across networks">
        <${Ban} size=${14} /> Remove / Suppress Rule
      </${Button}>
      <${Button} size="sm" variant="outline" onClick=${() => setSanitizeMsg(`${sanitizeAllNetworks().length} casing fix(es) applied across all networks.`)} title="Normalize tag/attribute casing to the official Sysmon schema for every loaded network">
        <${Sparkles} size=${13} /> Sanitize All Networks
      </${Button}>
      ${sanitizeMsg ? html`<div class="text-[10px] text-emerald-600 dark:text-emerald-400">${sanitizeMsg}</div>` : null}
      <${Button} size="sm" variant="outline" onClick=${() => setWrapMsg(`${wrapLooseRulesAllNetworks().length} loose rule(s) wrapped into RuleGroups across all networks.`)} title="Organizes floating/orphaned Include/Exclude conditions the parser auto-wrapped into clean, named RuleGroup structures">
        <${Unlink} size=${13} /> Wrap Loose Rules into RuleGroups
      </${Button}>
      ${wrapMsg ? html`<div class="text-[10px] text-emerald-600 dark:text-emerald-400">${wrapMsg}</div>` : null}
      <div class="text-[10px] text-slate-500 dark:text-zinc-500">
        ${selectedForBulk.size} of ${networks.length} networks selected for global actions.
      </div>
    </div>
    <${RuleRemoverModal} open=${removerOpen} onClose=${() => setRemoverOpen(false)} />
  </aside>`
}
