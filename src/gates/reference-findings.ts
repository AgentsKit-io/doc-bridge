import { isAbsolute, resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { DOCUMENT_RELATIONS, diffSnapshots } from '../diff/change-set.js'
import { discoverRepository } from '../discovery/repository.js'
import { serviceConfig } from '../execution/config.js'
import { readBoundedText } from '../lib/bounded-text.js'
import type { REFERENCE_FINDINGS_REASONS } from '../schemas/doc-bridge-index.js'
import type { DiscoverySnapshotV1, KnowledgeDiagnostic } from '../schemas/knowledge.js'
import { parseDiscoverySnapshot } from '../validate.js'

/** The finding codes the advisory counts; `fail-on-findings` and this gate share them. */
export const REFERENCE_FINDING_CODES: ReadonlySet<string> = new Set(['BROKEN_REFERENCE', 'AMBIGUOUS_REFERENCE', 'CHANGED_REFERENCE'])

/**
 * Splits diff findings the way the advisory does: a reference finding is pending until the change
 * also updates the citing documentation. `pending.length` is the advisory's `pendingCount`.
 */
export const referenceFindingGroups = <T extends { readonly code: string; readonly documentationUpdate?: string | undefined }>(findings: readonly T[]) => {
  const all = findings.filter((finding) => REFERENCE_FINDING_CODES.has(finding.code))
  return { all, pending: all.filter((finding) => !finding.documentationUpdate), updated: all.filter((finding) => finding.documentationUpdate) }
}

export type PendingReferenceFinding = {
  readonly code: string
  readonly document: string
  readonly line?: number
  readonly target: string
  readonly diagnostic: KnowledgeDiagnostic
}

/**
 * Why the gate failed, as a stable code. This, not free text, is what the index records: free text
 * can carry local paths or file bytes.
 */
export type ReferenceFindingsReason = (typeof REFERENCE_FINDINGS_REASONS)[number]

export type ReferenceFindingsFailure = {
  readonly ok: false
  readonly reasonCode: ReferenceFindingsReason
  /** A fixed sentence with no local path and no file content. */
  readonly reason: string
  /** The underlying error, for stderr only; never persisted. */
  readonly detail?: string
  readonly baseRevision?: string
  readonly findings?: readonly PendingReferenceFinding[]
}

export type ReferenceFindingsCheck =
  | { readonly ok: true; readonly baseRevision: string; readonly findings: readonly PendingReferenceFinding[] }
  | ReferenceFindingsFailure

const MAX_BASE_BYTES = 32 * 1024 * 1024
const MAX_LISTED = 50

const fail = (reasonCode: ReferenceFindingsReason, reason: string, extra: Omit<ReferenceFindingsFailure, 'ok' | 'reasonCode' | 'reason'> = {}): ReferenceFindingsFailure => ({ ok: false, reasonCode, reason, ...extra })
const errorCode = (error: unknown) => (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined)

/** Coverage entries that say a resource limit cut the analysis short. */
const truncated = (snapshot: DiscoverySnapshotV1) => snapshot.coverage.filter((entry) => entry.scope.startsWith('limits:') && (entry.status === 'partial' || entry.status === 'not-analyzed'))

/** True when the snapshot was taken under the service profile (`ak-docs action snapshot`). */
export const isServiceSnapshot = (snapshot: DiscoverySnapshotV1): boolean => snapshot.coverage.some((entry) => entry.analyzer === 'service-profile')

/**
 * Reads and checks the configured base. A base that parses but could not have produced a finding —
 * no documents, no citations, or analysis cut short by a limit — fails closed: diffing against it
 * would pass whatever the head says.
 */
export const loadReferenceBase = (root: string, config: DocBridgeConfigV1): { readonly ok: true; readonly base: DiscoverySnapshotV1 } | ReferenceFindingsFailure => {
  const configured = config.gates?.referenceFindings?.base
  if (!configured) {
    return fail('no-base', 'No base is configured: set gates.referenceFindings.base to a base snapshot (ak-docs action snapshot), or remove reference-findings from gates.include.')
  }
  const path = isAbsolute(configured) ? configured : resolve(root, configured)
  let text: string
  try {
    text = readBoundedText(path, { used: 0 }, { maxFileBytes: MAX_BASE_BYTES, maxCorpusBytes: MAX_BASE_BYTES })
  } catch (error) {
    const code = errorCode(error)
    return fail('base-unreadable', `The base snapshot (gates.referenceFindings.base) could not be read${code ? ` (${code})` : ''}. Create it with ak-docs action snapshot before publishing.`, { detail: error instanceof Error ? error.message : String(error) })
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    // The parser's message can quote the file's bytes, so it is not repeated anywhere.
    return fail('base-invalid', 'The base snapshot (gates.referenceFindings.base) is not valid JSON.')
  }
  // `ak-docs discover --json` wraps the snapshot; `ak-docs action snapshot` writes it bare.
  const candidate = raw && typeof raw === 'object' && !('type' in raw) && 'snapshot' in raw ? (raw as { snapshot: unknown }).snapshot : raw
  let base: DiscoverySnapshotV1
  try {
    base = parseDiscoverySnapshot(candidate)
  } catch (error) {
    // Schema messages can echo values from the file; only the failing field paths reach stderr.
    const issues = error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues) ? (error.issues as { path?: unknown[] }[]).slice(0, 5).map((issue) => (issue.path ?? []).join('.') || '(root)') : []
    return fail('base-invalid', 'The base snapshot (gates.referenceFindings.base) is not a valid discovery snapshot.', issues.length ? { detail: `invalid fields: ${issues.join(', ')}` } : {})
  }
  const baseRevision = base.sourceRevision
  if (!base.entities.some((entity) => entity.kind === 'document')) {
    return fail('base-invalid', 'The base snapshot has no document entities, so no reference could be checked against it. Snapshot the base with the same corpus configuration as the head.', { baseRevision })
  }
  if (!base.relations.some((relation) => DOCUMENT_RELATIONS.has(relation.kind))) {
    return fail('base-invalid', 'The base snapshot has no citation relations from documents to code, so no reference could be checked against it.', { baseRevision })
  }
  const limited = truncated(base)
  if (limited.length) {
    return fail('base-invalid', `The base snapshot is incomplete: a resource limit stopped its analysis (${limited.map((entry) => entry.scope).slice(0, 5).join(', ')}). Raise the safety limits and snapshot the base again.`, { baseRevision })
  }
  return { ok: true, base }
}

