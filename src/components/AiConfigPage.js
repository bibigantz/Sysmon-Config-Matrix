import { html, useState } from '../lib/react.js'
import { useAiStore, SYSTEM_PROMPT_PRESETS } from '../store/useAiStore.js'
import { Card, CardHeader, CardBody, Button, Select, TextInput } from './ui.js'
import { Callout, Kbd } from './HelpPrimitives.js'
import { PlugZap, WifiOff, Loader2, RefreshCw, Lock, Cpu, Eye, EyeOff } from './icons.js'

const API_STYLE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect (recommended)' },
  { value: 'ollama', label: 'Ollama Native (/api/tags, /api/chat)' },
  { value: 'openai', label: 'OpenAI-Compatible (Open WebUI, LM Studio, llama.cpp)' },
]

function Slider({ label, value, min, max, step, onChange, hint }) {
  return html`<div>
    <div class="mb-1 flex items-center justify-between">
      <span class="text-xs font-medium text-slate-700 dark:text-zinc-300">${label}</span>
      <span class="font-mono text-xs text-slate-500 dark:text-zinc-500">${value}</span>
    </div>
    <input
      type="range"
      min=${min}
      max=${max}
      step=${step}
      value=${value}
      onChange=${(e) => onChange(Number(e.target.value))}
      class="w-full accent-sky-600"
    />
    ${hint ? html`<div class="mt-0.5 text-[10px] text-slate-500 dark:text-zinc-500">${hint}</div>` : null}
  </div>`
}

