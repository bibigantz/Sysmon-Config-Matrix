import { html, useState, useMemo, Fragment as Fragment2 } from '../lib/react.js'
import { useStore } from '../store/useStore.js'
import { Select, TextInput, Pill, Button, Checkbox, PageIntro } from './ui.js'
import { Search, ChevronDown, ChevronRight, Trash2, Eye, EyeOff, MessageSquare, ShieldAlert, Pencil, Plus, X, Save, Unlink, LayoutGrid } from './icons.js'
import { ALL_EVENT_IDS, EVENT_ID_LABELS, TAG_BY_EVENT_ID, ONMATCH_VALUES, CONDITIONS, COMMON_FIELDS_BY_TAG } from '../utils/eventSchema.js'
import { MITRE_TECHNIQUE_INDEX } from '../utils/mitreMap.js'
import { buildRiskIndex } from '../utils/riskAnalyzer.js'

// Inline editor for an existing rule: lets an analyst fix a single filter's value (or add/remove
// conditions, change onmatch, or edit the rule's comment) without deleting and recreating the
// whole rule via the Global Rule Injector.
function RuleEditForm({ network, rule, onDone }) {
  const updateRule = useStore((s) => s.updateRule)
  const [onmatch, setOnmatch] = useState(rule.onmatch)
  const [filters, setFilters] = useState(rule.filters.map((f) => ({ ...f })))
  const [comment, setComment] = useState(rule.comment || '')

  const fieldOptions = COMMON_FIELDS_BY_TAG[rule.eventTag] || []

  function updateFilter(i, patch) {
    setFilters(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }

  function save() {
    const cleaned = filters.filter((f) => f.field && f.value !== '')
    updateRule(network.id, rule.id, { onmatch, filters: cleaned, comment: comment.trim() || null })
    onDone()
  }

  return html`<div class="rounded border border-sky-300 bg-sky-50 p-2 space-y-2 dark:border-sky-700/50 dark:bg-sky-500/10">
    <div class="flex items-center gap-2">
      <span class="font-mono text-[11px] text-sky-700 dark:text-sky-400">${rule.eventTag}</span>
      <${Select} value=${onmatch} onChange=${setOnmatch} options=${ONMATCH_VALUES.map((v) => ({ value: v, label: v }))} className="w-28 text-[11px] py-1" />
    </div>
    <div class="space-y-1.5">
      ${filters.map(
        (f, i) => html`<div key=${i} class="flex items-center gap-1.5">
          <${TextInput} value=${f.field} onChange=${(v) => updateFilter(i, { field: v })} placeholder="Field" className="w-32 text-[11px] py-1" list="rule-edit-fields" />
          <${Select} value=${f.condition} onChange=${(v) => updateFilter(i, { condition: v })} options=${CONDITIONS.map((c) => ({ value: c, label: c }))} className="w-32 text-[11px] py-1" />
          <${TextInput} value=${f.value} onChange=${(v) => updateFilter(i, { value: v })} placeholder="Value" className="flex-1 text-[11px] py-1" />
          <button class="text-slate-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400" title="Remove this condition" onClick=${() => setFilters(filters.filter((_, idx) => idx !== i))}><${X} size=${12} /></button>
        </div>`
      )}
      <datalist id="rule-edit-fields">
        ${fieldOptions.map((f) => html`<option key=${f} value=${f} />`)}
      </datalist>
      <${Button} variant="outline" size="sm" onClick=${() => setFilters([...filters, { field: fieldOptions[0] || '', condition: 'contains', value: '' }])} title="Add another field/condition/value row to this rule">
        <${Plus} size=${12} /> Add condition
      </${Button}>
    </div>
    <${TextInput} value=${comment} onChange=${setComment} placeholder="Comment (optional)" className="w-full text-[11px] py-1" />
    <div class="flex gap-2">
      <${Button} size="sm" onClick=${save} title="Save changes to this rule"><${Save} size=${12} /> Save</${Button}>
      <${Button} size="sm" variant="secondary" onClick=${onDone} title="Discard changes and close the editor">Cancel</${Button}>
    </div>
  </div>`
}

function ruleMatchesFilters(rule, { onmatch, groupRelation, keyword, mitre, looseOnly }) {
  if (looseOnly && !rule.orphaned) return false
  if (onmatch && rule.onmatch !== onmatch) return false
  if (groupRelation && rule.groupRelation !== groupRelation) return false
  if (mitre) {
    const techniques = [...rule.mitre.map((m) => m.technique), ...rule.manualMitre]
    if (!techniques.includes(mitre)) return false
  }
  if (keyword) {
    const kw = keyword.toLowerCase()
    const hit = rule.filters.some((f) => f.field.toLowerCase().includes(kw) || f.value.toLowerCase().includes(kw))
    if (!hit) return false
  }
  return true
}

function CellBreakdown({ network, eventId, filters, broadByRuleId }) {
  const deleteRule = useStore((s) => s.deleteRule)
  const toggleRuleDisabled = useStore((s) => s.toggleRuleDisabled)
  const [editingId, setEditingId] = useState(null)
  const rules = network.rules.filter((r) => r.eventIds.includes(eventId) && ruleMatchesFilters(r, filters))
  if (!rules.length) return html`<div class="text-[11px] text-slate-500 italic px-2 py-1 dark:text-zinc-500">No matching rules.</div>`
  return html`<div class="space-y-1.5">
    ${rules.map((r) => {
      if (editingId === r.id) {
        return html`<${RuleEditForm} key=${r.id} network=${network} rule=${r} onDone=${() => setEditingId(null)} />`
      }
      const broadFlags = new Map((broadByRuleId.get(r.id) || []).map((b) => [`${b.field}::${b.value}`, b]))
      return html`<div key=${r.id} class=${`rounded border p-2 ${r.disabled ? 'border-slate-200 bg-slate-50 opacity-60 dark:border-zinc-800/60 dark:bg-zinc-900/30' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/80'}`}>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <${Pill} tone=${r.onmatch === 'include' ? 'green' : 'red'}>${r.onmatch}</${Pill}>
            ${r.disabled ? html`<${Pill} tone="amber">suppressed</${Pill}>` : null}
            ${
              r.orphaned
                ? html`<span title="Found loose/unwrapped in the source XML (no enclosing RuleGroup/event tag, or a non-standard wrapper) - the event tag shown is a best guess. Auto-wrapped so nothing was lost; use Sanitize to confirm and clear this flag.">
                    <${Pill} tone="amber"><${Unlink} size=${10} /> Loose Rule / Unwrapped</${Pill}>
                  </span>`
                : null
            }
            ${r.ruleGroupName ? html`<span class="text-[10px] text-slate-500 dark:text-zinc-500">${r.ruleGroupName}</span>` : null}
            ${r.comment ? html`<span title=${r.comment}><${MessageSquare} size=${11} class="text-slate-400 dark:text-zinc-500" /></span>` : null}
          </div>
          <div class="flex items-center gap-1">
            <button class="text-slate-400 hover:text-sky-600 dark:text-zinc-500 dark:hover:text-sky-400" title="Edit" onClick=${() => setEditingId(r.id)}>
              <${Pencil} size=${12} />
            </button>
            <button class="text-slate-400 hover:text-sky-600 dark:text-zinc-500 dark:hover:text-sky-400" title=${r.disabled ? 'Re-enable this rule' : 'Suppress this rule (comment it out, keep it re-enablable)'} onClick=${() => toggleRuleDisabled(network.id, r.id)}>
              ${r.disabled ? html`<${Eye} size=${12} />` : html`<${EyeOff} size=${12} />`}
            </button>
            <button class="text-slate-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400" title="Delete this rule permanently" onClick=${() => deleteRule(network.id, r.id)}><${Trash2} size=${12} /></button>
          </div>
        </div>
        <div class="mt-1 space-y-0.5">
          ${r.filters.map((f, i) => {
            const broad = broadFlags.get(`${f.field}::${f.value}`)
            return html`<div key=${i} class="font-mono text-[11px] text-slate-700 dark:text-zinc-300">
              <span class="text-sky-700 dark:text-sky-400">${f.field}</span> <span class="text-slate-500 dark:text-zinc-500">${f.condition}</span> <span class="text-amber-700 dark:text-amber-300">"${f.value}"</span>
              ${f.comment ? html`<span class="text-slate-600 italic dark:text-zinc-400"> // ${f.comment.split('\n')[0]}</span>` : null}
              ${broad ? html`<span title=${broad.reason}><${Pill} tone="amber"><${ShieldAlert} size=${10} /> broad</${Pill}></span>` : null}
            </div>`
          })}
        </div>
        ${
          r.mitre.length || r.manualMitre.length
            ? html`<div class="mt-1 flex flex-wrap gap-1">
                ${[...new Set([...r.mitre.map((m) => m.technique), ...r.manualMitre])].map(
                  (t) => html`<${Pill} key=${t} tone="violet">${t}</${Pill}>`
                )}
              </div>`
            : null
        }
      </div>`
    })}
  </div>`
}

export function MatrixView() {
  const networks = useStore((s) => s.networks)
  const [eventIdFilter, setEventIdFilter] = useState('')
  const [onmatch, setOnmatch] = useState('')
  const [groupRelation, setGroupRelation] = useState('')
  const [keyword, setKeyword] = useState('')
  const [mitre, setMitre] = useState('')
  const [looseOnly, setLooseOnly] = useState(false)
  const [expanded, setExpanded] = useState(new Set())

  const activeFilters = { onmatch, groupRelation, keyword, mitre, looseOnly }
  const riskIndex = useMemo(() => buildRiskIndex(networks), [networks])

  const rows = useMemo(() => {
    return ALL_EVENT_IDS.filter((id) => (eventIdFilter ? String(id) === eventIdFilter : true)).filter((id) => {
      // Only show rows that have at least one network with rules for this event id (unfiltered),
      // so the matrix isn't 29 mostly-empty rows when only a couple networks are loaded.
      return networks.some((n) => (n.rules || []).some((r) => r.eventIds.includes(id)))
    })
  }, [networks, eventIdFilter])

  function toggle(id) {
    const next = new Set(expanded)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpanded(next)
  }

  return html`<div class="space-y-3">
    <${PageIntro} icon=${LayoutGrid}>
      Every Sysmon Event ID as a row, every loaded network as a column - compare <b>include</b>/<b>exclude</b> rule
      coverage across all your environments at a glance. Click a row to expand it and see each network's matching
      rules, filters, MITRE tags, and per-rule edit/suppress/delete controls. The Risk Analyzer's operator-mismatch
      and overly-broad-rule flags (shield icons) show up here too - see the Help Center for exactly what they check.
    </${PageIntro}>
    <div class="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div class="flex items-center gap-1.5">
        <${Search} size=${14} class="text-slate-400 dark:text-zinc-500" />
        <${TextInput} value=${keyword} onChange=${setKeyword} placeholder="Search Image, CommandLine, TargetFilename..." className="w-64" />
      </div>
      <${Select}
        value=${eventIdFilter}
        onChange=${setEventIdFilter}
        placeholder="All Event IDs"
        options=${ALL_EVENT_IDS.map((id) => ({ value: String(id), label: `${id} - ${EVENT_ID_LABELS[id]}` }))}
      />
      <${Select} value=${onmatch} onChange=${setOnmatch} placeholder="include / exclude" options=${ONMATCH_VALUES.map((v) => ({ value: v, label: v }))} />
      <${Select} value=${groupRelation} onChange=${setGroupRelation} placeholder="GroupRelation" options=${[{ value: 'or', label: 'or' }, { value: 'and', label: 'and' }]} />
      <${Select} value=${mitre} onChange=${setMitre} placeholder="MITRE technique" options=${MITRE_TECHNIQUE_INDEX.map((m) => ({ value: m.technique, label: `${m.technique} ${m.name}` }))} />
      <${Checkbox} checked=${looseOnly} onChange=${setLooseOnly} label="Show Loose / Unwrapped Rules Only" />
      ${
        eventIdFilter || onmatch || groupRelation || keyword || mitre || looseOnly
          ? html`<${Button} variant="ghost" size="sm" onClick=${() => { setEventIdFilter(''); setOnmatch(''); setGroupRelation(''); setKeyword(''); setMitre(''); setLooseOnly(false) }} title="Clear all Matrix View filters">Clear</${Button}>`
          : null
      }
      ${
        riskIndex.mismatches.length || riskIndex.broad.length || riskIndex.orphaned.length
          ? html`<div class="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-500">
              <${ShieldAlert} size=${13} class="text-amber-600 dark:text-amber-400" />
              ${riskIndex.mismatches.length ? html`<${Pill} tone="amber">${riskIndex.mismatches.length} operator mismatch${riskIndex.mismatches.length > 1 ? 'es' : ''}</${Pill}>` : null}
              ${riskIndex.broad.length ? html`<${Pill} tone="amber">${riskIndex.broad.length} broad rule${riskIndex.broad.length > 1 ? 's' : ''}</${Pill}>` : null}
              ${riskIndex.orphaned.length ? html`<${Pill} tone="amber"><${Unlink} size=${10} /> ${riskIndex.orphaned.length} loose rule${riskIndex.orphaned.length > 1 ? 's' : ''}</${Pill}>` : null}
            </div>`
          : null
      }
    </div>

    ${
      networks.length === 0
        ? html`<div class="py-16 text-center text-sm text-slate-500 dark:text-zinc-500">No networks loaded.</div>`
        : html`<div class="overflow-x-auto rounded-md border border-slate-200 dark:border-zinc-800">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-zinc-900 dark:text-zinc-500">
                  <th class="px-3 py-2 w-64">Event ID</th>
                  ${networks.map((n) => html`<th key=${n.id} class="px-3 py-2">
                    <span class="inline-flex items-center gap-1.5">
                      <span class="h-2 w-2 rounded-full" style=${{ background: n.color }}></span>${n.name}
                    </span>
                  </th>`)}
                </tr>
              </thead>
              <tbody>
                ${rows.map((eventId) => {
                  const isOpen = expanded.has(eventId)
                  const rowMismatches = riskIndex.mismatchByEventId.get(eventId) || []
                  const rowBroad = riskIndex.broadByEventId.get(eventId) || []
                  const rowOrphaned = riskIndex.orphanedByEventId.get(eventId) || []
                  return html`<${Fragment2} key=${eventId}>
                    <tr class="border-t border-slate-200 hover:bg-slate-50 cursor-pointer dark:border-zinc-800 dark:hover:bg-zinc-900/50" onClick=${() => toggle(eventId)}>
                      <td class="px-3 py-2 text-slate-800 dark:text-zinc-200">
                        <span class="inline-flex items-center gap-1">
                          ${isOpen ? html`<${ChevronDown} size=${13} />` : html`<${ChevronRight} size=${13} />`}
                          <span class="font-mono text-slate-500 dark:text-zinc-500">${eventId}</span> ${EVENT_ID_LABELS[eventId]}
                          ${rowMismatches.length || rowBroad.length ? html`<span title="Risk flags - expand for details"><${ShieldAlert} size=${12} class="text-amber-600 dark:text-amber-400" /></span>` : null}
                          ${rowOrphaned.length ? html`<span title="Loose/unwrapped rule(s) found for this Event ID - expand for details"><${Unlink} size=${12} class="text-amber-600 dark:text-amber-400" /></span>` : null}
                        </span>
                      </td>
                      ${networks.map((n) => {
                        const matching = (n.rules || []).filter((r) => r.eventIds.includes(eventId) && ruleMatchesFilters(r, activeFilters))
                        const active = matching.filter((r) => !r.disabled)
                        const inc = active.filter((r) => r.onmatch === 'include').length
                        const exc = active.filter((r) => r.onmatch === 'exclude').length
                        const disabledCount = matching.length - active.length
                        return html`<td key=${n.id} class="px-3 py-2">
                          ${inc ? html`<${Pill} tone="green">${inc} inc</${Pill}>` : null}
                          ${exc ? html`<${Pill} tone="red">${exc} exc</${Pill}>` : null}
                          ${disabledCount ? html`<${Pill} tone="zinc">${disabledCount} off</${Pill}>` : null}
                          ${!inc && !exc && !disabledCount ? html`<span class="text-slate-500 text-xs dark:text-zinc-500">—</span>` : null}
                        </td>`
                      })}
                    </tr>
                    ${
                      isOpen
                        ? html`<tr class="border-t border-slate-200/60 bg-slate-50 dark:border-zinc-800/60 dark:bg-zinc-950/60">
                            <td class="px-3 py-2 align-top text-[11px] text-slate-500 dark:text-zinc-500">
                              Details
                              ${
                                rowMismatches.length
                                  ? html`<div class="mt-2 space-y-1.5">
                                      ${rowMismatches.map(
                                        (m, i) => html`<div key=${i} class="rounded border border-amber-300 bg-amber-100 p-1.5 text-amber-800 dark:border-amber-700/40 dark:bg-amber-500/10 dark:text-amber-300">
                                          <div class="font-semibold">Operator mismatch</div>
                                          <div class="font-mono">${m.field} = "${m.value}"</div>
                                          ${m.entries.map((e, j) => html`<div key=${j}>${e.networkName}: <b>${e.condition}</b></div>`)}
                                        </div>`
                                      )}
                                    </div>`
                                  : null
                              }
                            </td>
                            ${networks.map(
                              (n) => html`<td key=${n.id} class="px-3 py-2 align-top">
                                <${CellBreakdown} network=${n} eventId=${eventId} filters=${activeFilters} broadByRuleId=${riskIndex.broadByRuleId} />
                              </td>`
                            )}
                          </tr>`
                        : null
                    }
                  </${Fragment2}>`
                })}
              </tbody>
            </table>
          </div>`
    }
  </div>`
}
