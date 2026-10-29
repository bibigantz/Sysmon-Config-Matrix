// "AI Detection Assistant" tab - the interactive surface for everything the local LLM is used
// for: gap analysis across the loaded Matrix, natural-language rule generation (with the same
// preview/conflict-check/inject flow as the Global Rule Injector), and rule explanation / MITRE
// mapping / false-positive-risk analysis for any existing rule or pasted snippet. Every call goes
// through useAiStore.ask(), which only ever talks to the locally-configured endpoint.
import { html, useState } from '../lib/react.js'
import { useStore } from '../store/useStore.js'
import { useAiStore } from '../store/useAiStore.js'
import { Card, CardHeader, CardBody, Button, Select, Checkbox, Pill, PageIntro } from './ui.js'
import {
  BrainCircuit, Wand2, FileSearch, FlaskConical, Send, Loader2, AlertTriangle, CircleCheck,
  Copy, Check, Code2, WifiOff, Bot,
} from './icons.js'
import { buildMatrix } from '../utils/diffEngine.js'
import { buildRiskIndex } from '../utils/riskAnalyzer.js'
import { validateNetwork } from '../utils/validator.js'
import { extractXmlSnippet } from '../utils/aiClient.js'
import { parseRawSnippet, detectConflicts } from '../utils/ruleOps.js'
import { serializeRuleSnippet } from '../utils/xmlSerializer.js'

const SUB_TABS = [
  { id: 'gap', label: 'Gap Analysis', icon: BrainCircuit },
  { id: 'generate', label: 'Rule Generator', icon: Wand2 },
  { id: 'inspect', label: 'Explain & FP Analysis', icon: FileSearch },
]

function SubTabs({ active, onChange }) {
  return html`<div class="flex gap-1 rounded-md border border-slate-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900/60">
    ${SUB_TABS.map(
      (t) => html`<button
        key=${t.id}
        onClick=${() => onChange(t.id)}
        title=${t.label}
        class=${`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
          active === t.id ? 'bg-sky-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
        }`}
      >
        <${t.icon} size=${14} /> ${t.label}
      </button>`
    )}
  </div>`
}

function AiOutput({ text }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable - silently no-op.
    }
  }
  return html`<div class="relative rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
    <button
      onClick=${copy}
      title="Copy this response to the clipboard"
      class="absolute right-2 top-2 flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      ${copied ? html`<${Check} size=${11} class="text-emerald-600 dark:text-emerald-400" />` : html`<${Copy} size=${11} />`} ${copied ? 'Copied' : 'Copy'}
    </button>
    <pre class="whitespace-pre-wrap pr-16 text-xs leading-relaxed text-slate-800 dark:text-zinc-200">${text}</pre>
  </div>`
}

function ErrorLine({ message }) {
  if (!message) return null
  return html`<div class="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"><${AlertTriangle} size=${13} /> ${message}</div>`
}

// ---- A. Intelligent Sysmon Config Gap Analysis ----

function buildGapAnalysisBrief(networks) {
  const matrix = buildMatrix(networks)
  const riskIndex = buildRiskIndex(networks)

  const coverageLines = matrix.map(({ eventId, tag, cells }) => {
    const perNetwork = cells.map((c, i) => `${networks[i].name}=${c.ruleCount}`).join(', ')
    return `Event ${eventId} (${tag || 'unknown tag'}): ${perNetwork}`
  })

  const noticeLines = networks.map((n) => {
    const issues = validateNetwork(n)
    const sample = issues.slice(0, 5).map((i) => i.message).join('; ')
    return `${n.name}: ${issues.length} validation notice(s)${sample ? ' - ' + sample : ''}`
  })

  const mismatchLines = riskIndex.mismatches
    .slice(0, 25)
    .map((m) => `${m.eventTag}/${m.onmatch} ${m.field}="${m.value}": ${m.entries.map((e) => `${e.networkName}=${e.condition}`).join(', ')}`)

  const broadLines = riskIndex.broad
    .slice(0, 25)
    .map((b) => `${b.networkName}: ${b.eventTag} ${b.onmatch} ${b.field} ${b.condition} "${b.value}" - ${b.reason}`)

  const orphanedLines = riskIndex.orphaned
    .slice(0, 25)
    .map((o) => `${o.networkName}: ${o.eventTag} (${o.filterCount} filter(s)) - loose/auto-wrapped, not yet confirmed`)

  return [
    `Networks loaded (${networks.length}): ${networks.map((n) => n.name).join(', ')}`,
    '',
    'Per-Event-ID rule counts per network (0 means that network has no rules at all for that Event ID):',
    ...coverageLines,
    '',
    'Validation notices per network:',
    ...noticeLines,
    '',
    mismatchLines.length ? `Cross-network operator mismatches (same target value, different condition operator):\n${mismatchLines.join('\n')}` : 'No cross-network operator mismatches detected.',
    '',
    broadLines.length ? `Overly broad rules (short non-path contains/begin-with/end-with matches):\n${broadLines.join('\n')}` : 'No overly broad rules detected.',
    '',
    orphanedLines.length ? `Loose/orphaned rules awaiting confirmation:\n${orphanedLines.join('\n')}` : 'No loose/orphaned rules.',
  ].join('\n')
}

