export const firstHeading = (markdown: string): string | undefined => {
  for (const line of markdown.split('\n')) {
    const m = /^#\s+(.+)$/.exec(line.trim())
    if (m?.[1]) return m[1].trim()
  }
  return undefined
}

export const firstParagraph = (markdown: string): string | undefined => {
  const lines = markdown.split('\n')
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