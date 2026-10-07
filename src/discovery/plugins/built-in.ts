import { replayableRelations, type PriorFile } from '../incremental.js'
import { resolve } from 'node:path'
import type { DiscoveryPluginInputV2, DiscoveryPluginManifestV2, ExtractionV2 } from '../../plugins/contract.js'
import { DocBridgeConfigV1Schema } from '../../config/schema.js'
import type { KnowledgeEntity, KnowledgeRelation } from '../../schemas/knowledge.js'
import { preloadScan } from '../preload.js'

export const builtInManifest = (id: 'js-ts' | 'markdown', version: string, patterns: string[]): DiscoveryPluginManifestV2 => ({
  contractVersion: 2, id, version, knowledgeSchemaVersion: 1, pipelineMajor: 1,
  languages: id === 'js-ts' ? ['javascript', 'typescript'] : ['markdown'],
  capabilities: id === 'js-ts' ? ['manifest', 'symbols'] : ['markdown'],
  inputPatterns: patterns,
  unsupportedConstructs: id === 'js-ts' ? ['non-literal dynamic imports', 'non-static runtime wiring', 'configuration outside the partition'] : ['runtime MDX expressions'],
  resourceLimits: { maxFiles: 100_000, maxBytes: 512 * 1024 * 1024, maxFileBytes: 64 * 1024 * 1024, maxTimeMs: 60_000, maxMemoryMb: 2048 },
})

export const pluginScan = async (input: DiscoveryPluginInputV2) => {
  const root = resolve('repository')
  const opts = { root, ...(Object.keys(input.configuration).length ? { config: DocBridgeConfigV1Schema.parse(input.configuration) } : {}) }
  return { root, opts, io: await preloadScan(input.read, input.signal, root) }
}

export const extractionGraph = (initial: readonly KnowledgeEntity[] = [], initialRelations: readonly KnowledgeRelation[] = []) => {
  const entities = new Map(initial.map(entity => [entity.id, entity]))
  const relations = new Map(initialRelations.map(relation => [relation.id, relation]))
  const addEntity = (entity: KnowledgeEntity): void => {
    const existing = entities.get(entity.id)
    if (existing && (existing.kind !== entity.kind || existing.path !== entity.path)) throw new Error(`Entity identity collision for "${entity.id}".`)
    entities.set(entity.id, existing ?? entity)
  }
  const addRelation = (relation: KnowledgeRelation): void => {
    const existing = relations.get(relation.id)
    if (!existing) { relations.set(relation.id, relation); return }
    const evidence = new Map([...existing.evidence, ...relation.evidence].map(item => [`${item.path}:${item.lineStart ?? ''}:${item.lineEnd ?? ''}:${item.source}`, item]))
    relations.set(relation.id, { ...existing, evidence: [...evidence.values()] })
  }
  return { entities, relations, addEntity, addRelation }
}

export const extractionOutput = (graph: ReturnType<typeof extractionGraph>, coverage: ExtractionV2['coverage'], input?: DiscoveryPluginInputV2): ExtractionV2 => ({
  entities: [...graph.entities.values()].filter(entity => !input?.resolution.entities.some(existing => existing.id === entity.id)).sort((a,b) => a.id.localeCompare(b.id)),
  relations: [...graph.relations.values()].filter(relation => !input?.resolution.relations.some(existing => existing.id === relation.id)).sort((a,b) => a.id.localeCompare(b.id)),
  facts: [], packages: [], diagnostics: [], coverage,
})

export const createReplayRelations = ({ entities, relations, addEntity, addRelation }: ReturnType<typeof extractionGraph>, plannedIds: ReadonlySet<string>) => {
  const willExist = (id: string): boolean => entities.has(id) || plannedIds.has(id)
  const replayRelations = (prior: PriorFile): readonly KnowledgeRelation[] => {
    const replay = replayableRelations(prior.outgoing, willExist)
    for (const id of replay.missingEndpoints) {
      if (entities.has(id)) continue
      const relation = prior.outgoing.find((item) => item.to === id)
      addEntity({
        id,
        kind: id.startsWith('external:') ? 'external' : 'unresolved-reference',
        name: id.replace(/^(?:external|unresolved):/, ''),
        provenance: 'observed',
        evidence: relation?.evidence[0] ? [relation.evidence[0]] : [],
      })
    }
    for (const relation of replay.relations) addRelation(relation)
    return replay.relations
  }
  return replayRelations
}
