import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import type { MemoryCandidateV1 } from '../schemas/memory-candidate.js'
import { searchIndex } from '../query/search.js'

export type MemoryRoute = 'agent' | 'human' | 'playbook' | 'discard'

export type MemoryClassification = {
  readonly candidate: MemoryCandidateV1
  readonly route: MemoryRoute
  readonly reason: string
  readonly target?: string
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
const secretPattern = /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/i
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

export const classifyMemoryCandidates = (
  candidates: readonly MemoryCandidateV1[],
  index: DocBridgeIndexV1,
): MemoryClassification[] =>
  candidates.map((candidate) => {
    const duplicate = searchIndex(index, candidate.fact, 1)[0]
    const targetMatch = packageOwnership.exec(candidate.fact)
    const route = classifyRoute(candidate.fact)
    return {
      candidate,
      ...route,
      ...(targetMatch?.[1] ? { target: targetMatch[1] } : {}),
      ...(duplicate && duplicate.score >= 16 ? { duplicateOf: duplicate.path } : {}),
    }
  })

export const scanMemorySafety = (
  classifications: readonly MemoryClassification[],
): SafetyFinding[] =>
  classifications.flatMap(({ candidate }) => {
    const findings: SafetyFinding[] = []
    if (secretPattern.test(candidate.fact)) {
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
