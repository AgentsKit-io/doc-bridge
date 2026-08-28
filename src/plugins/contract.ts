import { z } from 'zod'

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