function GapAnalysisPanel() {
  const networks = useStore((s) => s.networks)
  const ask = useAiStore((s) => s.ask)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function run() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const brief = buildGapAnalysisBrief(networks)
      const userPrompt = [
        'Here is a structured summary of our multi-network Sysmon Config Matrix: per-Event-ID rule coverage counts,',
        'validation notices, and risk-analyzer findings (not raw XML). Produce an executive summary for a SOC lead covering:',
        '1) Coverage gaps - which networks are missing Event IDs/detections that other networks already have.',
        '2) Dangerous bypass risks - operator mismatches, overly broad rules, and unconfirmed loose rules, and which network(s) they affect.',
        '3) A short, prioritized list of concrete next actions.',
        'Use short headings and bullet points.',
        '',
        brief,
      ].join('\n')
      const content = await ask([{ role: 'user', content: userPrompt }])
      setResult(content)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return html`<${Card}>
    <${CardHeader} className="flex items-center justify-between gap-2">
      <span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Intelligent Sysmon Config Gap Analysis</span>
      <${Button} size="sm" onClick=${run} disabled=${loading || !networks.length} title="Ask the local AI to summarize coverage gaps and risks across all loaded networks">
        ${loading ? html`<${Loader2} size=${13} class="animate-spin" />` : html`<${BrainCircuit} size=${13} />`}
        ${loading ? 'Analyzing...' : 'Run Gap Analysis'}
      </${Button}>
    </${CardHeader}>
    <${CardBody} className="space-y-3">
      <p class="text-xs text-slate-500 dark:text-zinc-500">
        Sends a structured summary of the Matrix View (rule coverage counts, validation notices, and risk-analyzer
        findings - never raw XML) to your local AI for an executive-style gap analysis across ${networks.length} loaded network(s).
      </p>
      <${ErrorLine} message=${error} />
      ${!networks.length ? html`<div class="text-xs text-slate-500 italic dark:text-zinc-500">Load at least one network first.</div>` : null}
      ${result ? html`<${AiOutput} text=${result} />` : null}
    </${CardBody}>
  </${Card}>`
}

// ---- B. Natural Language Rule Generator ----

