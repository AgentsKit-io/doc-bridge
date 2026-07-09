import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultVectorStorePath, resolveIntelligenceRuntime } from '../src/intelligence/adapter.js'
import { runChatOnce, startInkChat } from '../src/intelligence/chat.js'
import { createDocBridgeRag } from '../src/intelligence/rag.js'
import type { DocBridgeConfigV1 } from '../src/config/schema.js'
import type { DocBridgeIndexV1 } from '../src/schemas/doc-bridge-index.js'

const mocks = vi.hoisted(() => {
  const rag = {
    ingest: vi.fn<() => Promise<void>>(async () => undefined),
    search: vi.fn(async () => [
      {
        id: 'hit-1',
        content: 'Use docs/for-agents/packages/os-core.md first.',
        score: 0.9,
        source: 'docs/for-agents/packages/os-core.md',
        metadata: { title: 'OS Core' },
      },
      { content: 'Fallback hit' },
    ]),
  }

  return {
    adapters: {
      ollama: vi.fn((input: unknown) => ({ kind: 'ollama', input })),
      ollamaEmbedder: vi.fn((input: unknown) => ({ kind: 'ollama-embedder', input })),
      openai: vi.fn((input: unknown) => ({ kind: 'openai', input })),
      openaiEmbedder: vi.fn((input: unknown) => ({ kind: 'openai-embedder', input })),
      anthropic: vi.fn((input: unknown) => ({ kind: 'anthropic', input })),
      openrouter: vi.fn((input: unknown) => ({ kind: 'openrouter', input })),
    },
    rag,
    createRAG: vi.fn(() => rag),
    fileVectorMemory: vi.fn((input: unknown) => ({ kind: 'file-vector-memory', input })),
    createChatController: vi.fn(() => ({
      send: vi.fn(async () => ({ content: 'Answer from AgentsKit.' })),
    })),
    render: vi.fn(() => ({ waitUntilExit: vi.fn(async () => undefined) })),
    useChat: vi.fn(() => ({
      messages: [{ id: 'm1', role: 'assistant', content: 'Ready' }],
    })),
    createElement: vi.fn((type: unknown, props?: unknown, ...children: unknown[]) => {
      if (typeof type === 'function') return type(props)
      return { type, props, children }
    }),
  }
})

vi.mock('@agentskit/adapters', () => mocks.adapters)
vi.mock('@agentskit/rag', () => ({ createRAG: mocks.createRAG }))
vi.mock('@agentskit/memory', () => ({ fileVectorMemory: mocks.fileVectorMemory }))
vi.mock('@agentskit/core', () => ({ createChatController: mocks.createChatController }))
vi.mock('ink', () => ({ render: mocks.render }))
vi.mock('react', () => ({ default: { createElement: mocks.createElement }, createElement: mocks.createElement }))
vi.mock('@agentskit/ink', () => ({
  ChatContainer: 'ChatContainer',
  InputBar: 'InputBar',
  Message: 'Message',
  useChat: mocks.useChat,
}))

const config = (intelligence: DocBridgeConfigV1['intelligence']): DocBridgeConfigV1 =>
  ({
    schemaVersion: 1,
    project: { name: 'fixture' },
    corpus: { agent: { root: 'docs/for-agents' } },
    intelligence,
  }) as DocBridgeConfigV1

const index = (): DocBridgeIndexV1 => ({
  schemaVersion: 1,
  contentHash: 'a'.repeat(64),
  contentHashAlgo: 'sha256-normalized-v1',
  knowledge: [
    {
      id: 'os-core',
      type: 'package',
      title: 'OS Core',
      path: 'docs/for-agents/packages/os-core.md',
      description: 'Contracts and schemas.',
    },
  ],
  lookup: {
    packages: ['os-core'],
    ownership: {
      'os-core': {
        id: 'os-core',
        path: 'packages/os-core',
        checks: ['pnpm --filter os-core test'],
        agentDoc: 'docs/for-agents/packages/os-core.md',
        humanDoc: '/docs/concepts/architecture',
        purpose: 'Contracts and schemas.',
      },
    },
  },
})

const tempProject = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'ak-docs-intelligence-'))
  const docPath = join(root, 'docs/for-agents/packages/os-core.md')
  mkdirSync(join(root, 'docs/for-agents/packages'), { recursive: true })
  writeFileSync(docPath, '# OS Core\n\nOwns schemas and error contracts.')
  return root
}

