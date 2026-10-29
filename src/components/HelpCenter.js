import { html, useState, useMemo } from '../lib/react.js'
import { HELP_TOPICS } from '../content/helpTopics.js'
import { HELP_TOPICS_HE } from '../content/helpTopics.he.js'
import { Search, X, CircleHelp, Cpu } from './icons.js'
import { useHelpDevStore } from '../store/useHelpDevStore.js'

const LANG_STORAGE_KEY = 'sysmon-help-lang'

const STRINGS = {
  en: {
    title: 'Help & Documentation',
    searchPlaceholder: 'Search topics (e.g. suppress, casing)...',
    noMatch: (q) => `No topics match "${q}".`,
    close: 'Close help',
  },
  he: {
    title: 'עזרה ותיעוד',
    searchPlaceholder: 'חיפוש נושאים (למשל suppress, casing)...',
    noMatch: (q) => `אין נושאים שמתאימים ל-"${q}".`,
    close: 'סגור עזרה',
  },
}

function loadLang() {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY)
    return stored === 'he' ? 'he' : 'en'
  } catch {
    return 'en'
  }
}

function matchesQuery(topic, q) {
  if (!q) return true
  const haystack = `${topic.label} ${(topic.keywords || []).join(' ')}`.toLowerCase()
  return haystack.includes(q)
}

export function HelpCenter({ open, onClose }) {
  const [lang, setLang] = useState(loadLang)
  const [activeId, setActiveId] = useState(HELP_TOPICS[0].id)
  const [query, setQuery] = useState('')
  const devMode = useHelpDevStore((s) => s.devMode)
  const toggleDevMode = useHelpDevStore((s) => s.toggle)

  const topics = lang === 'he' ? HELP_TOPICS_HE : HELP_TOPICS
  const t = STRINGS[lang]
  const isRtl = lang === 'he'

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return topics.filter((topic) => matchesQuery(topic, q))
  }, [topics, query])

  function switchLang(next) {
    setLang(next)
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next)
    } catch {
      // Non-fatal: the choice just won't persist across reloads.
    }
  }

  if (!open) return null

  const active = topics.find((topic) => topic.id === activeId) || topics[0]

  return html`<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 dark:bg-black/70"
    onClick=${(e) => e.target === e.currentTarget && onClose()}
  >
    <div dir=${isRtl ? 'rtl' : 'ltr'} class="flex w-full max-w-5xl h-[88vh] flex-col rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden dark:border-zinc-700 dark:bg-zinc-900">
      <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-zinc-800">
        <div class="flex items-center gap-2">
          <${CircleHelp} size=${18} class="text-sky-600 dark:text-sky-400" />
          <h2 class="text-sm font-semibold text-slate-900 dark:text-zinc-100">${t.title}</h2>
        </div>
        <div class="flex items-center gap-2">
          <button
            onClick=${toggleDevMode}
            dir="ltr"
            title="Developer Mode: show exactly which file/function runs in the background for each button and action - for engineers extending or integrating with this app"
            class=${`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              devMode
                ? 'border-violet-400 bg-violet-100 text-violet-700 dark:border-violet-600 dark:bg-violet-500/15 dark:text-violet-300'
                : 'border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <${Cpu} size=${13} /> Dev Mode${devMode ? ': On' : ''}
          </button>
          <div class="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 p-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-800" dir="ltr">
            <button
              onClick=${() => switchLang('en')}
              title="Switch help content to English"
              class=${`rounded-[5px] px-2 py-1 font-medium transition-colors ${lang === 'en' ? 'bg-white text-sky-600 shadow-sm dark:bg-zinc-700 dark:text-sky-400' : 'text-slate-600 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
            >EN</button>
            <button
              onClick=${() => switchLang('he')}
              title="החלף את תוכן העזרה לעברית (switch help content to Hebrew)"
              class=${`rounded-[5px] px-2 py-1 font-medium transition-colors ${lang === 'he' ? 'bg-white text-sky-600 shadow-sm dark:bg-zinc-700 dark:text-sky-400' : 'text-slate-600 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
            >עברית</button>
          </div>
          <button class="text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-100" onClick=${onClose} aria-label=${t.close} title=${t.close}>
            <${X} size=${18} />
          </button>
        </div>
      </div>

      <div class="flex flex-1 overflow-hidden">
        <nav class="w-64 shrink-0 border-slate-200 bg-slate-50 overflow-y-auto dark:border-zinc-800 dark:bg-zinc-950/40" style=${isRtl ? { borderLeftWidth: '1px' } : { borderRightWidth: '1px' }}>
          <div class="p-3">
            <div class="relative">
              <${Search} size=${13} class=${`absolute top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 ${isRtl ? 'right-2.5' : 'left-2.5'}`} />
              <input
                value=${query}
                onInput=${(e) => setQuery(e.target.value)}
                placeholder=${t.searchPlaceholder}
                class=${`w-full rounded-md border border-slate-300 bg-white py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 ${isRtl ? 'pr-8 pl-2' : 'pl-8 pr-2'}`}
              />
            </div>
          </div>
          <div class="flex flex-col gap-0.5 px-2 pb-3">
            ${filtered.map(
              (topic) => html`<button
                key=${topic.id}
                onClick=${() => setActiveId(topic.id)}
                title=${topic.label}
                class=${`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${isRtl ? 'text-right' : 'text-left'} ${
                  activeId === topic.id
                    ? 'bg-sky-100 text-sky-700 font-medium dark:bg-sky-500/15 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60'
                }`}
              >
                <${topic.icon} size=${15} class="shrink-0" />
                <span class="truncate">${topic.label}</span>
              </button>`
            )}
            ${filtered.length === 0 ? html`<div class="px-2.5 py-3 text-xs text-slate-500 italic dark:text-zinc-500">${t.noMatch(query)}</div>` : null}
          </div>
        </nav>

        <div class=${`flex-1 overflow-y-auto p-6 ${isRtl ? 'text-right' : 'text-left'}`}>
          <div class="mb-4 flex items-center gap-2">
            <${active.icon} size=${18} class="text-sky-600 dark:text-sky-400" />
            <h3 class="text-lg font-semibold text-slate-900 dark:text-zinc-100">${active.label}</h3>
          </div>
          ${
            devMode
              ? html`<div dir="ltr" class="mb-4 flex items-center gap-2 rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-left text-xs text-violet-800 dark:border-violet-700/40 dark:bg-violet-500/10 dark:text-violet-300">
                  <${Cpu} size=${13} class="shrink-0" /> Developer Mode is on - look for the purple "Developer Mode" boxes below for the exact file/function behind each action (and whether it's deterministic code or an LLM call).
                </div>`
              : null
          }
          <${active.render} />
        </div>
      </div>
    </div>
  </div>`
}
