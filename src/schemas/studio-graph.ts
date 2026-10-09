import { z } from 'zod'
import { ContentHashAlgoSchema } from './doc-bridge-index.js'
import { CoverageSchema } from './knowledge.js'
import { FindingV1Schema } from './findings.js'

export const STUDIO_SCHEMA_VERSION = 1 as const
export const STUDIO_LIMITS = { nodes: 800, documents: 300, edges: 2_000, findings: 100, proposals: 100, bytes: 2_000_000 } as const
const id = z.string().min(1).max(256)
const text = z.string().min(1).max(512)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const count = z.number().int().nonnegative()
const path = text.refine(value => !value.startsWith('/') && !/^[A-Za-z]:/.test(value) && !value.includes('\\') && !value.split('/').includes('..'), 'Expected repository-relative path')
export const StudioNodeV1Schema = z.object({
  id, label: z.string().min(1).max(256),
  kind: z.enum(['package', 'area', 'document', 'symbol', 'fact', 'decision', 'concept', 'change', 'human-note']),
  path: path.optional(), sourceKind: z.string().min(1).max(128).optional(),
  areaId: id.optional(), cluster: id.optional(),
  timestamps: z.object({ authored: z.string().date().optional(), committed: z.string().datetime().optional() }).strict().optional(),
  metrics: z.object({ canonicality: z.number().min(0).max(1).optional(), centrality: z.number().min(0).max(1).optional(), degree: count }).strict(),
}).strict()
export const StudioEdgeV1Schema = z.object({
  id, from: id, to: id,
  kind: z.enum(['links-to', 'mentions', 'owns', 'cites', 'supersedes', 'changed-by', 'explains', 'imports', 're-exports', 'depends-on', 'covers']),
  sourceKind: z.string().min(1).max(128).optional(), weight: z.number().positive().max(1),
}).strict()
export const StudioFindingV1Schema = z.object({
  code: z.enum(['BROKEN_REFERENCE', 'AMBIGUOUS_REFERENCE', 'CHANGED_REFERENCE']), finding: FindingV1Schema,
}).strict()
export const StudioProposalV1Schema = z.object({
  id, kind: z.enum(['overlay', 'vault-diff']), targetIds: z.array(id).max(64),
  status: z.enum(['proposed', 'accepted', 'in-review', 'merged', 'rejected', 'stale', 'superseded']),
  label: z.string().min(1).max(1_024), evidenceHash: hash,
  prUrl: z.string().url().max(2_048).refine(value => /^https?:\/\//.test(value), 'Expected an HTTP(S) PR URL').optional(),
}).strict()
const truncation = z.object({ total: count, emitted: count, omitted: count }).strict().refine(value => value.total === value.emitted + value.omitted)
export const StudioGraphV1Schema = z.object({
  type: z.literal('studio-graph'), schemaVersion: z.literal(STUDIO_SCHEMA_VERSION),
  source: z.object({ project: z.string().min(1).max(128), indexHash: hash, indexHashAlgo: ContentHashAlgoSchema, revision: z.string().regex(/^[a-f0-9]{40,64}$/).optional() }).strict(),
  nodes: z.array(StudioNodeV1Schema).max(STUDIO_LIMITS.nodes), edges: z.array(StudioEdgeV1Schema).max(STUDIO_LIMITS.edges),
  findings: z.array(StudioFindingV1Schema).max(STUDIO_LIMITS.findings), proposals: z.array(StudioProposalV1Schema).max(STUDIO_LIMITS.proposals),
  coverage: z.object({ entities: z.enum(['enabled', 'disabled']), entityAnalysis: z.array(CoverageSchema).max(32), findings: z.enum(['supplied', 'not-analyzed']), proposals: z.enum(['supplied', 'not-analyzed']), limitations: z.array(z.string().min(1).max(1_024)).max(32) }).strict(),
  truncation: z.object({ nodes: truncation, documents: truncation, edges: truncation, findings: truncation, proposals: truncation }).strict(),
}).strict().superRefine((graph, context) => {
  const sizes = { nodes: graph.nodes.length, documents: graph.nodes.filter(node => node.kind === 'document' || node.kind === 'human-note').length, edges: graph.edges.length, findings: graph.findings.length, proposals: graph.proposals.length }
  for (const key of Object.keys(sizes) as (keyof typeof sizes)[]) if (graph.truncation[key].emitted !== sizes[key]) context.addIssue({ code: 'custom', message: 'Truncation count differs from emitted collection' })
  const categories = { BROKEN_REFERENCE: 'broken-reference', AMBIGUOUS_REFERENCE: 'ambiguous-reference', CHANGED_REFERENCE: 'changed-reference' }
  for (const item of graph.findings) if (item.finding.category !== categories[item.code]) context.addIssue({ code: 'custom', message: 'Reference code differs from finding category' })
  for (const collection of [graph.findings.map(item => item.finding), graph.proposals]) {
    if (new Set(collection.map(item => item.id)).size !== collection.length) context.addIssue({ code: 'custom', message: 'Duplicate inbox id' })
  }
  const ids = new Set(graph.nodes.map(node => node.id))
  if (ids.size !== graph.nodes.length) context.addIssue({ code: 'custom', message: 'Duplicate node id' })
  if (new Set(graph.edges.map(edge => edge.id)).size !== graph.edges.length) context.addIssue({ code: 'custom', message: 'Duplicate edge id' })
  for (const edge of graph.edges) if (!ids.has(edge.from) || !ids.has(edge.to)) context.addIssue({ code: 'custom', message: 'Dangling graph edge' })
  for (const node of graph.nodes) if ((node.areaId && !ids.has(node.areaId)) || (node.cluster && !ids.has(node.cluster))) context.addIssue({ code: 'custom', message: 'Dangling cluster or area' })
})
export const StudioSearchV1Schema = z.object({
  type: z.literal('studio-search'), schemaVersion: z.literal(1), indexHash: hash, query: z.string().max(1_024),
  results: z.array(z.object({ nodeId: id, label: z.string().min(1).max(256), score: z.number().finite(),
    why: z.object({ matched: z.record(z.string(), z.array(z.string()).max(64)), components: z.record(z.string(), z.number().finite()), surfacedBy: z.object({ kind: text, id }).strict().optional() }).strict().optional(),
  }).strict()).max(100),
}).strict()
export const StudioWhyV1Schema = z.object({
  type: z.literal('studio-why'), schemaVersion: z.literal(1), indexHash: hash, node: StudioNodeV1Schema,
  edges: z.array(StudioEdgeV1Schema).max(STUDIO_LIMITS.edges), findingIds: z.array(id).max(STUDIO_LIMITS.findings), proposalIds: z.array(id).max(STUDIO_LIMITS.proposals),
}).strict()
export type StudioGraphV1 = z.infer<typeof StudioGraphV1Schema>
export type StudioNodeV1 = z.infer<typeof StudioNodeV1Schema>
export type StudioEdgeV1 = z.infer<typeof StudioEdgeV1Schema>
export type StudioFindingV1 = z.infer<typeof StudioFindingV1Schema>
export type StudioProposalV1 = z.infer<typeof StudioProposalV1Schema>
export type StudioSearchV1 = z.infer<typeof StudioSearchV1Schema>
export type StudioWhyV1 = z.infer<typeof StudioWhyV1Schema>
export const StudioGraphV1JsonSchema = {
  ...z.toJSONSchema(StudioGraphV1Schema),
  $id: 'https://agentskit.io/schemas/doc-bridge/studio-graph-v1.schema.json',
  title: 'StudioGraph v1',
}
