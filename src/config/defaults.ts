import type { DocBridgeConfigV1 } from './schema.js'

const DEFAULT_AGENT_EXCLUDE = ['**/node_modules/**', '**/.git/**'] as const

/** Disabled opt-in settings must not change an existing index's configuration identity. */
export const withoutDisabledKnowledgeEntities = (config: DocBridgeConfigV1): DocBridgeConfigV1 => {
  if (!config.index?.knowledgeEntities || config.index.knowledgeEntities.enabled) return config
  const { knowledgeEntities: _disabled, ...index } = config.index
  const { index: _index, ...rest } = config
  return Object.keys(index).length ? { ...rest, index } : rest
}

export const applyConfigDefaults = (config: DocBridgeConfigV1): DocBridgeConfigV1 => {
  config = withoutDisabledKnowledgeEntities(config)
  const agentRoot = config.corpus.agent.root
  const agentIndex = config.corpus.agent.index ?? `${agentRoot}/INDEX.md`

  return {
    ...config,
    corpus: {
      ...config.corpus,
      agent: {
        ...config.corpus.agent,
        index: agentIndex,
        include: config.corpus.agent.include ?? ['**/*.{md,mdx}'],
        exclude: config.corpus.agent.exclude ?? [...DEFAULT_AGENT_EXCLUDE],
      },
    },
    index: {
      outFile: '.doc-bridge/index.json',
      contentHash: 'sha256-normalized-v1',
      llmsTxt: {
        enabled: true,
        outFile: 'llms.txt',
        ...config.index?.llmsTxt,
      },
      capabilities: {
        enabled: true,
        outFile: '.doc-bridge/capabilities.json',
        ...config.index?.capabilities,
      },
      ...config.index,
    },
    gates: {
      preset: 'minimal',
      ...config.gates,
    },
    rules: {
      mode: 'default',
      ...config.rules,
    },
    safety: {
      redactSecrets: true,
      ...config.safety,
    },
    surfaces: {
      cli: {
        bin: 'ak-docs',
        defaultFormat: 'json',
        ...config.surfaces?.cli,
      },
      mcp: {
        enabled: true,
        tools: [
          'handoff.resolve', 'doc.search', 'doc.get', 'gate.status', 'retriever.query',
          'memory.classify', 'memory.promoteDraft', 'registry.topology',
          'docbridge.snapshot', 'docbridge.report', 'docbridge.diagnostics',
          'docbridge.relations', 'docbridge.run', 'docbridge.proposals',
          'knowledge.search', 'knowledge.lookup', 'knowledge.decision', 'knowledge.concept', 'knowledge.whyChanged',
        ],
        transport: 'stdio',
        ...config.surfaces?.mcp,
      },
      ...config.surfaces,
    },
    intelligence: config.intelligence
      ? {
          enabled: false,
          ...config.intelligence,
          chat: config.intelligence.chat
            ? { handoffFirst: true, ...config.intelligence.chat }
            : undefined,
        }
      : { enabled: false },
  }
}
