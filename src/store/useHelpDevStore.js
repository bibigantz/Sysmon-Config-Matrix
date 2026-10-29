// Tracks the Help Center's "Developer Mode" toggle - a display-only preference (shows/hides the
// <DevNote> "under the hood" boxes sprinkled through content/helpTopics.js), persisted to
// localStorage the same lightweight way useThemeStore persists the color theme. No other part of
// the app reads this; it exists purely so <DevNote> can subscribe to it from anywhere without
// every helpTopics.js render function having to thread a prop down manually.
import { create } from 'zustand'

const STORAGE_KEY = 'sysmon-help-devmode'

function loadInitial() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const useHelpDevStore = create((set, get) => ({
  devMode: loadInitial(),

  toggle() {
    const next = !get().devMode
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // Non-fatal: the choice just won't persist across reloads.
    }
    set({ devMode: next })
  },
}))
