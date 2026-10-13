// Tiny shared browser-download helper (Raw Editor/Export + Merge & Policy Builder both export a
// single XML file this same way).
export function downloadText(filename, text, mime = 'application/xml') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
