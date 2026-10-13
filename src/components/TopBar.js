import { html, useState } from '../lib/react.js'
import { Tabs } from './ui.js'
import { ThemeToggle } from './ThemeToggle.js'
import { ModuleModeToggle } from './ModuleModeToggle.js'
import { AiStatusBadge } from './AiStatusBadge.js'
import { HelpCenter } from './HelpCenter.js'
import { CircleHelp } from './icons.js'

export function TopBar({ tabs, active, onChange }) {
  const [helpOpen, setHelpOpen] = useState(false)

  return html`<div class="flex items-center justify-between border-b border-slate-200 bg-white px-2 dark:border-zinc-800 dark:bg-zinc-950">
    <${Tabs} tabs=${tabs} active=${active} onChange=${onChange} />
    <div class="flex items-center gap-2 pr-3 shrink-0">
      <${AiStatusBadge} onOpenConfig=${() => onChange('ai-config')} />
      <${ModuleModeToggle} />
      <${ThemeToggle} />
      <button
        onClick=${() => setHelpOpen(true)}
        title="Help & Documentation"
        aria-label="Help & Documentation"
        class="flex items-center justify-center rounded-md border border-slate-300 bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
      >
        <${CircleHelp} size=${15} />
      </button>
    </div>
    <${HelpCenter} open=${helpOpen} onClose=${() => setHelpOpen(false)} />
  </div>`
}
