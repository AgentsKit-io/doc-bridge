import { intersectStorageLimits, type RepositoryReadV1, type StorageFailure, type StorageLimits } from './contract.js'
import { StorageFault, StorageLedger, storageFailure } from './local.js'
import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'

export type ProgressEvent = Readonly<{ stage: string; processed: number; total?: number; elapsedMs: number }>
export type OperationOptions = Readonly<{
  collectMetrics?: boolean
  signal?: AbortSignal
  limits?: Partial<StorageLimits>
  maxDurationMs?: number
  onProgress?: (event: ProgressEvent) => void
}>
export type RunMetrics = Readonly<{ durationMs: number; stages: Readonly<Record<string, number>>; filesRead: number; bytesRead: number; peakHeapBytes: number }>

/** One run budget; telemetry stays outside semantic artifacts. */
export const createOperation = (reader: RepositoryReadV1, options: OperationOptions) => {
  const started = performance.now()
  const signal = options.signal ?? new AbortController().signal
  const limits = intersectStorageLimits(reader.limits, { ...reader.limits, ...options.limits, ...(options.maxDurationMs === undefined ? {} : { maxTimeMs: Math.min(options.maxDurationMs, options.limits?.maxTimeMs ?? reader.limits.maxTimeMs) }) })
  const ledger = new StorageLedger(reader.partition, limits)
  const request = { partition: reader.partition, signal }
  let stage = 'acquisition'
  let stageStarted = started
  let processed = 0
  let total: number | undefined
  let filesRead = 0
  let bytesRead = 0
  let peakHeapBytes = 0
  let emitted = 0
  const stages: Record<string, number> = {}
  const sample = () => { peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed) }
  const event = (knownTotal = total) => { sample(); if (emitted++ < 256) options.onProgress?.(Object.freeze({ stage, processed, ...(knownTotal === undefined ? {} : { total: knownTotal }), elapsedMs: performance.now() - started })) }
  const boundary = (name: string, knownTotal?: number) => {
    if (processed) event()
    const now = performance.now()
    stages[stage] = (stages[stage] ?? 0) + now - stageStarted
    stage = name; stageStarted = now; processed = 0; total = knownTotal
    event()
    ledger.check(request)
  }
  const checked = async <T>(input: typeof request, fn: () => Promise<T>): Promise<T> => {
    ledger.check(input)
    const value = await fn()
    ledger.check(input)
    return value
  }
  const read: RepositoryReadV1 = { version: reader.version, partition: reader.partition, limits,
    async list(input) {
      try {
        const bound = { ...input, signal: AbortSignal.any([signal, input.signal]) }
        const result = await checked(bound, () => reader.list(bound))
        if (result.status === 'ok') {
          total = result.value.entries.filter(entry => entry.kind === 'file').length
          event()
          for (const entry of result.value.entries) { ledger.entry(bound); if (entry.kind === 'file') ledger.charge(bound, entry.bytes) }
        }
        return result
      } catch (error) { return storageFailure(error) }
    },
    async stat(input) {
      try { const bound = { ...input, signal: AbortSignal.any([signal, input.signal]) }; ledger.entry(bound); return await checked(bound, () => reader.stat(bound)) } catch (error) { return storageFailure(error) }
    },
    async read(input) {
      try {
        const bound = { ...input, signal: AbortSignal.any([signal, input.signal]) }
        ledger.entry(bound)
        const result = await checked(bound, () => reader.read(bound))
        if (result.status === 'ok') { filesRead++; bytesRead += result.value.bytes.length; ledger.charge(bound, result.value.bytes.length); processed++; if (processed === 1 || (processed % 64 === 0 && processed <= 8192)) event() }
        return result
      } catch (error) { return storageFailure(error) }
    },
  }
  return {
    read, signal, boundary,
    check: () => ledger.check(request),
    finish: (): RunMetrics => {
      const now = performance.now(); sample()
      return { durationMs: now - started, stages: { ...stages, [stage]: (stages[stage] ?? 0) + now - stageStarted }, filesRead, bytesRead, peakHeapBytes }
    },
    coverage: (failure: StorageFailure): DiscoverySnapshotV1['coverage'] => [{ analyzer: 'operation', scope: `limits:${stage}`, status: 'partial', reason: failure.code }],
    stop: (failure: StorageFailure): never => { throw new StorageFault(failure) },
  }
}
