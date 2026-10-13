import { html } from '../lib/react.js'
import { useThemeStore } from '../store/useThemeStore.js'
import { Sun, Moon, Monitor } from './icons.js'

const OPTIONS = [
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'system', label: 'Match system theme', icon: Monitor },
  { value: 'dark', label: 'Dark theme', icon: Moon },
]

// A 3-way segmented control rather than a single cycling button: every state is reachable in
// one click and visible/labeled, which is more discoverable and accessible than making a user
// click repeatedly to find the 'system' option.
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  return html`<div
    role="radiogroup"
    aria-label="Color theme"
    class="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800"
  >
    ${OPTIONS.map(
      (o) => html`<button
        key=${o.value}
        type="button"
        role="radio"
        aria-checked=${theme === o.value}
        aria-label=${o.label}
        title=${o.label}
        onClick=${() => setTheme(o.value)}
        class=${`flex items-center justify-center rounded-[5px] p-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-sky-500 ${
          theme === o.value
            ? 'bg-white text-sky-600 shadow-sm dark:bg-zinc-700 dark:text-sky-400'
            : 'text-slate-600 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
        }`}
      >
        <${o.icon} size=${14} />
      </button>`
    )}
  </div>`
}
