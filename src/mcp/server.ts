import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { z, ZodError } from 'zod'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { retrieveDocBridgeChunks } from '../retriever/doc-bridge-retriever.js'
import { runGates } from '../gates/run-gates.js'
import { ingestMemoryCandidates } from '../memory/ingest.js'
import { classifyMemoryCandidates, draftMemoryPromotion } from '../memory/pipeline.js'
import { loadDocBridgeIndex } from '../query/load-index.js'
import { runQuery } from '../query/query.js'
import { searchIndex } from '../query/search.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { PACKAGE_VERSION } from '../version.js'
import { loadWorkflowManifest, loadWorkflowStepOutput } from '../workflow/engine.js'
import { parseDiscoverySnapshot, parseReconciliationReport } from '../validate.js'
import { applyFixProposal, approveFixProposal, createArtifactNormalizationProposal, createMarkdownLinkFixProposal } from '../fixes/proposals.js'
import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { discoverRepository } from '../discovery/repository.js'
import { FixProposalV1Schema, type DiscoverySnapshotV1, type ReconciliationReportV1, type FixProposalV1 } from '../schemas/knowledge.js'
import { redactValue } from '../safety/repository.js'

type JsonRpcRequest = {
  readonly jsonrpc?: '2.0'
  readonly id?: string | number | null
  readonly method?: string
  readonly params?: unknown
}

type McpContext = {
  readonly root: string
  readonly config: DocBridgeConfigV1
  readonly loadIndex?: () => DocBridgeIndexV1
}

export const MCP_TOOLS = [
  {
    name: 'handoff.resolve',
    title: 'Resolve repository handoff',
    description: 'Resolve a package or ownership id to its deterministic AgentHandoff.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, kind: { type: 'string', enum: ['package', 'ownership'] } },
      required: ['id'],
    },
  },
  {
    name: 'doc.search',
    title: 'Search repository documentation',
    description: 'Search the deterministic Doc Bridge index for repository documentation.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: { term: { type: 'string' }, limit: { type: 'number' } },
      required: ['term'],
    },
  },
  {
    name: 'doc.get',
    title: 'Read indexed documentation',
    description: 'Read one indexed agent documentation file by id or indexed path.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, path: { type: 'string' } },
    },
  },
  {
    name: 'gate.status',
    title: 'Check documentation gates',
    description: 'Evaluate documentation gates without writing files.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'retriever.query',
    title: 'Retrieve documentation context',
    description: 'Return relevant local Doc Bridge index chunks for a query.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
      required: ['query'],
    },
  },
  {
    name: 'memory.classify',
    title: 'Classify memory candidates',
    description: 'Classify local memory candidates into agent, human, playbook, or discard routes.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'memory.promoteDraft',
    title: 'Draft memory promotion',
    description: 'Build a reviewable draft promotion body from local memory candidates without publishing it.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'registry.topology',
    title: 'Inspect registry topology',
    description: 'Return the static Doc Bridge curator and delegate topology.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'docbridge.snapshot',
    title: 'Read the latest discovery snapshot',
    description: 'Read the bounded canonical repository snapshot from the latest workflow run.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: { runId: { type: 'string' } } },
  },
  {
    name: 'docbridge.report',
    title: 'Read the latest reconciliation report',
    description: 'Read the canonical reconciliation report from the latest workflow run.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: { runId: { type: 'string' } } },
  },
  {
    name: 'docbridge.diagnostics',
    title: 'Read reconciliation diagnostics',
    description: 'Read bounded diagnostics from the latest canonical reconciliation report.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: { status: { type: 'string' }, severity: { type: 'string' } } },
  },
  {
    name: 'docbridge.relations',
    title: 'Read architecture relations',
    description: 'Read bounded observed and declared relations from the latest canonical snapshot.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: { kind: { type: 'string' }, limit: { type: 'number' } } },
  },
  {
    name: 'docbridge.run',
    title: 'Read workflow state',
    description: 'Read the latest resumable workflow state and artifact references.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'docbridge.proposals',
    title: 'Read or approve proposals',
    description: 'Create, inspect, approve and apply deterministic proposals through the shared human-gated workflow.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'propose-links', 'propose-normalize', 'approve', 'apply'] }, proposalHash: { type: 'string' }, artifactPath: { type: 'string' }, approvedBy: { type: 'string' }, proposal: { type: 'object' } } },
  },
] as const

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

const HandoffResolveArgsSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['package', 'ownership']).optional(),
})

const DocSearchArgsSchema = z.object({
  term: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
})

const RetrieverQueryArgsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
})

const DocGetArgsSchema = z
  .object({
    id: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
  })
  .refine((args) => args.id || args.path, 'doc.get requires id or path')

const WorkflowRunArgsSchema = z.object({ runId: z.string().min(1).optional() })
const DiagnosticsArgsSchema = z.object({ status: z.string().min(1).optional(), severity: z.string().min(1).optional() })
const RelationsArgsSchema = z.object({ kind: z.string().min(1).optional(), limit: z.number().int().positive().max(500).optional() })
const ProposalsArgsSchema = z.object({ action: z.enum(['list', 'propose-links', 'propose-normalize', 'approve', 'apply']).optional(), proposalHash: z.string().min(1).optional(), artifactPath: z.string().min(1).optional(), approvedBy: z.string().min(1).optional(), proposal: z.unknown().optional() })

const parseToolArgs = <T>(tool: string, schema: z.ZodType<T>, value: unknown): T => {
  try {
    return schema.parse(value)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`${tool} invalid arguments: ${error.issues.map((issue) => issue.message).join(', ')}`)
    }
    throw error
  }
}

const textResult = (value: unknown) => ({
  content: [
    {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    },
  ],
})

const findDocPath = (index: DocBridgeIndexV1, args: z.infer<typeof DocGetArgsSchema>): string => {
  if (args.path) {
    const doc = index.knowledge.find((entry) => entry.path === args.path)
    if (!doc) throw new Error(`Unknown indexed doc path "${args.path}"`)
    return doc.path
  }
  const id = args.id ?? ''
  const doc = index.knowledge.find((entry) => entry.id === args.id)
  if (!doc) throw new Error(`Unknown doc id "${id}"`)
  return doc.path
}

const resolveDocPath = (root: string, relPath: string): string => {
  const rootAbs = realpathSync.native(root)
  const unresolved = resolve(rootAbs, relPath)
  const unresolvedRel = relative(rootAbs, unresolved)
  if (unresolvedRel.startsWith('..')) throw new Error('doc.get path escapes project root')
  const abs = realpathSync.native(unresolved)
  const rel = relative(rootAbs, abs)
  if (rel.startsWith('..')) throw new Error('doc.get path escapes project root')
  return abs
}

const workflowStateDir = (ctx: McpContext): string => resolve(ctx.root, ctx.config.workflow?.stateDir ?? '.doc-bridge/workflow')

const workflowRun = (ctx: McpContext) => loadWorkflowManifest(workflowStateDir(ctx))

const ensureLatestRun = (ctx: McpContext, runId?: string) => {
  const run = workflowRun(ctx)
  if (runId && run.runId !== runId) throw new Error(`Unknown workflow run "${runId}"`)
  if (run.state === 'stale' || run.state === 'failed') throw new Error(`Workflow run is ${run.state}; resume or create a valid run before reading artifacts.`)
  return run
}

const workflowSnapshot = (ctx: McpContext, runId?: string): DiscoverySnapshotV1 => {
  ensureLatestRun(ctx, runId)
  return parseDiscoverySnapshot(loadWorkflowStepOutput(workflowStateDir(ctx), 'normalize'))
}

const workflowReport = (ctx: McpContext, runId?: string): ReconciliationReportV1 => {
  ensureLatestRun(ctx, runId)
  return parseReconciliationReport(loadWorkflowStepOutput(workflowStateDir(ctx), 'reconcile'))
}

const proposalPath = (ctx: McpContext): string => join(ctx.root, '.doc-bridge', 'proposal.json')
const readSavedProposal = (ctx: McpContext, input: unknown): FixProposalV1 => {
  if (input !== undefined) return FixProposalV1Schema.parse(input)
  try { return FixProposalV1Schema.parse(JSON.parse(readFileSync(proposalPath(ctx), 'utf8')) as unknown) } catch { throw new Error(`No saved fix proposal at ${proposalPath(ctx)}.`) }
}
const saveProposal = (ctx: McpContext, proposal: FixProposalV1): void => { mkdirSync(join(ctx.root, '.doc-bridge'), { recursive: true }); writeFileSync(proposalPath(ctx), `${JSON.stringify(proposal, null, 2)}\n`, 'utf8') }

