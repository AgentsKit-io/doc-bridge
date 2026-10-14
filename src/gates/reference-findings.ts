import { isAbsolute, resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { diffSnapshots } from '../diff/change-set.js'
import { discoverRepository } from '../discovery/repository.js'
import { readBoundedText } from '../lib/bounded-text.js'
import type { DiscoverySnapshotV1, KnowledgeDiagnostic } from '../schemas/knowledge.js'
import { parseDiscoverySnapshot } from '../validate.js'

/** The finding codes the advisory counts; `fail-on-findings` and this gate share them. */
export const REFERENCE_FINDING_CODES: ReadonlySet<string> = new Set(['BROKEN_REFERENCE', 'AMBIGUOUS_REFERENCE', 'CHANGED_REFERENCE'])

/**
 * Splits diff findings the way the advisory does: a reference finding is pending until the change
 * also updates the citing documentation. `pending.length` is the advisory's `pendingCount`.
 */
export const referenceFindingGroups = <T extends { readonly code: string; readonly documentationUpdate?: string }>(findings: readonly T[]) => {
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

export type ReferenceFindingsCheck =
  | { readonly ok: true; readonly baseRevision: string; readonly findings: readonly PendingReferenceFinding[] }
  | { readonly ok: false; readonly reason: string; readonly baseRevision?: string; readonly findings?: readonly PendingReferenceFinding[] }

const MAX_BASE_BYTES = 32 * 1024 * 1024
const MAX_LISTED = 50

const loadBase = (root: string, base: string) => {
  const path = isAbsolute(base) ? base : resolve(root, base)
  let raw: unknown
  try {
    raw = JSON.parse(readBoundedText(path, { used: 0 }, { maxFileBytes: MAX_BASE_BYTES, maxCorpusBytes: MAX_BASE_BYTES }))
  } catch (error) {
    throw new Error(`Base snapshot ${base} could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
  // `ak-docs discover --json` wraps the snapshot; `ak-docs action snapshot` writes it bare.
  const candidate = raw && typeof raw === 'object' && !('type' in raw) && 'snapshot' in raw ? (raw as { snapshot: unknown }).snapshot : raw
  try {
    return parseDiscoverySnapshot(candidate)
  } catch (error) {
    throw new Error(`Base snapshot ${base} is not a valid discovery snapshot: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`)
  }
}

/**
 * The publication check behind the `reference-findings` gate: snapshot the head, run the advisory
 * diff against the configured base, and count what is still pending. It fails closed — no base,
 * an unreadable base, or a diff that cannot run is a failure, never a pass.
 */
export const checkReferenceFindings = (root: string, config: DocBridgeConfigV1): ReferenceFindingsCheck => {
  const base = config.gates?.referenceFindings?.base
  if (!base) {
    return { ok: false, reason: 'No base is configured: set gates.referenceFindings.base to a base snapshot (ak-docs action snapshot), or remove reference-findings from gates.include.' }
  }
  let snapshot: DiscoverySnapshotV1
  try {
    snapshot = loadBase(root, base)
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
  let diff: ReturnType<typeof diffSnapshots>
  try {
    const head = discoverRepository({ root, config })
    diff = diffSnapshots(snapshot, head, { headRoot: root })
  } catch (error) {
    return { ok: false, baseRevision: snapshot.sourceRevision, reason: `Reference analysis is unavailable: ${error instanceof Error ? error.message : String(error)}` }
  }
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
    ? { ok: false, baseRevision: snapshot.sourceRevision, findings, reason: `${findings.length} pending reference finding(s) since base ${snapshot.sourceRevision}.` }
    : { ok: true, baseRevision: snapshot.sourceRevision, findings }
}

/** One short line per finding — code, document, line and target — for terminal output. */
export const formatPendingReferenceFindings = (findings: readonly PendingReferenceFinding[]): string[] => [
  ...findings.slice(0, MAX_LISTED).map((finding) => `  ${finding.code} ${finding.document}${finding.line === undefined ? '' : `:${finding.line}`} → ${finding.target}`),
  ...(findings.length > MAX_LISTED ? [`  … and ${findings.length - MAX_LISTED} more (see the JSON output)`] : []),
]