describe('intelligence runtime', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OPENROUTER_API_KEY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('rejects disabled, missing, and unsupported adapter configuration with actionable messages', async () => {
    await expect(resolveIntelligenceRuntime(config({ enabled: false }))).rejects.toThrow(/disabled/)
    await expect(resolveIntelligenceRuntime(config({ enabled: true }))).rejects.toThrow(/adapter is required/)
    await expect(
      resolveIntelligenceRuntime(config({ enabled: true, adapter: { provider: 'custom' } })),
    ).rejects.toThrow(/programmatic integration/)
  })

  it('creates ollama adapters without API keys and honors embed model/base URL options', async () => {
    const runtime = await resolveIntelligenceRuntime(
      config({
        enabled: true,
        adapter: {
          provider: 'ollama',
          model: 'llama3.2',
          baseUrl: 'http://localhost:11434',
          options: { embedModel: 'nomic-embed-text:v2' },
        },
      }),
    )

    expect(runtime).toMatchObject({ provider: 'ollama', model: 'llama3.2' })
    expect(mocks.adapters.ollama).toHaveBeenCalledWith({
      model: 'llama3.2',
      baseUrl: 'http://localhost:11434',
    })
    expect(mocks.adapters.ollamaEmbedder).toHaveBeenCalledWith({
      model: 'nomic-embed-text:v2',
      baseUrl: 'http://localhost:11434',
    })
  })

  it('requires and wires API keys for OpenAI, Anthropic embeddings, and OpenRouter', async () => {
    await expect(
      resolveIntelligenceRuntime(config({ enabled: true, adapter: { provider: 'openai' } })),
    ).rejects.toThrow(/Missing API key/)

    process.env.OPENAI_API_KEY = 'openai-key'
    await resolveIntelligenceRuntime(config({ enabled: true, adapter: { provider: 'openai' } }))
    expect(mocks.adapters.openai).toHaveBeenCalledWith({ apiKey: 'openai-key' })
    expect(mocks.adapters.openaiEmbedder).toHaveBeenCalledWith({
      apiKey: 'openai-key',
      model: 'text-embedding-3-small',
    })

    process.env.ANTHROPIC_API_KEY = 'anthropic-key'
    await resolveIntelligenceRuntime(config({ enabled: true, adapter: { provider: 'anthropic' } }))
    expect(mocks.adapters.anthropic).toHaveBeenCalledWith({ apiKey: 'anthropic-key' })

    delete process.env.OPENAI_API_KEY
    await expect(
      resolveIntelligenceRuntime(config({ enabled: true, adapter: { provider: 'anthropic' } })),
    ).rejects.toThrow(/requires an embedder/)

    process.env.OPENROUTER_API_KEY = 'openrouter-key'
    await resolveIntelligenceRuntime(
      config({
        enabled: true,
        adapter: { provider: 'openrouter', apiKeyEnv: 'OPENROUTER_API_KEY', model: 'openai/gpt-4o-mini' },
      }),
    )
    expect(mocks.adapters.openrouter).toHaveBeenCalledWith({
      apiKey: 'openrouter-key',
      model: 'openai/gpt-4o-mini',
    })
  })

  it('ingests indexed docs into AgentsKit RAG and normalizes search hits', async () => {
    const root = tempProject()
    const rag = await createDocBridgeRag(
      root,
      config({ enabled: true, adapter: { provider: 'ollama' }, retriever: { options: { storePath: '.cache/vectors' } } }),
      index(),
    )

    await expect(rag.ingest()).resolves.toEqual({
      documentCount: 1,
      storePath: join(root, '.cache/vectors'),
    })
    await expect(rag.search('schemas', 2)).resolves.toEqual([
      {
        id: 'hit-1',
        content: 'Use docs/for-agents/packages/os-core.md first.',
        score: 0.9,
        source: 'docs/for-agents/packages/os-core.md',
        metadata: { title: 'OS Core' },
      },
      { content: 'Fallback hit' },
    ])
    expect(mocks.rag.ingest).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'os-core',
        content: '# OS Core\n\nOwns schemas and error contracts.',
        source: 'docs/for-agents/packages/os-core.md',
      }),
    ])
    expect(mocks.rag.search).toHaveBeenCalledWith('schemas', { topK: 2 })
  })

  it('falls back to indexed descriptions when source files are not readable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-intelligence-missing-'))
    const rag = await createDocBridgeRag(root, config({ enabled: true, adapter: { provider: 'ollama' } }), index())

    await rag.ingest()

    expect(rag.storePath).toBe(defaultVectorStorePath(root))
    expect(mocks.rag.ingest).toHaveBeenCalledWith([
      expect.objectContaining({
        content: 'OS Core\n\nContracts and schemas.',
      }),
    ])
  })

  it('runs one-shot chat with handoff-first context when the question names a package', async () => {
    const root = tempProject()
    const result = await runChatOnce(
      root,
      config({ enabled: true, adapter: { provider: 'ollama' } }),
      index(),
      'How do I edit os-core schemas?',
    )

    expect(result).toEqual({ content: 'Answer from AgentsKit.', handoffPrefixed: true })
    expect(mocks.createChatController).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Deterministic AgentHandoff'),
      }),
    )
  })

  it('wraps provider network errors with setup hints', async () => {
    mocks.createChatController.mockReturnValueOnce({
      send: vi.fn(async () => {
        throw new Error('ECONNREFUSED localhost:11434')
      }),
    })

    await expect(
      runChatOnce(
        tempProject(),
        config({ enabled: true, adapter: { provider: 'ollama' } }),
        index(),
        'question without a package',
      ),
    ).rejects.toThrow(/ollama serve|Install Layer 1/)
  })

  it('starts the Ink chat UI using AgentsKit chat primitives', async () => {
    await expect(
      startInkChat(tempProject(), config({ enabled: true, adapter: { provider: 'ollama' } }), index()),
    ).resolves.toBeUndefined()

    expect(mocks.useChat).toHaveBeenCalledWith(expect.objectContaining({ system: expect.stringContaining('Provider: ollama') }))
    expect(mocks.render).toHaveBeenCalled()
  })
})
