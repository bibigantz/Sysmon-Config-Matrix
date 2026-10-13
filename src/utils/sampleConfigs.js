// Bundled demo networks, loaded from requirements/examples/ so the app has real,
// messy, real-world Sysmon configs to work with immediately on first run.
export const SAMPLE_NETWORKS_META = [
  { file: 'ConfigCorpHQ.xml', name: 'Corporate HQ', color: '#38bdf8' },
  { file: 'ConfigOTProduction.xml', name: 'OT Production', color: '#f59e0b' },
  { file: 'ConfigCloudVPC.xml', name: 'Cloud VPC', color: '#34d399' },
  { file: 'ConfigDMZBaseline.xml', name: 'DMZ Baseline (SwiftOnSecurity)', color: '#f87171' },
]

export async function fetchSampleXml(file) {
  const url = new URL(`../../requirements/examples/${file}`, import.meta.url)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load sample ${file}: HTTP ${res.status}`)
  return res.text()
}
