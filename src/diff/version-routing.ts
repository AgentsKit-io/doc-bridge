import { z } from 'zod'
import { EvidenceSchema } from '../schemas/knowledge.js'
import { ReleaseEventSchema, type ReleaseEvent, type Resolution, type DiscoveryPluginV2 } from '../plugins/contract.js'
import { type ChangeSetV1 } from '../schemas/change-set.js'
import { changeSetContentHash, parseChangeSet } from './change-set.js'

export const DocumentTargetSchema = z.object({
  purl: z.string().min(5).max(512).optional(),
  state: z.enum(['resolved', 'unresolved', 'latest-released', 'default-branch']),
  range: z.string().min(1).max(512).optional(),
  source: z.enum(['frontmatter', 'lockfile', 'manifest', 'implicit']),
  reason: z.string().max(256).optional(),
  evidence: z.array(EvidenceSchema).max(4),
}).strict()
export type DocumentTarget = z.infer<typeof DocumentTargetSchema>
export type VersionComparator = Pick<DiscoveryPluginV2, 'satisfiesRange'>

/** Mapping is supplied by the caller's adapter; no release is inferred from discovery. */
export const stampChangeSet = (input: ChangeSetV1, eventInput: ReleaseEvent, mapping: Resolution<readonly { purl: string; version: string }[]>): Resolution<ChangeSetV1> => {
  const changeSet = parseChangeSet(input)
  const event = ReleaseEventSchema.parse(eventInput)
  if (mapping.status !== 'resolved') return mapping
  if (event.revision !== changeSet.headRevision) return { status: 'unresolved', reason: 'RELEASE_REVISION_MISMATCH', evidence: event.evidence }
  if (mapping.value.length !== 1) return { status: mapping.value.length ? 'ambiguous' : 'unresolved', reason: 'RELEASE_REQUIRES_ONE_PACKAGE', evidence: event.evidence }
  const value = mapping.value[0]!
  if (!changeSet.packages.some(pkg => pkg.purl === value.purl)) return { status: 'unresolved', reason: 'UNMATCHED_RELEASE_PACKAGE', evidence: event.evidence }
  if (changeSet.release.state === 'released') {
    if (changeSet.release.eventId === event.eventId && changeSet.release.purl === value.purl && changeSet.release.version === value.version) return { status: 'resolved', value: changeSet, evidence: event.evidence }
    throw new Error('CONFLICTING_RELEASE_STAMP: review required; the existing stamp was preserved.')
  }
  const stamped: ChangeSetV1 = { ...changeSet, release: { state: 'released', ...value, eventId: event.eventId }, coverage: [...changeSet.coverage.filter(entry => !(entry.analyzer === 'diff' && entry.scope === 'release-event')), { analyzer: 'release', scope: 'release-event', status: 'complete', evidence: event.evidence }] }
  stamped.contentHash = changeSetContentHash(stamped)
  return { status: 'resolved', value: parseChangeSet(stamped), evidence: event.evidence }
}

/** Unknown targets/comparisons stay unresolved, never implicitly eligible. */
export const changeSetEligibility = (changeSet: ChangeSetV1, input: DocumentTarget, adapter: VersionComparator = {}): Resolution<boolean> => {
  const target = DocumentTargetSchema.parse(input)
  const resolved = (value: boolean): Resolution<boolean> => ({ status: 'resolved', value, evidence: target.evidence })
  if (target.state === 'unresolved') return { status: 'unresolved', reason: target.reason ?? 'UNRESOLVED_DOCUMENT_TARGET', evidence: target.evidence }
  if (changeSet.release.state === 'unreleased') return resolved((!target.purl || changeSet.packages.some(pkg => pkg.purl === target.purl)) && (target.state === 'default-branch' || !!target.range?.startsWith('workspace:')))
  if (target.purl && target.purl !== changeSet.release.purl) return resolved(false)
  if (target.state === 'latest-released') return resolved(true)
  if (target.state === 'default-branch' || target.range?.startsWith('workspace:')) return resolved(false)
  if (!target.range || !adapter.satisfiesRange) return { status: 'unsupported', reason: 'MISSING_VERSION_COMPARATOR_OR_RANGE', evidence: target.evidence }
  return adapter.satisfiesRange(changeSet.release.purl, changeSet.release.version, target.range)
}
