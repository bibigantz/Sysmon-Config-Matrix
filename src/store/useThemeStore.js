// Theme state: 'dark' | 'light' | 'system', persisted to localStorage, applied as a `dark` or
// `light` class on <html> so plain Tailwind `dark:` variants (darkMode: 'class') react to it
// everywhere instantly - no component re-render is needed for the visual switch itself, only
// for the toggle control's own icon/label.
import { create } from 'zustand'

const STORAGE_KEY = 'sysmon-theme'
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

function systemPrefersDark() {
  return media ? media.matches : true
}

function resolve(theme) {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme
}

function applyToDom(resolved) {
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(resolved)
}

export const useThemeStore = create((set, get) => ({
  theme: 'dark',
  resolved: 'dark',

  init() {
    let stored = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {
      // localStorage unavailable - fall back to the default below.
    }
    const theme = stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'dark'
    const resolved = resolve(theme)
    applyToDom(resolved)
    set({ theme, resolved })

    if (media) {
      media.addEventListener('change', () => {
        if (get().theme === 'system') {
          const next = resolve('system')
          applyToDom(next)
          set({ resolved: next })
        }
      })
    }
  },

  setTheme(theme) {
    const resolved = resolve(theme)
    applyToDom(resolved)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Non-fatal: theme just won't persist across reloads.
    }
    set({ theme, resolved })
  },

  cycleTheme() {
    const order = ['dark', 'light', 'system']
    const next = order[(order.indexOf(get().theme) + 1) % order.length]
    get().setTheme(next)
  },
}))
