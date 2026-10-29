// Reference data for mapping Sigma rule vocabulary onto the Sysmon schema (eventSchema.js).
// Scope is intentionally limited to logsources/fields/modifiers that a Sysmon config can actually
// express - Sigma rules targeting other log sources (Windows Security log, PowerShell logging,
// etc.) are correctly reported as unmappable by sigmaToSysmon.js rather than guessed at here.

// Sigma `logsource.category` -> Sysmon EVENT_TAGS key. Only categories with a direct Sysmon
// equivalent are listed; anything else falls back to the EventID-based lookup in
// sigmaToSysmon.js (for `product: windows, service: sysmon` rules with no category) or is
// reported as unmappable.
export const LOGSOURCE_TO_EVENTTAG = {
  process_creation: 'ProcessCreate',
  process_termination: 'ProcessTerminate',
  network_connection: 'NetworkConnect',
  dns_query: 'DnsQuery',
  dns: 'DnsQuery',
  image_load: 'ImageLoad',
  driver_load: 'DriverLoad',
  driver_loaded: 'DriverLoad',
  create_remote_thread: 'CreateRemoteThread',
  process_access: 'ProcessAccess',
  file_event: 'FileCreate',
  file_create: 'FileCreate',
  file_delete: 'FileDelete',
  create_stream_hash: 'FileCreateStreamHash',
  raw_access_thread: 'RawAccessRead',
  raw_access_read: 'RawAccessRead',
  registry_add: 'RegistryEvent',
  registry_set: 'RegistryEvent',
  registry_delete: 'RegistryEvent',
  registry_rename: 'RegistryEvent',
  registry_event: 'RegistryEvent',
  pipe_created: 'PipeEvent',
  wmi_event: 'WmiEvent',
  clipboard_capture: 'ClipboardChange',
}

// Sigma field names that don't map 1:1 onto a Sysmon field - they instead address a sub-part of
// Sysmon's combined `Hashes` field (e.g. "MD5=...,SHA256=...") and must always be matched with
// `contains` regardless of whatever modifier the Sigma rule used.
export const FIELD_ALIASES = {
  md5: 'Hashes',
  sha1: 'Hashes',
  sha256: 'Hashes',
  sha384: 'Hashes',
  imphash: 'Hashes',
  hash: 'Hashes',
}
export const FORCE_CONTAINS_FIELDS = new Set(Object.keys(FIELD_ALIASES))

// Sigma value-list/string modifiers -> Sysmon filter `condition`. Modifiers not listed here
// either have no Sysmon equivalent (see UNSUPPORTED_MODIFIERS) or are handled structurally
// (`all`, `re`, `base64*`) in sigmaToSysmon.js rather than through a 1:1 condition swap.
export const MODIFIER_CONDITION = {
  contains: 'contains',
  startswith: 'begin with',
  endswith: 'end with',
  gt: 'more than',
  gte: 'more than',
  lt: 'less than',
  lte: 'less than',
}

// Modifiers Sysmon's filter engine has no equivalent for at all - translation proceeds (falling
// back to a literal/wildcard match on the raw value) but a warning is always raised so the gap
// is visible in the audit report rather than silently producing an inaccurate rule.
export const UNSUPPORTED_MODIFIERS = new Set([
  'cased', 'windash', 'exists', 'fieldref', 'expand', 'cidr', 'utf16', 'utf16le', 'utf16be', 'wide',
])
