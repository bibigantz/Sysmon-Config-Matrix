import { html, useState } from '../lib/react.js'
import { useStore } from '../store/useStore.js'
import { Card, CardHeader, CardBody, Button, Select, TextInput, Checkbox, Pill } from './ui.js'
import { Plus, X, Wand2, Code2, AlertTriangle, CircleCheck } from './icons.js'
import { EVENT_TAGS, CONDITIONS, ONMATCH_VALUES, COMMON_FIELDS_BY_TAG } from '../utils/eventSchema.js'
import { createRuleFromForm, parseRawSnippet, detectConflicts } from '../utils/ruleOps.js'

const EVENT_TAG_OPTIONS = Object.keys(EVENT_TAGS).map((t) => ({ value: t, label: `${t} (${EVENT_TAGS[t].ids.join('/')})` }))

function FilterRow({ filter, fields, onChange, onRemove }) {
  return html`<div class="flex items-center gap-2">
    <${Select} value=${filter.field} onChange=${(v) => onChange({ ...filter, field: v })} placeholder="Field" options=${fields.map((f) => ({ value: f, label: f }))} className="w-44" />
    <${Select} value=${filter.condition} onChange=${(v) => onChange({ ...filter, condition: v })} options=${CONDITIONS.map((c) => ({ value: c, label: c }))} className="w-36" />
    <${TextInput} value=${filter.value} onChange=${(v) => onChange({ ...filter, value: v })} placeholder="Value" className="flex-1" />
    <button class="text-slate-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400" onClick=${onRemove} title="Remove this condition"><${X} size=${14} /></button>
  </div>`
}

