import { html } from '../lib/react.js'
import { X } from './icons.js'

export function Button({ variant = 'default', size = 'md', className = '', children, ...props }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-sky-500'
  const variants = {
    default: 'bg-sky-600 hover:bg-sky-500 text-white',
    secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-700',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 dark:hover:bg-zinc-800 dark:text-zinc-300',
    danger: 'bg-red-600/90 hover:bg-red-600 text-white',
    outline: 'bg-transparent border border-slate-300 hover:border-slate-400 text-slate-800 dark:border-zinc-700 dark:hover:border-zinc-500 dark:text-zinc-200',
  }
  const sizes = { sm: 'text-xs px-2 py-1', md: 'text-sm px-3 py-1.5', lg: 'text-sm px-4 py-2' }
  return html`<button class=${`${base} ${variants[variant]} ${sizes[size]} ${className}`} ...${props}>${children}</button>`
}

export function Badge({ children, className = '', style = {} }) {
  return html`<span
    class=${`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border border-slate-300 bg-slate-100 text-slate-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 ${className}`}
    style=${style}
  >${children}</span>`
}

export function NetworkBadge({ network }) {
  return html`<span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-100 border border-slate-300 dark:bg-zinc-800 dark:border-zinc-700">
    <span class="h-2 w-2 rounded-full" style=${{ background: network.color }}></span>
    ${network.name}
  </span>`
}

export function Card({ children, className = '' }) {
  return html`<div class=${`rounded-lg border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60 ${className}`}>${children}</div>`
}

export function CardHeader({ children, className = '' }) {
  return html`<div class=${`border-b border-slate-200 px-4 py-3 dark:border-zinc-800 ${className}`}>${children}</div>`
}

export function CardBody({ children, className = '' }) {
  return html`<div class=${`p-4 ${className}`}>${children}</div>`
}

export function Select({ value, onChange, options, className = '', placeholder }) {
  return html`<select
    class=${`rounded-md border border-slate-300 bg-white text-slate-900 text-sm px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${className}`}
    value=${value}
    onChange=${(e) => onChange(e.target.value)}
  >
    ${placeholder ? html`<option value="">${placeholder}</option>` : null}
    ${options.map((o) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
  </select>`
}

export function TextInput({ value, onChange, placeholder, className = '', ...props }) {
  return html`<input
    class=${`rounded-md border border-slate-300 bg-white text-slate-900 text-sm px-2 py-1.5 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 ${className}`}
    value=${value}
    placeholder=${placeholder}
    onChange=${(e) => onChange(e.target.value)}
    ...${props}
  />`
}

export function Checkbox({ checked, onChange, label }) {
  return html`<label class="inline-flex items-center gap-2 text-sm text-slate-800 cursor-pointer select-none dark:text-zinc-200">
    <input type="checkbox" class="accent-sky-600 h-3.5 w-3.5" checked=${checked} onChange=${(e) => onChange(e.target.checked)} />
    ${label}
  </label>`
}

export function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null
  return html`<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 p-4" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class=${`w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-lg border border-slate-200 bg-white shadow-xl max-h-[90vh] flex flex-col dark:border-zinc-700 dark:bg-zinc-900`}>
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-zinc-800">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-zinc-100">${title}</h2>
        <button class="text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-100" onClick=${onClose} title="Close"><${X} size=${16} /></button>
      </div>
      <div class="overflow-y-auto p-4">${children}</div>
    </div>
  </div>`
}

// `shrink-0 whitespace-nowrap` on every tab keeps each one at its natural width instead of the
// flex row silently squeezing (and line-wrapping the label inside) every button as more tabs get
// added - the container this renders into (TopBar.js) scrolls horizontally instead, which also
// guarantees sibling controls placed after this never get pushed off-screen by tab overflow.
export function Tabs({ tabs, active, onChange }) {
  return html`<div class="flex gap-1">
    ${tabs.map(
      (t) => html`<button
        key=${t.id}
        onClick=${() => onChange(t.id)}
        title=${t.label}
        class=${`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
          active === t.id
            ? 'border-sky-500 text-sky-600 dark:text-sky-400'
            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
        }`}
      >
        ${t.icon ? html`<${t.icon} size=${14} />` : null}
        ${t.label}
      </button>`
    )}
  </div>`
}

// A short, always-visible "what this page does" banner, placed at the top of a tab's content -
// distinct from the Help Center (src/content/helpTopics.js), which has the full documentation.
// `icon` is normally the same icon the tab itself uses in TopBar.js's TABS list, so the banner
// visually echoes the tab you just clicked.
export function PageIntro({ icon: Icon, children }) {
  return html`<div class="mb-4 flex items-start gap-2.5 rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm leading-relaxed text-sky-900 dark:border-sky-700/40 dark:bg-sky-500/10 dark:text-sky-200">
    ${Icon ? html`<${Icon} size=${16} class="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" />` : null}
    <div>${children}</div>
  </div>`
}

export function Pill({ tone = 'zinc', children }) {
  const tones = {
    zinc: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    green: 'bg-green-100 text-green-700 border-green-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-700/50',
    red: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-700/50',
    amber: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-700/50',
    sky: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-700/50',
    violet: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-700/50',
  }
  return html`<span class=${`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-mono border ${tones[tone]}`}>${children}</span>`
}
