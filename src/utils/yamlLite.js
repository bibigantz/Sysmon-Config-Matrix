// Minimal, indentation-based YAML subset parser - good enough for Sigma detection rules, not a
// general-purpose YAML toolkit (same "lean, good enough" philosophy as xmlParser.js/mitreMap.js).
// Supports: nested mappings, block sequences (including "- key: value" continued mappings),
// inline flow lists ([a, b]) and maps ({a: 1}), single/double-quoted scalars, and block scalars
// (`|` literal / `>` folded). Does NOT support YAML anchors/aliases, multi-document streams, or
// tags (!!str etc) - none of those appear in real-world Sigma rules.

function stripQuotes(s) {
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1).replace(/\\(.)/g, '$1')
  }
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") {
    return s.slice(1, -1).replaceAll("''", "'")
  }
  return s
}

function parseScalar(raw) {
  const t = raw.trim()
  if (t === '' || t === '~' || t.toLowerCase() === 'null') return null
  if (t.toLowerCase() === 'true') return true
  if (t.toLowerCase() === 'false') return false
  return stripQuotes(t)
}

function splitTopLevelCommas(s) {
  const parts = []
  let depth = 0
  let quote = null
  let cur = ''
  for (const c of s) {
    if (quote) {
      cur += c
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      cur += c
      continue
    }
    if (c === '[' || c === '{') depth += 1
    if (c === ']' || c === '}') depth -= 1
    if (c === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  if (cur.trim() !== '') parts.push(cur)
  return parts
}

function parseInlineFlowList(v) {
  const inner = v.trim().replace(/^\[/, '').replace(/\]$/, '')
  if (!inner.trim()) return []
  return splitTopLevelCommas(inner).map((s) => parseInlineValue(s.trim()))
}

function parseInlineFlowMap(v) {
  const inner = v.trim().replace(/^\{/, '').replace(/\}$/, '')
  const map = {}
  if (!inner.trim()) return map
  for (const part of splitTopLevelCommas(inner)) {
    const idx = part.indexOf(':')
    if (idx === -1) continue
    map[stripQuotes(part.slice(0, idx).trim())] = parseInlineValue(part.slice(idx + 1).trim())
  }
  return map
}

function parseInlineValue(v) {
  if (v.startsWith('[')) return parseInlineFlowList(v)
  if (v.startsWith('{')) return parseInlineFlowMap(v)
  return parseScalar(v)
}

// Finds the ':' that separates a mapping key from its value on one logical line - the first
// colon outside of a quoted span that is either at end-of-line or followed by whitespace.
function findKeySeparator(content) {
  let quote = null
  for (let idx = 0; idx < content.length; idx += 1) {
    const c = content[idx]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (c === ':' && (idx === content.length - 1 || content[idx + 1] === ' ')) return idx
  }
  return -1
}

function tryParseMappingKeyLine(content) {
  const sepIdx = findKeySeparator(content)
  if (sepIdx === -1) return null
  const key = stripQuotes(content.slice(0, sepIdx).trim())
  if (!key) return null
  const valuePart = content.slice(sepIdx + 1).trim()
  return { key, valuePart }
}

function buildLines(text) {
  const rawLines = text.replace(/\t/g, '    ').replace(/\r\n/g, '\n').split('\n')
  return rawLines.map((raw) => {
    const indent = raw.match(/^ */)[0].length
    const content = raw.slice(indent).replace(/\s+$/, '')
    const blank = content.trim() === ''
    const commentOnly = !blank && content.startsWith('#')
    return { raw, indent, content, blank, commentOnly }
  })
}

export function parseYamlLite(text) {
  const lines = buildLines(text)
  let i = 0

  function nextSignificant() {
    while (i < lines.length && (lines[i].blank || lines[i].commentOnly)) i += 1
    return i < lines.length ? lines[i] : null
  }

  function consumeBlockScalar(indicator, parentIndent) {
    const style = indicator[0] // '|' (literal) or '>' (folded)
    const collected = []
    let baseIndent = null
    while (i < lines.length) {
      const l = lines[i]
      if (l.blank) {
        collected.push('')
        i += 1
        continue
      }
      if (l.indent <= parentIndent) break
      if (baseIndent === null) baseIndent = l.indent
      collected.push(l.raw.slice(Math.min(baseIndent, l.raw.length)))
      i += 1
    }
    while (collected.length && collected[collected.length - 1] === '') collected.pop()
    return style === '|' ? collected.join('\n') : collected.join(' ').trim()
  }

  function applyMappingEntry(map, key, valuePart, parentIndent) {
    if (valuePart === '') {
      const sub = parseBlock(parentIndent + 1)
      map[key] = sub === undefined ? null : sub
    } else if (/^[|>][+-]?\d*$/.test(valuePart)) {
      map[key] = consumeBlockScalar(valuePart, parentIndent)
    } else {
      map[key] = parseInlineValue(valuePart)
    }
  }

  function parseSequence(blockIndent) {
    const items = []
    while (true) {
      const line = nextSignificant()
      if (!line || line.indent !== blockIndent) break
      if (!(line.content === '-' || line.content.startsWith('- '))) break
      i += 1
      const rest = line.content === '-' ? '' : line.content.slice(2)
      if (rest === '') {
        const sub = parseBlock(blockIndent + 1)
        items.push(sub === undefined ? null : sub)
        continue
      }
      const kv = tryParseMappingKeyLine(rest)
      if (kv) {
        const virtualIndent = blockIndent + (line.content.length - rest.length)
        const map = {}
        applyMappingEntry(map, kv.key, kv.valuePart, virtualIndent)
        while (true) {
          const l2 = nextSignificant()
          if (!l2 || l2.indent !== virtualIndent) break
          const kv2 = tryParseMappingKeyLine(l2.content)
          if (!kv2) break
          i += 1
          applyMappingEntry(map, kv2.key, kv2.valuePart, virtualIndent)
        }
        items.push(map)
      } else {
        items.push(parseInlineValue(rest))
      }
    }
    return items
  }

  function parseMapping(blockIndent) {
    const map = {}
    while (true) {
      const line = nextSignificant()
      if (!line || line.indent !== blockIndent) break
      if (line.content === '-' || line.content.startsWith('- ')) break
      const kv = tryParseMappingKeyLine(line.content)
      if (!kv) {
        i += 1 // malformed/unsupported line - skip rather than abort the whole document
        continue
      }
      i += 1
      applyMappingEntry(map, kv.key, kv.valuePart, blockIndent)
    }
    return map
  }

  function parseBlock(minIndent) {
    const first = nextSignificant()
    if (!first || first.indent < minIndent) return undefined
    const blockIndent = first.indent
    if (first.content === '-' || first.content.startsWith('- ')) return parseSequence(blockIndent)
    return parseMapping(blockIndent)
  }

  try {
    const value = parseBlock(0)
    return { value: value === undefined ? {} : value, error: null }
  } catch (err) {
    return { value: null, error: err.message }
  }
}
