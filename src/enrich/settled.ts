import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { DecisionV1Schema, FindingV1Schema, RemediationV1Schema, type DecisionV1, type FindingV1, type RemediationV1 } from '../schemas/findings.js'
import type { RejectedEnrichment } from '../schemas/enrichment.js'
import { readEnrichmentOverlay, sealEnrichmentOverlay, writeEnrichmentOverlay } from './overlay.js'

export const settledRejections = (entries: readonly RejectedEnrichment[]): RejectedEnrichment[] =>
  entries.filter(entry => entry.reason === 'human-rejected' || entry.reason === 'adjudicated')
/** Uses the existing settled overlay authority, including across agent-cache replay. */
export const recordDecision = (root: string, input: unknown, targetInput: FindingV1 | RemediationV1, authenticate: (by: string) => boolean): DecisionV1 => {
  const decision = DecisionV1Schema.parse(input)
  const target = targetInput.type === 'finding' ? FindingV1Schema.parse(targetInput) : RemediationV1Schema.parse(targetInput)
  if (!decision.by.trim() || decision.by === 'policy' || !authenticate(decision.by)) throw new Error('Caller-authenticated human identity required')
  if (decision.target.kind !== target.type || decision.target.id !== target.id || decision.evidenceHash !== target.evidenceHash) throw new Error('Decision target/evidence binding mismatch')
  const overlay = readEnrichmentOverlay(root)
  if (!overlay) throw new Error('A valid enrichment overlay is required for settled decision persistence')
  const proposalId = sha256NormalizedV1({ target: decision.target, evidenceHash: decision.evidenceHash })
  const rejected = [...overlay.rejected.filter(entry => entry.proposalId !== proposalId), { proposalId, kind: decision.target.kind, reason: 'human-rejected' as const, decision }]
  writeEnrichmentOverlay(root, sealEnrichmentOverlay({ ...overlay, rejected }))
  return decision
}
export const findingSuppressed = (finding: FindingV1, entries: readonly RejectedEnrichment[]): boolean =>
  settledRejections(entries).some(entry => entry.decision?.target.kind === 'finding' && entry.decision.target.id === finding.id && entry.decision.evidenceHash === finding.evidenceHash)
export const replayRemediation = (remediation: RemediationV1, entries: readonly RejectedEnrichment[]): RemediationV1 =>
  settledRejections(entries).some(entry => entry.decision?.target.kind === 'remediation' && entry.decision.target.id === remediation.id && entry.decision.evidenceHash === remediation.evidenceHash)
    ? { ...remediation, status: 'rejected' } : remediation
