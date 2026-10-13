// Heuristic MITRE ATT&CK tagging. This is intentionally a best-effort keyword matcher,
// not an authoritative mapping -- it exists to pre-populate suggestions that an analyst
// can accept, edit, or remove on each rule.

// Each heuristic: { tag: EVENT_TAGS key or '*', field: filter field name or '*', test: (value:string)=>bool, technique, name }
const HEURISTICS = [
  { tag: 'ProcessAccess', field: 'TargetImage', test: (v) => /lsass\.exe/i.test(v), technique: 'T1003.001', name: 'OS Credential Dumping: LSASS Memory' },
  { tag: '*', field: 'CommandLine', test: (v) => /mimikatz|sekurlsa|procdump.*lsass/i.test(v), technique: 'T1003.001', name: 'OS Credential Dumping: LSASS Memory' },
  { tag: '*', field: '*', test: (v) => /\\mimikatz/i.test(v), technique: 'T1003', name: 'OS Credential Dumping' },
  { tag: 'PipeEvent', field: 'PipeName', test: (v) => /msagent_|mojo\.|postex_|status_|mypipe-|MSSE-/i.test(v), technique: 'T1055', name: 'Process Injection (Cobalt Strike named pipe)' },
  { tag: 'WmiEvent', field: '*', test: () => true, technique: 'T1047', name: 'Windows Management Instrumentation' },
  { tag: 'DriverLoad', field: '*', test: () => true, technique: 'T1014', name: 'Rootkit / Unsigned Driver Load' },
  { tag: 'CreateRemoteThread', field: '*', test: () => true, technique: 'T1055', name: 'Process Injection' },
  { tag: 'ProcessTampering', field: '*', test: () => true, technique: 'T1055.012', name: 'Process Hollowing' },
  { tag: 'RegistryEvent', field: 'TargetObject', test: (v) => /\\CurrentVersion\\Run|RunOnce|Winlogon\\Shell/i.test(v), technique: 'T1547.001', name: 'Registry Run Keys / Startup Folder' },
  { tag: 'RegistryEvent', field: 'TargetObject', test: (v) => /Image File Execution Options/i.test(v), technique: 'T1546.012', name: 'Image File Execution Options Injection' },
  { tag: 'RegistryEvent', field: 'TargetObject', test: (v) => /AppCertDLLs|AppInit_DLLs/i.test(v), technique: 'T1546.009', name: 'AppCert/AppInit DLLs' },
  { tag: 'ProcessCreate', field: 'ParentImage', test: (v) => /winword\.exe|excel\.exe|powerpnt\.exe|outlook\.exe/i.test(v), technique: 'T1566.001', name: 'Phishing: Spearphishing Attachment (Office spawn)' },
  { tag: 'ProcessCreate', field: 'CommandLine', test: (v) => /-enc(odedcommand)?\s|frombase64string|-nop\s|-w(indowstyle)?\s+hidden/i.test(v), technique: 'T1059.001', name: 'PowerShell (encoded/hidden)' },
  { tag: 'ProcessCreate', field: 'CommandLine', test: (v) => /cmd(\.exe)?\s+\/c/i.test(v), technique: 'T1059.003', name: 'Windows Command Shell' },
  { tag: 'ProcessCreate', field: 'Image', test: (v) => /\\wmic\.exe|\\psexec/i.test(v), technique: 'T1021.002', name: 'Remote Services: SMB/PsExec' },
  { tag: 'ProcessCreate', field: 'CommandLine', test: (v) => /rundll32|regsvr32/i.test(v), technique: 'T1218', name: 'System Binary Proxy Execution' },
  { tag: 'NetworkConnect', field: 'DestinationPort', test: (v) => /^(4444|8080|8443|1337)$/.test(v.trim()), technique: 'T1071', name: 'Application Layer Protocol (common C2 ports)' },
  { tag: 'DnsQuery', field: 'QueryName', test: () => false, technique: 'T1071.004', name: 'DNS C2' }, // placeholder, rarely auto-fires
  { tag: 'FileCreate', field: 'TargetFilename', test: (v) => /\.(ps1|hta|vbs|js)$/i.test(v), technique: 'T1059', name: 'Command and Scripting Interpreter artifact' },
]

export function suggestMitreTechniques(eventTag, filters) {
  const matches = new Map()
  for (const f of filters) {
    for (const h of HEURISTICS) {
      if (h.tag !== '*' && h.tag !== eventTag) continue
      if (h.field !== '*' && h.field !== f.field) continue
      try {
        if (h.test(String(f.value ?? ''))) {
          matches.set(h.technique, h.name)
        }
      } catch {
        // ignore malformed regex targets
      }
    }
  }
  return Array.from(matches.entries()).map(([technique, name]) => ({ technique, name }))
}

export const MITRE_TECHNIQUE_INDEX = Array.from(
  new Map(HEURISTICS.map((h) => [h.technique, h.name])).entries()
).map(([technique, name]) => ({ technique, name })).sort((a, b) => a.technique.localeCompare(b.technique))