export const handleMcpRequest = (ctx: McpContext, request: JsonRpcRequest): unknown => {
  if (request.method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'ak-docs', version: PACKAGE_VERSION },
    }
  }

  if (request.method === 'tools/list') return { tools: MCP_TOOLS }

  if (request.method === 'tools/call') {
    const params = asRecord(request.params)
    const name = params.name
    const args = asRecord(params.arguments)
    const index = () => ctx.loadIndex?.() ?? loadDocBridgeIndex(ctx.root, ctx.config)

    if (name === 'handoff.resolve') {
      const parsed = parseToolArgs('handoff.resolve', HandoffResolveArgsSchema, args)
      return textResult(
        runQuery(index(), ctx.config, {
          kind: parsed.kind === 'package' ? 'package' : 'ownership',
          id: parsed.id,
          agent: true,
        }),
      )
    }

    if (name === 'doc.search') {
      const parsed = parseToolArgs('doc.search', DocSearchArgsSchema, args)
      return textResult(searchIndex(index(), parsed.term, parsed.limit ?? 20))
    }

    if (name === 'doc.get') {
      const relPath = findDocPath(index(), parseToolArgs('doc.get', DocGetArgsSchema, args))
      return textResult(readFileSync(resolveDocPath(ctx.root, relPath), 'utf8'))
    }

    if (name === 'gate.status') return textResult(runGates(ctx.root, ctx.config))

    if (name === 'retriever.query') {
      const parsed = parseToolArgs('retriever.query', RetrieverQueryArgsSchema, args)
      return textResult(retrieveDocBridgeChunks(index(), parsed.query, parsed.limit ? { limit: parsed.limit } : {}))
    }

    if (name === 'memory.classify') {
      return textResult(classifyMemoryCandidates(ingestMemoryCandidates(ctx.root), index()))
    }

    if (name === 'memory.promoteDraft') {
      return textResult(draftMemoryPromotion(classifyMemoryCandidates(ingestMemoryCandidates(ctx.root), index())))
    }

    if (name === 'registry.topology') {
      return textResult({
        id: 'doc-curator',
        delegates: ['docs-chat', 'knowledge-promoter', 'code-review'],
        tools: ['handoff.resolve', 'doc.search', 'doc.get', 'gate.status', 'retriever.query'],
        steps: ['classify', 'draft', 'verify', 'review'],
        mergePolicy: { autoMerge: false, requiresHuman: true },
      })
    }

    if (name === 'docbridge.snapshot') {
      const parsed = parseToolArgs('docbridge.snapshot', WorkflowRunArgsSchema, args)
      return textResult(redactValue(workflowSnapshot(ctx, parsed.runId)))
    }

    if (name === 'docbridge.report') {
      const parsed = parseToolArgs('docbridge.report', WorkflowRunArgsSchema, args)
      return textResult(redactValue(workflowReport(ctx, parsed.runId)))
    }

    if (name === 'docbridge.diagnostics') {
      const parsed = parseToolArgs('docbridge.diagnostics', DiagnosticsArgsSchema, args)
      const diagnostics = workflowReport(ctx).diagnostics.filter((diagnostic) =>
        (!parsed.status || diagnostic.status === parsed.status) && (!parsed.severity || diagnostic.severity === parsed.severity),
      )
      return textResult(redactValue({ reportHash: workflowReport(ctx).contentHash, diagnostics }))
    }

    if (name === 'docbridge.relations') {
      const parsed = parseToolArgs('docbridge.relations', RelationsArgsSchema, args)
      const snapshot = workflowSnapshot(ctx)
      return textResult({ snapshotHash: snapshot.contentHash, relations: snapshot.relations.filter((relation) => !parsed.kind || relation.kind === parsed.kind).slice(0, parsed.limit ?? 100) })
    }

    if (name === 'docbridge.run') {
      parseToolArgs('docbridge.run', z.object({}), args)
      return textResult(workflowRun(ctx))
    }

    if (name === 'docbridge.proposals') {
      const parsed = parseToolArgs('docbridge.proposals', ProposalsArgsSchema, args)
      const run = (() => { try { return workflowRun(ctx) } catch { return undefined } })()
      if (!parsed.action || parsed.action === 'list') {
        let proposal: FixProposalV1 | undefined
        try { proposal = readSavedProposal(ctx, undefined) } catch { proposal = undefined }
        return textResult(redactValue({ ...(run ? { runId: run.runId } : {}), proposals: proposal ? [proposal] : [] }))
      }
      const discovered = discoverRepository({ root: ctx.root, config: ctx.config })
      const options = { baseRevision: discovered.sourceRevision, configurationHash: sha256NormalizedV1(ctx.config), ...(ctx.config.project?.name ? { projectName: ctx.config.project.name } : {}) }
      if (parsed.action === 'propose-links') {
        const proposal = createMarkdownLinkFixProposal(ctx.root, options)
        if (proposal) saveProposal(ctx, proposal)
        return textResult(redactValue({ ...(run ? { runId: run.runId } : {}), proposal: proposal ?? null }))
      }
      if (parsed.action === 'propose-normalize') {
        if (!parsed.artifactPath) throw new Error('docbridge.proposals propose-normalize requires artifactPath')
        const proposal = createArtifactNormalizationProposal(ctx.root, parsed.artifactPath, options)
        if (proposal) saveProposal(ctx, proposal)
        return textResult(redactValue({ ...(run ? { runId: run.runId } : {}), proposal: proposal ?? null }))
      }
      if (parsed.action === 'approve') {
        const proposal = approveFixProposal(readSavedProposal(ctx, parsed.proposal), parsed.approvedBy ?? 'human')
        if (parsed.proposalHash && proposal.approval?.proposalHash !== parsed.proposalHash) throw new Error('proposalHash does not match the saved proposal')
        saveProposal(ctx, proposal)
        return textResult(redactValue({ ...(run ? { runId: run.runId } : {}), proposal }))
      }
      const proposal = applyFixProposal(ctx.root, readSavedProposal(ctx, parsed.proposal), { currentRevision: discovered.sourceRevision })
      saveProposal(ctx, proposal)
      return textResult(redactValue({ ...(run ? { runId: run.runId } : {}), proposal }))
    }

    throw new Error(`Unknown tool "${String(name)}"`)
  }

  if (request.method?.startsWith('notifications/')) return undefined
  throw new Error(`Unsupported MCP method "${request.method ?? ''}"`)
}

