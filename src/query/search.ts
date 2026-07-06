import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'

export type SearchMatch = {
  readonly type: string
  readonly id: string
  readonly path: string
  readonly summary?: string
  readonly score: number
}

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)

export const searchIndex = (index: DocBridgeIndexV1, term: string, limit = 20): SearchMatch[] => {
  const tokens = tokenize(term)
  if (!tokens.length) return []

  const matches: SearchMatch[] = []

  for (const entry of index.knowledge) {
    const hay = `${entry.id} ${entry.title} ${entry.description ?? ''} ${entry.path}`.toLowerCase()
    let score = 0
    for (const token of tokens) {
      if (hay.includes(token)) score += token.length
    }
    if (score > 0) {
      matches.push({
        type: 'knowledge',
        id: entry.id,
        path: entry.path,
        ...(entry.description ? { summary: entry.description } : {}),
        score,
      })
    }
  }

  for (const [id, owner] of Object.entries(index.lookup?.ownership ?? {})) {
    const hay = `${id} ${owner.path} ${owner.purpose ?? ''} ${owner.group ?? ''}`.toLowerCase()
    let score = 0
    for (const token of tokens) {
      if (hay.includes(token)) score += token.length * 2
    }
    if (score > 0) {
      matches.push({
        type: 'ownership',
        id,
        path: owner.agentDoc ?? owner.path,
        ...(owner.purpose ? { summary: owner.purpose } : {}),
        score,
      })
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit)
}