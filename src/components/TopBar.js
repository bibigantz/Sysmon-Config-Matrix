import { html, useState } from '../lib/react.js'
import { Tabs } from './ui.js'
import { SettingsMenu } from './SettingsMenu.js'
import { HelpCenter } from './HelpCenter.js'

export function TopBar({ tabs, active, onChange }) {
  const [helpOpen, setHelpOpen] = useState(false)

  return html`<div class="flex items-center justify-between border-b border-slate-200 bg-white px-2 dark:border-zinc-800 dark:bg-zinc-950">
    <div class="min-w-0 flex-1 overflow-x-auto">
      <${Tabs} tabs=${tabs} active=${active} onChange=${onChange} />
    </div>
    <div class="flex items-center gap-2 pr-3 pl-2 shrink-0">
      <${SettingsMenu} onOpenHelp=${() => setHelpOpen(true)} onOpenAiConfig=${() => onChange('ai-config')} />
    </div>
    <${HelpCenter} open=${helpOpen} onClose=${() => setHelpOpen(false)} />
  </div>`
}
