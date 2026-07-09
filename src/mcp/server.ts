import { readFileSync, realpathSync } from 'node:fs'
import { relative, resolve } from 'node:path'

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
    description: 'Resolve a package or ownership id to an AgentHandoff.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, kind: { type: 'string', enum: ['package', 'ownership'] } },
      required: ['id'],
    },
  },
  {
    name: 'doc.search',
    description: 'Search the deterministic doc-bridge index.',
    inputSchema: {
      type: 'object',
      properties: { term: { type: 'string' }, limit: { type: 'number' } },
      required: ['term'],
    },
  },
  {
    name: 'doc.get',
    description: 'Read an indexed agent documentation file by id or path.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, path: { type: 'string' } },
    },
  },
  {
    name: 'gate.status',
    description: 'Run the index-freshness gate.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'retriever.query',
    description: 'Return local doc-bridge retriever chunks for a query.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
      required: ['query'],
    },
  },
  {
    name: 'memory.classify',
    description: 'Classify local memory candidates into agent/human/playbook/discard routes.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'memory.promoteDraft',
    description: 'Build a safe draft promotion body for local memory candidates.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'registry.topology',
    description: 'Return the doc-curator registry topology.',
    inputSchema: { type: 'object', properties: {} },
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

    throw new Error(`Unknown tool "${String(name)}"`)
  }

  if (request.method?.startsWith('notifications/')) return undefined
  throw new Error(`Unsupported MCP method "${request.method ?? ''}"`)
}

const writeFrame = (payload: unknown): void => {
  const body = JSON.stringify(payload)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

const respond = (ctx: McpContext, request: JsonRpcRequest): void => {
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
    writeFrame({ jsonrpc: '2.0', id: request.id, result: result ?? {} })
  } catch (error) {
    writeFrame({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
    })
  }
}

export const startMcpStdioServer = (ctx: McpContext): void => {
  let buffer = Buffer.alloc(0)
  process.stdin.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    while (true) {
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
      respond(ctx, JSON.parse(raw) as JsonRpcRequest)
    }
  })
  process.stdin.resume()
}
