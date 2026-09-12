import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { hasSearchToken, tokenizeSearchText } from './text.js'

export type SearchMatch = {
  readonly type: string
  readonly id: string
  readonly path: string
  readonly summary?: string
  readonly score: number
}

const PACKAGE_INTENT =
  /\b(package|module|pkg|edit|change|where|owns?|ownership|handoff|start)\b/i
const CHANGE_INTENT = /\b(change|edit|modify|update|fix|migrate|replace)\b/i

const scoreHay = (tokens: readonly string[], hay: string, weight = 1): number => {
  let score = 0
  for (const token of tokens) {
    if (!hasSearchToken(hay, token)) continue
    score += token.length * weight
    score += token.length
  }
  return score
}

/** Exact / near-exact identity boost so "core" ranks the core package over mentions of @agentskit/core. */
const identityBoost = (id: string, path: string, tokens: readonly string[], term: string): number => {
  const idLower = id.toLowerCase()
  const termLower = term.toLowerCase().trim()
  const base = path.split('/').pop()?.replace(/\.mdx?$/i, '').toLowerCase() ?? ''
  let boost = 0

  if (idLower === termLower || base === termLower) boost += 200
  if (tokens.length === 1 && (idLower === tokens[0] || base === tokens[0])) boost += 200

  for (const token of tokens) {
    if (idLower === token) boost += 120
    else if (idLower.startsWith(`${token}-`) || idLower.endsWith(`-${token}`)) boost += 40
    else if (idLower.includes(token) && idLower.length <= token.length + 4) boost += 30
    if (base === token) boost += 100
  }

  // Prefer short ids when term is the id (package name)
  if (tokens.includes(idLower)) boost += Math.max(0, 40 - idLower.length)

  return boost
}

const preferOwnership = (term: string): boolean =>
  PACKAGE_INTENT.test(term) || /^(where|how).*(edit|change|package|module)/i.test(term)

const routeTitleBoost = (title: string, tokens: readonly string[]): number =>
  tokens.length > 1 && tokens.every((token) => hasSearchToken(title.toLowerCase(), token)) ? 100 : 0

export const searchIndex = (index: DocBridgeIndexV1, term: string, limit = 20): SearchMatch[] => {
  const tokens = tokenizeSearchText(term)
  if (!tokens.length) return []

  const wantOwnership = preferOwnership(term)
  const byPath = new Map<string, SearchMatch>()

  const consider = (match: SearchMatch) => {
    const key = match.path
    const existing = byPath.get(key)
    if (!existing) {
      byPath.set(key, match)
      return
    }
    // Prefer ownership over knowledge for same path; else higher score
    const prefer =
      match.score > existing.score ||
      (match.score === existing.score && match.type === 'ownership' && existing.type !== 'ownership') ||
      (wantOwnership && match.type === 'ownership' && existing.type !== 'ownership' && match.score >= existing.score - 20)
    if (prefer) byPath.set(key, match)
  }

  for (const entry of index.knowledge) {
    const body = (entry as { body?: string }).body ?? ''
    const hay = `${entry.id} ${entry.title} ${entry.description ?? ''} ${entry.path} ${body}`.toLowerCase()
    let score = scoreHay(tokens, hay, 1)
    score += identityBoost(entry.id, entry.path, tokens, term)
    if (score > 0) {
      consider({
        type: 'knowledge',
        id: entry.id,
        path: entry.path,
        ...(entry.description ? { summary: entry.description } : {}),
        score,
      })
    }
  }

  for (const [id, owner] of Object.entries(index.lookup?.ownership ?? {})) {
    const path = owner.agentDoc ?? owner.path
    const hay = `${id} ${owner.path} ${owner.purpose ?? ''} ${owner.group ?? ''} ${owner.agentDoc ?? ''} ${owner.humanDoc ?? ''}`.toLowerCase()
    let score = scoreHay(tokens, hay, 2)
    score += identityBoost(id, path, tokens, term)
    if (score <= 0) continue
    // Ownership is primary for routing questions, but only after a real match.
    if (wantOwnership) score += 25
    if (score > 0) {
      consider({
        type: 'ownership',
        id,
        path,
        ...(owner.purpose ? { summary: owner.purpose } : {}),
        score,
      })
    }
  }

  for (const intent of Object.values(index.lookup?.intents ?? {})) {
    const hay = `${intent.id} ${intent.title} ${intent.paths.join(' ')}`.toLowerCase()
    const score = scoreHay(tokens, hay, 2) + routeTitleBoost(intent.title, tokens)
    if (score > 0) consider({ type: 'intent', id: intent.id, path: intent.paths[0] ?? '', summary: intent.title, score })
  }

  for (const change of Object.values(index.lookup?.changes ?? {})) {
    const hay = `${change.id} ${change.title} ${change.startHere} ${(change.relatedPackages ?? []).join(' ')}`.toLowerCase()
    const titleBoost = routeTitleBoost(change.title, tokens)
    const score = scoreHay(tokens, hay, 2) + titleBoost
    if (score > 0 && (titleBoost > 0 || CHANGE_INTENT.test(term))) consider({ type: 'change', id: change.id, path: change.startHere, summary: change.title, score })
  }

  return [...byPath.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // Tie-break: exact id match, then ownership, then shorter id
    const aExact = tokens.includes(a.id.toLowerCase()) ? 1 : 0
    const bExact = tokens.includes(b.id.toLowerCase()) ? 1 : 0
    if (bExact !== aExact) return bExact - aExact
    if (a.type === 'ownership' && b.type !== 'ownership') return -1
    if (b.type === 'ownership' && a.type !== 'ownership') return 1
    return a.id.localeCompare(b.id)
  }).slice(0, limit)
}
