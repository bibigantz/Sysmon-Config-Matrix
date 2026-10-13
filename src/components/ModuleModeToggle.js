import { html } from '../lib/react.js'
import { Cloud, HardDriveDownload } from './icons.js'

// Mirrors the decision index.html's pre-React bootstrap script already made (which import map
// to use) - that decision has to happen before React loads and can't be undone here, but
// *changing the setting for next time* is just localStorage + reload, so this can safely be a
// normal React component living wherever the layout wants it (the top bar, next to the theme
// toggle), unlike the bootstrap logic itself.
export function ModuleModeToggle() {
  const mode = typeof window !== 'undefined' ? window.__SYSMON_MODULE_SOURCE__ || 'vendor' : 'vendor'
  const isVendor = mode === 'vendor'

  function switchMode() {
    localStorage.setItem('sysmon-module-source', isVendor ? 'cdn' : 'vendor')
    location.reload()
  }

  return html`<button
    type="button"
    onClick=${switchMode}
    title=${isVendor ? 'Running fully offline from ./vendor/ - click to switch back to the esm.sh CDN' : 'Running from the esm.sh CDN - click to switch to the offline ./vendor/ copy'}
    class=${`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-sky-500 ${
      isVendor
        ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20'
        : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-700/50 dark:bg-sky-500/10 dark:text-sky-400 dark:hover:bg-sky-500/20'
    }`}
  >
    ${isVendor ? html`<${HardDriveDownload} size=${12} />` : html`<${Cloud} size=${12} />`}
    ${isVendor ? 'Offline (vendor/)' : 'CDN (esm.sh)'}
  </button>`
}