type StdioFraming = 'content-length' | 'json-line'

const writeFrame = (payload: unknown, framing: StdioFraming): void => {
  const body = JSON.stringify(payload)
  process.stdout.write(framing === 'json-line' ? `${body}\n` : `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

const respond = (ctx: McpContext, request: JsonRpcRequest, framing: StdioFraming): void => {
  if (request.id === undefined) {
    try {
      handleMcpRequest(ctx, request)
    } catch {
      // Notifications do not get responses.
    }
    return
  }

  try {
    const result = handleMcpRequest(ctx, request)
    writeFrame({ jsonrpc: '2.0', id: request.id, result: result ?? {} }, framing)
  } catch (error) {
    writeFrame({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
    }, framing)
  }
}

export const startMcpStdioServer = (ctx: McpContext): void => {
  let buffer = Buffer.alloc(0)
  process.stdin.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    while (true) {
      if (/^content-length:/i.test(buffer.subarray(0, Math.min(buffer.length, 32)).toString('utf8'))) {
        const headerEnd = buffer.indexOf('\r\n\r\n')
        if (headerEnd === -1) return
        const header = buffer.subarray(0, headerEnd).toString('utf8')
        const match = /content-length:\s*(\d+)/i.exec(header)
        if (!match?.[1]) {
          buffer = buffer.subarray(headerEnd + 4)
          continue
        }
        const length = Number(match[1])
        const bodyStart = headerEnd + 4
        const bodyEnd = bodyStart + length
        if (buffer.length < bodyEnd) return
        const raw = buffer.subarray(bodyStart, bodyEnd).toString('utf8')
        buffer = buffer.subarray(bodyEnd)
        respond(ctx, JSON.parse(raw) as JsonRpcRequest, 'content-length')
        continue
      }

      const lineEnd = buffer.indexOf('\n')
      if (lineEnd === -1) return
      const raw = buffer.subarray(0, lineEnd).toString('utf8').trim()
      buffer = buffer.subarray(lineEnd + 1)
      if (!raw) continue
      try {
        respond(ctx, JSON.parse(raw) as JsonRpcRequest, 'json-line')
      } catch {
        writeFrame({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 'json-line')
      }
    }
  })
  process.stdin.resume()
}
