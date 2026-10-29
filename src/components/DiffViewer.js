import { html, useMemo } from '../lib/react.js'
import { useStore } from '../store/useStore.js'
import { Select, Card, CardHeader, CardBody, Pill, PageIntro } from './ui.js'
import { diffNetworks } from '../utils/diffEngine.js'
import { GitCompare, Unlink } from './icons.js'

function FilterLine({ f, tone }) {
  // Full-opacity throughout: the tone colors below are already independently tuned per theme for
  // contrast against their background, so dimming parts of the line with opacity (as this used to
  // do) stacks on top of that tuning and can crush contrast in dark mode specifically - the base
  // dark: text colors here are already light/muted by design, and multiplying by opacity pushes
  // them toward unreadable rather than just "less emphasized".
  return html`<div class=${`font-mono text-[11px] px-1.5 py-0.5 rounded ${tone}`}>
    <span class="font-semibold">${f.field}</span> ${f.condition} "${f.value}"
  </div>`
}

function BucketCard({ bucket }) {
  return html`<${Card}>
    <${CardHeader} className="flex items-center justify-between py-2">
      <div class="flex items-center gap-2 text-sm text-slate-900 dark:text-zinc-100">
        <span class="font-mono text-slate-500 dark:text-zinc-500">${bucket.eventTag}</span>
        <${Pill} tone=${bucket.onmatch === 'include' ? 'green' : 'red'}>${bucket.onmatch}</${Pill}>
        ${
          bucket.anyOrphaned
            ? html`<span title="Includes a loose/unwrapped rule found with no enclosing RuleGroup/event tag in the source - the event tag is a best guess">
                <${Pill} tone="amber"><${Unlink} size=${10} /> Loose Rule / Unwrapped</${Pill}>
              </span>`
            : null
        }
      </div>
      <div class="flex gap-1.5 text-[11px]">
        ${bucket.added.length ? html`<${Pill} tone="green">+${bucket.added.length}</${Pill}>` : null}
        ${bucket.removed.length ? html`<${Pill} tone="red">-${bucket.removed.length}</${Pill}>` : null}
        ${bucket.modified.length ? html`<${Pill} tone="amber">~${bucket.modified.length}</${Pill}>` : null}
      </div>
    </${CardHeader}>
    <${CardBody} className="space-y-1">
      ${bucket.unchanged.map((f, i) => html`<${FilterLine} key=${`u${i}`} f=${f} tone="text-slate-600 dark:text-zinc-400" />`)}
      ${bucket.removed.map((f, i) => html`<${FilterLine} key=${`r${i}`} f=${f} tone="bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300" />`)}
      ${bucket.added.map((f, i) => html`<${FilterLine} key=${`a${i}`} f=${f} tone="bg-green-100 text-green-700 dark:bg-emerald-500/10 dark:text-emerald-300" />`)}
      ${bucket.modified.map(
        (m, i) => html`<div key=${`m${i}`} class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          <span class="font-semibold">${m.field}</span> ${m.condition}: <span class="line-through">"${m.from}"</span> → "${m.to}"
        </div>`
      )}
    </${CardBody}>
  </${Card}>`
}

export function DiffViewer() {
  const networks = useStore((s) => s.networks)
  const diffSelection = useStore((s) => s.diffSelection)
  const setDiffSelection = useStore((s) => s.setDiffSelection)

  const netA = networks.find((n) => n.id === diffSelection.a)
  const netB = networks.find((n) => n.id === diffSelection.b)
  const diff = useMemo(() => (netA && netB ? diffNetworks(netA, netB) : null), [netA, netB])

  const options = networks.map((n) => ({ value: n.id, label: n.name }))

  return html`<div class="space-y-4">
    <${PageIntro} icon=${GitCompare}>
      Pick any two loaded networks to see exactly which rules were <b>added</b>, <b>removed</b>, or <b>changed in
      value</b> between them, bucketed by Event tag and onmatch. A "no differences" result means the two configs
      are identical field-for-field in every bucket that exists in either one - useful for confirming two
      environments really are in sync.
    </${PageIntro}>
    <div class="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <${GitCompare} size=${16} class="text-slate-400 dark:text-zinc-500" />
      <${Select} value=${diffSelection.a || ''} onChange=${(v) => setDiffSelection(v, diffSelection.b)} placeholder="Network A" options=${options} />
      <span class="text-slate-500 text-xs dark:text-zinc-500">vs</span>
      <${Select} value=${diffSelection.b || ''} onChange=${(v) => setDiffSelection(diffSelection.a, v)} placeholder="Network B" options=${options} />
      ${
        diff
          ? html`<div class="ml-auto flex gap-1.5 text-xs">
              <${Pill} tone="green">+${diff.summary.added}</${Pill}>
              <${Pill} tone="red">-${diff.summary.removed}</${Pill}>
              <${Pill} tone="amber">~${diff.summary.modified}</${Pill}>
            </div>`
          : null
      }
    </div>

    ${
      !netA || !netB
        ? html`<div class="py-16 text-center text-sm text-slate-500 dark:text-zinc-500">Select two networks to compare.</div>`
        : !diff.results.length
        ? html`<div class="py-16 text-center text-sm text-slate-500 dark:text-zinc-500">No rules found in either network.</div>`
        : html`<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
            ${diff.results.map((b, i) => html`<${BucketCard} key=${i} bucket=${b} />`)}
          </div>`
    }
  </div>`
}
