// Reference data for the Sysmon configuration schema.
// Source: Microsoft Sysinternals Sysmon documentation (schema 4.00 - 4.90).

// Maps the XML tag used inside <EventFiltering> to its numeric Sysmon Event ID(s) and a human label.
export const EVENT_TAGS = {
  ProcessCreate: { ids: [1], label: 'Process Creation' },
  FileCreateTime: { ids: [2], label: 'File Creation Time Changed' },
  NetworkConnect: { ids: [3], label: 'Network Connection' },
  ProcessTerminate: { ids: [5], label: 'Process Terminated' },
  DriverLoad: { ids: [6], label: 'Driver Loaded' },
  ImageLoad: { ids: [7], label: 'Image Loaded' },
  CreateRemoteThread: { ids: [8], label: 'CreateRemoteThread' },
  RawAccessRead: { ids: [9], label: 'RawAccessRead' },
  ProcessAccess: { ids: [10], label: 'ProcessAccess' },
  FileCreate: { ids: [11], label: 'FileCreate' },
  RegistryEvent: { ids: [12, 13, 14], label: 'Registry Event (Create/Set/Rename)' },
  // Legacy (pre schema 3.3) registry tags, still seen in the wild.
  CreateKey: { ids: [12], label: 'Registry Create Key (legacy)' },
  SetValue: { ids: [13], label: 'Registry Set Value (legacy)' },
  DeleteKey: { ids: [12], label: 'Registry Delete Key (legacy)' },
  DeleteValue: { ids: [13], label: 'Registry Delete Value (legacy)' },
  RenameKey: { ids: [14], label: 'Registry Rename Key (legacy)' },
  FileCreateStreamHash: { ids: [15], label: 'FileCreateStreamHash' },
  PipeEvent: { ids: [17, 18], label: 'Pipe Created/Connected' },
  WmiEvent: { ids: [19, 20, 21], label: 'WMI Filter/Consumer/Binding' },
  DnsQuery: { ids: [22], label: 'DNS Query' },
  FileDelete: { ids: [23], label: 'File Delete (archived)' },
  ClipboardChange: { ids: [24], label: 'Clipboard Change' },
  ProcessTampering: { ids: [25], label: 'Process Tampering' },
  FileDeleteDetected: { ids: [26], label: 'File Delete Logged' },
  FileBlockExecutable: { ids: [27], label: 'File Block Executable' },
  FileBlockShredding: { ids: [28], label: 'File Block Shredding' },
  FileExecutableDetected: { ids: [29], label: 'File Executable Detected' },
}

// Non-rule, non-filterable config elements that sit directly under <Sysmon>.
export const GLOBAL_TAGS = [
  'HashAlgorithms',
  'DnsLookup',
  'ArchiveDirectory',
  'CheckRevocation',
  'CopyOnDeadlink',
  'ProcessAccessConfig',
  'PipeMonitoringConfig',
]

// Child "config" elements that configure a filter rather than being a condition value
// (e.g. <ProcessAccessConfig><SysmonAny>true</SysmonAny></ProcessAccessConfig>) are excluded from diffing.
export const ALL_EVENT_IDS = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]

export const EVENT_ID_LABELS = ALL_EVENT_IDS.reduce((acc, id) => {
  const entry = Object.values(EVENT_TAGS).find((t) => t.ids.includes(id))
  acc[id] = entry ? entry.label : `Event ID ${id}`
  return acc
}, {})

export const TAG_BY_EVENT_ID = ALL_EVENT_IDS.reduce((acc, id) => {
  acc[id] = Object.keys(EVENT_TAGS).find((tag) => EVENT_TAGS[tag].ids.includes(id) && !['CreateKey', 'DeleteKey', 'SetValue', 'DeleteValue', 'RenameKey'].includes(tag))
  return acc
}, {})

export const CONDITIONS = [
  'is', 'is not', 'is any', 'is excluded',
  'contains', 'contains any', 'contains all',
  'excludes', 'excludes any', 'excludes all',
  'begin with', 'not begin with',
  'end with', 'not end with',
  'less than', 'more than', 'image',
]

export const ONMATCH_VALUES = ['include', 'exclude']

export const COMMON_FIELDS_BY_TAG = {
  ProcessCreate: ['Image', 'OriginalFileName', 'CommandLine', 'ParentImage', 'ParentCommandLine', 'User', 'IntegrityLevel', 'Hashes', 'CurrentDirectory'],
  FileCreateTime: ['Image', 'TargetFilename'],
  NetworkConnect: ['Image', 'User', 'Protocol', 'DestinationIp', 'DestinationHostname', 'DestinationPort', 'SourceIp', 'SourcePort'],
  ProcessTerminate: ['Image'],
  DriverLoad: ['ImageLoaded', 'Signature', 'Hashes', 'Signed'],
  ImageLoad: ['Image', 'ImageLoaded', 'Signature', 'Hashes', 'Signed'],
  CreateRemoteThread: ['SourceImage', 'TargetImage', 'StartModule', 'StartFunction'],
  RawAccessRead: ['Image', 'Device'],
  ProcessAccess: ['SourceImage', 'TargetImage', 'GrantedAccess', 'CallTrace'],
  FileCreate: ['Image', 'TargetFilename'],
  RegistryEvent: ['TargetObject', 'Image', 'EventType', 'Details'],
  FileCreateStreamHash: ['TargetFilename', 'Image'],
  PipeEvent: ['PipeName', 'Image'],
  WmiEvent: ['Operation', 'Consumer', 'Filter', 'EventNamespace', 'Name'],
  DnsQuery: ['QueryName', 'QueryStatus', 'Image'],
  FileDelete: ['Image', 'TargetFilename', 'Hashes'],
  ClipboardChange: ['Image', 'Session', 'ClientInfo'],
  ProcessTampering: ['Image', 'Type'],
  FileDeleteDetected: ['Image', 'TargetFilename', 'Hashes'],
  FileBlockExecutable: ['Image', 'TargetFilename'],
  FileBlockShredding: ['Image', 'TargetFilename'],
  FileExecutableDetected: ['Image', 'TargetFilename'],
}

export const KNOWN_SCHEMA_VERSIONS = ['3.30', '3.40', '3.50', '4.00', '4.10', '4.20', '4.21', '4.22', '4.30', '4.40', '4.41', '4.50', '4.52', '4.60', '4.70', '4.81', '4.82', '4.90']
