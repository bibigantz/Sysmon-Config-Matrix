import { html, useState } from '../lib/react.js'
import { useAiStore } from '../store/useAiStore.js'
import { AiStatusBadge } from './AiStatusBadge.js'
import { ModuleModeToggle } from './ModuleModeToggle.js'
import { ThemeToggle } from './ThemeToggle.js'
import { Settings2, ChevronDown, CircleHelp } from './icons.js'

function MenuLabel({ children }) {
  return html`<div class="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">${children}</div>`
}

// Consolidates the top bar's Local AI status, offline/CDN module toggle, theme toggle, and Help
// trigger - previously four separate always-visible controls - into a single dropdown so the top
// bar stays uncluttered. Each control keeps its own existing component/behavior unchanged; this
// is purely a different container for them (a clickable trigger + an absolutely-positioned panel,
// closed by a full-screen invisible backdrop - the same click-outside-to-close technique Modal
// uses in ui.js, just anchored under a button instead of centered on the page).
export function SettingsMenu({ onOpenHelp, onOpenAiConfig }) {
  const [open, setOpen] = useState(false)
  const aiConnected = useAiStore((s) => s.status === 'connected')

  return html`<div class="relative">
    <button
      type="button"
      onClick=${() => setOpen((o) => !o)}
      title="Settings: Local AI, offline/CDN mode, theme, help"
      aria-haspopup="menu"
      aria-expanded=${open}
      class=${`relative flex items-center gap-1 rounded-md border px-2 py-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-sky-500 ${
        open
          ? 'border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-600 dark:bg-sky-500/15 dark:text-sky-300'
          : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100'
      }`}
    >
      <${Settings2} size=${15} />
      <${ChevronDown} size=${12} class=${`transition-transform ${open ? 'rotate-180' : ''}`} />
      ${aiConnected ? html`<span class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-950" title="Local AI connected"></span>` : null}
    </button>

    ${open ? html`<div class="fixed inset-0 z-40" onClick=${() => setOpen(false)}></div>` : null}

    ${
      open
        ? html`<div dir="ltr" class="absolute right-0 top-full z-50 mt-2 w-64 space-y-2 rounded-md border border-slate-200 bg-white p-2.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <div>
              <${MenuLabel}>Local AI</${MenuLabel}>
              <${AiStatusBadge}
                onOpenConfig=${() => {
                  setOpen(false)
                  onOpenAiConfig()
                }}
              />
              <button
                onClick=${() => {
                  setOpen(false)
                  onOpenAiConfig()
                }}
                class="mt-1.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <${Settings2} size=${14} /> Open Local AI Config
              </button>
            </div>

            <div>
              <${MenuLabel}>Module Source</${MenuLabel}>
              <${ModuleModeToggle} />
            </div>

            <div>
              <${MenuLabel}>Theme</${MenuLabel}>
              <${ThemeToggle} />
            </div>

            <div class="border-t border-slate-200 pt-2 dark:border-zinc-800">
              <button
                onClick=${() => {
                  setOpen(false)
                  onOpenHelp()
                }}
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <${CircleHelp} size=${14} /> Help & Documentation
              </button>
            </div>
          </div>`
        : null
    }
  </div>`
}
