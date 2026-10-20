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
  for (const key of ['notes', 'removed', 'findings']) if (typeof result[key] !== 'number') throw new Error(`Export result is missing ${key}`)
  if (typeof result.ok !== 'boolean') throw new Error('Export result is missing ok')
  return result as unknown as ExportResult
}

export function extractFindings(path: string, title: string, tags: string[], markdown: string): Finding | undefined {
  if (!tags.some(tag => tag.startsWith('drift/'))) return undefined
  const section = markdown.match(/^## Findings\s*\n([\s\S]*?)(?=^## |\s*$)/m)?.[1] ?? ''
  const items = section.split(/\r?\n/).map(line => line.trim()).filter(line => /^\d+\s*→\s*.+/.test(line))
  return { path, title, items }
}

export function statusText(count: number): string { return count ? `doc-bridge · ${count} drift` : 'doc-bridge · in sync' }
