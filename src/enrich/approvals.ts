import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { PeerMissingError, importPeer } from '../intelligence/peers.js'

/**
 * Approvals through the ecosystem gate.
 *
 * `createApprovalGate` from `@agentskit/core/hitl` is the contract every AgentsKit surface uses
 * to pause at a decision point and record what a person decided. Doc Bridge records its
 * approvals through it — the enrichment overlay's, and `ak-docs fix approve`'s — so the CLI,
 * MCP and a rendered review page share one record rather than three ways of writing "approved".
 *
 * The store is a directory of JSON files, one per approval, because the repository is the only
 * persistence Doc Bridge has. The gate contract is mirrored here for the same reason every other
 * ecosystem contract is: `@agentskit/core` is an optional peer, and the real `createApprovalGate`
 * is used through `importPeer` when it is installed. A test runs both over the same store and
 * asserts the same records.
 */

export type ApprovalDecision = 'approved' | 'rejected'

export type Approval<TPayload = unknown> = {
  id: string
  name: string
  payload: TPayload
  status: 'pending' | ApprovalDecision | 'cancelled'
  createdAt: string
  decidedAt?: string
  decisionMetadata?: Record<string, unknown>
}

export type ApprovalStore = {
  put: <T>(approval: Approval<T>) => Promise<void>
  get: <T>(id: string) => Promise<Approval<T> | null>
  patch: <T>(id: string, update: Partial<Approval<T>>) => Promise<Approval<T> | null>
}

export type RequestApprovalInput<TPayload> = { name: string; payload: TPayload; id: string }

export type ApprovalGate<TPayload = unknown> = {
  request: (input: RequestApprovalInput<TPayload>) => Promise<Approval<TPayload>>
  await: (id: string, options?: { timeoutMs?: number; pollMs?: number; signal?: AbortSignal }) => Promise<Approval<TPayload>>
  decide: (id: string, decision: ApprovalDecision, metadata?: Record<string, unknown>) => Promise<Approval<TPayload>>
  cancel: (id: string) => Promise<Approval<TPayload>>
}

export const APPROVALS_DIR = '.doc-bridge/approvals'
export const ENRICHMENT_APPROVAL_GATE = 'doc-bridge.enrichment'
export const FIX_APPROVAL_GATE = 'doc-bridge.fix'

export const approvalsDir = (root: string): string => join(resolve(root), APPROVALS_DIR)

/** An approval id is a hash; anything else would be a path. */
const safeId = (id: string): string => {
  if (!/^[a-f0-9]{16,64}$/.test(id)) throw new Error(`Approval ids are content hashes; received "${id}".`)
  return id
}

/** The id an enrichment approval binds to: the proposal and the exact content it was made about. */
export const enrichmentApprovalId = (proposalId: string, targetContentHash: string): string => sha256NormalizedV1({ proposalId, targetContentHash })

/** The id a fix approval binds to: the proposal id and the hash of its exact content. */
export const fixApprovalId = (proposalId: string, proposalHash: string): string => sha256NormalizedV1({ proposalId, proposalHash })

export const createFileApprovalStore = (dir: string): ApprovalStore => {
  const pathFor = (id: string): string => join(dir, `${safeId(id)}.json`)
  const write = (approval: Approval): void => {
    mkdirSync(dir, { recursive: true })
    const path = pathFor(approval.id)
    const temporary = `${path}.tmp-${process.pid}`
    writeFileSync(temporary, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
    renameSync(temporary, path)
  }
  const read = (id: string): Approval | null => {
    const path = pathFor(id)
    if (!existsSync(path)) return null
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Approval
    } catch {
      return null
    }
  }
  return {
    async put<T>(approval: Approval<T>): Promise<void> {
      write(approval as Approval)
    },
    async get<T>(id: string): Promise<Approval<T> | null> {
      return read(id) as Approval<T> | null
    },
    async patch<T>(id: string, update: Partial<Approval<T>>): Promise<Approval<T> | null> {
      const current = read(id)
      if (!current) return null
      const next = { ...current, ...update } as Approval
      write(next)
      return next as Approval<T>
    },
  }
}

