import type { DocBridgeConfigV1 } from './schema.js'

const DEFAULT_AGENT_EXCLUDE = ['**/node_modules/**', '**/.git/**'] as const

export const applyConfigDefaults = (config: DocBridgeConfigV1): DocBridgeConfigV1 => {
  const agentRoot = config.corpus.agent.root
  const agentIndex = config.corpus.agent.index ?? `${agentRoot}/INDEX.md`

  return {
    ...config,
    corpus: {
      ...config.corpus,
      agent: {
        ...config.corpus.agent,
        index: agentIndex,
        include: config.corpus.agent.include ?? ['**/*.md'],
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
    surfaces: {
      cli: {
        bin: 'ak-docs',
        defaultFormat: 'json',
        ...config.surfaces?.cli,
      },
      mcp: {
        enabled: true,
        tools: ['handoff.resolve', 'doc.search', 'doc.get', 'gate.status'],
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
