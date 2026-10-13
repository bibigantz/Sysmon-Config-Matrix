import { html, useState, useRef } from '../lib/react.js'
import { useStore } from '../store/useStore.js'
import { Upload } from './icons.js'

export function FileImport() {
  const importFile = useStore((s) => s.importFile)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith('.xml'))
    for (const file of files) {
      const text = await file.text()
      importFile(file.name, text)
    }
  }

  return html`<div
    class=${`rounded-md border-2 border-dashed p-4 text-center text-xs transition-colors cursor-pointer ${
      dragOver
        ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
        : 'border-slate-300 text-slate-500 hover:border-slate-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600'
    }`}
    onClick=${() => inputRef.current?.click()}
    onDragOver=${(e) => {
      e.preventDefault()
      setDragOver(true)
    }}
    onDragLeave=${() => setDragOver(false)}
    onDrop=${(e) => {
      e.preventDefault()
      setDragOver(false)
      handleFiles(e.dataTransfer.files)
    }}
  >
    <${Upload} size=${18} class="mx-auto mb-1.5 opacity-70" />
    <div>Drop Sysmon .xml files or click to browse</div>
    <div class="text-[10px] opacity-60 mt-0.5">Batch upload supported</div>
    <input
      ref=${inputRef}
      type="file"
      accept=".xml"
      multiple
      class="hidden"
      onChange=${(e) => handleFiles(e.target.files)}
    />
  </div>`
}