function RuleGeneratorPanel() {
  const networks = useStore((s) => s.networks)
  const selectedForBulk = useStore((s) => s.selectedForBulk)
  const toggleBulkSelection = useStore((s) => s.toggleBulkSelection)
  const applyRuleToNetworks = useStore((s) => s.applyRuleToNetworks)
  const ask = useAiStore((s) => s.ask)

  const [prompt, setPrompt] = useState('Generate a Sysmon rule to detect Mimikatz LSASS process memory dumping or DCSync usage')
  const [loading, setLoading] = useState(false)
  const [rawResponse, setRawResponse] = useState(null)
  const [preview, setPreview] = useState(null) // [{ rule, conflicts }]
  const [parseError, setParseError] = useState(null)
  const [error, setError] = useState(null)
  const [applied, setApplied] = useState(false)

  const targets = networks.filter((n) => selectedForBulk.has(n.id))

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setRawResponse(null)
    setPreview(null)
    setParseError(null)
    setApplied(false)
    try {
      const userPrompt = [
        `Generate a Sysmon detection rule for this request: "${prompt}".`,
        'Use real Sysmon event tags (ProcessCreate, ProcessAccess, FileCreate, NetworkConnect, RegistryEvent, ...),',
        'real field names, and real condition operators (is, contains, begin with, end with, image, etc).',
        'Output ONLY the rule as one or more XML snippets like <ProcessCreate onmatch="include">...</ProcessCreate>,',
        'inside a single ```xml fenced code block, optionally followed by one short paragraph of plain-English notes.',
      ].join(' ')
      const content = await ask([{ role: 'user', content: userPrompt }])
      setRawResponse(content)
      const xml = extractXmlSnippet(content)
      if (!xml) {
        setParseError('The model response did not contain a recognizable XML snippet - see the raw response below.')
        return
      }
      const { error: err, rules } = parseRawSnippet(xml)
      if (err) {
        setParseError(err)
        return
      }
      setPreview(rules.map((rule) => ({ rule, conflicts: detectConflicts(rule, targets) })))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleApply() {
    if (!preview) return
    for (const { rule } of preview) applyRuleToNetworks(rule, targets.map((t) => t.id))
    setApplied(true)
  }

  return html`<div class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
    <div class="space-y-4">
      <${Card}>
        <${CardHeader}><span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Natural Language Rule Generator</span></${CardHeader}>
        <${CardBody} className="space-y-3">
          <textarea
            class="w-full h-20 rounded-md border border-slate-300 bg-white text-slate-900 text-sm p-2.5 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            value=${prompt}
            onChange=${(e) => setPrompt(e.target.value)}
            placeholder="e.g. Generate a Sysmon rule to detect Mimikatz LSASS process memory dumping or DCSync usage"
          ></textarea>
          <${Button} onClick=${handleGenerate} disabled=${loading || !prompt.trim()} title="Ask the local AI to turn this request into a Sysmon XML rule">
            ${loading ? html`<${Loader2} size=${14} class="animate-spin" />` : html`<${Send} size=${14} />`}
            ${loading ? 'Generating...' : 'Generate Rule'}
          </${Button}>
          <${ErrorLine} message=${error} />
        </${CardBody}>
      </${Card}>

      ${
        parseError
          ? html`<${Card}>
              <${CardBody} className="space-y-2">
                <div class="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"><${AlertTriangle} size=${13} /> ${parseError}</div>
                ${rawResponse ? html`<${AiOutput} text=${rawResponse} />` : null}
              </${CardBody}>
            </${Card}>`
          : null
      }

      ${
        preview
          ? html`<${Card}>
              <${CardHeader}><span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Preview · conflict check against ${targets.length} selected network${targets.length === 1 ? '' : 's'}</span></${CardHeader}>
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
                <${Button} variant=${applied ? 'secondary' : 'default'} onClick=${handleApply} disabled=${applied || targets.length === 0} title=${applied ? 'Already applied to the selected target networks' : 'Apply this generated rule to every checked target network'}>
                  ${applied ? 'Injected ✓' : `Inject into ${targets.length} network${targets.length === 1 ? '' : 's'}`}
                </${Button}>
              </${CardBody}>
            </${Card}>`
          : null
      }

      ${
        rawResponse && !parseError
          ? html`<details class="text-xs text-slate-500 dark:text-zinc-500">
              <summary class="cursor-pointer hover:text-slate-800 dark:hover:text-zinc-300">Raw model response</summary>
              <div class="mt-2"><${AiOutput} text=${rawResponse} /></div>
            </details>`
          : null
      }
    </div>

    <${Card} className="h-fit">
      <${CardHeader}><span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Target networks</span></${CardHeader}>
      <${CardBody} className="flex flex-col gap-1.5">
        ${networks.map((n) => html`<${Checkbox} key=${n.id} checked=${selectedForBulk.has(n.id)} onChange=${() => toggleBulkSelection(n.id)} label=${n.name} />`)}
        ${networks.length === 0 ? html`<div class="text-xs text-slate-500 italic dark:text-zinc-500">No networks loaded.</div>` : null}
      </${CardBody}>
    </${Card}>
  </div>`
}

// ---- C & D. Rule Explanation / Attack Mapping + False-Positive / Evasion Analysis ----

function ruleLabel(rule) {
  const summary = rule.filters.map((f) => `${f.field} ${f.condition} "${f.value}"`).join(' AND ')
  return `${rule.eventTag} (${rule.onmatch})${summary ? ' - ' + summary : ''}`
}

function RuleInspectorPanel() {
  const networks = useStore((s) => s.networks)
  const ask = useAiStore((s) => s.ask)

  const [mode, setMode] = useState('pick') // 'pick' | 'raw'
  const [networkId, setNetworkId] = useState('')
  const [ruleId, setRuleId] = useState('')
  const [rawXml, setRawXml] = useState(
    '<ProcessAccess onmatch="include">\n  <TargetImage condition="is">C:\\Windows\\System32\\lsass.exe</TargetImage>\n</ProcessAccess>'
  )
  const [loading, setLoading] = useState(null) // 'explain' | 'fp' | null
  const [results, setResults] = useState([]) // [{ id, kind, xml, text, error }]

  const network = networks.find((n) => n.id === networkId)
  const rules = network?.rules || []
  const rule = rules.find((r) => r.id === ruleId)

  function currentXml() {
    if (mode === 'raw') return rawXml.trim() || null
    return rule ? serializeRuleSnippet(rule) : null
  }

  async function run(kind) {
    const xml = currentXml()
    if (!xml) return
    setLoading(kind)
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const task =
      kind === 'explain'
        ? [
            'Explain this Sysmon rule in plain English for a SOC analyst:',
            '1) Exactly what activity it catches and why.',
            '2) Known attacker evasion techniques specifically against this rule as written.',
            '3) The MITRE ATT&CK Tactics, Techniques, and Sub-techniques it maps to (give real IDs like T1003.001).',
            'Use short headings.',
          ].join(' ')
        : [
            'Evaluate this Sysmon rule for false-positive risk in a typical enterprise environment',
            '(e.g. broad "contains" path checks, missing parent-process constraints, short wildcard matches).',
            'List concrete false-positive scenarios this rule could trigger, then propose a hardened alternative',
            '(e.g. "begin with", exact image paths, parent-process constraints) as a revised rule in a single ```xml fenced block.',
          ].join(' ')
    try {
      const content = await ask([{ role: 'user', content: `${task}\n\nRule:\n\`\`\`xml\n${xml}\n\`\`\`` }])
      setResults((prev) => [{ id, kind, xml, text: content, error: null }, ...prev])
    } catch (err) {
      setResults((prev) => [{ id, kind, xml, text: null, error: err.message }, ...prev])
    } finally {
      setLoading(null)
    }
  }

  const hasTarget = !!currentXml()

  return html`<div class="space-y-4">
    <${Card}>
      <${CardHeader} className="flex items-center gap-2">
        <button class=${`flex items-center gap-1.5 text-sm px-2 py-1 rounded ${mode === 'pick' ? 'bg-sky-600 text-white' : 'text-slate-500 dark:text-zinc-400'}`} onClick=${() => setMode('pick')} title="Pick a rule already loaded in one of your networks">
          <${FileSearch} size=${14} /> Pick existing rule
        </button>
        <button class=${`flex items-center gap-1.5 text-sm px-2 py-1 rounded ${mode === 'raw' ? 'bg-sky-600 text-white' : 'text-slate-500 dark:text-zinc-400'}`} onClick=${() => setMode('raw')} title="Paste a raw Sysmon XML snippet to analyze instead">
          <${Code2} size=${14} /> Paste XML snippet
        </button>
      </${CardHeader}>
      <${CardBody} className="space-y-3">
        ${
          mode === 'pick'
            ? html`<div class="flex flex-col sm:flex-row gap-2">
                <${Select}
                  value=${networkId}
                  onChange=${(v) => { setNetworkId(v); setRuleId('') }}
                  placeholder="Choose network"
                  options=${networks.map((n) => ({ value: n.id, label: n.name }))}
                  className="flex-1"
                />
                <${Select}
                  value=${ruleId}
                  onChange=${setRuleId}
                  placeholder="Choose rule"
                  options=${rules.map((r) => ({ value: r.id, label: ruleLabel(r) }))}
                  className="flex-[2]"
                />
              </div>`
            : html`<textarea
                class="w-full h-28 rounded-md border border-slate-300 bg-white text-slate-900 font-mono text-xs p-3 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                value=${rawXml}
                onChange=${(e) => setRawXml(e.target.value)}
              ></textarea>`
        }
        <div class="flex flex-wrap gap-2">
          <${Button} onClick=${() => run('explain')} disabled=${loading !== null || !hasTarget} title="Ask the local AI to explain this rule in plain English and map it to MITRE ATT&CK">
            ${loading === 'explain' ? html`<${Loader2} size=${14} class="animate-spin" />` : html`<${FileSearch} size=${14} />`} Explain & Map to MITRE
          </${Button}>
          <${Button} variant="secondary" onClick=${() => run('fp')} disabled=${loading !== null || !hasTarget} title="Ask the local AI to evaluate false-positive risk and suggest a hardened alternative">
            ${loading === 'fp' ? html`<${Loader2} size=${14} class="animate-spin" />` : html`<${FlaskConical} size=${14} />`} Check False-Positive Risk
          </${Button}>
        </div>
      </${CardBody}>
    </${Card}>

    ${results.map(
      (r) => html`<${Card} key=${r.id}>
        <${CardHeader} className="flex items-center gap-2">
          ${r.kind === 'explain' ? html`<${FileSearch} size=${14} class="text-sky-600 dark:text-sky-400" />` : html`<${FlaskConical} size=${14} class="text-amber-600 dark:text-amber-400" />`}
          <span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">${r.kind === 'explain' ? 'Rule Explanation & MITRE Mapping' : 'False-Positive / Hardening Analysis'}</span>
        </${CardHeader}>
        <${CardBody} className="space-y-2">
          <pre class="whitespace-pre-wrap font-mono text-[11px] text-slate-500 dark:text-zinc-500">${r.xml}</pre>
          ${r.error ? html`<${ErrorLine} message=${r.error} /> ` : html`<${AiOutput} text=${r.text} />`}
        </${CardBody}>
      </${Card}>`
    )}
    ${!results.length ? html`<div class="text-xs text-slate-500 italic dark:text-zinc-500">No analysis run yet.</div>` : null}
  </div>`
}

// ---- Tab shell ----

export function AiAssistant() {
  const [subTab, setSubTab] = useState('gap')
  const aiStatus = useAiStore((s) => s.status)
  const setActiveTab = useStore((s) => s.setActiveTab)

  return html`<div class="space-y-4">
    <${PageIntro} icon=${Bot}>
      Ask your local LLM to analyze coverage gaps across every loaded network, generate a new rule from a plain-English
      request (previewed and conflict-checked exactly like the Global Rule Injector before anything is applied), or
      explain/false-positive-review an existing rule with MITRE ATT&CK mapping. Every request goes only to the local
      endpoint you configure - never to a cloud API.
    </${PageIntro}>
    ${
      aiStatus !== 'connected'
        ? html`<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-500/10 dark:text-amber-200">
            <span class="flex items-center gap-2"><${WifiOff} size=${16} class="shrink-0" /> Local AI is not connected. Start your local Open WebUI / Ollama service, then configure and test the connection.</span>
            <${Button} size="sm" variant="outline" onClick=${() => setActiveTab('ai-config')} title="Go to the Local AI Config tab to set up the connection">Open AI Config</${Button}>
          </div>`
        : null
    }

    <${SubTabs} active=${subTab} onChange=${setSubTab} />

    ${subTab === 'gap' ? html`<${GapAnalysisPanel} />` : null}
    ${subTab === 'generate' ? html`<${RuleGeneratorPanel} />` : null}
    ${subTab === 'inspect' ? html`<${RuleInspectorPanel} />` : null}
  </div>`
}
