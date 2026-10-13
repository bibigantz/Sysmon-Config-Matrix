// Merge & Policy Builder (`/merge` tab) - deterministic, code-only multi-network merging. Every
// algorithm this page drives lives in src/utils/mergeEngine.js as plain structural XML-model
// manipulation (dedup by field/condition/value signature, set operations across rule buckets,
// AST-style regrouping) - there is no AI/LLM anywhere in this file or its dependencies.
import { html, useState, useMemo } from '../lib/react.js'
import { useStore } from '../store/useStore.js'
import { Card, CardHeader, CardBody, Button, Select, TextInput, Checkbox, Pill } from './ui.js'
import { FileImport } from './FileImport.js'
import {
  GitMerge, Layers, Scale, GitCompareArrows, Crown, Combine, ArrowRightLeft,
  AlertTriangle, CircleCheck, Check, Trash2, Download, Save, ShieldAlert, FlaskConical,
} from './icons.js'
import {
  unionMerge, intersectionMerge, differentialMerge, hierarchicalMerge,
  detectAllConflicts, resolveOnmatchConflict, resolveGroupRelationConflict,
  findRedundantConditions, removeConditionLine, assembleMergedNetwork,
} from '../utils/mergeEngine.js'
import { serializeSysmonConfig } from '../utils/xmlSerializer.js'
import { validateNetwork } from '../utils/validator.js'
import { highlightXml } from '../utils/xmlHighlight.js'
import { downloadText } from '../utils/download.js'

const MODES = [
  { id: 'union', label: 'Union / Additive', icon: Layers, hint: 'Combine every unique rule across all selected networks; identical condition lines are deduplicated.' },
  { id: 'intersection', label: 'Intersection', icon: Scale, hint: 'Keep only condition lines present, identically, in every selected network - a mandatory shared baseline.' },
  { id: 'differential', label: 'Differential / Override', icon: GitCompareArrows, hint: 'Rules present in the base network but missing from the other selected network (network-specific delta).' },
  { id: 'hierarchy', label: 'Hierarchical Inheritance', icon: Crown, hint: 'Base network\'s header/schema/hash algorithms pass through untouched; overlays only ADD new rules.' },
]

const STYLE_OPTIONS = [
  { value: 'standard', label: 'Standard (flat rules)' },
  { value: 'swiftonsecurity', label: 'SwiftOnSecurity style' },
  { value: 'olaf-hartong', label: 'Olaf Hartong modular style' },
]

const REDUNDANT_KEY_SEP = '\u0001'

function modeRequirement(mode, sourceCount) {
  if (mode === 'differential') return sourceCount === 2 ? null : 'Differential mode needs exactly 2 selected source networks.'
  return sourceCount >= 2 ? null : 'Select at least 2 source networks.'
}

// ---- Source selection ----

function SourceSelectionPanel({ networks, sourceIds, onToggleSource, baseId, onSetBase, mode }) {
  const baseLabel = mode === 'hierarchy' ? 'Base / Master config' : mode === 'differential' ? 'Source A (primary)' : 'Primary (schema/hash tiebreak)'
  return html`<${Card}>
    <${CardHeader}><span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Input sources</span></${CardHeader}>
    <${CardBody} className="space-y-3">
      <${FileImport} />
      <div class="space-y-1">
        ${networks.map((n) => {
          const selected = sourceIds.includes(n.id)
          return html`<div key=${n.id} class="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-zinc-800/60">
            <${Checkbox} checked=${selected} onChange=${() => onToggleSource(n.id)} label=${n.name} />
            ${
              selected
                ? html`<button
                    title=${`Set as ${baseLabel}`}
                    onClick=${() => onSetBase(n.id)}
                    class=${`ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      baseId === n.id
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                        : 'text-slate-400 hover:text-amber-600 dark:text-zinc-500 dark:hover:text-amber-400'
                    }`}
                  >
                    <${Crown} size=${11} /> ${baseId === n.id ? 'Base' : 'Set base'}
                  </button>`
                : null
            }
          </div>`
        })}
        ${networks.length === 0 ? html`<div class="text-xs text-slate-500 italic dark:text-zinc-500">No networks loaded.</div>` : null}
      </div>
    </${CardBody}>
  </${Card}>`
}

// ---- Mode selector ----

