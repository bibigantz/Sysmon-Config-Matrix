// Local AI / LLM transport layer. Every call in this file goes to a user-configured base URL
// only (e.g. http://localhost:11434 for native Ollama, http://localhost:8080/api for Open WebUI,
// or any other LAN/air-gapped endpoint) - there is no hardcoded cloud provider host anywhere in
// this module, by design, so this app can never phone out to OpenAI/Anthropic/Google even by
// accident. Supports two local server shapes:
//   - "ollama"  - Ollama's native API (/api/tags, /api/chat)
//   - "openai"  - the OpenAI-compatible surface most local servers (incl. Open WebUI, LM Studio,
//                 llama.cpp server) also expose (/v1/models + /v1/chat/completions, or the same
//                 paths without the /v1 prefix)

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

function authHeaders(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timed out waiting for ${url}`)
    throw new Error(`Could not reach ${url} (${err.message || 'network error'}) - is the local AI server running, and is this origin allowed by its CORS settings?`)
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // Non-JSON body - fall through, json stays null.
  }
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || json?.message || text || `HTTP ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return json
}

async function tryOllamaModels(base, apiKey) {
  const data = await fetchJson(`${base}/api/tags`, { headers: { ...authHeaders(apiKey) } })
  const models = (data?.models || []).map((m) => m.name).filter(Boolean)
  return { style: 'ollama', models }
}

async function tryOpenAiModels(base, apiKey) {
  let lastErr = null
  for (const path of ['/v1/models', '/models', '/api/models']) {
    try {
      const data = await fetchJson(`${base}${path}`, { headers: { ...authHeaders(apiKey) } })
      const list = data?.data || data?.models || []
      const models = list.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean)
      return { style: 'openai', models }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('No OpenAI-compatible models endpoint responded.')
}

// Detects whether the configured base URL speaks the Ollama-native or OpenAI-compatible shape
// (unless the caller pins one explicitly) and returns the model list either way.
export async function detectAndFetchModels({ baseUrl, apiKey, apiStyle = 'auto' }) {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) throw new Error('Enter a base API URL first.')
  if (apiStyle === 'ollama') return tryOllamaModels(base, apiKey)
  if (apiStyle === 'openai') return tryOpenAiModels(base, apiKey)
  try {
    return await tryOllamaModels(base, apiKey)
  } catch {
    return await tryOpenAiModels(base, apiKey)
  }
}

// Sends a chat request to the configured local server and returns the assistant's reply text.
export async function chatCompletion(config, userMessages) {
  const base = normalizeBaseUrl(config.baseUrl)
  const style = config.style || config.detectedStyle || 'ollama'
  const messages = [
    ...(config.systemPrompt ? [{ role: 'system', content: config.systemPrompt }] : []),
    ...userMessages,
  ]

  if (style === 'ollama') {
    const data = await fetchJson(
      `${base}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(config.apiKey) },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false,
          options: { temperature: config.temperature, top_p: config.topP, num_predict: config.maxTokens },
        }),
      },
      120000
    )
    return data?.message?.content || ''
  }

  let lastErr = null
  for (const path of ['/chat/completions', '/v1/chat/completions']) {
    try {
      const data = await fetchJson(
        `${base}${path}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(config.apiKey) },
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: config.temperature,
            top_p: config.topP,
            max_tokens: config.maxTokens,
            stream: false,
          }),
        },
        120000
      )
      return data?.choices?.[0]?.message?.content || ''
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('No OpenAI-compatible chat endpoint responded.')
}

// Pulls the first ```xml fenced block (or, failing that, the first bare <Tag>...</Tag> run) out
// of a model's free-text reply, so a natural-language rule-generation response can still be
// previewed/injected as XML even though the model was never forced into structured output.
export function extractXmlSnippet(text) {
  if (!text) return null
  const fenced = text.match(/```(?:xml)?\s*([\s\S]*?)```/i)
  if (fenced && fenced[1].trim()) return fenced[1].trim()
  const tagRun = text.match(/<[A-Za-z][\s\S]*>/)
  return tagRun ? tagRun[0].trim() : null
}
