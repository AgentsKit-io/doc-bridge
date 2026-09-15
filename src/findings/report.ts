import type { Evidence, FindingStatus, KnowledgeDiagnostic } from '../schemas/knowledge.js'

/**
 * The canonical finding, as the rest of the ecosystem consumes it.
 *
 * `Finding` and `SEVERITY_ORDER` mirror `@agentskit/core/finding`, which is an optional peer:
 * Code Review, AKOS and dashboards read this shape, so a Doc Bridge diagnostic reported in it
 * needs no parser of its own. A test imports the real package and asserts that what is emitted
 * here is assignable to it and that the severities are drawn from the real order.
 *
 * This is a reporter, not a migration. `KnowledgeDiagnostic`, `RuleFinding` and
 * `DocumentationAuditFinding` keep their shapes; all three carry the fields the reporter reads.
 */

/** Ordered most to least severe, as the ecosystem orders them. */
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const

export type Severity = (typeof SEVERITY_ORDER)[number]

export type Finding = {
  id: string
  severity: Severity
  title: string
  detail: string
  category?: string
  location?: string
  confidence?: number
  remediation?: string
  ref?: string
  metadata?: Record<string, unknown>
}

/** What the three internal shapes have in common, which is all the reporter needs. */
export type ReportableDiagnostic = Pick<KnowledgeDiagnostic, 'id' | 'code' | 'status' | 'severity' | 'message' | 'evidence'> & {
  readonly entityIds?: readonly string[] | undefined
  readonly relationIds?: readonly string[] | undefined
  readonly remediation?: string | undefined
}

/**
 * Internal severities are a linter's (`error`, `warn`, `info`, `off`); the ecosystem's run from
 * `critical` to `info`. Nothing Doc Bridge reports is `critical`: a documentation finding never
 * takes a system down, and a reporter that says otherwise trains readers to ignore it.
 */
const SEVERITY: Readonly<Record<KnowledgeDiagnostic['severity'], Severity>> = {
  error: 'high',
  warn: 'medium',
  info: 'low',
  off: 'info',
}

/**
 * How sure the finding is real, from its status. A confirmed or undocumented relation was observed
 * in code; a conflict names two declarations that disagree; something stale or unverified may have
 * been fixed since it was declared; a coverage gap is not a finding about the repository at all,
 * only about what the scan could see.
 */
const CONFIDENCE: Readonly<Record<FindingStatus, number>> = {
  confirmed: 1,
  undocumented: 0.9,
  conflict: 0.9,
  unresolved: 0.8,
  'stale-or-unverified': 0.6,
  'not-analyzed': 0.3,
}

const title = (code: string): string => {
  const words = code.replace(/^DOCBRIDGE_/, '').toLowerCase().split('_').filter(Boolean)
  const first = words[0] ?? code.toLowerCase()
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ')
}

const location = (evidence: readonly Evidence[]): string | undefined => {
  const first = evidence[0]
  if (!first) return undefined
  return first.lineStart === undefined ? first.path : `${first.path}:${first.lineStart}`
}

export const findingFromDiagnostic = (diagnostic: ReportableDiagnostic): Finding => ({
  id: diagnostic.id,
  severity: SEVERITY[diagnostic.severity],
  title: title(diagnostic.code),
  detail: diagnostic.message,
  category: diagnostic.status,
  ...(location(diagnostic.evidence) !== undefined ? { location: location(diagnostic.evidence) as string } : {}),
  confidence: CONFIDENCE[diagnostic.status],
  ...(diagnostic.remediation ? { remediation: diagnostic.remediation } : {}),
  ref: diagnostic.code,
  metadata: {
    code: diagnostic.code,
    status: diagnostic.status,
    severity: diagnostic.severity,
    evidence: diagnostic.evidence,
    ...(diagnostic.entityIds?.length ? { entityIds: diagnostic.entityIds } : {}),
    ...(diagnostic.relationIds?.length ? { relationIds: diagnostic.relationIds } : {}),
  },
})

const rank = (severity: Severity): number => SEVERITY_ORDER.indexOf(severity)

/** Every diagnostic as a finding, most severe first and by id within a severity, so output is stable. */
export const findingsFromDiagnostics = (diagnostics: readonly ReportableDiagnostic[]): Finding[] =>
  diagnostics.map(findingFromDiagnostic).sort((a, b) => rank(a.severity) - rank(b.severity) || a.id.localeCompare(b.id))