/** Every approval in the store, by id. For a reviewer listing what is waiting. */
export const listApprovals = (dir: string): Approval[] => {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /^[a-f0-9]{16,64}\.json$/.test(name))
    .sort()
    .flatMap((name) => {
      try {
        return [JSON.parse(readFileSync(join(dir, name), 'utf8')) as Approval]
      } catch {
        return []
      }
    })
}

/** The mirror of `createApprovalGate`: create-or-load, poll, patch. */
export const createApprovalGateMirror = <TPayload = unknown>(store: ApprovalStore): ApprovalGate<TPayload> => {
  const load = async (id: string): Promise<Approval<TPayload>> => {
    const approval = await store.get<TPayload>(id)
    if (!approval) throw new Error(`Unknown approval "${id}".`)
    return approval
  }
  return {
    async request(input) {
      const existing = await store.get<TPayload>(input.id)
      if (existing) return existing
      const approval: Approval<TPayload> = { id: input.id, name: input.name, payload: input.payload, status: 'pending', createdAt: new Date().toISOString() }
      await store.put(approval)
      return approval
    },
    async await(id, options = {}) {
      const pollMs = options.pollMs ?? 500
      const started = Date.now()
      for (;;) {
        const approval = await load(id)
        if (approval.status !== 'pending') return approval
        if (options.signal?.aborted) throw new Error(`Approval "${id}" wait aborted.`)
        if (options.timeoutMs !== undefined && Date.now() - started >= options.timeoutMs) throw new Error(`Approval "${id}" timed out.`)
        await new Promise((resolveWait) => setTimeout(resolveWait, pollMs))
      }
    },
    async decide(id, decision, metadata) {
      const updated = await store.patch<TPayload>(id, { status: decision, decidedAt: new Date().toISOString(), ...(metadata ? { decisionMetadata: metadata } : {}) })
      if (!updated) throw new Error(`Unknown approval "${id}".`)
      return updated
    },
    async cancel(id) {
      const updated = await store.patch<TPayload>(id, { status: 'cancelled', decidedAt: new Date().toISOString() })
      if (!updated) throw new Error(`Unknown approval "${id}".`)
      return updated
    },
  }
}

type CoreHitl = { createApprovalGate: <T>(store: ApprovalStore) => ApprovalGate<T> }

/**
 * The gate over a store: the ecosystem's when the peer is installed, the mirror otherwise.
 *
 * Both write the same records to the same files, which is the point — a record written by one
 * is read by the other, and by any AgentsKit surface that opens the same store.
 */
export const loadApprovalGate = async <TPayload = unknown>(store: ApprovalStore): Promise<{ readonly gate: ApprovalGate<TPayload>; readonly source: 'ecosystem' | 'mirror' }> => {
  try {
    const core = await importPeer<CoreHitl>('@agentskit/core/hitl')
    if (typeof core.createApprovalGate === 'function') return { gate: core.createApprovalGate<TPayload>(store), source: 'ecosystem' }
  } catch (error) {
    if (!(error instanceof PeerMissingError)) throw error
  }
  return { gate: createApprovalGateMirror<TPayload>(store), source: 'mirror' }
}

export type RecordedApproval = { readonly approval: Approval; readonly source: 'ecosystem' | 'mirror' }

/**
 * Record a decision a person already made — the shape `ak-docs fix approve` needs: request
 * (idempotent, so a re-run finds the same record) then decide, in one call.
 */
export const recordApproval = async (
  root: string,
  input: { readonly id: string; readonly name: string; readonly payload: unknown; readonly decision: ApprovalDecision; readonly by: string; readonly reason?: string },
): Promise<RecordedApproval> => {
  const store = createFileApprovalStore(approvalsDir(root))
  const { gate, source } = await loadApprovalGate(store)
  const existing = await gate.request({ id: input.id, name: input.name, payload: input.payload })
  if (existing.status !== 'pending') throw new Error(`Approval ${input.id} was already ${existing.status}.`)
  const approval = await gate.decide(input.id, input.decision, { by: input.by, ...(input.reason ? { reason: input.reason } : {}) })
  return { approval, source }
}
