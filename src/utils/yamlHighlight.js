// Lightweight, best-effort YAML syntax highlighter for the Sigma Workspace editor - a lean
// per-line regex tokenizer, deliberately matching the scope and style of this app's existing XML
// highlighter (see xmlHighlight.js): "good enough for Sigma rules", not a general YAML toolkit.

const KEY_CLASS = 'text-sky-700 dark:text-sky-400'
const STRING_CLASS = 'text-amber-700 dark:text-amber-300'
const COMMENT_CLASS = 'text-slate-600 italic dark:text-zinc-400'
const DASH_CLASS = 'text-violet-700 dark:text-violet-400'
const PUNCT_CLASS = 'text-slate-600 dark:text-zinc-400'

function escapeHtml(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

// Only treats '#' as a comment starter when it's preceded by nothing but whitespace (or is at
// column 0) and isn't inside an odd number of quotes on this line - a lean heuristic, not full
// quote-aware scanning.
function splitComment(line) {
  const idx = line.indexOf('#')
  if (idx === -1) return { code: line, comment: '' }
  const before = line.slice(0, idx)
  const quoteCount = (before.match(/['"]/g) || []).length
  if (quoteCount % 2 === 0 && (idx === 0 || /\s/.test(line[idx - 1]))) {
    return { code: line.slice(0, idx), comment: line.slice(idx) }
  }
  return { code: line, comment: '' }
}

function highlightValue(text) {
  if (!text) return ''
  const m = text.match(/^(\s*)(['"]).*\2(\s*)$/)
  if (m) {
    const inner = text.slice(m[1].length, text.length - m[3].length)
    return escapeHtml(m[1]) + `<span class="${STRING_CLASS}">${escapeHtml(inner)}</span>` + escapeHtml(m[3])
  }
  return escapeHtml(text)
}

function highlightLine(line) {
  const { code, comment } = splitComment(line)
  const m = code.match(/^(\s*)((?:- )*)(-)?(.*)$/)
  const indent = m[1]
  const dashes = m[2] + (m[3] || '')
  const rest = m[4]

  let out = escapeHtml(indent)
  if (dashes) out += `<span class="${DASH_CLASS}">${escapeHtml(dashes)}</span>`

  const kv = rest.match(/^([^:#]+?)(:)(\s.*|$)/)
  if (kv) {
    out += `<span class="${KEY_CLASS}">${escapeHtml(kv[1])}</span><span class="${PUNCT_CLASS}">${kv[2]}</span>${highlightValue(kv[3])}`
  } else {
    out += highlightValue(rest)
  }

  if (comment) out += `<span class="${COMMENT_CLASS}">${escapeHtml(comment)}</span>`
  return out
}

export function highlightYaml(text) {
  return `${text.split('\n').map(highlightLine).join('\n')}\n`
}
