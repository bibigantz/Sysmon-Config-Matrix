// Local AI / LLM connection + parameters, persisted to localStorage so the connection survives
// reloads on an air-gapped machine with no server-side session to fall back on. Talks only to the
// base URL the user types in here (src/utils/aiClient.js) - never to a cloud API.
import { create } from 'zustand'
import { detectAndFetchModels, chatCompletion } from '../utils/aiClient.js'

const STORAGE_KEY = 'sysmon-ai-config::v1'

export const SYSTEM_PROMPT_PRESETS = [
  {
    id: 'detection-engineer',
    label: 'Detection Engineer (default)',
    prompt:
      'You are a senior detection engineer and DFIR analyst helping tune Sysmon configurations. ' +
      'Be precise, cite concrete Sysmon event tags/fields/conditions, and prefer MITRE ATT&CK technique IDs ' +
      '(e.g. T1003.001) when relevant. When asked to produce a Sysmon rule, output ONLY a valid XML snippet ' +
      'inside a ```xml fenced code block using real Sysmon event tags (ProcessCreate, ProcessAccess, ' +
      'FileCreate, etc.) with onmatch="include" or onmatch="exclude", followed by at most one short paragraph ' +
      'of plain-English explanation after the code block.',
  },
  {
    id: 'concise-analyst',
    label: 'Concise Analyst (short answers)',
    prompt:
      'You are a Sysmon detection assistant. Answer as concisely as possible using bullet points. ' +
      'When producing a rule, output ONLY a ```xml fenced snippet with no extra commentary.',
  },
  {
    id: 'verbose-educator',
    label: 'Verbose Educator (teach while answering)',
    prompt:
      'You are a Sysmon and Windows internals instructor. Explain your reasoning step by step, define any ' +
      'jargon on first use, and call out attacker evasion techniques and MITRE ATT&CK mappings in detail. ' +
      'When producing a rule, still output it as a ```xml fenced snippet so it can be parsed by tooling.',
  },
]

const DEFAULTS = {
  baseUrl: 'http://localhost:11434',
  apiStyle: 'auto', // 'auto' | 'ollama' | 'openai'
  apiKey: '',
  model: '',
  availableModels: [],
  detectedStyle: null,
  temperature: 0.2,
  topP: 0.9,
  maxTokens: 1536,
  systemPromptPreset: 'detection-engineer',
  systemPrompt: SYSTEM_PROMPT_PRESETS[0].prompt,
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(state) {
  try {
    const {
      baseUrl, apiStyle, apiKey, model, availableModels, detectedStyle,
      temperature, topP, maxTokens, systemPromptPreset, systemPrompt,
    } = state
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ baseUrl, apiStyle, apiKey, model, availableModels, detectedStyle, temperature, topP, maxTokens, systemPromptPreset, systemPrompt })
    )
  } catch {
    // Non-fatal: settings just won't persist across reloads.
  }
}

export const useAiStore = create((set, get) => ({
  ...loadPersisted(),
  status: 'unknown', // 'unknown' | 'checking' | 'connected' | 'offline'
  statusError: null,

  setConfig(patch) {
    set(patch)
    persist(get())
  },

  applySystemPromptPreset(presetId) {
    const preset = SYSTEM_PROMPT_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    get().setConfig({ systemPromptPreset: presetId, systemPrompt: preset.prompt })
  },

  async testConnection() {
    const { baseUrl, apiKey, apiStyle } = get()
    set({ status: 'checking', statusError: null })
    try {
      const { style, models } = await detectAndFetchModels({ baseUrl, apiKey, apiStyle })
      const model = get().model && models.includes(get().model) ? get().model : models[0] || ''
      set({ status: 'connected', statusError: null, availableModels: models, detectedStyle: style, model })
      persist(get())
      return { ok: true, models, style }
    } catch (err) {
      const message = err?.message || String(err)
      set({ status: 'offline', statusError: message })
      return { ok: false, error: message }
    }
  },

  // Best-effort, silent re-check (e.g. on app load) - never throws, just updates the badge.
  async silentRecheck() {
    if (!get().baseUrl) return
    try {
      await get().testConnection()
    } catch {
      // testConnection already captures failures into state; nothing else to do here.
    }
  },

  async ask(userMessages) {
    const cfg = get()
    if (!cfg.baseUrl.trim()) throw new Error('Set a Base API URL in the AI Config tab first.')
    if (!cfg.model) throw new Error('Pick a model in the AI Config tab first (Test Connection to list what the server has).')
    const style = cfg.detectedStyle || (cfg.apiStyle !== 'auto' ? cfg.apiStyle : 'ollama')
    try {
      const content = await chatCompletion({ ...cfg, style }, userMessages)
      if (get().status !== 'connected') set({ status: 'connected', statusError: null })
      return content
    } catch (err) {
      const message = err?.message || String(err)
      set({ status: 'offline', statusError: message })
      throw new Error(message)
    }
  },
}))