/**
 * The configuration the head is discovered with. A base from `ak-docs action snapshot` was
 * discovered under the service profile's configuration selection, so the head uses the same
 * selection; otherwise the head uses the project configuration, like `ak-docs discover`.
 */
export const referenceHeadConfig = (base: DiscoverySnapshotV1, config: DocBridgeConfigV1): DocBridgeConfigV1 =>
  // A clone: the selection without the service capability binding, so local discovery may run it.
  isServiceSnapshot(base) ? structuredClone(serviceConfig(config).config) : config

/**
 * Whether the base and the head can be compared at all. Different projects, configurations,
 * analyzers or a head cut short by a limit would make the diff miss findings, so each fails closed.
 */
export const referenceComparabilityFailure = (base: DiscoverySnapshotV1, head: DiscoverySnapshotV1): ReferenceFindingsFailure | undefined => {
  const baseRevision = base.sourceRevision
  if (base.project.name !== head.project.name || (base.project.root ?? '.') !== (head.project.root ?? '.')) {
    return fail('diff-unavailable', 'The base and the head have different project identities. Name the project in the root package.json so a base from another checkout directory matches.', { baseRevision })
  }
  if (base.configurationHash !== head.configurationHash) {
    return fail('diff-unavailable', 'The base snapshot configurationHash does not match the head: the base was discovered with a different configuration. Snapshot the base again with the same doc-bridge configuration.', { baseRevision })
  }
  const analyzers = [...new Set([...Object.keys(base.analyzerVersions), ...Object.keys(head.analyzerVersions)])].filter((id) => base.analyzerVersions[id] !== head.analyzerVersions[id]).sort()
  if (analyzers.length) {
    return fail('diff-unavailable', `The base snapshot analyzerVersions do not match the head (${analyzers.slice(0, 5).map((id) => `${id}: base ${base.analyzerVersions[id] ?? 'absent'}, head ${head.analyzerVersions[id] ?? 'absent'}`).join('; ')}). Snapshot the base again with this doc-bridge version.`, { baseRevision })
  }
  const limited = truncated(head)
  if (limited.length) {
    return fail('diff-unavailable', `The head analysis is incomplete: a resource limit stopped it (${limited.map((entry) => entry.scope).slice(0, 5).join(', ')}). Raise the safety limits.`, { baseRevision })
  }
  return undefined
}

