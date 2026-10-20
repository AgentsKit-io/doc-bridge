export interface Finding { path: string; title: string; items: string[] }
export interface ExportResult { ok: boolean; output?: string; notes: number; removed: number; findings: number }

export function splitCommand(command: string): string[] {
  const args: string[] = []
  let token = '', quote = '', escaped = false, started = false
  for (const char of command.trim()) {
    if (escaped) { token += char; escaped = false; started = true; continue }
    if (char === '\\' && quote !== "'") { escaped = true; started = true; continue }
    if (quote) { if (char === quote) quote = ''; else token += char; started = true; continue }
    if (char === '"' || char === "'") { quote = char; started = true; continue }
    if (/\s/.test(char)) { if (started) { args.push(token); token = ''; started = false }; continue }
    token += char; started = true
  }
  if (escaped || quote) throw new Error('Unclosed quote or escape in command')
  if (started) args.push(token)
  if (!args.length) throw new Error('Command cannot be empty')
  return args
}

export function parseExportJson(value: string): ExportResult {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object') throw new Error('Export returned invalid JSON')
  const result = parsed as Record<string, unknown>
  if (result.findings === undefined) result.findings = 0
  for (const key of ['notes', 'removed', 'findings']) if (typeof result[key] !== 'number') throw new Error(`Export result is missing ${key}`)
  if (typeof result.ok !== 'boolean') throw new Error('Export result is missing ok')
  return result as unknown as ExportResult
}

export function extractFindings(path: string, title: string, tags: string[], markdown: string): Finding | undefined {
  if (!tags.some(tag => tag.startsWith('drift/'))) return undefined
  const lines = markdown.split(/\r?\n/)
  const heading = lines.findIndex(line => line.trim() === '## Findings')
  const section = heading === -1 ? [] : lines.slice(heading + 1)
  const next = section.findIndex(line => /^#{1,2} /.test(line))
  const items = (next === -1 ? section : section.slice(0, next))
    .map(line => line.trim().replace(/^[-*]\s+/, ''))
    .filter(line => /^(?:\d+|\?)\s*→\s*.+/.test(line))
  return { path, title, items }
}

export function statusText(count: number): string { return count ? `doc-bridge · ${count} drift` : 'doc-bridge · in sync' }

/** PATH for child processes: apps opened from the Dock do not inherit the shell PATH, so node is often missing. */
export function childPath(current: string | undefined, extra: string, separator = ':'): string {
  const parts = [...extra.split(separator), ...(current ?? '').split(separator)].map(part => part.trim()).filter(Boolean)
  return [...new Set(parts)].join(separator)
}
