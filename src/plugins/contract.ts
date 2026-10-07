import { z } from 'zod'
import { EvidenceSchema, type Evidence } from '../schemas/knowledge.js'
import { PartitionSchema, StorageLimitsSchema, StoragePathSchema, type RepositoryReadV1, type StorageLimits } from '../storage/contract.js'
import { PackageFactSchema, SurfaceFactSchema, surfaceFactToEntity, type PackageFact } from '../storage/facts.js'
import { contentRef, StorageLedger } from '../storage/local.js'
import { markdownContentHash } from '../discovery/markdown.js'
import { canonicalJsonV1 } from '../index-builder/content-hash.js'

import { CoverageSchema, DiagnosticSchema, EntitySchema, RelationSchema, type Coverage, type KnowledgeDiagnostic, type KnowledgeEntity, type KnowledgeRelation } from '../schemas/knowledge.js'

export const ANALYZER_PLUGIN_CONTRACT_VERSION = 1 as const

export const AnalyzerPluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/).max(128),
  version: z.string().min(1).max(64),
  languages: z.array(z.string().min(1).max(64)).min(1).max(32),
  frameworks: z.array(z.string().min(1).max(128)).max(32).default([]),
  capabilities: z.array(z.string().min(1).max(128)).min(1).max(32),
  knowledgeSchemaVersion: z.literal(1),
  compatibility: z.object({ pipelineMajor: z.number().int().nonnegative() }).strict(),
  unsupportedConstructs: z.array(z.string().min(1).max(256)).max(128).default([]),
  resourceLimits: z.object({ maxFiles: z.number().int().positive().optional(), maxBytes: z.number().int().positive().optional() }).strict().default({}),
}).strict()

export type AnalyzerPluginManifest = z.infer<typeof AnalyzerPluginManifestSchema>

export const AnalyzerPluginOutputSchema = z.object({
  entities: z.array(EntitySchema).max(50_000).default([]),
  relations: z.array(RelationSchema).max(100_000).default([]),
  coverage: z.array(CoverageSchema).max(1_000).default([]),
  diagnostics: z.array(DiagnosticSchema).max(100_000).default([]),
}).strict()

export type AnalyzerPluginOutput = z.infer<typeof AnalyzerPluginOutputSchema>

export type AnalyzerPluginInput = {
  readonly language: string
  readonly framework?: string
  readonly files: readonly { readonly path: string; readonly bytes: number }[]
  readonly value?: unknown
}

export type AnalyzerPlugin = {
  readonly manifest: AnalyzerPluginManifest
  readonly analyze: (input: AnalyzerPluginInput) => Promise<unknown> | unknown
}

export type AnalyzerRegistry = {
  readonly register: (plugin: AnalyzerPlugin) => void
  readonly list: () => readonly AnalyzerPluginManifest[]
  readonly analyze: (id: string, input: AnalyzerPluginInput) => Promise<AnalyzerPluginOutput>
}

const pipelineMajor = (version: string): number => Number.parseInt(version.split('.')[0] ?? '', 10)

export const createAnalyzerRegistry = (options: { readonly pipelineVersion?: string; readonly maxPlugins?: number } = {}): AnalyzerRegistry => {
  const plugins = new Map<string, AnalyzerPlugin>()
  const pipeline = pipelineMajor(options.pipelineVersion ?? '1.0.0')
  return {
    register(plugin) {
      const manifest = AnalyzerPluginManifestSchema.parse(plugin.manifest)
      if (manifest.compatibility.pipelineMajor !== pipeline) throw new Error(`Analyzer plugin "${manifest.id}" requires pipeline major ${manifest.compatibility.pipelineMajor}; current pipeline is ${pipeline}.`)
      if (plugins.has(manifest.id)) throw new Error(`Analyzer plugin "${manifest.id}" is already registered.`)
      if (options.maxPlugins !== undefined && plugins.size >= options.maxPlugins) throw new Error(`Analyzer plugin limit ${options.maxPlugins} exceeded.`)
      plugins.set(manifest.id, { ...plugin, manifest })
    },
    list() {
      return [...plugins.values()].map((plugin) => plugin.manifest).sort((a, b) => a.id.localeCompare(b.id))
    },
    async analyze(id, input) {
      const plugin = plugins.get(id)
      if (!plugin) throw new Error(`Analyzer plugin "${id}" is not registered.`)
      const { maxFiles, maxBytes } = plugin.manifest.resourceLimits
      const bytes = input.files.reduce((total, file) => total + file.bytes, 0)
      if (maxFiles !== undefined && input.files.length > maxFiles) throw new Error(`Analyzer plugin "${id}" file limit ${maxFiles} exceeded.`)
      if (maxBytes !== undefined && bytes > maxBytes) throw new Error(`Analyzer plugin "${id}" byte limit ${maxBytes} exceeded.`)
      try {
        const output = AnalyzerPluginOutputSchema.parse(await plugin.analyze(input))
        return {
          ...output,
          coverage: output.coverage.map((entry) => ({ ...entry, analyzer: plugin.manifest.id, analyzerVersion: plugin.manifest.version })),
        }
      } catch (error) {
        return {
          entities: [],
          relations: [],
          diagnostics: [],
          coverage: [{ analyzer: plugin.manifest.id, analyzerVersion: plugin.manifest.version, scope: 'plugin', status: 'not-analyzed', reason: `Plugin failed safely: ${error instanceof Error ? error.message : String(error)}` }],
        }
      }
    },
  }
}

