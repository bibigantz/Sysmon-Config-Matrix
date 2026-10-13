import { html, useEffect } from '../lib/react.js'
import { useAiStore } from '../store/useAiStore.js'
import { PlugZap, WifiOff, Loader2 } from './icons.js'

// Live top-bar indicator for the Local AI connection. Silently re-checks once on mount so the
// badge reflects reality after a reload without requiring a trip to the AI Config tab first -
// failures are swallowed (status just flips to "Offline"), since this must never block or alarm
// the rest of the app, which works fully without AI.
export function AiStatusBadge({ onOpenConfig }) {
  const status = useAiStore((s) => s.status)
  const model = useAiStore((s) => s.model)
  const baseUrl = useAiStore((s) => s.baseUrl)
  const silentRecheck = useAiStore((s) => s.silentRecheck)

  useEffect(() => {
    silentRecheck()
  }, [])

  const checking = status === 'checking'
  const connected = status === 'connected'

  return html`<button
    type="button"
    onClick=${onOpenConfig}
    title=${connected ? `Local AI connected at ${baseUrl} (${model || 'no model selected'})` : baseUrl ? `Local AI offline - click to open AI Config (${baseUrl})` : 'Local AI not configured - click to set it up'}
    class=${`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-sky-500 ${
      connected
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700/50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20'
        : 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
    }`}
  >
    ${checking ? html`<${Loader2} size=${12} class="animate-spin" />` : connected ? html`<${PlugZap} size=${12} />` : html`<${WifiOff} size=${12} />`}
    ${checking ? 'Checking Local AI...' : connected ? `Local AI: Connected · ${model}` : 'Local AI: Offline'}
  </button>`
}