export function RuleInjector() {
  const networks = useStore((s) => s.networks)
  const selectedForBulk = useStore((s) => s.selectedForBulk)
  const toggleBulkSelection = useStore((s) => s.toggleBulkSelection)
  const applyRuleToNetworks = useStore((s) => s.applyRuleToNetworks)

  const [mode, setMode] = useState('form') // 'form' | 'raw'
  const [eventTag, setEventTag] = useState('ProcessCreate')
  const [onmatch, setOnmatch] = useState('exclude')
  const [filters, setFilters] = useState([{ field: 'CommandLine', condition: 'contains', value: '' }])
  const [rawXml, setRawXml] = useState('<ProcessCreate onmatch="exclude">\n  <CommandLine condition="contains">mimikatz</CommandLine>\n</ProcessCreate>')
  const [preview, setPreview] = useState(null) // { rules, conflicts }
  const [error, setError] = useState(null)
  const [applied, setApplied] = useState(false)

  const fields = COMMON_FIELDS_BY_TAG[eventTag] || []
  const targets = networks.filter((n) => selectedForBulk.has(n.id))

  function buildCandidateRules() {
    if (mode === 'form') {
      return [createRuleFromForm({ eventTag, onmatch, filters })]
    }
    const { error: err, rules } = parseRawSnippet(rawXml)
    if (err) throw new Error(err)
    return rules
  }

  function handlePreview() {
    setError(null)
    setApplied(false)
    try {
      const rules = buildCandidateRules()
      const conflictsByRule = rules.map((rule) => ({ rule, conflicts: detectConflicts(rule, targets) }))
      setPreview(conflictsByRule)
    } catch (err) {
      setPreview(null)
      setError(err.message)
    }
  }

  function handleApply() {
    if (!preview) return
    for (const { rule } of preview) {
      applyRuleToNetworks(rule, targets.map((t) => t.id))
    }
    setApplied(true)
    setPreview(null)
  }

  return html`<div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
    <div class="space-y-4">
      <${Card}>
        <${CardHeader} className="flex items-center gap-2">
          <button class=${`flex items-center gap-1.5 text-sm px-2 py-1 rounded ${mode === 'form' ? 'bg-sky-600 text-white' : 'text-slate-500 dark:text-zinc-400'}`} onClick=${() => setMode('form')} title="Build the rule with dropdowns and condition rows">
            <${Wand2} size=${14} /> Form Builder
          </button>
          <button class=${`flex items-center gap-1.5 text-sm px-2 py-1 rounded ${mode === 'raw' ? 'bg-sky-600 text-white' : 'text-slate-500 dark:text-zinc-400'}`} onClick=${() => setMode('raw')} title="Paste a raw Sysmon XML snippet instead">
            <${Code2} size=${14} /> Raw XML
          </button>
        </${CardHeader}>
        <${CardBody} className="space-y-3">
          ${
            mode === 'form'
              ? html`<div class="space-y-3">
                  <div class="flex gap-3">
                    <${Select} value=${eventTag} onChange=${setEventTag} options=${EVENT_TAG_OPTIONS} className="flex-1" />
                    <${Select} value=${onmatch} onChange=${setOnmatch} options=${ONMATCH_VALUES.map((v) => ({ value: v, label: v }))} />
                  </div>
                  <div class="space-y-2">
                    ${filters.map(
                      (f, i) => html`<${FilterRow}
                        key=${i}
                        filter=${f}
                        fields=${fields}
                        onChange=${(nf) => setFilters(filters.map((x, idx) => (idx === i ? nf : x)))}
                        onRemove=${() => setFilters(filters.filter((_, idx) => idx !== i))}
                      />`
                    )}
                    <${Button} variant="outline" size="sm" onClick=${() => setFilters([...filters, { field: fields[0] || '', condition: 'contains', value: '' }])} title="Add another field/condition/value row to this rule">
                      <${Plus} size=${13} /> Add condition
                    </${Button}>
                  </div>
                </div>`
              : html`<textarea
                  class="w-full h-40 rounded-md border border-slate-300 bg-white text-slate-900 font-mono text-xs p-3 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  value=${rawXml}
                  onChange=${(e) => setRawXml(e.target.value)}
                ></textarea>`
          }
          <${Button} onClick=${handlePreview} title="Build the rule and check it against the selected target networks before applying">Preview conflicts & build rule</${Button}>
          ${error ? html`<div class="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"><${AlertTriangle} size=${13} /> ${error}</div>` : null}
        </${CardBody}>
      </${Card}>

      ${
        preview
          ? html`<${Card}>
              <${CardHeader}><span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Conflict check against ${targets.length} selected network${targets.length === 1 ? '' : 's'}</span></${CardHeader}>
              <${CardBody} className="space-y-3">
                ${preview.map(
                  ({ rule, conflicts }, idx) => html`<div key=${idx} class="rounded border border-slate-200 p-2.5 space-y-1.5 dark:border-zinc-800">
                    <div class="font-mono text-xs text-slate-700 dark:text-zinc-300">
                      <${Pill} tone=${rule.onmatch === 'include' ? 'green' : 'red'}>${rule.onmatch}</${Pill}> <span class="text-sky-700 dark:text-sky-400">${rule.eventTag}</span>
                      ${rule.filters.map((f, i) => html`<div key=${i} class="pl-4 text-slate-500 dark:text-zinc-400">${f.field} ${f.condition} "${f.value}"</div>`)}
                    </div>
                    <div class="space-y-1">
                      ${conflicts.map(
                        (c) => html`<div key=${c.networkId} class="flex items-start gap-1.5 text-[11px]">
                          ${c.type === 'none' ? html`<${CircleCheck} size=${12} class="mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />` : html`<${AlertTriangle} size=${12} class="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />`}
                          <span class="text-slate-500 dark:text-zinc-400"><b class="text-slate-800 dark:text-zinc-200">${c.networkName}</b>: ${c.message}</span>
                        </div>`
                      )}
                    </div>
                  </div>`
                )}
                <${Button} variant=${applied ? 'secondary' : 'default'} onClick=${handleApply} disabled=${applied || targets.length === 0} title=${applied ? 'Already applied to the selected target networks' : 'Add this rule to every checked target network'}>
                  ${applied ? 'Applied ✓' : `Apply to ${targets.length} network${targets.length === 1 ? '' : 's'}`}
                </${Button}>
              </${CardBody}>
            </${Card}>`
          : null
      }
    </div>

    <${Card} className="h-fit">
      <${CardHeader}><span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Target networks</span></${CardHeader}>
      <${CardBody} className="flex flex-col gap-1.5">
        ${networks.map(
          (n) => html`<${Checkbox} key=${n.id} checked=${selectedForBulk.has(n.id)} onChange=${() => toggleBulkSelection(n.id)} label=${n.name} />`
        )}
        ${networks.length === 0 ? html`<div class="text-xs text-slate-500 italic dark:text-zinc-500">No networks loaded.</div>` : null}
      </${CardBody}>
    </${Card}>
  </div>`
}
