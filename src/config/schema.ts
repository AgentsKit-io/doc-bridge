import { z } from 'zod'

export const CONFIG_SCHEMA_VERSION = 1 as const

export const HumanCorpusPluginIdSchema = z.enum([
  'plain-markdown',
  'fumadocs',
  'docusaurus',
  'mkdocs',
  'vitepress',
  'starlight',
  'nextra',
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
        urlPrefix: z.string().url().optional(),
        pathPrefix: z.string().min(1).max(512).optional(),
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
      .enum(['pnpm-monorepo', 'npm-workspaces', 'yarn-workspaces', 'nx', 'pattern-files', 'custom'])
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

export const RuleIdSchema = z.enum([
  'documentation-quality',
  'graph-undocumented-relation',
  'declared-unobserved-relation',
  'unresolved-reference',
  'conflicting-declaration',
  'not-analyzed-coverage',
  'stale-documentation',
  'centrality-risk',
  'critical-path-risk',
  'freshness',
  'ownership',
])

export const RuleSeveritySchema = z.enum(['off', 'info', 'warn', 'error'])

export const RulesConfigSchema = z
  .object({
    mode: z.enum(['default', 'recommended', 'strict']).optional(),
    severity: z.record(RuleIdSchema, RuleSeveritySchema).optional(),
    ignore: z.array(RuleIdSchema).max(128).optional(),
    criticalEntities: z.array(z.string().min(1).max(256)).max(128).optional(),
    criticalPaths: z.array(z.string().min(1).max(512)).max(128).optional(),
    warningThresholds: z.record(RuleIdSchema, z.number().int().min(1).max(100_000)).optional(),
  })
  .strict()

export const ReconciliationConfigSchema = z
  .object({
    /** Semantic comparison level. Raw discovery always keeps file-level relations. */
    scope: z.enum(['file', 'module', 'package']).optional(),
    /** Relation kinds that must have documentation declarations. Omit to require all observed kinds; [] disables this signal. */
    requiredRelationKinds: z.array(z.string().min(1).max(128)).max(128).optional(),
    includeOrphanedDocuments: z.boolean().optional(),
  })
  .strict()

export const AnalysisConfigSchema = z
  .object({
    plugins: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9-]*$/).max(128),
            enabled: z.boolean().optional(),
            order: z.number().int().nonnegative().optional(),
            options: z.record(z.string(), z.unknown()).optional(),
            reason: z.string().min(1).max(1_024).optional(),
          })
          .strict(),
      )
      .max(128)
      .optional(),
    jsTs: z
      .object({
        runtimeWiringMethods: z.array(z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/).max(64)).max(64).optional(),
        runtimeWiringAdapters: z
          .array(
            z
              .object({
                id: z.string().min(1).max(128),
                methods: z.array(z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/).max(64)).min(1).max(64),
              })
              .strict(),
          )
          .max(32)
          .optional(),
        includeTestRuntimeWiring: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const WorkflowConfigSchema = z
  .object({
    stateDir: z.string().min(1).max(512).optional(),
  })
  .strict()

export const RepositorySafetyConfigSchema = z
  .object({
    exclude: z.array(z.string().min(1).max(512)).max(128).optional(),
    maxFiles: z.number().int().positive().max(1_000_000).optional(),
    maxBytes: z.number().int().positive().max(10_000_000_000).optional(),
    maxTimeMs: z.number().int().positive().max(86_400_000).optional(),
    maxMemoryMb: z.number().int().positive().max(1_048_576).optional(),
    redactSecrets: z.boolean().optional(),
  })
  .strict()

export const ReportConfigSchema = z
  .object({
    /** Public report privacy mode. Private is the default; anonymized preserves topology without project identity. */
    privacy: z.enum(['private', 'anonymized']).optional(),
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
              'docbridge.snapshot',
              'docbridge.report',
              'docbridge.diagnostics',
              'docbridge.relations',
              'docbridge.run',
              'docbridge.proposals',
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
    registry: z
      .object({
        enabled: z.boolean().optional(),
        agentId: z.string().min(1).max(256).optional(),
        agentRoot: z.string().min(1).max(512).optional(),
        runnerModule: z.string().min(1).max(512).optional(),
        deterministic: z.boolean().optional(),
        timeoutMs: z.number().int().positive().max(600_000).optional(),
        maxTokens: z.number().int().positive().max(1_000_000).optional(),
        maxResponseBytes: z.number().int().positive().max(10_000_000).optional(),
        maxConcurrency: z.number().int().positive().max(64).optional(),
      })
      .strict()
      .optional(),
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

export const EcosystemContractEvidenceSchema = z
  .object({
    manifest: z.string().min(1).max(512),
    claims: z.string().min(1).max(512),
    productId: z.string().regex(/^[a-z][a-z0-9-]*$/).max(128),
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
    ecosystemContract: EcosystemContractEvidenceSchema.optional(),
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
    reconciliation: ReconciliationConfigSchema.optional(),
    analysis: AnalysisConfigSchema.optional(),
    rules: RulesConfigSchema.optional(),
    workflow: WorkflowConfigSchema.optional(),
    safety: RepositorySafetyConfigSchema.optional(),
    report: ReportConfigSchema.optional(),
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
export type ReconciliationConfig = z.infer<typeof ReconciliationConfigSchema>
export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>
export type RuleId = z.infer<typeof RuleIdSchema>
export type RuleSeverity = z.infer<typeof RuleSeveritySchema>
export type RulesConfig = z.infer<typeof RulesConfigSchema>
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>
export type RepositorySafetyConfig = z.infer<typeof RepositorySafetyConfigSchema>
export type ReportConfig = z.infer<typeof ReportConfigSchema>