function ModeSelector({ mode, onChange }) {
  return html`<${Card}>
    <${CardBody} className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
      ${MODES.map(
        (m) => html`<button
          key=${m.id}
          onClick=${() => onChange(m.id)}
          title=${m.hint}
          class=${`flex items-start gap-2 rounded-md border p-2.5 text-left transition-colors min-w-0 ${
            mode === m.id
              ? 'border-sky-400 bg-sky-50 dark:border-sky-700/60 dark:bg-sky-500/10'
              : 'border-slate-200 hover:border-slate-300 dark:border-zinc-800 dark:hover:border-zinc-700'
          }`}
        >
          <${m.icon} size=${16} class=${mode === m.id ? 'text-sky-600 dark:text-sky-400 shrink-0 mt-0.5' : 'text-slate-400 dark:text-zinc-500 shrink-0 mt-0.5'} />
          <span class="min-w-0">
            <span class=${`block text-sm font-medium ${mode === m.id ? 'text-sky-700 dark:text-sky-300' : 'text-slate-800 dark:text-zinc-200'}`}>${m.label}</span>
            <span class="block text-[11px] text-slate-600 dark:text-zinc-400 break-words">${m.hint}</span>
          </span>
        </button>`
      )}
    </${CardBody}>
  </${Card}>`
}

// ---- Conflict resolution ----

function OnmatchConflictRow({ conflict, choice, onChoose }) {
  return html`<div class="rounded border border-amber-300 bg-amber-50 p-2.5 space-y-1.5 dark:border-amber-700/40 dark:bg-amber-500/10">
    <div class="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
      <${AlertTriangle} size=${13} class="shrink-0" />
      <span class="font-mono text-sky-700 dark:text-sky-400">${conflict.eventTag}</span> ${conflict.field} = "${conflict.value}"
      ${choice ? html`<${Pill} tone="green"><${Check} size=${10} /> Resolved</${Pill}>` : null}
    </div>
    <div class="text-[11px] text-amber-700 dark:text-amber-400">
      ${conflict.sides.map((s, i) => html`<div key=${i}><b>${s.onmatch}</b> in: ${s.networks.join(', ')}</div>`)}
    </div>
    <div class="flex flex-wrap gap-1.5">
      ${conflict.sides.map(
        (s) => html`<${Button} key=${s.onmatch} size="sm" variant=${choice === `keep-${s.onmatch}` ? 'default' : 'outline'} onClick=${() => onChoose(`keep-${s.onmatch}`)} title=${`Keep only the ${s.onmatch} rule from ${s.networks.join(', ')} and drop the conflicting side`}>
          Keep ${s.networks[0]} (${s.onmatch})
        </${Button}>`
      )}
      <${Button} size="sm" variant=${choice === 'keep-both' ? 'default' : 'outline'} onClick=${() => onChoose('keep-both')} title="Keep both conflicting rules as separate, unmodified rules">Keep Both (Separate Rules)</${Button}>
      <${Button} size="sm" variant=${choice === 'merge-or' ? 'default' : 'outline'} onClick=${() => onChoose('merge-or')} title="Tag both sides with a shared RuleGroup name and groupRelation set to or"><${Combine} size=${12} /> Merge into RuleGroup (OR)</${Button}>
    </div>
  </div>`
}

function GroupRelationConflictRow({ conflict, choice, onChoose }) {
  return html`<div class="rounded border border-amber-300 bg-amber-50 p-2.5 space-y-1.5 dark:border-amber-700/40 dark:bg-amber-500/10">
    <div class="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
      <${AlertTriangle} size=${13} class="shrink-0" /> GroupRelation mismatch for <span class="font-mono text-sky-700 dark:text-sky-400">${conflict.groupKey}</span>
      ${choice ? html`<${Pill} tone="green"><${Check} size=${10} /> Resolved</${Pill}>` : null}
    </div>
    <div class="text-[11px] text-amber-700 dark:text-amber-400">
      ${conflict.sides.map((s, i) => html`<div key=${i}>groupRelation="<b>${s.groupRelation}</b>" in: ${s.networks.join(', ')}</div>`)}
    </div>
    <div class="flex flex-wrap gap-1.5">
      ${conflict.sides.map(
        (s) => html`<${Button} key=${s.groupRelation} size="sm" variant=${choice === s.groupRelation ? 'default' : 'outline'} onClick=${() => onChoose(s.groupRelation)} title=${`Use groupRelation="${s.groupRelation}" for this RuleGroup in the output`}>
          Use "${s.groupRelation}"
        </${Button}>`
      )}
    </div>
  </div>`
}

