// Line-level diff (classic O(n*m) LCS dynamic program) used only on-demand inside the Sigma
// Auditor's approval modal to preview an injection against one network's serialized XML - not a
// general-purpose diff engine, and not meant to be called on every keystroke. Sysmon configs in
// this app top out at a couple thousand lines, which keeps the DP table small enough to be
// instant in practice.
export function diffLines(aText, bText) {
  const a = aText.split('\n')
  const b = bText.split('\n')
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const rows = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: 'equal', left: a[i], right: b[j] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'remove', left: a[i], right: null })
      i += 1
    } else {
      rows.push({ type: 'add', left: null, right: b[j] })
      j += 1
    }
  }
  while (i < n) {
    rows.push({ type: 'remove', left: a[i], right: null })
    i += 1
  }
  while (j < m) {
    rows.push({ type: 'add', left: null, right: b[j] })
    j += 1
  }
  return rows
}

export function diffSummary(rows) {
  return rows.reduce(
    (acc, r) => {
      if (r.type === 'add') acc.added += 1
      if (r.type === 'remove') acc.removed += 1
      return acc
    },
    { added: 0, removed: 0 }
  )
}
