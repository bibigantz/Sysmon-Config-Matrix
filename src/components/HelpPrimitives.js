import { html, useState } from '../lib/react.js'
import { Info, AlertTriangle, Lightbulb, Copy, Check, ChevronDown, ChevronRight, Cpu } from './icons.js'
import { highlightXml } from '../utils/xmlHighlight.js'
import { highlightYaml } from '../utils/yamlHighlight.js'
import { useHelpDevStore } from '../store/useHelpDevStore.js'

export function H({ children }) {
  return html`<h3 class="text-base font-semibold text-slate-900 mb-2 mt-6 first:mt-0 dark:text-zinc-100">${children}</h3>`
}

export function P({ children }) {
  return html`<p class="text-sm leading-relaxed text-slate-600 mb-3 dark:text-zinc-400">${children}</p>`
}

export function Ul({ children }) {
  return html`<ul class="list-disc marker:text-slate-400 dark:marker:text-zinc-600 pl-5 space-y-1.5 text-sm leading-relaxed text-slate-600 mb-3 dark:text-zinc-400">${children}</ul>`
}

// dir="ltr" is forced here (and in CodeBlock below) because this renders literal code/syntax -
// it must never be bidi-reordered by a surrounding RTL (Hebrew) paragraph, regardless of UI language.
export function Kbd({ children }) {
  return html`<code dir="ltr" class="inline-block rounded border border-slate-300 bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">${children}</code>`
}

const CALLOUT_TONES = {
  info: {
    icon: Info,
    class: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700/50 dark:bg-sky-500/10 dark:text-sky-200',
    iconClass: 'text-sky-600 dark:text-sky-400',
    label: 'Info',
  },
  warning: {
    icon: AlertTriangle,
    class: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-500/10 dark:text-amber-200',
    iconClass: 'text-amber-600 dark:text-amber-400',
    label: 'Warning',
  },
  tip: {
    icon: Lightbulb,
    class: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-500/10 dark:text-emerald-200',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    label: 'Best practice',
  },
}

export function Callout({ tone = 'info', title, children }) {
  const t = CALLOUT_TONES[tone]
  return html`<div class=${`flex gap-2.5 rounded-md border p-3 mb-3 text-sm leading-relaxed ${t.class}`}>
    <${t.icon} size=${16} class=${`mt-0.5 shrink-0 ${t.iconClass}`} />
    <div>
      <div class="font-semibold text-[13px] mb-0.5">${title || t.label}</div>
      <div>${children}</div>
    </div>
  </div>`
}

// Only visible when the Help Center's "Developer Mode" toggle is on (see HelpCenter.js /
// useHelpDevStore.js) - an "under the hood" box naming the exact file(s)/function(s) that run
// for whatever action the surrounding prose just described, for engineers who want to extend or
// integrate with this app rather than just use it. Deliberately a distinct tone (violet) from the
// info/warning/tip Callouts above so it reads as "implementation detail", not "user-facing advice".
export function DevNote({ children }) {
  const devMode = useHelpDevStore((s) => s.devMode)
  if (!devMode) return null
  return html`<div class="mb-3 rounded-md border border-violet-300 bg-violet-50 p-3 text-sm leading-relaxed text-violet-950 dark:border-violet-700/40 dark:bg-violet-500/10 dark:text-violet-200">
    <div class="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">
      <${Cpu} size=${12} /> Developer Mode - under the hood
    </div>
    <div>${children}</div>
  </div>`
}

export function CodeBlock({ code, lang = 'xml', copyLabel = 'Copy', copiedLabel = 'Copied', copyTitle = 'Copy to clipboard' }) {
  const [copied, setCopied] = useState(false)
  const highlighted = lang === 'xml' ? highlightXml(code.trim()) : lang === 'yaml' ? highlightYaml(code.trim()) : null

  async function copy() {
    try {
      await navigator.clipboard.writeText(code.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable (e.g. insecure context) - silently no-op, nothing to recover.
    }
  }

  return html`<div class="relative mb-3 rounded-md border border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950">
    <button
      onClick=${copy}
      title=${copyTitle}
      dir="ltr"
      class="absolute right-2 top-2 flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      ${copied ? html`<${Check} size=${11} class="text-emerald-600 dark:text-emerald-400" />` : html`<${Copy} size=${11} />`}
      ${copied ? copiedLabel : copyLabel}
    </button>
    ${
      highlighted
        ? html`<pre dir="ltr" class="overflow-x-auto p-3 pr-16 text-left font-mono text-xs leading-relaxed text-slate-900 dark:text-zinc-100" dangerouslySetInnerHTML=${{ __html: highlighted }}></pre>`
        : html`<pre dir="ltr" class="overflow-x-auto p-3 pr-16 text-left font-mono text-xs leading-relaxed text-slate-900 dark:text-zinc-100">${code.trim()}</pre>`
    }
  </div>`
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return html`<div class="border-b border-slate-200 last:border-0 dark:border-zinc-800">
    <button
      onClick=${() => setOpen(!open)}
      title=${open ? 'Collapse this answer' : 'Expand this answer'}
      class="flex w-full items-center justify-between gap-2 py-2.5 text-left text-sm font-medium text-slate-800 hover:text-slate-950 dark:text-zinc-200 dark:hover:text-white"
    >
      <span>${q}</span>
      ${open ? html`<${ChevronDown} size=${15} class="shrink-0 text-slate-400 dark:text-zinc-500" />` : html`<${ChevronRight} size=${15} class="shrink-0 text-slate-400 dark:text-zinc-500" />`}
    </button>
    ${open ? html`<div class="pb-3 text-sm leading-relaxed text-slate-600 dark:text-zinc-400">${a}</div>` : null}
  </div>`
}

export function Faq({ items }) {
  return html`<div class="rounded-md border border-slate-200 px-3 dark:border-zinc-800">
    ${items.map((item, i) => html`<${FaqItem} key=${i} q=${item.q} a=${item.a} />`)}
  </div>`
}
