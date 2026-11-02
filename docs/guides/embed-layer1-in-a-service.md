---
title: Embed Layer 1 in a service
description: Run deterministic Layer 1 in the service profile with limits, read the ChangeSetV1 and handle partial coverage and errors.
---

# Embed Layer 1 in a service

Layer 1 is deterministic: no LLM, no API key. A hosted service runs it on two
exact revisions, diffs them and reads the `ChangeSetV1`. The service owns the
ceiling: it passes `profile: 'service'`, its own `StorageLimits` and an
`AbortSignal`. Repository config cannot widen any of them. See the
[service profile](./service-profile.md) and [injected storage](./injected-storage.md).

## Example

The code below is `examples/service-embed/review-revision.ts`; CI runs it
(`tests/service-embed-guide.test.ts`) and checks that this block matches the file.

```ts
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import {
  applyConfigDefaults, contentRef, createLocalRepositoryRead, diffSnapshotsWithRead,
  discoverRepositoryWithRead, DocBridgeConfigV1Schema, safeWalkFiles,
  type DiscoverySnapshotV1,
} from '@agentskit/doc-bridge'

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
```

## Read the result

- `changeSet.changes` lists added, removed and changed entities; `contentHash`
  identifies the set. Validate stored sets with `parseChangeSet`.
- `findings` are advisory (for example `BROKEN_REFERENCE` with status
  `conflict`); they never approve or apply edits.
- `status` is `'partial'` when a limit stopped analysis and `'cancelled'` when
  the signal aborted. Both stay in `changeSet.coverage` (scopes such as
  `base:limits:source`).

## Partial coverage

An empty `findings` list is not "all clear". Coverage entries whose status is
not `complete` or `not-applicable` list what was not analyzed, including
service-profile denials. Show them next to the findings. When a limit is hit,
findings that depended on unread bytes degrade from `conflict` to
`stale-or-unverified`. Raise the limits or split the partition rather than
treating the result as final.

## Errors

Missing, mismatched or unreadable input throws (for example
`HEAD_PARTITION_MISMATCH` when the head reader's revision differs from the head
snapshot). Wrap it and fail the job; never turn a failure into an empty
successful review. Cancellation is a status, not an exception.