export function AiConfigPage() {
  const cfg = useAiStore((s) => s)
  const setConfig = useAiStore((s) => s.setConfig)
  const testConnection = useAiStore((s) => s.testConnection)
  const applySystemPromptPreset = useAiStore((s) => s.applySystemPromptPreset)
  const [showKey, setShowKey] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const checking = cfg.status === 'checking'
  const connected = cfg.status === 'connected'

  async function handleTest() {
    setTestResult(null)
    const result = await testConnection()
    setTestResult(result)
  }

  return html`<div class="max-w-4xl space-y-4">
    <div class="flex items-center gap-2.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-500/10 dark:text-emerald-200">
      <${Lock} size=${16} class="shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span>🔒 <b>Local Air-Gapped Mode:</b> All prompts and analysis remain 100% on this local machine. This app never calls OpenAI, Anthropic, Google, or any other cloud API - every request below goes only to the base URL you configure, on your workstation or LAN.</span>
    </div>

    <${Card}>
      <${CardHeader}><span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Endpoint settings</span></${CardHeader}>
      <${CardBody} className="space-y-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">Base API URL</label>
          <${TextInput}
            value=${cfg.baseUrl}
            onChange=${(v) => setConfig({ baseUrl: v })}
            placeholder="http://localhost:11434 (Ollama) or http://localhost:8080/api (Open WebUI)"
            className="w-full font-mono"
          />
          <div class="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500 dark:text-zinc-500">
            <span>Examples:</span><${Kbd}>http://localhost:11434</${Kbd}><span>native Ollama ·</span>
            <${Kbd}>http://localhost:8080/api</${Kbd}><span>Open WebUI · any reachable LAN/air-gapped address, e.g.</span>
            <${Kbd}>http://10.0.4.12:11434</${Kbd}>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">API style</label>
          <${Select} value=${cfg.apiStyle} onChange=${(v) => setConfig({ apiStyle: v })} options=${API_STYLE_OPTIONS} className="w-full" />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">Local API key / bearer token (optional)</label>
          <div class="flex gap-2">
            <${TextInput}
              type=${showKey ? 'text' : 'password'}
              value=${cfg.apiKey}
              onChange=${(v) => setConfig({ apiKey: v })}
              placeholder="Only needed if your local Open WebUI instance requires auth"
              className="flex-1 font-mono"
            />
            <${Button} variant="outline" size="sm" onClick=${() => setShowKey(!showKey)} title=${showKey ? 'Hide the API key' : 'Show the API key'}>
              ${showKey ? html`<${EyeOff} size=${13} />` : html`<${Eye} size=${13} />`}
            </${Button}>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <${Button} onClick=${handleTest} disabled=${checking} title="Ping the configured endpoint and list the models it has available">
            ${checking ? html`<${Loader2} size=${14} class="animate-spin" />` : html`<${PlugZap} size=${14} />`}
            ${checking ? 'Testing...' : 'Test Connection & Fetch Models'}
          </${Button}>
          ${
            connected
              ? html`<span class="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><${PlugZap} size=${13} /> Connected (${cfg.detectedStyle === 'ollama' ? 'Ollama native' : 'OpenAI-compatible'}) · ${cfg.availableModels.length} model${cfg.availableModels.length === 1 ? '' : 's'} found</span>`
              : html`<span class="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-zinc-500"><${WifiOff} size=${13} /> ${cfg.statusError || 'Not connected yet'}</span>`
          }
        </div>

        ${
          !connected && cfg.statusError
            ? html`<${Callout} tone="warning" title="Local AI server unreachable">
                Could not reach the configured endpoint. Make sure your local Open WebUI or Ollama service is running on this
                workstation or LAN, then click "Test Connection" again. All other app features (diffing, injection, exporting)
                continue to work normally without the AI connection.
              </${Callout}>`
            : null
        }

        <${Callout} tone="info" title="CORS / proxy troubleshooting">
          <span>Browsers block cross-origin requests by default, so the page serving this app and the local AI server need to agree on CORS. For <b>Ollama</b>, set</span> <${Kbd}>OLLAMA_ORIGINS=*</${Kbd}> <span>(or your app's exact origin) as an environment variable before starting</span> <${Kbd}>ollama serve</${Kbd}>. <span>For <b>Open WebUI</b>, enable CORS / allowed origins in its admin settings, or run it reverse-proxied on the same origin as this app. If "Test Connection" fails with a network error but the server is definitely running, this is almost always the cause.</span>
        </${Callout}>
      </${CardBody}>
    </${Card}>

    <${Card}>
      <${CardHeader}><span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Model</span></${CardHeader}>
      <${CardBody} className="space-y-3">
        ${
          cfg.availableModels.length
            ? html`<${Select}
                value=${cfg.model}
                onChange=${(v) => setConfig({ model: v })}
                options=${cfg.availableModels.map((m) => ({ value: m, label: m }))}
                className="w-full"
              />`
            : html`<${TextInput}
                value=${cfg.model}
                onChange=${(v) => setConfig({ model: v })}
                placeholder="e.g. llama3.1, qwen2.5-coder, gemma2, mistral (type a model name already pulled on your server)"
                className="w-full font-mono"
              />`
        }
        <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-500">
          <span class="inline-flex items-center gap-1"><${Cpu} size=${12} /> ${cfg.availableModels.length ? `${cfg.availableModels.length} model(s) reported by the server` : 'No model list yet - test the connection to populate this dropdown.'}</span>
          <button class="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400" onClick=${handleTest} title="Re-test the connection and refresh the model list">
            <${RefreshCw} size=${11} /> Refresh models
          </button>
        </div>
      </${CardBody}>
    </${Card}>

    <${Card}>
      <${CardHeader}><span class="text-sm font-semibold text-slate-900 dark:text-zinc-100">Model parameters</span></${CardHeader}>
      <${CardBody} className="space-y-4">
        <${Slider} label="Temperature" value=${cfg.temperature} min=${0} max=${2} step=${0.05} onChange=${(v) => setConfig({ temperature: v })} hint="Lower = more deterministic/consistent rule output; higher = more creative phrasing." />
        <${Slider} label="Top P" value=${cfg.topP} min=${0} max=${1} step=${0.05} onChange=${(v) => setConfig({ topP: v })} />
        <div>
          <label class="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">Max tokens</label>
          <${TextInput} type="number" value=${cfg.maxTokens} onChange=${(v) => setConfig({ maxTokens: Number(v) || 0 })} className="w-32" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">System prompt preset</label>
          <${Select}
            value=${cfg.systemPromptPreset}
            onChange=${applySystemPromptPreset}
            options=${SYSTEM_PROMPT_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
            className="w-full mb-2"
          />
          <textarea
            class="w-full h-28 rounded-md border border-slate-300 bg-white text-slate-900 text-xs font-mono p-2.5 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            value=${cfg.systemPrompt}
            onChange=${(e) => setConfig({ systemPrompt: e.target.value })}
          ></textarea>
        </div>
      </${CardBody}>
    </${Card}>
  </div>`
}
