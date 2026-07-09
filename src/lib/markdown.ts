export type FrontmatterValue = string | boolean | readonly string[]
export type FrontmatterData = Record<string, FrontmatterValue>

export const parseFrontmatter = (
  markdown: string,
): { readonly data: FrontmatterData; readonly body: string } => {
  const normalized = markdown.replace(/^\uFEFF/, '')
  if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) {
    return { data: {}, body: markdown }
  }
  const endMatch = /\r?\n---\r?\n/.exec(normalized.slice(3))
  if (!endMatch || endMatch.index === undefined) {
    return { data: {}, body: markdown }
  }
  const block = normalized.slice(4, 3 + endMatch.index)
  const body = normalized.slice(3 + endMatch.index + endMatch[0].length)
  const data: Record<string, FrontmatterValue> = {}
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!m?.[1]) continue
    const key = m[1]
    const raw = (m[2] ?? '').trim()
    if (raw === 'true') data[key] = true
    else if (raw === 'false') data[key] = false
    else if (raw.startsWith('[') && raw.endsWith(']')) {
      data[key] = raw
        .slice(1, -1)
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    } else {
      data[key] = raw.replace(/^['"]|['"]$/g, '')
    }
  }
  return { data, body }
}

export const frontmatterString = (
  data: FrontmatterData,
  key: string,
): string | undefined => {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export const frontmatterStringList = (
  data: FrontmatterData,
  key: string,
): string[] | undefined => {
  const value = data[key]
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value === 'string' && value.length > 0) return [value]
  return undefined
}

export const firstHeading = (markdown: string): string | undefined => {
  const { body } = parseFrontmatter(markdown)
  for (const line of body.split('\n')) {
    const m = /^#\s+(.+)$/.exec(line.trim())
    if (m?.[1]) return m[1].trim()
  }
  return undefined
}

export const firstParagraph = (markdown: string): string | undefined => {
  const { body } = parseFrontmatter(markdown)
  const lines = body.split('\n')
  const buf: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      if (buf.length) break
      continue
    }
    if (t.startsWith('#')) continue
    if (t.startsWith('---')) continue
    buf.push(t)
    if (buf.join(' ').length > 40) break
  }
  const text = buf.join(' ').trim()
  return text || undefined
}

export const slugFromPath = (relPath: string): string => {
  const base = relPath.replace(/\.mdx?$/, '')
  const parts = base.split('/')
  return parts[parts.length - 1] ?? base
}
