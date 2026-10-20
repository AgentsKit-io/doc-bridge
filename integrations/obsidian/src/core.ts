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

export type Source = 'vault' | 'custom'
export interface StaleNote { file: string; paths: string[]; repo?: string; recorded?: string; current?: string }
export interface CustomResult { ok: true; notes: number; findings: number; stale: StaleNote[] }

export const GRAPH_COLOR = 0xe3b341
export const GRAPH_MAX_FILES = 400
/** Never matches a real path; it identifies the colour group the plugin owns, because Obsidian drops unknown keys when it rewrites graph.json. */
export const GRAPH_MARKER = 'doc-bridge:stale-notes'

const optionalString = (value: unknown): string | undefined => typeof value === 'string' && value ? value : undefined

/** Parses the JSON a custom freshness command prints; throws the command's own `error` when it reports `ok: false`. */
export function parseCustomJson(value: string): CustomResult {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Command returned invalid JSON')
  const result = parsed as Record<string, unknown>
  if (typeof result.ok !== 'boolean') throw new Error('Command result is missing ok')
  if (!result.ok) throw new Error(optionalString(result.error) ?? 'Command reported ok: false')
  const stale: StaleNote[] = []
  for (const entry of Array.isArray(result.stale) ? result.stale : []) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    if (typeof item.file !== 'string' || !item.file) continue
    const note: StaleNote = { file: item.file, paths: Array.isArray(item.paths) ? item.paths.filter((p): p is string => typeof p === 'string') : [] }
    const repo = optionalString(item.repo), recorded = optionalString(item.recorded), current = optionalString(item.current)
    if (repo) note.repo = repo
    if (recorded) note.recorded = recorded
    if (current) note.current = current
    stale.push(note)
  }
  return { ok: true, notes: typeof result.notes === 'number' ? result.notes : 0, findings: typeof result.findings === 'number' ? result.findings : stale.length, stale }
}

/** Shapes stale notes like drift findings so the findings view renders both sources. */
export function staleToFindings(stale: StaleNote[]): Finding[] {
  return stale.map(note => {
    const items = [...note.paths]
    if (note.recorded && note.current) items.push(`${note.repo ? `${note.repo}: ` : ''}${note.recorded} → ${note.current}`)
    return { path: note.file, title: note.file.split('/').pop() ?? note.file, items }
  })
}

export function customStatusText(count: number | undefined): string {
  return count === undefined ? 'doc-bridge · not checked' : count ? `doc-bridge · ${count} stale` : 'doc-bridge · in sync'
}

const quoteTerm = (file: string): string => `"${file.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** Graph search query for the stale files, capped so the query stays usable; `truncated` tells the caller to say so. */
export function buildGraphQuery(files: string[], max = GRAPH_MAX_FILES): { query: string; used: number; truncated: boolean } {
  const used = files.slice(0, max)
  return { query: `path:(${[...used.map(quoteTerm), quoteTerm(GRAPH_MARKER)].join(' OR ')})`, used: used.length, truncated: files.length > max }
}

const isOwnGroup = (group: unknown): boolean =>
  !!group && typeof group === 'object' && typeof (group as { query?: unknown }).query === 'string' && (group as { query: string }).query.includes(quoteTerm(GRAPH_MARKER))

/**
 * Merges the plugin's colour group into graph.json text. Returns the new text, or undefined when there is nothing to write
 * (no file and no stale notes). Every other key and group is kept; the own group goes first. Throws on unparseable input so a
 * hand-edited file is never overwritten.
 */
export function mergeGraphJson(existing: string | undefined, files: string[], max = GRAPH_MAX_FILES): string | undefined {
  if (existing === undefined && !files.length) return undefined
  let graph: Record<string, unknown> = {}
  if (existing !== undefined) {
    const parsed: unknown = JSON.parse(existing)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('graph.json is not an object')
    graph = parsed as Record<string, unknown>
  }
  const others = (Array.isArray(graph.colorGroups) ? graph.colorGroups : []).filter(group => !isOwnGroup(group))
  const groups = files.length ? [{ query: buildGraphQuery(files, max).query, color: { a: 1, rgb: GRAPH_COLOR } }, ...others] : others
  return JSON.stringify({ ...graph, colorGroups: groups }, null, '\t') + '\n'
}

/** PATH for child processes: apps opened from the Dock do not inherit the shell PATH, so node is often missing. */
export function childPath(current: string | undefined, extra: string, separator = ':'): string {
  const parts = [...extra.split(separator), ...(current ?? '').split(separator)].map(part => part.trim()).filter(Boolean)
  return [...new Set(parts)].join(separator)
}
