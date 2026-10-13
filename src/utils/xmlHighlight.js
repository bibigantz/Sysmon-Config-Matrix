// Lightweight, best-effort XML syntax highlighter for the Raw Editor. Not a full XML parser -
// a lean regex tokenizer is consistent with the rest of this app's "good enough for Sysmon
// configs, not a general-purpose XML toolkit" philosophy (see mitreMap.js, riskAnalyzer.js).
// Produces an HTML string with Tailwind classes carrying their own `dark:` variants, so the
// same highlighted markup looks right in both themes with no re-render needed on theme switch.

const TAG_CLASS = 'text-sky-700 dark:text-sky-400'
const ATTR_CLASS = 'text-violet-700 dark:text-violet-400'
const VALUE_CLASS = 'text-amber-700 dark:text-amber-300'
// slate-400/zinc-500 measure well under WCAG AA against this editor's white/near-black
// backgrounds (~2.5:1) - too faint to read comfortably in either theme. slate-600/zinc-400 is
// the same "readable muted" pair used for secondary text elsewhere in the app (Dashboard,
// HelpPrimitives, MergeWorkspace), which does clear AA against both.
const COMMENT_CLASS = 'text-slate-600 italic dark:text-zinc-400'
const PUNCT_CLASS = 'text-slate-600 dark:text-zinc-400'

function escapeHtml(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function highlightTag(tagSrc) {
  const m = tagSrc.match(/^<(\/?)([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?)>$/)
  if (!m) return `<span class="${PUNCT_CLASS}">${escapeHtml(tagSrc)}</span>`
  const [, closingSlash, name, attrsRaw, selfClose] = m

  let out = `<span class="${PUNCT_CLASS}">&lt;${closingSlash}</span><span class="${TAG_CLASS}">${escapeHtml(name)}</span>`

  const attrRe = /([A-Za-z_][\w:.-]*)(\s*=\s*)("[^"]*")/g
  let lastIndex = 0
  let am
  while ((am = attrRe.exec(attrsRaw))) {
    out += escapeHtml(attrsRaw.slice(lastIndex, am.index))
    out += `<span class="${ATTR_CLASS}">${escapeHtml(am[1])}</span>`
    out += `<span class="${PUNCT_CLASS}">${escapeHtml(am[2])}</span>`
    out += `<span class="${VALUE_CLASS}">${escapeHtml(am[3])}</span>`
    lastIndex = attrRe.lastIndex
  }
  out += escapeHtml(attrsRaw.slice(lastIndex))
  out += `<span class="${PUNCT_CLASS}">${selfClose}&gt;</span>`
  return out
}

export function highlightXml(xmlText) {
  const BLOCK_RE = /(<!--[\s\S]*?-->)|(<\?[\s\S]*?\?>)|(<\/?[A-Za-z_][^>]*>)/g
  let out = ''
  let lastIndex = 0
  let m
  while ((m = BLOCK_RE.exec(xmlText))) {
    out += escapeHtml(xmlText.slice(lastIndex, m.index))
    const full = m[0]
    if (full.startsWith('<!--') || full.startsWith('<?')) {
      out += `<span class="${COMMENT_CLASS}">${escapeHtml(full)}</span>`
    } else {
      out += highlightTag(full)
    }
    lastIndex = BLOCK_RE.lastIndex
  }
  out += escapeHtml(xmlText.slice(lastIndex))
  // A trailing newline keeps the overlay <pre> the same height as the textarea even when the
  // text ends exactly at a line break (browsers render <pre> one line short otherwise).
  return `${out}\n`
}