export type { Coverage, KnowledgeDiagnostic, KnowledgeEntity, KnowledgeRelation }

// V2 is additive: the v1 schemas/registry above retain their exact behavior.
export const DISCOVERY_PLUGIN_CONTRACT_VERSION = 2 as const
export const DiscoveryCapabilitySchema = z.enum(['manifest', 'lockfile', 'release-map', 'versions', 'symbols', 'cli-commands', 'cli-flags', 'config-keys', 'signatures', 'markdown'])
export const DiscoveryPluginManifestV2Schema = z.object({
  contractVersion: z.literal(2), id: z.string().regex(/^[a-z][a-z0-9-]*$/).max(128), version: z.string().min(1).max(64),
  knowledgeSchemaVersion: z.literal(1), pipelineMajor: z.number().int().nonnegative(),
  languages: z.array(z.string().min(1).max(64)).min(1).max(32), capabilities: z.array(DiscoveryCapabilitySchema).min(1).max(32),
  inputPatterns: z.array(z.string().min(1).max(512)).min(1).max(128), unsupportedConstructs: z.array(z.string().min(1).max(256)).max(128), resourceLimits: StorageLimitsSchema,
}).strict().refine(value => new Set(value.capabilities).size === value.capabilities.length, 'Duplicate capabilities')
export type DiscoveryPluginManifestV2 = Readonly<z.infer<typeof DiscoveryPluginManifestV2Schema>>
export const DiscoveryPluginOutputV2Schema = z.object({
  entities: z.array(EntitySchema).max(50_000), relations: z.array(RelationSchema).max(100_000),
  facts: z.array(SurfaceFactSchema).max(50_000), packages: z.array(PackageFactSchema).max(10_000),
  coverage: z.array(CoverageSchema).max(1_000), diagnostics: z.array(DiagnosticSchema).max(100_000),
}).strict()
export type ExtractionV2 = Readonly<z.infer<typeof DiscoveryPluginOutputV2Schema>>
const RepositoryCapabilitySchema = z.custom<RepositoryReadV1>(value => {
  if (!value || typeof value !== 'object') return false
  const read = value as RepositoryReadV1
  return read.version === 1 && PartitionSchema.safeParse(read.partition).success && StorageLimitsSchema.safeParse(read.limits).success && ['read','list','stat'].every(key => typeof read[key as 'read' | 'list' | 'stat'] === 'function')
}, 'Invalid repository capability')
export const DiscoveryPluginInputV2Schema = z.object({
  read: RepositoryCapabilitySchema, signal: z.instanceof(AbortSignal), configuration: z.record(z.string().max(128), z.unknown()),
  previous: DiscoveryPluginOutputV2Schema.optional(), resolution: z.object({ entities: z.array(EntitySchema).max(50_000), relations: z.array(RelationSchema).max(100_000) }).strict(),
}).strict()
export type DiscoveryPluginInputV2 = Readonly<z.infer<typeof DiscoveryPluginInputV2Schema>>
export const ReleaseEventSchema = z.object({ eventId: z.string().min(1).max(256), tag: z.string().min(1).max(256), revision: z.string().min(1).max(256), evidence: z.array(EvidenceSchema).max(64) }).strict()
export type ReleaseEvent = Readonly<z.infer<typeof ReleaseEventSchema>>
export const resolutionSchema = <T extends z.ZodType>(value: T) => z.union([
  z.object({ status: z.literal('resolved'), value, evidence: z.array(EvidenceSchema).max(64) }).strict(),
  z.object({ status: z.enum(['unresolved', 'ambiguous', 'unsupported']), reason: z.string().min(1).max(256), evidence: z.array(EvidenceSchema).max(64) }).strict(),
])
export type Resolution<T> = Readonly<{ status: 'resolved'; value: T; evidence: readonly Evidence[] }> | Readonly<{ status: 'unresolved' | 'ambiguous' | 'unsupported'; reason: string; evidence: readonly Evidence[] }>
export interface DiscoveryPluginV2 {
  readonly manifest: DiscoveryPluginManifestV2
  discover(input: DiscoveryPluginInputV2): Promise<unknown>
  normalizeRange?(purl: string, value: string): Resolution<string>
  normalizeVersion?(purl: string, value: string): Resolution<string>
  compareVersions?(purl: string, left: string, right: string): Resolution<-1 | 0 | 1>
  satisfiesRange?(purl: string, version: string, versRange: string): Resolution<boolean>
  mapRelease?(input: Readonly<{ event: ReleaseEvent; packages: readonly PackageFact[]; read: RepositoryReadV1; signal: AbortSignal }>): Promise<Resolution<readonly { purl: string; version: string }[]>>
}
export interface DiscoveryRegistryV2 {
  register(plugin: DiscoveryPluginV2): void
  list(): readonly DiscoveryPluginManifestV2[]
  discover(id: string, input: DiscoveryPluginInputV2): Promise<ExtractionV2>
}
const freezePluginData = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezePluginData); Object.freeze(value)
  }
  return value
}
const emptyV2 = (manifest: DiscoveryPluginManifestV2, reason: string): ExtractionV2 => ({ entities: [], relations: [], facts: [], packages: [], diagnostics: [], coverage: [{ analyzer: manifest.id, analyzerVersion: manifest.version, scope: 'plugin', status: 'not-analyzed', reason }] })
export const createDiscoveryRegistryV2 = (options: { readonly pipelineVersion?: string; readonly maxPlugins?: number; readonly builtIns?: readonly { readonly plugin: DiscoveryPluginV2; readonly analyzerVersions: Readonly<Record<string, string>> }[] } = {}): DiscoveryRegistryV2 => {
  const plugins = new Map<string, DiscoveryPluginV2>()
  const pipeline = pipelineMajor(options.pipelineVersion ?? '1.0.0')
  const builtIns = new Map<string, Readonly<Record<string, string>>>()
  return {
    register(plugin) {
      const manifest = DiscoveryPluginManifestV2Schema.parse(plugin.manifest)
      if (manifest.pipelineMajor !== pipeline) throw new Error('INCOMPATIBLE_PIPELINE')
      if (plugins.has(manifest.id)) throw new Error('DUPLICATE_PLUGIN')
      if (plugins.size >= (options.maxPlugins ?? 128)) throw new Error('PLUGIN_LIMIT')
      if (typeof plugin.discover !== 'function') throw new Error('INVALID_PLUGIN')
      if (manifest.capabilities.includes('versions') && (!plugin.normalizeVersion || !plugin.compareVersions || !plugin.satisfiesRange)) throw new Error('MISSING_VERSION_CAPABILITY')
      if (manifest.capabilities.includes('release-map') && !plugin.mapRelease) throw new Error('MISSING_RELEASE_CAPABILITY')
      Object.freeze(manifest.languages); Object.freeze(manifest.capabilities); Object.freeze(manifest.inputPatterns); Object.freeze(manifest.unsupportedConstructs); Object.freeze(manifest.resourceLimits); Object.freeze(manifest)
      const policy = options.builtIns?.find(entry => entry.plugin === plugin)
      if (policy) builtIns.set(manifest.id, Object.freeze({ ...policy.analyzerVersions }))
      plugins.set(manifest.id, { manifest, discover: plugin.discover.bind(plugin), ...(plugin.normalizeRange ? { normalizeRange: plugin.normalizeRange.bind(plugin) } : {}), ...(plugin.normalizeVersion ? { normalizeVersion: plugin.normalizeVersion.bind(plugin) } : {}), ...(plugin.compareVersions ? { compareVersions: plugin.compareVersions.bind(plugin) } : {}), ...(plugin.satisfiesRange ? { satisfiesRange: plugin.satisfiesRange.bind(plugin) } : {}), ...(plugin.mapRelease ? { mapRelease: plugin.mapRelease.bind(plugin) } : {}) })
    },
    list() { return [...plugins.values()].map(plugin => plugin.manifest).sort((a,b) => a.id.localeCompare(b.id)) },
    async discover(id, rawInput) {
      const plugin = plugins.get(id)
      if (!plugin) throw new Error('PLUGIN_NOT_REGISTERED')
      const input = DiscoveryPluginInputV2Schema.parse(rawInput)
      // Fail before execution unless caller supplied the stricter capability intersection.
      for (const key of Object.keys(input.read.limits) as (keyof StorageLimits)[]) {
        if (input.read.limits[key] > plugin.manifest.resourceLimits[key]) throw new Error('INCOMPATIBLE_RESOURCE_LIMITS')
      }
      if (Buffer.byteLength(canonicalJsonV1(input.configuration)) > input.read.limits.maxBytes) throw new Error('CONFIGURATION_LIMIT')
      freezePluginData(input.configuration); freezePluginData(input.resolution); if (input.previous) freezePluginData(input.previous)
      const abort = new AbortController()
      const signal = AbortSignal.any([input.signal, abort.signal])
      const ledger = new StorageLedger(input.read.partition, input.read.limits)
      const issued = new Map<string, { hash: string; documentationHash: string; lines: number }>()
      const reader: RepositoryReadV1 = Object.freeze({ version: 1, partition: Object.freeze({ ...input.read.partition }), limits: Object.freeze({ ...input.read.limits }),
        async read(request: Parameters<RepositoryReadV1['read']>[0]) {
          const bound = { ...request, signal }; ledger.check(bound)
          const result = await input.read.read(bound)
          ledger.check(bound)
          if (result.status === 'ok') {
            ledger.charge(bound, result.value.bytes.length)
            if (contentRef(result.value.bytes).hash !== result.value.content.hash) throw new Error('INVALID_READ_EVIDENCE')
            issued.set(request.path, { hash: result.value.content.hash, documentationHash: markdownContentHash(Buffer.from(result.value.bytes).toString('utf8')), lines: Buffer.from(result.value.bytes).toString('utf8').split(/\r?\n/).length })
          }
          return result
        },
        async list(request: Parameters<RepositoryReadV1['list']>[0]) { const bound = { ...request, signal }; ledger.check(bound); const result = await input.read.list(bound); ledger.check(bound); return result },
        async stat(request: Parameters<RepositoryReadV1['stat']>[0]) { const bound = { ...request, signal }; ledger.check(bound); const result = await input.read.stat(bound); ledger.check(bound); return result },
      })
      let timer: ReturnType<typeof setTimeout> | undefined
      let onAbort: (() => void) | undefined
      try {
        ledger.check({ partition: reader.partition, signal })
        const timedOut = new Promise<never>((_, reject) => {
          onAbort = () => reject(new Error('PLUGIN_CANCELLED_OR_TIMEOUT'))
          signal.addEventListener('abort', onAbort, { once: true })
          timer = setTimeout(() => abort.abort(), input.read.limits.maxTimeMs)
        })
        const output = await Promise.race([plugin.discover({ ...input, read: reader, signal }), timedOut])
        ledger.check({ partition: reader.partition, signal })
        if (Buffer.byteLength(canonicalJsonV1(output)) > Math.min(input.read.limits.maxBytes, input.read.limits.maxMemoryMb * 1024 * 1024)) throw new Error('OUTPUT_LIMIT')
        const parsed = DiscoveryPluginOutputV2Schema.parse(output)
        const entities = new Map(input.resolution.entities.map(entity => [entity.id, entity]))
        if (entities.size !== input.resolution.entities.length) throw new Error('DUPLICATE_OWNER')
        const ids = new Set<string>()
        const unique = (id: string) => { if (ids.has(id)) throw new Error('DUPLICATE_OUTPUT'); ids.add(id) }
        for (const entity of parsed.entities) { unique(entity.id); if (entities.has(entity.id)) throw new Error('DUPLICATE_OWNER'); entities.set(entity.id, entity) }
        ids.clear()
        for (const relation of parsed.relations) { unique(relation.id); if (!entities.has(relation.from) || !entities.has(relation.to)) throw new Error('INVALID_ENDPOINT') }
        ids.clear()
        for (const fact of parsed.facts) { unique(fact.id); if (!entities.has(fact.ownerId)) throw new Error('INVALID_OWNER'); surfaceFactToEntity(fact) }
        ids.clear()
        for (const pkg of parsed.packages) { unique(pkg.id); if (entities.has(pkg.id) && entities.get(pkg.id)?.kind !== 'package') throw new Error('INVALID_OWNER') }
        const evidence = [...parsed.entities, ...parsed.relations, ...parsed.facts, ...parsed.packages, ...parsed.coverage, ...parsed.diagnostics].flatMap(item => item.evidence ?? [])
        if (evidence.length > 100_000) throw new Error('EVIDENCE_LIMIT')
        const componentVersions = builtIns.get(id)
        const inventoryPaths = new Set<string>(['.'])
        for (const path of issued.keys()) {
          inventoryPaths.add(path)
          const parts = path.split('/')
          for (let length = 1; length < parts.length; length++) inventoryPaths.add(parts.slice(0, length).join('/'))
        }
        for (const item of evidence) {
          const proof = issued.get(item.path)
          const validPath = StoragePathSchema.safeParse(item.path).success || (componentVersions && item.path === '.')
          const validHash = componentVersions && item.contentHash === undefined ? inventoryPaths.has(item.path) : proof && item.contentHash === (componentVersions && item.source === 'documentation' ? proof.documentationHash : proof.hash)
          if (!validPath || !validHash || (proof && (item.lineEnd ?? item.lineStart ?? 1) > proof.lines) || (!proof && (item.lineStart !== undefined || item.lineEnd !== undefined))) throw new Error('INVALID_EVIDENCE')
        }
        for (const entity of parsed.entities) if (entity.path && !(componentVersions ? inventoryPaths.has(entity.path) : issued.has(entity.path))) throw new Error('INVALID_EVIDENCE')
        const capabilityFor = { symbol: 'symbols', 'cli-command': 'cli-commands', 'cli-flag': 'cli-flags', 'config-key': 'config-keys', signature: 'signatures' } as const
        for (const fact of parsed.facts) if (!plugin.manifest.capabilities.includes(capabilityFor[fact.kind])) throw new Error('UNDECLARED_CAPABILITY')
        if (parsed.packages.length && !plugin.manifest.capabilities.includes('manifest') && !plugin.manifest.capabilities.includes('lockfile')) throw new Error('UNDECLARED_CAPABILITY')
        const coverage = parsed.coverage.map(entry => {
          if (!componentVersions) return { ...entry, analyzer: plugin.manifest.id, analyzerVersion: plugin.manifest.version }
          const version = componentVersions[entry.analyzer]
          if (!version || (entry.analyzerVersion !== undefined && entry.analyzerVersion !== version)) throw new Error('INVALID_COMPONENT_ATTRIBUTION')
          return { ...entry, analyzerVersion: version }
        })
        if (!componentVersions) for (const capability of DiscoveryCapabilitySchema.options) if (!plugin.manifest.capabilities.includes(capability)) coverage.push({ analyzer: plugin.manifest.id, analyzerVersion: plugin.manifest.version, scope: capability, status: 'not-analyzed', reason: 'UNSUPPORTED_CAPABILITY' })
        if (!componentVersions) for (const capability of plugin.manifest.capabilities) if (!coverage.some(entry => entry.scope === capability)) coverage.push({ analyzer: plugin.manifest.id, analyzerVersion: plugin.manifest.version, scope: capability, status: 'not-analyzed', reason: 'MISSING_CAPABILITY_COVERAGE' })
        for (const items of [parsed.entities, parsed.relations, parsed.facts, parsed.packages, parsed.diagnostics]) items.sort((a,b) => a.id.localeCompare(b.id))
        if (!componentVersions) coverage.sort((a,b) => canonicalJsonV1(a).localeCompare(canonicalJsonV1(b)))
        return { ...parsed, coverage }
      } catch { return emptyV2(plugin.manifest, signal.aborted ? 'PLUGIN_CANCELLED_OR_TIMEOUT' : 'PLUGIN_FAILED') }
      finally { if (timer) clearTimeout(timer); if (onAbort) signal.removeEventListener('abort', onAbort); abort.abort() }
    },
  }
}
