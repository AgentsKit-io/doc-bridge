import { createHash } from 'node:crypto'
import { parseMarkdownDocument } from '../discovery/markdown.js'
import type { KnowledgeEntitiesV1, MemoryEntityRelationV1 } from '../schemas/knowledge-entity.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import type { MemoryCandidateV1 } from '../schemas/memory-candidate.js'
import { searchIndex } from '../query/search.js'
import { containsSecret } from '../safety/repository.js'

export type MemoryRoute = 'agent' | 'human' | 'playbook' | 'discard'

export type MemoryClassification = {
  readonly candidate: MemoryCandidateV1
  readonly route: MemoryRoute
  readonly reason: string
  readonly target?: string
  readonly entityRelations?: readonly MemoryEntityRelationV1[]
  readonly duplicateOf?: string
}

export type SafetyFinding = {
  readonly candidateId: string
  readonly kind: 'secret' | 'private-email'
  readonly message: string
}

export type MemoryPromotionDraft = {
  readonly ok: boolean
  readonly title: string
  readonly body: string
  readonly findings: SafetyFinding[]
  readonly classifications: MemoryClassification[]
}

const packageOwnership = /\b(?:package|module)\s+([a-z0-9._/-]+)\s+(?:owns|owner|responsible|routes?)\b/i
const privateEmailPattern = /\b[A-Z0-9._%+-]+@(?!example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i

const classifyRoute = (fact: string): Pick<MemoryClassification, 'route' | 'reason'> => {
  if (/\b(noise|scratch|ignore|discard)\b/i.test(fact)) {
    return { route: 'discard', reason: 'marked as noise' }
  }
  if (/\b(playbook|pattern|principle|best practice)\b/i.test(fact)) {
    return { route: 'playbook', reason: 'generalizable pattern' }
  }
  if (/\b(user-facing|human guide|docs site|tutorial|guide)\b/i.test(fact)) {
    return { route: 'human', reason: 'user-facing documentation' }
  }
  return { route: 'agent', reason: 'project convention or ownership note' }
}

/** Explicit, exact references only; a shared alias/path never chooses an arbitrary entity. */
export const linkMemoryToEntities = (
  candidates: readonly MemoryCandidateV1[],
  section: KnowledgeEntitiesV1,
): MemoryEntityRelationV1[] => {
  const references = new Map<string, { target: string; kind: MemoryEntityRelationV1['evidence']['kind'] } | null>()
  for (const entity of section.entities) {
    const values = [
      { value: entity.id, kind: 'id' as const },
      ...entity.aliases.map(value => ({ value, kind: 'alias' as const })),
      ...entity.evidence.flatMap(evidence => evidence.kind === 'document-region' ? [{ value: evidence.path, kind: 'path' as const }] : []),
    ]
    for (const { value, kind } of values) {
      const prior = references.get(value)
      if (prior === undefined) references.set(value, { target: entity.id, kind })
      else if (prior && prior.target !== entity.id) references.set(value, null)
    }
  }
  const relations: MemoryEntityRelationV1[] = []
  for (const candidate of candidates) {
    if (classifyRoute(candidate.fact).route === 'discard' || scanMemorySafety([{ candidate, route: 'agent', reason: '' }]).length) continue
    const markdown = candidate.fact.includes('`') || candidate.fact.includes('](')
      ? parseMarkdownDocument(candidate.rawPath ?? 'memory.md', candidate.fact)
      : undefined
    const tokens = new Set([
      ...candidate.references,
      candidate.fact,
      ...candidate.fact.split(/[\s()[\]`"'<>;,!?]+/),
      ...(markdown?.codeTokens ?? []).map(token => token.value),
      ...(markdown?.links ?? []).map(token => token.value),
    ])
    const factHash = createHash('sha256').update(candidate.fact).digest('hex')
    for (const value of [...tokens].sort()) {
      const match = references.get(value)
      if (!match) continue
      relations.push({ kind: 'memory-supports', candidateId: candidate.id, target: match.target, evidence: { kind: match.kind, value, ...(candidate.rawPath ? { rawPath: candidate.rawPath } : {}), factHash } })
      if (relations.length > 10_000) throw new Error('Memory entity relations exceed the 10000 relation limit.')
    }
  }
  return [...new Map(relations.map(relation => [JSON.stringify(relation), relation])).values()]
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId) || a.target.localeCompare(b.target) || a.evidence.value.localeCompare(b.evidence.value))
}

export const classifyMemoryCandidates = (
  candidates: readonly MemoryCandidateV1[],
  index: DocBridgeIndexV1,
): MemoryClassification[] => {
  const byCandidate = new Map<string, MemoryEntityRelationV1[]>()
  for (const relation of index.knowledgeEntities ? linkMemoryToEntities(candidates, index.knowledgeEntities) : []) {
    const key = JSON.stringify([relation.candidateId, relation.evidence.rawPath, relation.evidence.factHash])
    byCandidate.set(key, [...(byCandidate.get(key) ?? []), relation])
  }
  return candidates.map((candidate) => {
    const duplicate = searchIndex(index, candidate.fact, 1)[0]
    const targetMatch = packageOwnership.exec(candidate.fact)
    const route = classifyRoute(candidate.fact)
    const entityRelations = byCandidate.get(JSON.stringify([candidate.id, candidate.rawPath, createHash('sha256').update(candidate.fact).digest('hex')])) ?? []
    return {
      candidate,
      ...route,
      ...(entityRelations.length ? { entityRelations } : {}),
      ...(targetMatch?.[1] ? { target: targetMatch[1] } : {}),
      ...(duplicate && duplicate.score >= 16 ? { duplicateOf: duplicate.path } : {}),
    }
  })
}

export const scanMemorySafety = (
  classifications: readonly MemoryClassification[],
): SafetyFinding[] =>
  classifications.flatMap(({ candidate }) => {
    const findings: SafetyFinding[] = []
    if (containsSecret(candidate.fact)) {
      findings.push({
        candidateId: candidate.id,
        kind: 'secret',
        message: 'Potential secret-like value in memory fact',
      })
    }
    if (privateEmailPattern.test(candidate.fact)) {
      findings.push({
        candidateId: candidate.id,
        kind: 'private-email',
        message: 'Potential private email in memory fact',
      })
    }
    return findings
  })

export const draftMemoryPromotion = (
  classifications: readonly MemoryClassification[],
): MemoryPromotionDraft => {
  const findings = scanMemorySafety(classifications)
  const safe = findings.length === 0
  const lines = classifications.map(({ candidate, route, reason, target, duplicateOf }) =>
    [
      `- ${candidate.id}: ${route}`,
      `reason=${reason}`,
      target ? `target=${target}` : undefined,
      duplicateOf ? `duplicateOf=${duplicateOf}` : undefined,
      `fact=${candidate.fact}`,
    ].filter(Boolean).join(' | '),
  )

  return {
    ok: safe,
    title: 'Draft doc-bridge memory promotion',
    body: [
      '# Draft doc-bridge memory promotion',
      '',
      safe ? 'Safety scan: pass.' : 'Safety scan: blocked. Redact findings before PR.',
      '',
      '## Candidates',
      '',
      ...lines,
      '',
      '## Policy',
      '',
      '- Draft only; never auto-merge.',
      '- Run doc-bridge gates before opening a PR.',
    ].join('\n'),
    findings,
    classifications: [...classifications],
  }
}
