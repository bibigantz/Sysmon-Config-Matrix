import { html, useState } from '../lib/react.js'
import { useStore } from '../store/useStore.js'
import { Card, CardHeader, CardBody, Pill, Badge, PageIntro } from './ui.js'
import { validateNetwork, validationCounts } from '../utils/validator.js'
import { Hash, AlertTriangle, AlertCircle, Info, FileWarning, ChevronDown, ChevronRight, Network } from './icons.js'
import { EVENT_TAGS } from '../utils/eventSchema.js'

function IssuesList({ network }) {
  const [open, setOpen] = useState(false)
  const issues = validateNetwork(network)
  const counts = validationCounts(issues)
  if (!issues.length) {
    return html`<div class="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><${Info} size=${13} /> No validation issues found.</div>`
  }
  return html`<div>
    <button class="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white" onClick=${() => setOpen(!open)} title=${open ? 'Hide the detailed issue list' : 'Show the detailed issue list for this network'}>
      ${open ? html`<${ChevronDown} size=${13} />` : html`<${ChevronRight} size=${13} />`}
      ${counts.errors ? html`<${Pill} tone="red">${counts.errors} error${counts.errors > 1 ? 's' : ''}</${Pill}>` : null}
      ${counts.warnings ? html`<${Pill} tone="amber">${counts.warnings} warning${counts.warnings > 1 ? 's' : ''}</${Pill}>` : null}
      ${counts.info ? html`<${Pill} tone="sky">${counts.info} note${counts.info > 1 ? 's' : ''}</${Pill}>` : null}
    </button>
    ${
      open
        ? html`<ul class="mt-2 space-y-1 border-l border-slate-200 pl-2 dark:border-zinc-800">
            ${issues.map(
              (i, idx) => html`<li key=${idx} class="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-zinc-400">
                ${i.severity === 'error' ? html`<${AlertCircle} size=${12} class="mt-0.5 text-red-600 dark:text-red-400 shrink-0" />` : null}
                ${i.severity === 'warning' ? html`<${AlertTriangle} size=${12} class="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />` : null}
                ${i.severity === 'info' ? html`<${Info} size=${12} class="mt-0.5 text-sky-600 dark:text-sky-400 shrink-0" />` : null}
                <span>${i.message}</span>
              </li>`
            )}
          </ul>`
        : null
    }
  </div>`
}

function NetworkCard({ network }) {
  const byEventTag = {}
  for (const r of network.rules || []) {
    byEventTag[r.eventTag] = (byEventTag[r.eventTag] || 0) + 1
  }
  const totalFilters = (network.rules || []).reduce((sum, r) => sum + r.filters.length, 0)

  return html`<${Card}>
    <${CardHeader} className="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full" style=${{ background: network.color }}></span>
        <span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">${network.name}</span>
      </div>
      <span class="text-[10px] text-slate-500 font-mono dark:text-zinc-500">${network.fileName}</span>
    </${CardHeader}>
    <${CardBody} className="space-y-3">
      <div class="flex flex-wrap gap-2">
        <${Badge}><${Hash} size=${11} /> schema ${network.schemaversion || 'unknown'}</${Badge}>
        <${Badge}>${network.rules?.length || 0} rules</${Badge}>
        <${Badge}>${totalFilters} filter conditions</${Badge}>
        ${network.globals?.HashAlgorithms ? html`<${Badge}>hashes: ${network.globals.HashAlgorithms}</${Badge}>` : null}
        ${network.globals?.DnsLookup ? html`<${Badge}>DNS lookup: ${network.globals.DnsLookup}</${Badge}>` : null}
      </div>

      <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        ${Object.entries(byEventTag)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([tag, count]) => html`<div key=${tag} class="flex items-center justify-between text-slate-600 dark:text-zinc-400">
              <span class="truncate">${EVENT_TAGS[tag]?.label || tag}</span>
              <span class="font-mono text-slate-800 dark:text-zinc-300">${count}</span>
            </div>`
          )}
      </div>

      ${network.headerComment ? html`<details class="text-[11px] text-slate-500 dark:text-zinc-500">
        <summary class="cursor-pointer hover:text-slate-800 dark:hover:text-zinc-300">Source header comment</summary>
        <pre class="mt-1 whitespace-pre-wrap font-mono text-[10px] text-slate-500 max-h-24 overflow-y-auto dark:text-zinc-500">${network.headerComment}</pre>
      </details>` : null}

      <${IssuesList} network=${network} />
    </${CardBody}>
  </${Card}>`
}

export function Dashboard() {
  const networks = useStore((s) => s.networks)
  if (!networks.length) {
    return html`<div class="flex flex-col items-center justify-center gap-2 py-20 text-slate-500 dark:text-zinc-500">
      <${FileWarning} size=${28} />
      <div class="text-sm">No networks loaded. Import Sysmon XML files from the sidebar to get started.</div>
    </div>`
  }
  return html`<div>
    <${PageIntro} icon=${Network}>
      Per-network overview: rule counts, filter totals, global options (hash algorithms, DNS lookup), and every
      parser notice for each loaded Sysmon config at a glance. Click <b>N notices</b> on any card to see exactly
      what the parser flagged for that file.
    </${PageIntro}>
    <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      ${networks.map((n) => html`<${NetworkCard} key=${n.id} network=${n} />`)}
    </div>
  </div>`
}
