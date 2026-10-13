import { html, useEffect } from './lib/react.js'
import { useStore } from './store/useStore.js'
import { useThemeStore } from './store/useThemeStore.js'
import { Sidebar } from './components/Sidebar.js'
import { TopBar } from './components/TopBar.js'
import { Dashboard } from './components/Dashboard.js'
import { MatrixView } from './components/MatrixView.js'
import { DiffViewer } from './components/DiffViewer.js'
import { RuleInjector } from './components/RuleInjector.js'
import { RawEditorExport } from './components/RawEditorExport.js'
import { MergeWorkspace } from './components/MergeWorkspace.js'
import { AiAssistant } from './components/AiAssistant.js'
import { AiConfigPage } from './components/AiConfigPage.js'
import { LayoutGrid, GitCompare, Wand2, Code2, Network, Bot, Settings2, GitMerge } from './components/icons.js'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Network },
  { id: 'matrix', label: 'Matrix View', icon: LayoutGrid },
  { id: 'diff', label: 'Side-by-Side Diff', icon: GitCompare },
  { id: 'inject', label: 'Global Rule Injector', icon: Wand2 },
  { id: 'merge', label: 'Merge & Combine', icon: GitMerge },
  { id: 'export', label: 'Raw Editor / Export', icon: Code2 },
  { id: 'ai-assistant', label: 'AI Detection Assistant', icon: Bot },
  { id: 'ai-config', label: 'Local AI Config', icon: Settings2 },
]

export function App() {
  const init = useStore((s) => s.init)
  const loaded = useStore((s) => s.loaded)
  const activeTab = useStore((s) => s.activeTab)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const initTheme = useThemeStore((s) => s.init)

  useEffect(() => {
    initTheme()
    init()
  }, [])

  if (!loaded) {
    return html`<div class="flex h-screen items-center justify-center bg-slate-50 text-slate-500 text-sm dark:bg-zinc-950 dark:text-zinc-400">Loading Sysmon configs...</div>`
  }

  return html`<div class="flex h-screen bg-slate-50 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100">
    <${Sidebar} />
    <main class="flex-1 flex flex-col overflow-hidden">
      <${TopBar} tabs=${TABS} active=${activeTab} onChange=${setActiveTab} />
      <div class="flex-1 overflow-y-auto p-5">
        ${activeTab === 'dashboard' ? html`<${Dashboard} />` : null}
        ${activeTab === 'matrix' ? html`<${MatrixView} />` : null}
        ${activeTab === 'diff' ? html`<${DiffViewer} />` : null}
        ${activeTab === 'inject' ? html`<${RuleInjector} />` : null}
        ${activeTab === 'merge' ? html`<${MergeWorkspace} />` : null}
        ${activeTab === 'export' ? html`<${RawEditorExport} />` : null}
        ${activeTab === 'ai-assistant' ? html`<${AiAssistant} />` : null}
        ${activeTab === 'ai-config' ? html`<${AiConfigPage} />` : null}
      </div>
    </main>
  </div>`
}