type DiffOutcome = Pick<ReturnType<typeof diffSnapshots>, 'findings' | 'policy'>

/** Counts the pending findings of a completed diff, the way the advisory counts `pendingCount`. */
export const pendingReferenceFindings = (base: DiscoverySnapshotV1, diff: DiffOutcome): ReferenceFindingsCheck => {
  const assertions = new Map(diff.policy.findings.map((finding) => [finding.id, finding.assertion]))
  const findings = referenceFindingGroups(diff.findings).pending.map((diagnostic): PendingReferenceFinding => {
    const citations = diagnostic.evidence.filter((item) => item.source === 'documentation')
    const citation = citations.find((item) => item.context === 'Head citation') ?? citations.find((item) => item.context === 'Base citation')
    const assertion = assertions.get(diagnostic.id)
    return {
      code: diagnostic.code,
      document: assertion?.document ?? citation?.path ?? '(unknown document)',
      ...(citation?.lineStart === undefined ? {} : { line: citation.lineStart }),
      target: assertion?.key ?? '(unknown target)',
      diagnostic,
    }
  })
  return findings.length
    ? fail('pending', `${findings.length} pending reference finding(s) since base ${base.sourceRevision}.`, { baseRevision: base.sourceRevision, findings })
    : { ok: true, baseRevision: base.sourceRevision, findings }
}

/**
 * The publication check behind the `reference-findings` gate: snapshot the working tree, run the
 * advisory diff against the configured base, and count what is still pending. It fails closed — no
 * base, an unusable base, or a diff that cannot run or cannot be trusted is a failure, never a pass.
 */
export const checkReferenceFindings = (root: string, config: DocBridgeConfigV1): ReferenceFindingsCheck => {
  const loaded = loadReferenceBase(root, config)
  if (!loaded.ok) return loaded
  const { base } = loaded
  try {
    const head = discoverRepository({ root, config: referenceHeadConfig(base, config) })
    const incomparable = referenceComparabilityFailure(base, head)
    if (incomparable) return incomparable
    return pendingReferenceFindings(base, diffSnapshots(base, head, { headRoot: root }))
  } catch (error) {
    return fail('diff-unavailable', 'Reference analysis is unavailable: the head could not be discovered or diffed against the base.', { baseRevision: base.sourceRevision, detail: error instanceof Error ? error.message : String(error) })
  }
}

/** One short line per finding — code, document, line and target — for terminal output. */
export const formatPendingReferenceFindings = (findings: readonly PendingReferenceFinding[]): string[] => [
  ...findings.slice(0, MAX_LISTED).map((finding) => `  ${finding.code} ${finding.document}${finding.line === undefined ? '' : `:${finding.line}`} → ${finding.target}`),
  ...(findings.length > MAX_LISTED ? [`  … and ${findings.length - MAX_LISTED} more (see the JSON output)`] : []),
]