function GlobalConflictRow({ title, conflict, value, onChange }) {
  if (!conflict) return null
  return html`<div class="rounded border border-amber-300 bg-amber-50 p-2.5 space-y-1.5 dark:border-amber-700/40 dark:bg-amber-500/10">
    <div class="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300"><${AlertTriangle} size=${13} /> ${title}</div>
    <div class="text-[11px] text-amber-700 dark:text-amber-400">
      ${conflict.options.map((o, i) => html`<div key=${i}><span class="font-mono">${o.value}</span> in: ${o.networks.join(', ')}</div>`)}
    </div>
    <${Select}
      value=${value}
      onChange=${onChange}
      placeholder="Choose unified value for output"
      options=${conflict.options.map((o) => ({ value: o.value, label: o.value }))}
      className="w-full"
    />
  </div>`
}

function ConflictPanel({ conflicts, resolutionChoices, onChooseResolution, resolvedHash, setResolvedHash, resolvedSchema, setResolvedSchema }) {
  if (!conflicts) return null
  const totalConflicts = conflicts.onmatch.length + conflicts.grouprelation.length + (conflicts.hash ? 1 : 0) + (conflicts.schema ? 1 : 0)
  return html`<${Card}>
    <${CardHeader} className="flex items-center gap-2">
      <${ShieldAlert} size=${15} class="text-amber-600 dark:text-amber-400" />
      <span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Conflict Resolution</span>
      ${totalConflicts ? html`<${Pill} tone="amber">${totalConflicts} conflict${totalConflicts === 1 ? '' : 's'}</${Pill}>` : html`<${Pill} tone="green">No conflicts</${Pill}>`}
    </${CardHeader}>
    <${CardBody} className="space-y-2.5">
      ${conflicts.onmatch.map((c) => html`<${OnmatchConflictRow} key=${c.id} conflict=${c} choice=${resolutionChoices[c.id]} onChoose=${(action) => onChooseResolution(c.id, action)} />`)}
      ${conflicts.grouprelation.map((c) => html`<${GroupRelationConflictRow} key=${c.id} conflict=${c} choice=${resolutionChoices[c.id]} onChoose=${(rel) => onChooseResolution(c.id, rel)} />`)}
      <${GlobalConflictRow} title="HashAlgorithms mismatch" conflict=${conflicts.hash} value=${resolvedHash} onChange=${setResolvedHash} />
      <${GlobalConflictRow} title="Schema version mismatch" conflict=${conflicts.schema} value=${resolvedSchema} onChange=${setResolvedSchema} />
      ${!totalConflicts ? html`<div class="text-xs text-slate-500 italic dark:text-zinc-500">No onmatch, GroupRelation, hash, or schema conflicts detected across the selected sources.</div>` : null}
    </${CardBody}>
  </${Card}>`
}

// ---- Redundancy panel ----

function RedundancyPanel({ redundant, onRemove }) {
  if (!redundant) return null
  return html`<${Card}>
    <${CardHeader} className="flex items-center gap-2">
      <${FlaskConical} size=${15} class="text-sky-600 dark:text-sky-400" />
      <span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Redundancy / Overlap Check</span>
      ${redundant.length ? html`<${Pill} tone="amber">${redundant.length} possible overlap${redundant.length === 1 ? '' : 's'}</${Pill}>` : html`<${Pill} tone="green">None found</${Pill}>`}
    </${CardHeader}>
    ${
      redundant.length
        ? html`<${CardBody} className="space-y-2">
            ${redundant.map(
              (r, i) => html`<div key=${i} class="flex items-start justify-between gap-2 rounded border border-slate-200 p-2 text-[11px] dark:border-zinc-800">
                <div class="text-slate-600 dark:text-zinc-400">
                  <div class="font-mono text-slate-800 dark:text-zinc-200">${r.bucket}</div>
                  <div>${r.reason}</div>
                </div>
                <${Button} size="sm" variant="outline" onClick=${() => onRemove(r.narrow.ruleId, r.field, r.narrow.value)} title="Remove the narrower, likely-redundant condition line from the merged output">
                  <${Trash2} size=${11} /> Remove narrower line
                </${Button}>
              </div>`
            )}
          </${CardBody}>`
        : null
    }
  </${Card}>`
}

// ---- Live preview + output ----

