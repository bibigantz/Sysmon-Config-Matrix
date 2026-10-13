import { html, useState, useMemo } from '../lib/react.js'
import { useStore } from '../store/useStore.js'
import { Modal, Button, Select, TextInput, Checkbox, Pill } from './ui.js'
import { Trash2, Ban, Code2, Search, Eye, Unlink } from './icons.js'
import { EVENT_TAGS, ONMATCH_VALUES } from '../utils/eventSchema.js'
import { findMatchingRules, findRulesBySnippet } from '../utils/ruleFinder.js'

const EVENT_TAG_OPTIONS = Object.keys(EVENT_TAGS).map((t) => ({ value: t, label: `${t} (${EVENT_TAGS[t].ids.join('/')})` }))

function matchKey(m) {
  return `${m.networkId}:${m.rule.id}`
}

export function RuleRemoverModal({ open, onClose }) {
  const networks = useStore((s) => s.networks)
  const selectedForBulk = useStore((s) => s.selectedForBulk)
  const toggleBulkSelection = useStore((s) => s.toggleBulkSelection)
  const deleteRulesAcrossNetworks = useStore((s) => s.deleteRulesAcrossNetworks)
  const setRulesDisabled = useStore((s) => s.setRulesDisabled)

  const [mode, setMode] = useState('keyword') // 'keyword' | 'snippet'
  const [eventTag, setEventTag] = useState('')
  const [onmatch, setOnmatch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [snippet, setSnippet] = useState('<ProcessCreate onmatch="exclude">\n  <CommandLine condition="contains">mimikatz</CommandLine>\n</ProcessCreate>')
  const [results, setResults] = useState(null) // array of matches
  const [error, setError] = useState(null)
  const [selectedKeys, setSelectedKeys] = useState(new Set())
  const [done, setDone] = useState(null)

  const targets = useMemo(() => networks.filter((n) => selectedForBulk.has(n.id)), [networks, selectedForBulk])

  function runSearch() {
    setError(null)
    setDone(null)
    if (mode === 'keyword') {
      const matches = findMatchingRules(targets, { eventTag, onmatch, keyword })
      if (!eventTag && !onmatch && !keyword.trim()) {
        setError('Enter a keyword, or choose an Event ID / onmatch to search by.')
        setResults(null)
        return
      }
      setResults(matches)
      setSelectedKeys(new Set(matches.map(matchKey)))
    } else {
      const { error: err, matches } = findRulesBySnippet(targets, snippet)
      if (err) {
        setError(err)
        setResults(null)
        return
      }
      setResults(matches)
      setSelectedKeys(new Set(matches.map(matchKey)))
    }
  }

  function toggleMatch(key) {
    const next = new Set(selectedKeys)
    next.has(key) ? next.delete(key) : next.add(key)
    setSelectedKeys(next)
  }

  function selectedRefs() {
    return (results || [])
      .filter((m) => selectedKeys.has(matchKey(m)))
      .map((m) => ({ networkId: m.networkId, ruleId: m.rule.id }))
  }

  function handleDelete() {
    const refs = selectedRefs()
    if (!refs.length) return
    deleteRulesAcrossNetworks(refs)
    setDone(`Deleted ${refs.length} rule${refs.length > 1 ? 's' : ''}.`)
    setResults((prev) => prev.filter((m) => !selectedKeys.has(matchKey(m))))
    setSelectedKeys(new Set())
  }

  function handleSuppress() {
    const refs = selectedRefs()
    if (!refs.length) return
    setRulesDisabled(refs, true)
    setDone(`Suppressed (commented out) ${refs.length} rule${refs.length > 1 ? 's' : ''}. They stay in the export as inert, re-enablable comments.`)
    setResults((prev) => prev.map((m) => (selectedKeys.has(matchKey(m)) ? { ...m, rule: { ...m.rule, disabled: true } } : m)))
  }

  return html`<${Modal} open=${open} onClose=${onClose} title="Global Rule Remover / Suppressor" wide=${true}>
    <div class="space-y-4">
      <div>
        <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">Target networks</div>
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          ${networks.map((n) => html`<${Checkbox} key=${n.id} checked=${selectedForBulk.has(n.id)} onChange=${() => toggleBulkSelection(n.id)} label=${n.name} />`)}
        </div>
      </div>

      <div class="flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-zinc-800">
        <button class=${`flex items-center gap-1.5 text-sm px-2 py-1 rounded ${mode === 'keyword' ? 'bg-sky-600 text-white' : 'text-slate-500 dark:text-zinc-400'}`} onClick=${() => setMode('keyword')} title="Search by keyword, field, Event tag, or onmatch">
          <${Search} size=${14} /> Keyword / Field
        </button>
        <button class=${`flex items-center gap-1.5 text-sm px-2 py-1 rounded ${mode === 'snippet' ? 'bg-sky-600 text-white' : 'text-slate-500 dark:text-zinc-400'}`} onClick=${() => setMode('snippet')} title="Match rules by pasting an exact raw XML snippet instead">
          <${Code2} size=${14} /> Raw XML snippet
        </button>
      </div>

      ${
        mode === 'keyword'
          ? html`<div class="flex flex-wrap items-center gap-2">
              <${TextInput} value=${keyword} onChange=${setKeyword} placeholder="Condition value or field, e.g. mimikatz" className="flex-1 min-w-[200px]" />
              <${Select} value=${eventTag} onChange=${setEventTag} placeholder="Any Event tag" options=${EVENT_TAG_OPTIONS} />
              <${Select} value=${onmatch} onChange=${setOnmatch} placeholder="Any onmatch" options=${ONMATCH_VALUES.map((v) => ({ value: v, label: v }))} />
            </div>`
          : html`<textarea
              class="w-full h-28 rounded-md border border-slate-300 bg-white text-slate-900 font-mono text-xs p-3 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              value=${snippet}
              onChange=${(e) => setSnippet(e.target.value)}
            ></textarea>`
      }

      <${Button} onClick=${runSearch} disabled=${targets.length === 0} title="Find matching rules in the selected target networks">
        <${Search} size=${13} /> Search ${targets.length} target network${targets.length === 1 ? '' : 's'}
      </${Button}>
      ${targets.length === 0 ? html`<div class="text-xs text-amber-600 dark:text-amber-400">Select at least one target network above.</div>` : null}
      ${error ? html`<div class="text-xs text-red-600 dark:text-red-400">${error}</div>` : null}
      ${done ? html`<div class="text-xs text-emerald-600 dark:text-emerald-400">${done}</div>` : null}

      ${
        results !== null
          ? html`<div class="space-y-2">
              <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-500">
                <span>${results.length} match${results.length === 1 ? '' : 'es'} found - ${selectedKeys.size} selected</span>
                <div class="flex gap-2">
                  <button class="text-sky-600 hover:underline dark:text-sky-400" onClick=${() => setSelectedKeys(new Set(results.map(matchKey)))} title="Select every matching rule">select all</button>
                  <button class="text-slate-500 hover:underline dark:text-zinc-500" onClick=${() => setSelectedKeys(new Set())} title="Deselect all matches">select none</button>
                </div>
              </div>
              <div class="max-h-64 overflow-y-auto space-y-1.5">
                ${results.map(
                  (m) => html`<div key=${matchKey(m)} class="flex items-start gap-2 rounded border border-slate-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                    <${Checkbox} checked=${selectedKeys.has(matchKey(m))} onChange=${() => toggleMatch(matchKey(m))} />
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5 text-xs">
                        <${Pill}>${m.networkName}</${Pill}>
                        <${Pill} tone=${m.rule.onmatch === 'include' ? 'green' : 'red'}>${m.rule.onmatch}</${Pill}>
                        <span class="font-mono text-sky-700 dark:text-sky-400">${m.rule.eventTag}</span>
                        ${m.rule.disabled ? html`<${Pill} tone="amber">suppressed</${Pill}>` : null}
                        ${m.rule.orphaned ? html`<${Pill} tone="amber"><${Unlink} size=${10} /> Loose Rule / Unwrapped</${Pill}>` : null}
                      </div>
                      <div class="mt-1 space-y-0.5">
                        ${m.rule.filters.map((f, i) => html`<div key=${i} class="font-mono text-[11px] text-slate-500 dark:text-zinc-400">${f.field} ${f.condition} "${f.value}"</div>`)}
                      </div>
                    </div>
                  </div>`
                )}
                ${results.length === 0 ? html`<div class="text-xs text-slate-500 italic dark:text-zinc-500">No matching rules in the selected networks.</div>` : null}
              </div>
              <div class="flex gap-2 pt-1">
                <${Button} variant="danger" disabled=${!selectedKeys.size} onClick=${handleDelete} title="Permanently delete the selected rules">
                  <${Trash2} size=${13} /> Delete ${selectedKeys.size || ''} selected
                </${Button}>
                <${Button} variant="secondary" disabled=${!selectedKeys.size} onClick=${handleSuppress} title="Comment out the selected rules - keeps them re-enablable in the app">
                  <${Ban} size=${13} /> Comment out (suppress) ${selectedKeys.size || ''} selected
                </${Button}>
              </div>
              <div class="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-zinc-500">
                <${Eye} size=${11} /> Suppressed rules stay visible (greyed out) in Matrix View and can be re-enabled there.
              </div>
            </div>`
          : null
      }
    </div>
  </${Modal}>`
}
