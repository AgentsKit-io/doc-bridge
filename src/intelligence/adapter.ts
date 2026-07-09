import { join } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { importPeer } from './peers.js'

const readEnv = (name: string | undefined): string | undefined => {
  if (!name) return undefined
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

export type ResolvedIntelligence = {
  readonly adapter: unknown
  readonly embed: unknown
  readonly provider: string
  readonly model?: string
}

export const resolveIntelligenceRuntime = async (
  config: DocBridgeConfigV1,
): Promise<ResolvedIntelligence> => {
  if (!config.intelligence?.enabled) {
    throw new Error('Intelligence is disabled. Set intelligence.enabled: true in doc-bridge config.')
  }
  const adapterCfg = config.intelligence.adapter
  if (!adapterCfg) {
    throw new Error('intelligence.adapter is required for chat/RAG (provider + optional model).')
  }

  const adapters = await importPeer<typeof import('@agentskit/adapters')>('@agentskit/adapters')
  const provider = adapterCfg.provider
  const model = adapterCfg.model
  const apiKey = readEnv(adapterCfg.apiKeyEnv) ?? readEnv('OPENAI_API_KEY') ?? readEnv('ANTHROPIC_API_KEY')
  const baseUrl = adapterCfg.baseUrl

  let adapter: unknown
  let embed: unknown

  switch (provider) {
    case 'ollama': {
      adapter = adapters.ollama({ model: model ?? 'llama3.2', ...(baseUrl ? { baseUrl } : {}) })
      embed = adapters.ollamaEmbedder({
        model: typeof adapterCfg.options?.embedModel === 'string'
          ? adapterCfg.options.embedModel
          : 'nomic-embed-text',
        ...(baseUrl ? { baseUrl } : {}),
      })
      break
    }
    case 'openai': {
      if (!apiKey) throw new Error(`Missing API key env ${adapterCfg.apiKeyEnv ?? 'OPENAI_API_KEY'}`)
      adapter = adapters.openai({ apiKey, ...(model ? { model } : {}), ...(baseUrl ? { baseUrl } : {}) })
      embed = adapters.openaiEmbedder({ apiKey, model: 'text-embedding-3-small' })
      break
    }
    case 'anthropic': {
      if (!apiKey) throw new Error(`Missing API key env ${adapterCfg.apiKeyEnv ?? 'ANTHROPIC_API_KEY'}`)
      adapter = adapters.anthropic({ apiKey, ...(model ? { model } : {}) })
      // Anthropic has no default embedder in adapters — fall back to openai-compatible if key present
      const openaiKey = readEnv('OPENAI_API_KEY')
      if (openaiKey) embed = adapters.openaiEmbedder({ apiKey: openaiKey })
      else {
        throw new Error(
          'Anthropic chat requires an embedder for RAG. Set OPENAI_API_KEY for embeddings or use provider: ollama.',
        )
      }
      break
    }
    case 'openrouter': {
      if (!apiKey) throw new Error(`Missing API key env ${adapterCfg.apiKeyEnv ?? 'OPENROUTER_API_KEY'}`)
      adapter = adapters.openrouter({ apiKey, ...(model ? { model } : {}) })
      embed = adapters.openaiEmbedder({
        apiKey,
        model: 'text-embedding-3-small',
        // openrouter embeddings path may vary; adapters handle openai-compatible
      })
      break
    }
    case 'custom':
      throw new Error(
        'provider: custom requires a programmatic integration. Use ollama, openai, anthropic, or openrouter in v0.1.',
      )
    default:
      throw new Error(`Unsupported intelligence.adapter.provider: ${String(provider)}`)
  }

  return { adapter, embed, provider, ...(model ? { model } : {}) }
}

export const defaultVectorStorePath = (root: string): string => join(root, '.doc-bridge', 'vectors')
