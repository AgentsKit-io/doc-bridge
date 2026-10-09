import { z } from 'zod'
import { applyBudget } from '../budget/sections.js'
import { isServiceProfile } from '../execution/profile.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { KnowledgeEntityV1Schema, MemoryEntityRelationV1Schema } from '../schemas/knowledge-entity.js'
import { CoverageSchema } from '../schemas/knowledge.js'
import { BudgetReportSchema } from '../schemas/budget.js'

export const KnowledgeWhyRequestSchema = z.object({
  target: z.string().trim().min(1).max(512),
  kind: z.enum(['decision', 'concept', 'change']).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  budgetTokens: z.number().int().min(1).max(1_000_000).optional(),
}).strict()
export const KnowledgeWhyResponseV1Schema = z.object({
  type: z.literal('knowledge-why'), schemaVersion: z.literal(1),
  source: z.string().regex(/^index:[a-f0-9]{64}$/), target: z.string().min(1).max(512), enabled: z.boolean(), guidance: z.string().max(512).optional(),
  entities: z.array(KnowledgeEntityV1Schema).max(100),
  documents: z.array(z.object({ id: z.string(), path: z.string(), contentHash: z.string(), context: z.string() }).strict()).max(100),
  memoryRelations: z.array(MemoryEntityRelationV1Schema).max(100).optional(),
  coverage: z.array(CoverageSchema), truncated: z.boolean(), budget: BudgetReportSchema.optional(),
}).strict()
export type KnowledgeWhyRequest = z.input<typeof KnowledgeWhyRequestSchema>
export type KnowledgeWhyResponse = z.infer<typeof KnowledgeWhyResponseV1Schema>

/** Exact indexed observations only; unresolved names never select a fuzzy owner. */
export const knowledgeWhy = (index: DocBridgeIndexV1, input: KnowledgeWhyRequest, service = false): KnowledgeWhyResponse => {
  const request = KnowledgeWhyRequestSchema.parse(input)
  const section = index.knowledgeEntities
  const restricted = service || isServiceProfile(index)
  const historyCoverage = { analyzer: 'knowledge-query', scope: 'git:first-parent', status: 'not-analyzed' as const, reason: 'History unavailable in stored/service queries; no local git reads.' }
  const base = { type: 'knowledge-why' as const, schemaVersion: 1 as const, source: `index:${index.contentHash}`, target: request.target }
  if (!section) {
    const response: KnowledgeWhyResponse = { ...base, enabled: false, guidance: 'Enable index.knowledgeEntities.enabled: true, then run ak-docs index with the default semantic hash. Service configuration disables entity extraction; supply an entity-enabled stored index through injected reads.', entities: [], documents: [], coverage: restricted ? [historyCoverage] : [], truncated: false }
    if (request.budgetTokens === undefined) return response
    const result = applyBudget(response, [], request.budgetTokens)
    return { ...result.payload, budget: result.budget }
  }
  const entries = index.projection?.entries ?? []
  const observed = section.entities.filter(entity => !restricted || !entity.evidence.some(item => item.kind === 'commit'))
  const direct = observed.filter(entity => entity.id === request.target || entity.name === request.target || entity.aliases.includes(request.target))
  const keys = new Set([request.target, ...entries.filter(entry => entry.id === request.target || entry.path === request.target || entry.symbols?.includes(request.target)).map(entry => entry.id)])
  for (const entity of direct) for (const evidence of entity.evidence) if (evidence.kind === 'document-region') keys.add(evidence.path)
  for (const entity of direct) for (const link of entity.links) if (['defines-symbol', 'affected-fact', 'affected-path'].includes(link.kind)) keys.add(link.target)
  const matching = observed.filter(entity => direct.includes(entity) || entity.links.some(link => ['affected-path', 'affected-fact', 'defines-symbol'].includes(link.kind) && (keys.has(link.target) || link.symbol === request.target)))
    .filter(entity => !request.kind || entity.kind === request.kind)
    .sort((a, b) => a.id.localeCompare(b.id))
  const entities = matching.slice(0, request.limit)
  const entityIds = new Set(entities.map(entity => entity.id))
  const matchingMemory = (section.memoryRelations ?? []).filter(relation => entityIds.has(relation.target))
    .sort((a, b) => a.target.localeCompare(b.target) || a.candidateId.localeCompare(b.candidateId) || a.evidence.kind.localeCompare(b.evidence.kind) || a.evidence.value.localeCompare(b.evidence.value) || (a.evidence.rawPath ?? '').localeCompare(b.evidence.rawPath ?? '') || a.evidence.factHash.localeCompare(b.evidence.factHash))
  const memoryRelations = matchingMemory.slice(0, request.limit)
  const targetEntries = entries.filter(entry => keys.has(entry.id) || keys.has(entry.path))
  const documentIds = new Set(targetEntries.flatMap(entry => [...entry.graph.coveredBy, ...entry.graph.mentionedBy]))
  const documents = entries.filter(entry => entry.kind === 'document' && documentIds.has(entry.id)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, request.limit)
    .map(entry => ({ id: entry.id, path: entry.path, contentHash: entry.contentHash, context: `Indexed citation via ${targetEntries.filter(target => target.graph.coveredBy.includes(entry.id) || target.graph.mentionedBy.includes(entry.id)).map(target => target.path).sort().join(', ')}` }))
  const coverage = restricted ? [...section.coverage.filter(item => item.scope !== 'git:first-parent'), historyCoverage] : section.coverage
  const response: KnowledgeWhyResponse = { ...base, enabled: true, entities, documents, ...(memoryRelations.length ? { memoryRelations } : {}), coverage, truncated: matchingMemory.length > memoryRelations.length || matching.length > entities.length || documentIds.size > documents.length }
  if (request.budgetTokens === undefined) return response
  const result = applyBudget(response, [], request.budgetTokens)
  return { ...result.payload, budget: result.budget }
}

export const formatKnowledgeWhyText = (response: KnowledgeWhyResponse): string => [
  `Why: ${response.target}`, response.guidance ?? '',
  ...(response.budget ? [`Budget: ${response.budget.tokens.total}/${response.budget.budgetTokens} tokens (${response.budget.tokenMethod}), fits: ${response.budget.fits ? 'yes' : 'no'}`] : []),
  ...response.entities.map(entity => `${entity.kind} ${entity.id}: ${entity.name}${entity.status ? ` [${entity.status}]` : ''}\n${JSON.stringify({ aliases: entity.aliases, links: entity.links, evidence: entity.evidence })}`),
  ...(response.memoryRelations ?? []).map(relation => `memory-supports ${relation.candidateId} → ${relation.target}: ${JSON.stringify(relation.evidence)}`),
  ...response.documents.map(document => `Cited by ${document.path}: ${JSON.stringify(document)}`),
  ...response.coverage.map(item => `${item.scope}: ${item.status}${item.reason ? ` — ${item.reason}` : ''}`),
  ...(response.truncated ? ['Results truncated; refine the target or increase the limit.'] : []),
].filter(Boolean).join('\n')
