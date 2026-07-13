import { z } from 'zod'

export const CONFIG_SCHEMA_VERSION = 1 as const

export const HumanCorpusPluginIdSchema = z.enum([
  'plain-markdown',
  'fumadocs',
  'docusaurus',
  'mkdocs',
  'vitepress',
  'custom',
])

export const AgentCorpusConfigSchema = z
  .object({
    root: z.string().min(1).max(512),
    index: z.string().min(1).max(512).optional(),
    include: z.array(z.string().min(1).max(256)).max(64).optional(),
    exclude: z.array(z.string().min(1).max(256)).max(64).optional(),
    okf: z
      .object({
        requireType: z.boolean().optional(),
        allowedTypes: z.array(z.string().min(1).max(128)).max(64).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const HumanCorpusConfigSchema = z
  .object({
    plugin: HumanCorpusPluginIdSchema,
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export const IndexConfigSchema = z
  .object({
    outFile: z.string().min(1).max(512).optional(),
    llmsTxt: z
      .object({
        enabled: z.boolean().optional(),
        outFile: z.string().min(1).max(512).optional(),
        preamble: z.string().max(4_000).optional(),
      })
      .strict()
      .optional(),
    capabilities: z
      .object({
        enabled: z.boolean().optional(),
        outFile: z.string().min(1).max(512).optional(),
      })
      .strict()
      .optional(),
    contentHash: z.literal('sha256-normalized-v1').optional(),
  })
  .strict()

export const OwnershipEntrySchema = z
  .object({
    path: z.string().min(1).max(512),
    group: z.string().min(1).max(128).optional(),
    layer: z.string().min(1).max(32).optional(),
    purpose: z.string().max(1024).optional(),
    checks: z.array(z.string().min(1).max(256)).max(32).optional(),
    agentDoc: z.string().min(1).max(512).optional(),
    humanDoc: z.string().min(1).max(512).optional(),
  })
  .strict()

export const RoutingConfigSchema = z
  .object({
    plugin: z
      .enum(['pnpm-monorepo', 'npm-workspaces', 'yarn-workspaces', 'pattern-files', 'custom'])
      .optional(),
    options: z
      .object({
        packages: z.array(z.string().min(1).max(256)).max(128).optional(),
        /** Infer ownership from corpus paths/frontmatter (default true). */
        ownershipFromCorpus: z.boolean().optional(),
        ownership: z.record(z.string().min(1).max(256), OwnershipEntrySchema).optional(),
        intents: z
          .array(
            z
              .object({
                id: z.string().min(1).max(128),
                title: z.string().min(1).max(256),
                paths: z.array(z.string().min(1).max(512)).max(32),
              })
              .strict(),
          )
          .max(128)
          .optional(),
        changes: z
          .array(
            z
              .object({
                id: z.string().min(1).max(128),
                title: z.string().min(1).max(256),
                startHere: z.string().min(1).max(512),
                relatedPackages: z.array(z.string().min(1).max(256)).max(32).optional(),
              })
              .strict(),
          )
          .max(128)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const GatesConfigSchema = z
  .object({
    /** minimal: freshness · standard: + human links · strict: + okf-type · playbook: freshness + okf soft style */
    preset: z.enum(['minimal', 'standard', 'strict', 'playbook']).optional(),
    include: z
      .array(
        z.enum([
          'index-freshness',
          'human-guide-links',
          'link-rot',
          'okf-type',
          'docs-style',
          'routing-currency',
          'bootstrap-size',
          'documentation-standard-v1',
        ]),
      )
      .max(16)
      .optional(),
    exclude: z
      .array(
        z.enum([
          'index-freshness',
          'human-guide-links',
          'link-rot',
          'okf-type',
          'docs-style',
          'routing-currency',
          'bootstrap-size',
          'documentation-standard-v1',
        ]),
      )
      .max(16)
      .optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export const SurfacesConfigSchema = z
  .object({
    cli: z
      .object({
        bin: z.string().min(1).max(64).optional(),
        defaultFormat: z.enum(['json', 'text']).optional(),
      })
      .strict()
      .optional(),
    mcp: z
      .object({
        enabled: z.boolean().optional(),
        tools: z
          .array(
            z.enum([
              'handoff.resolve',
              'doc.search',
              'doc.get',
              'gate.status',
              'playbook.pattern.get',
              'retriever.query',
              'memory.classify',
              'memory.promoteDraft',
              'registry.topology',
            ]),
          )
          .max(16)
          .optional(),
        transport: z.enum(['stdio', 'http']).optional(),
        http: z
          .object({
            port: z.number().int().min(1).max(65_535).optional(),
            path: z.string().min(1).max(256).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const IntelligenceConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    adapter: z
      .object({
        provider: z.enum(['openai', 'anthropic', 'ollama', 'openrouter', 'custom']),
        model: z.string().min(1).max(128).optional(),
        apiKeyEnv: z.string().min(0).max(128).optional(),
        baseUrl: z.string().url().optional(),
        options: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .optional(),
    chat: z
      .object({
        enabled: z.boolean().optional(),
        sources: z.array(z.enum(['agent', 'human', 'federation'])).max(8).optional(),
        handoffFirst: z.boolean().optional(),
      })
      .strict()
      .optional(),
    retriever: z
      .object({
        enabled: z.boolean().optional(),
        mode: z.enum(['local', 'remote', 'bm25', 'agentskit-rag']).optional(),
        embedModel: z.string().min(1).max(128).optional(),
        chunkSize: z.number().int().min(128).max(16_384).optional(),
        options: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .optional(),
    memory: z
      .object({
        enabled: z.boolean().optional(),
        adapters: z
          .array(z.enum(['playbook-memory', 'cursor-rules', 'session-export', 'bootstrap-delta']))
          .max(8)
          .optional(),
        ingestDir: z.string().min(1).max(512).optional(),
        classify: z.boolean().optional(),
        promote: z
          .object({
            enabled: z.boolean().optional(),
            targets: z.array(z.enum(['agent', 'human', 'agents-md'])).max(8).optional(),
            requireApproval: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    runtime: z.enum(['agentskit', 'custom']).optional(),
    runtimeModule: z.string().min(1).max(512).optional(),
  })
  .strict()

export const FederationConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    sources: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            llmsTxt: z.string().min(1).max(512).optional(),
            rawBaseUrl: z.string().url().optional(),
            includeInRetriever: z.boolean().optional(),
            includeInChat: z.boolean().optional(),
          })
          .strict(),
      )
      .max(16)
      .optional(),
  })
  .strict()

export const DocumentationEvidenceFileSchema = z
  .object({
    path: z.string().min(1).max(512),
    contains: z.array(z.string().min(1).max(512)).min(1).max(32),
  })
  .strict()

export const DocumentationLinkEvidenceSchema = z
  .object({
    url: z.string().url().max(512),
    paths: z.array(z.string().min(1).max(512)).min(1).max(32),
  })
  .strict()

export const DocumentationQuickstartEvidenceSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/).max(128),
    doc: z.string().min(1).max(512),
    test: z.string().min(1).max(512),
    command: z.string().min(1).max(512),
    testContains: z.array(z.string().min(1).max(256)).min(1).max(16),
  })
  .strict()

export const DocumentationStandardRuleIdSchema = z.enum([
  'human-docs',
  'llms-and-raw-source',
  'agent-handoffs',
  'contribution',
  'metadata',
  'cross-links',
  'tested-quickstarts',
  'visual-explanations',
  'structured-diagrams',
])

export const DocumentationStandardExceptionSchema = z
  .object({
    ruleId: DocumentationStandardRuleIdSchema,
    reason: z.string().min(10).max(1_024),
    approvedBy: z.string().min(1).max(256),
    trackingUrl: z.string().url().max(512),
  })
  .strict()

export const DocumentationStandardV1ConfigSchema = z
  .object({
    rawSources: z.array(z.string().min(1).max(512)).max(64).optional(),
    contributionPaths: z.array(z.string().min(1).max(512)).max(16).optional(),
    metadata: z.array(DocumentationEvidenceFileSchema).max(32).optional(),
    links: z.array(DocumentationLinkEvidenceSchema).max(64).optional(),
    quickstarts: z.array(DocumentationQuickstartEvidenceSchema).max(32).optional(),
    visuals: z.array(z.string().min(1).max(512)).max(64).optional(),
    diagrams: z.array(DocumentationEvidenceFileSchema).max(32).optional(),
    exceptions: z.array(DocumentationStandardExceptionSchema).max(32).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>()
    for (const [index, exception] of (value.exceptions ?? []).entries()) {
      if (seen.has(exception.ruleId)) {
        context.addIssue({
          code: 'custom',
          path: ['exceptions', index, 'ruleId'],
          message: `Duplicate exception for rule ${exception.ruleId}`,
        })
      }
      seen.add(exception.ruleId)
    }
  })

export const ConformanceConfigSchema = z
  .object({
    documentationStandardV1: DocumentationStandardV1ConfigSchema.optional(),
  })
  .strict()

export const DocBridgeConfigV1Schema = z
  .object({
    schemaVersion: z.literal(CONFIG_SCHEMA_VERSION),
    project: z
      .object({
        name: z.string().min(1).max(128).optional(),
        root: z.string().min(1).max(512).optional(),
      })
      .strict()
      .optional(),
    corpus: z
      .object({
        agent: AgentCorpusConfigSchema,
        human: z.union([HumanCorpusConfigSchema, z.array(HumanCorpusConfigSchema).max(8)]).optional(),
      })
      .strict(),
    index: IndexConfigSchema.optional(),
    routing: RoutingConfigSchema.optional(),
    gates: GatesConfigSchema.optional(),
    surfaces: SurfacesConfigSchema.optional(),
    intelligence: IntelligenceConfigSchema.optional(),
    federation: FederationConfigSchema.optional(),
    conformance: ConformanceConfigSchema.optional(),
  })
  .strict()

export type DocBridgeConfigV1 = z.infer<typeof DocBridgeConfigV1Schema>
export type AgentCorpusConfig = z.infer<typeof AgentCorpusConfigSchema>
export type HumanCorpusConfig = z.infer<typeof HumanCorpusConfigSchema>
export type DocumentationStandardV1Config = z.infer<typeof DocumentationStandardV1ConfigSchema>
export type DocumentationStandardRuleId = z.infer<typeof DocumentationStandardRuleIdSchema>
