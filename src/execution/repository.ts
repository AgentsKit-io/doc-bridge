import { minimatch } from 'minimatch'
import { StorageLedger, storageFailure } from '../storage/local.js'
import type { RepositoryReadV1, StorageLimits } from '../storage/contract.js'
import type { DocBridgeConfigV1 } from '../config/schema.js'

/** Repository limits only tighten the caller's acquisition budget. */
export const restrictServiceRead = (read: RepositoryReadV1, config: DocBridgeConfigV1): RepositoryReadV1 => {
  const limits = Object.freeze(Object.fromEntries(Object.entries(read.limits).map(([key, limit]) => [key, Math.min(limit, config.safety?.[key as keyof NonNullable<DocBridgeConfigV1['safety']>] as number ?? limit)])) as StorageLimits)
  const ledger = new StorageLedger(read.partition, limits)
  const excludes = config.safety?.exclude ?? []
  const excluded = (path: string) => excludes.some(pattern => minimatch(path, pattern, { dot: true }))
  const restricted: RepositoryReadV1 = { version: read.version, partition: read.partition, limits,
    async list(request) {
      try {
        ledger.check(request)
        const result = await read.list({ partition: request.partition, signal: request.signal, under: request.under, include: request.include, exclude: [...new Set([...request.exclude, ...excludes])] })
        if (result.status !== 'ok') return result
        result.value.entries.forEach(() => ledger.entry(request))
        return { status: 'ok' as const, value: { ...result.value, entries: result.value.entries.filter(entry => !excluded(entry.path)) } }
      } catch (error) { return storageFailure(error) }
    },
    async stat(request) {
      try { ledger.entry(request); return excluded(request.path) ? { status: 'denied' as const, code: 'PATH_DENIED' as const } : await read.stat({ partition: request.partition, signal: request.signal, path: request.path }) } catch (error) { return storageFailure(error) }
    },
    async read(request) {
      try {
        ledger.entry(request)
        if (excluded(request.path)) return { status: 'denied' as const, code: 'PATH_DENIED' as const }
        const result = await read.read({ partition: request.partition, signal: request.signal, path: request.path, ...(request.expected ? { expected: request.expected } : {}) })
        if (result.status === 'ok') ledger.charge(request, result.value.bytes.length)
        return result
      } catch (error) { return storageFailure(error) }
    },
  }
  return Object.freeze(restricted)
}
