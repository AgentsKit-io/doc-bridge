import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import type { EnrichmentTask } from './context-pack.js'
import { enrichmentCacheDir } from './overlay.js'

/**
 * The persistent enrichment cache.
 *
 * The old deterministic cache was an in-process `Map`: it saved a second call inside one
 * process and nothing across two. This one is keyed on everything that could change an answer —
 * the task, the agent identity and version, the prompt version, and the pack hash, which covers
 * the target and every neighbour by content hash — and lives under `.doc-bridge/enrich/cache/`,
 * so an unchanged repository makes zero agent calls and a one-document change re-runs only the
 * packs whose hash moved. An empty answer is cached like any other: "the agent had nothing to
 * say about this" is an answer, and asking again costs the same.
 */

export type EnrichmentCacheKeyInput = {
  readonly task: EnrichmentTask
  readonly agentId: string
  readonly agentVersion: string
  readonly promptVersion: string
  readonly packHash: string
}

export const enrichmentCacheKey = (input: EnrichmentCacheKeyInput): string =>
  sha256NormalizedV1({ task: input.task, agentId: input.agentId, agentVersion: input.agentVersion, promptVersion: input.promptVersion, packHash: input.packHash })

const CacheEntrySchema = z
  .object({
    type: z.literal('enrichment-cache-entry'),
    key: z.string().regex(/^[a-f0-9]{64}$/),
    task: z.enum(['curate', 'review', 'adjudicate']),
    agentId: z.string().min(1).max(256),
    agentVersion: z.string().min(1).max(64),
    promptVersion: z.string().min(1).max(64),
    packHash: z.string().regex(/^[a-f0-9]{64}$/),
    proposals: z.array(z.unknown()).max(1_024),
  })
  .strict()
export type EnrichmentCacheEntry = z.infer<typeof CacheEntrySchema>

export type EnrichmentCache = {
  readonly read: (input: EnrichmentCacheKeyInput) => readonly unknown[] | undefined
  readonly write: (input: EnrichmentCacheKeyInput, proposals: readonly unknown[]) => string
}

/** A file-backed cache under the enrich directory. A read never writes; a corrupt entry is a miss. */
export const createEnrichmentCache = (root: string): EnrichmentCache => {
  const dir = enrichmentCacheDir(root)
  const pathFor = (key: string): string => join(dir, `${key}.json`)
  return {
    read: (input) => {
      const key = enrichmentCacheKey(input)
      const path = pathFor(key)
      if (!existsSync(path)) return undefined
      try {
        const entry = CacheEntrySchema.parse(JSON.parse(readFileSync(path, 'utf8')) as unknown)
        // A file renamed into place under another key is not that key's answer.
        return entry.key === key && entry.packHash === input.packHash && entry.agentId === input.agentId ? entry.proposals : undefined
      } catch {
        return undefined
      }
    },
    write: (input, proposals) => {
      const key = enrichmentCacheKey(input)
      mkdirSync(dir, { recursive: true })
      const entry: EnrichmentCacheEntry = { type: 'enrichment-cache-entry', key, ...input, proposals: [...proposals] }
      const path = pathFor(key)
      const temporary = `${path}.tmp-${process.pid}`
      writeFileSync(temporary, `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
      renameSync(temporary, path)
      return path
    },
  }
}

/** An in-memory cache with the same contract, for callers that must not touch disk. */
export const createMemoryEnrichmentCache = (): EnrichmentCache => {
  const entries = new Map<string, readonly unknown[]>()
  return {
    read: (input) => entries.get(enrichmentCacheKey(input)),
    write: (input, proposals) => {
      const key = enrichmentCacheKey(input)
      entries.set(key, [...proposals])
      return key
    },
  }
}
