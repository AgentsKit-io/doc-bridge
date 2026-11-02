import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import {
  applyConfigDefaults, contentRef, createLocalRepositoryRead, diffSnapshotsWithRead,
  discoverRepositoryWithRead, DocBridgeConfigV1Schema, safeWalkFiles,
  type DiscoverySnapshotV1,
} from '../../src/index.js'

// The service chooses the ceiling; repository config cannot widen it.
const limits = { maxFiles: 5_000, maxBytes: 64 * 1024 * 1024, maxFileBytes: 1024 * 1024, maxTimeMs: 20_000, maxMemoryMb: 512 }
const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } }))

// Analyze one exact revision in the service profile, with limits and cancellation.
const analyze = async (root: string, revision: string, signal: AbortSignal, maxFiles = limits.maxFiles) => {
  const inventory = Object.fromEntries(safeWalkFiles(root).files.map(path => [relative(root, path).replaceAll('\\', '/'), contentRef(readFileSync(path))]))
  const read = await createLocalRepositoryRead({ root, partition: { repositoryId: 'my-service-repo', revision }, limits: { ...limits, maxFiles }, inventory })
  const { snapshot } = await discoverRepositoryWithRead(read, { root: 'my-service-repo', config, profile: 'service', signal })
  return { read, snapshot }
}

export type Review = {
  status: 'complete' | 'partial' | 'cancelled'
  changes: number
  findings: { code: string; status: string; message: string }[]
  /** Coverage the caller must show next to the result; never treat it as "no findings". */
  notAnalyzed: { scope: string; status: string; reason?: string | undefined }[]
}

export const reviewRevision = async (
  baseRoot: string, headRoot: string, signal: AbortSignal, maxFiles?: number,
): Promise<Review> => {
  let base: DiscoverySnapshotV1, head: Awaited<ReturnType<typeof analyze>>
  try {
    base = (await analyze(baseRoot, 'base', signal, maxFiles)).snapshot
    head = await analyze(headRoot, 'head', signal, maxFiles)
  } catch (error) {
    // Unreadable or mismatched input is an error, never an empty successful review.
    throw new Error(`layer-1 review failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  const delta = await diffSnapshotsWithRead(base, head.snapshot, head.read, { signal, profile: 'service' })
  const { changeSet } = delta // ChangeSetV1: changes[], coverage[], contentHash
  const notAnalyzed = changeSet.coverage.filter(entry => entry.status !== 'complete' && entry.status !== 'not-applicable')
  return {
    status: delta.status ?? (notAnalyzed.some(entry => entry.scope.includes('limits:')) ? 'partial' : 'complete'),
    changes: changeSet.changes.length,
    findings: delta.findings.map(finding => ({ code: finding.code, status: finding.status, message: finding.message })),
    notAnalyzed,
  }
}
