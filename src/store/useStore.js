import { create } from 'zustand'
import { parseSysmonConfig } from '../utils/xmlParser.js'
import { SAMPLE_NETWORKS_META, fetchSampleXml } from '../utils/sampleConfigs.js'
import { sanitizeNetwork as sanitizeNetworkModel, wrapLooseRules as wrapLooseRulesModel } from '../utils/sanitizer.js'
import { suggestMitreTechniques } from '../utils/mitreMap.js'

const STORAGE_KEY = 'sysmon-matrix::networks::v1'
const MAX_HISTORY = 30

function cloneNetworks(networks) {
  return JSON.parse(JSON.stringify(networks))
}

function saveToLocalStorage(networks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(networks))
  } catch (err) {
    console.warn('Could not persist networks to localStorage', err)
  }
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

let colorCursor = 0
const PALETTE = ['#38bdf8', '#f59e0b', '#34d399', '#f87171', '#a78bfa', '#fb923c', '#22d3ee', '#e879f9']
function nextColor() {
  const c = PALETTE[colorCursor % PALETTE.length]
  colorCursor += 1
  return c
}

export const useStore = create((set, get) => ({
  networks: [],
  loaded: false,
  activeTab: 'dashboard',
  diffSelection: { a: null, b: null },
  selectedForBulk: new Set(),
  history: { past: [], future: [] },

  // ---- bootstrap ----
  async init() {
    const stored = loadFromLocalStorage()
    if (stored && stored.length) {
      set({ networks: stored, loaded: true })
      return
    }
    await get().loadSampleNetworks()
    set({ loaded: true })
  },

  async loadSampleNetworks() {
    const loaded = []
    for (const meta of SAMPLE_NETWORKS_META) {
      try {
        const xml = await fetchSampleXml(meta.file)
        const parsed = parseSysmonConfig(xml, { fileName: meta.file })
        loaded.push({
          id: `net-${meta.file}`,
          name: meta.name,
          color: meta.color,
          fileName: meta.file,
          ...parsed,
        })
      } catch (err) {
        console.error('Failed to load sample', meta.file, err)
      }
    }
    set({ networks: loaded })
    saveToLocalStorage(loaded)
  },

  _pushHistory() {
    const { history, networks } = get()
    const past = [...history.past, cloneNetworks(networks)].slice(-MAX_HISTORY)
    set({ history: { past, future: [] } })
  },

  undo() {
    const { history, networks } = get()
    if (!history.past.length) return
    const previous = history.past[history.past.length - 1]
    const past = history.past.slice(0, -1)
    const future = [cloneNetworks(networks), ...history.future]
    set({ networks: previous, history: { past, future } })
    saveToLocalStorage(previous)
  },

  redo() {
    const { history, networks } = get()
    if (!history.future.length) return
    const next = history.future[0]
    const future = history.future.slice(1)
    const past = [...history.past, cloneNetworks(networks)]
    set({ networks: next, history: { past, future } })
    saveToLocalStorage(next)
  },

  // ---- networks ----
  importFile(fileName, xmlText) {
    get()._pushHistory()
    const parsed = parseSysmonConfig(xmlText, { fileName })
    const baseName = fileName.replace(/\.xml$/i, '')
    const net = {
      id: `net-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: baseName,
      color: nextColor(),
      fileName,
      ...parsed,
    }
    const networks = [...get().networks, net]
    set({ networks })
    saveToLocalStorage(networks)
    return net
  },

  removeNetwork(id) {
    get()._pushHistory()
    const networks = get().networks.filter((n) => n.id !== id)
    set({ networks })
    saveToLocalStorage(networks)
  },

  renameNetwork(id, name) {
    const networks = get().networks.map((n) => (n.id === id ? { ...n, name } : n))
    set({ networks })
    saveToLocalStorage(networks)
  },

  recolorNetwork(id, color) {
    const networks = get().networks.map((n) => (n.id === id ? { ...n, color } : n))
    set({ networks })
    saveToLocalStorage(networks)
  },

  updateNetworkRules(id, rules) {
    get()._pushHistory()
    const networks = get().networks.map((n) => (n.id === id ? { ...n, rules } : n))
    set({ networks })
    saveToLocalStorage(networks)
  },

  deleteRule(networkId, ruleId) {
    get()._pushHistory()
    const networks = get().networks.map((n) =>
      n.id === networkId ? { ...n, rules: n.rules.filter((r) => r.id !== ruleId) } : n
    )
    set({ networks })
    saveToLocalStorage(networks)
  },

  updateRuleMitre(networkId, ruleId, manualMitre) {
    const networks = get().networks.map((n) =>
      n.id !== networkId
        ? n
        : { ...n, rules: n.rules.map((r) => (r.id === ruleId ? { ...r, manualMitre } : r)) }
    )
    set({ networks })
    saveToLocalStorage(networks)
  },

  // Applies one rule object to every network whose id is in targetIds.
  applyRuleToNetworks(rule, targetIds) {
    get()._pushHistory()
    const networks = get().networks.map((n) => {
      if (!targetIds.includes(n.id)) return n
      const clonedRule = { ...rule, id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${n.id}` }
      return { ...n, rules: [...n.rules, clonedRule] }
    })
    set({ networks })
    saveToLocalStorage(networks)
  },

  replaceRawXml(networkId, xmlText) {
    get()._pushHistory()
    const existing = get().networks.find((n) => n.id === networkId)
    const parsed = parseSysmonConfig(xmlText, { fileName: existing?.fileName })
    const networks = get().networks.map((n) => (n.id === networkId ? { ...n, ...parsed } : n))
    set({ networks })
    saveToLocalStorage(networks)
  },

  // Removes a specific set of {networkId, ruleId} rules outright.
  deleteRulesAcrossNetworks(refs) {
    get()._pushHistory()
    const byNetwork = new Map()
    for (const r of refs) {
      if (!byNetwork.has(r.networkId)) byNetwork.set(r.networkId, new Set())
      byNetwork.get(r.networkId).add(r.ruleId)
    }
    const networks = get().networks.map((n) =>
      byNetwork.has(n.id) ? { ...n, rules: n.rules.filter((r) => !byNetwork.get(n.id).has(r.id)) } : n
    )
    set({ networks })
    saveToLocalStorage(networks)
  },

  // Marks a specific set of {networkId, ruleId} rules disabled/enabled (suppressed-but-kept).
  setRulesDisabled(refs, disabled) {
    get()._pushHistory()
    const byNetwork = new Map()
    for (const r of refs) {
      if (!byNetwork.has(r.networkId)) byNetwork.set(r.networkId, new Set())
      byNetwork.get(r.networkId).add(r.ruleId)
    }
    const networks = get().networks.map((n) =>
      byNetwork.has(n.id)
        ? { ...n, rules: n.rules.map((r) => (byNetwork.get(n.id).has(r.id) ? { ...r, disabled } : r)) }
        : n
    )
    set({ networks })
    saveToLocalStorage(networks)
  },

  // Edits an existing rule in place (onmatch, filters, and/or its comment) rather than
  // requiring delete-and-recreate. Re-derives the automatic MITRE suggestions from the new
  // filters; manually-added MITRE tags are left untouched.
  updateRule(networkId, ruleId, updates) {
    get()._pushHistory()
    const networks = get().networks.map((n) => {
      if (n.id !== networkId) return n
      return {
        ...n,
        rules: n.rules.map((r) => {
          if (r.id !== ruleId) return r
          const filters = updates.filters ?? r.filters
          return {
            ...r,
            onmatch: updates.onmatch ?? r.onmatch,
            filters,
            comment: updates.comment !== undefined ? updates.comment : r.comment,
            mitre: suggestMitreTechniques(r.eventTag, filters),
          }
        }),
      }
    })
    set({ networks })
    saveToLocalStorage(networks)
  },

  toggleRuleDisabled(networkId, ruleId) {
    get()._pushHistory()
    const networks = get().networks.map((n) =>
      n.id !== networkId ? n : { ...n, rules: n.rules.map((r) => (r.id === ruleId ? { ...r, disabled: !r.disabled } : r)) }
    )
    set({ networks })
    saveToLocalStorage(networks)
  },

  // Rewrites one network's tag/attribute casing to canonical Sysmon schema casing.
  // Returns the list of changes made (for display), or [] if nothing needed changing.
  sanitizeNetwork(id) {
    const existing = get().networks.find((n) => n.id === id)
    if (!existing) return []
    const { network, changes } = sanitizeNetworkModel(existing)
    if (!changes.length) return []
    get()._pushHistory()
    const networks = get().networks.map((n) => (n.id === id ? network : n))
    set({ networks })
    saveToLocalStorage(networks)
    return changes
  },

  sanitizeAllNetworks() {
    const results = get().networks.map((n) => sanitizeNetworkModel(n))
    const totalChanges = results.reduce((sum, r) => sum + r.changes.length, 0)
    if (!totalChanges) return []
    get()._pushHistory()
    const networks = results.map((r) => r.network)
    set({ networks })
    saveToLocalStorage(networks)
    return results.flatMap((r) => r.changes)
  },

  // "Wrap Loose Rules into RuleGroups" - accepts the parser's auto-wrapped orphaned rules as
  // permanent (names their RuleGroup, clears the orphaned flag). Returns the change list, or []
  // if the network had no loose rules to wrap.
  wrapLooseRules(id) {
    const existing = get().networks.find((n) => n.id === id)
    if (!existing) return []
    const { network, changes } = wrapLooseRulesModel(existing)
    if (!changes.length) return []
    get()._pushHistory()
    const networks = get().networks.map((n) => (n.id === id ? network : n))
    set({ networks })
    saveToLocalStorage(networks)
    return changes
  },

  wrapLooseRulesAllNetworks() {
    const results = get().networks.map((n) => wrapLooseRulesModel(n))
    const totalChanges = results.reduce((sum, r) => sum + r.changes.length, 0)
    if (!totalChanges) return []
    get()._pushHistory()
    const networks = results.map((r) => r.network)
    set({ networks })
    saveToLocalStorage(networks)
    return results.flatMap((r) => r.changes)
  },

  // ---- UI state ----
  setActiveTab(tab) {
    set({ activeTab: tab })
  },
  setDiffSelection(a, b) {
    set({ diffSelection: { a, b } })
  },
  toggleBulkSelection(id) {
    const sel = new Set(get().selectedForBulk)
    sel.has(id) ? sel.delete(id) : sel.add(id)
    set({ selectedForBulk: sel })
  },
  setBulkSelection(ids) {
    set({ selectedForBulk: new Set(ids) })
  },
}))