function PreviewPanel({ xml, issues, outputName, setOutputName, style, setStyle, onSave, savedMsg, onDownload }) {
  const highlighted = useMemo(() => (xml ? highlightXml(xml) : ''), [xml])
  const errorCount = issues.filter((i) => i.severity === 'error').length

  return html`<${Card}>
    <${CardHeader} className="flex flex-wrap items-center gap-2 justify-between">
      <span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Merged output preview</span>
      ${
        xml
          ? errorCount
            ? html`<${Pill} tone="red"><${AlertTriangle} size=${11} /> ${errorCount} error${errorCount === 1 ? '' : 's'}</${Pill}>`
            : html`<${Pill} tone="green"><${CircleCheck} size=${11} /> valid</${Pill}>`
          : null
      }
    </${CardHeader}>
    <${CardBody} className="space-y-3">
      ${
        xml
          ? html`<pre class="h-[45vh] overflow-auto rounded-md border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 whitespace-pre-wrap break-words dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" dangerouslySetInnerHTML=${{ __html: highlighted }}></pre>`
          : html`<div class="flex h-[45vh] items-center justify-center text-sm text-slate-500 dark:text-zinc-500">Select sources, pick a mode, and click "Run Merge" to see a live preview here.</div>`
      }

      <div class="flex flex-wrap items-end gap-2">
        <div class="flex-1 min-w-[160px]">
          <label class="mb-1 block text-[11px] font-medium text-slate-700 dark:text-zinc-300">Output network name</label>
          <${TextInput} value=${outputName} onChange=${setOutputName} placeholder="ConfigMerged" className="w-full" />
        </div>
        <${Select} value=${style} onChange=${setStyle} options=${STYLE_OPTIONS} />
      </div>

      <div class="flex flex-wrap gap-2">
        <${Button} onClick=${onSave} disabled=${!xml} title="Import the merged result as a new network in this workspace"><${Save} size=${14} /> Save as new workspace network</${Button}>
        <${Button} variant="secondary" onClick=${onDownload} disabled=${!xml} title="Download the merged XML as a file"><${Download} size=${14} /> Download ${outputName || 'ConfigMerged'}.xml</${Button}>
      </div>
      ${savedMsg ? html`<div class="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><${CircleCheck} size=${13} /> ${savedMsg}</div>` : null}
    </${CardBody}>
  </${Card}>`
}

// ---- Top-level workspace ----

export function MergeWorkspace() {
  const networks = useStore((s) => s.networks)
  const importFile = useStore((s) => s.importFile)

  const [sourceIds, setSourceIds] = useState([])
  const [baseId, setBaseId] = useState('')
  const [mode, setMode] = useState('union')
  const [outputName, setOutputName] = useState('ConfigMerged')
  const [style, setStyle] = useState('standard')
  const [savedMsg, setSavedMsg] = useState(null)

  const [baseMergedRules, setBaseMergedRules] = useState(null)
  const [conflicts, setConflicts] = useState(null)
  const [resolutionChoices, setResolutionChoices] = useState({})
  const [removedRedundant, setRemovedRedundant] = useState(new Set())
  const [resolvedHash, setResolvedHash] = useState('')
  const [resolvedSchema, setResolvedSchema] = useState('')

  const sources = useMemo(() => networks.filter((n) => sourceIds.includes(n.id)), [networks, sourceIds])
  const base = sources.find((n) => n.id === baseId) || sources[0] || null
  const orderedSources = base ? [base, ...sources.filter((n) => n.id !== base.id)] : sources
  const overlays = base ? sources.filter((n) => n.id !== base.id) : []

  function clearResults() {
    setBaseMergedRules(null)
    setConflicts(null)
    setResolutionChoices({})
    setRemovedRedundant(new Set())
    setResolvedHash('')
    setResolvedSchema('')
    setSavedMsg(null)
  }

  function toggleSource(id) {
    setSourceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
    clearResults()
  }
  function handleSetBase(id) {
    setBaseId(id)
    clearResults()
  }
  function handleSetMode(id) {
    setMode(id)
    clearResults()
  }

  const requirement = modeRequirement(mode, sources.length)

  function runMerge() {
    if (requirement || !base) return
    setConflicts(detectAllConflicts(sources))
    setResolutionChoices({})
    setRemovedRedundant(new Set())
    setResolvedHash('')
    setResolvedSchema('')
    setSavedMsg(null)

    if (mode === 'union') setBaseMergedRules(unionMerge(sources))
    else if (mode === 'intersection') setBaseMergedRules(intersectionMerge(sources))
    else if (mode === 'differential') {
      const other = sources.find((n) => n.id !== base.id)
      setBaseMergedRules(differentialMerge(base, other))
    } else if (mode === 'hierarchy') {
      setBaseMergedRules(hierarchicalMerge(base, overlays).rules)
    }
  }

  const displayedRules = useMemo(() => {
    if (!baseMergedRules) return null
    let rules = baseMergedRules
    for (const c of conflicts?.onmatch || []) {
      const action = resolutionChoices[c.id]
      if (action) rules = resolveOnmatchConflict(rules, c, action)
    }
    for (const c of conflicts?.grouprelation || []) {
      const rel = resolutionChoices[c.id]
      if (rel) rules = resolveGroupRelationConflict(rules, c, rel)
    }
    for (const key of removedRedundant) {
      const [ruleId, field, value] = key.split(REDUNDANT_KEY_SEP)
      rules = removeConditionLine(rules, ruleId, field, value)
    }
    return rules
  }, [baseMergedRules, conflicts, resolutionChoices, removedRedundant])

  const redundant = useMemo(() => (displayedRules ? findRedundantConditions(displayedRules) : null), [displayedRules])

  const assembledNetwork = useMemo(() => {
    if (!displayedRules) return null
    return assembleMergedNetwork(mode, orderedSources, displayedRules, { resolvedHash, resolvedSchema, name: outputName })
  }, [displayedRules, mode, orderedSources, resolvedHash, resolvedSchema, outputName])

  const previewXml = useMemo(() => (assembledNetwork ? serializeSysmonConfig(assembledNetwork, style) : ''), [assembledNetwork, style])
  const previewIssues = useMemo(() => (assembledNetwork ? validateNetwork(assembledNetwork) : []), [assembledNetwork])

  function handleChooseResolution(conflictId, choice) {
    setResolutionChoices((prev) => ({ ...prev, [conflictId]: choice }))
  }
  function handleRemoveRedundant(ruleId, field, value) {
    setRemovedRedundant((prev) => new Set(prev).add([ruleId, field, value].join(REDUNDANT_KEY_SEP)))
  }
  function handleSave() {
    if (!previewXml) return
    importFile(`${outputName || 'ConfigMerged'}.xml`, previewXml)
    setSavedMsg(`Saved as a new network "${outputName || 'ConfigMerged'}" in the workspace - see the sidebar.`)
  }
  function handleDownload() {
    if (!previewXml) return
    downloadText(`${outputName || 'ConfigMerged'}.xml`, previewXml)
  }

  return html`<div class="space-y-4">
    <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-500">
      <${GitMerge} size=${14} /> 100% deterministic, code-driven merging (set operations + AST-style rule regrouping) - no AI/LLM is used anywhere on this page.
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
      <div class="space-y-4 min-w-0">
        <${SourceSelectionPanel} networks=${networks} sourceIds=${sourceIds} onToggleSource=${toggleSource} baseId=${base?.id || ''} onSetBase=${handleSetBase} mode=${mode} />
        ${
          mode === 'differential' && sources.length === 2
            ? html`<${Button} variant="outline" size="sm" className="w-full" onClick=${() => handleSetBase(overlays[0]?.id)} title="Swap which selected network is Source A vs Source B">
                <${ArrowRightLeft} size=${12} /> Swap A ↔ B
              </${Button}>`
            : null
        }
      </div>

      <div class="space-y-4 min-w-0">
        <${ModeSelector} mode=${mode} onChange=${handleSetMode} />

        <div class="flex items-center gap-2">
          <${Button} onClick=${runMerge} disabled=${!!requirement} title="Compute the merged output and detect conflicts for the current mode and sources">
            <${GitMerge} size=${14} /> Run Merge
          </${Button}>
          ${requirement ? html`<span class="text-xs text-amber-600 dark:text-amber-400">${requirement}</span> ` : html`<span class="text-xs text-slate-500 dark:text-zinc-500">${sources.length} source(s) selected${base ? ` · base: ${base.name}` : ''}</span>`}
        </div>

        ${baseMergedRules ? html`<${ConflictPanel}
          conflicts=${conflicts}
          resolutionChoices=${resolutionChoices}
          onChooseResolution=${handleChooseResolution}
          resolvedHash=${resolvedHash}
          setResolvedHash=${setResolvedHash}
          resolvedSchema=${resolvedSchema}
          setResolvedSchema=${setResolvedSchema}
        />` : null}

        ${baseMergedRules ? html`<${RedundancyPanel} redundant=${redundant} onRemove=${handleRemoveRedundant} />` : null}

        <${PreviewPanel}
          xml=${previewXml}
          issues=${previewIssues}
          outputName=${outputName}
          setOutputName=${setOutputName}
          style=${style}
          setStyle=${setStyle}
          onSave=${handleSave}
          savedMsg=${savedMsg}
          onDownload=${handleDownload}
        />
      </div>
    </div>
  </div>`
}
