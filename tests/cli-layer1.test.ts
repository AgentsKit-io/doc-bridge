import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const layer1 = vi.hoisted(() => ({
  ingest: vi.fn(async () => ({ documentCount: 2, storePath: '/repo/.doc-bridge/vectors' })),
  search: vi.fn(async () => [{ content: 'RAG hit', score: 0.8 }]),
  createDocBridgeRag: vi.fn(() => ({
    ingest: layer1.ingest,
    search: layer1.search,
    retriever: { kind: 'retriever' },
    storePath: '/repo/.doc-bridge/vectors',
  })),
  runChatOnce: vi.fn(async () => ({ content: 'Chat answer', handoffPrefixed: true })),
  startInkChat: vi.fn(async () => undefined),
  retrieveHybridChunks: vi.fn(async () => [{ id: 'chunk', content: 'Hybrid hit', score: 1 }]),
}))

vi.mock('../src/intelligence/rag.js', () => ({ createDocBridgeRag: layer1.createDocBridgeRag }))
vi.mock('../src/intelligence/chat.js', () => ({
  runChatOnce: layer1.runChatOnce,
  startInkChat: layer1.startInkChat,
}))
vi.mock('../src/federation/llms.js', () => ({ retrieveHybridChunks: layer1.retrieveHybridChunks }))

const { runCli } = await import('../src/cli/program.js')

const captureStdoutAsync = async (
  fn: () => number | undefined | Promise<number | undefined>,
): Promise<{ code: number | undefined; out: string }> => {
  const write = process.stdout.write
  let out = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk)
    return true
  }) as typeof process.stdout.write
  try {
    return { code: await fn(), out }
  } finally {
    process.stdout.write = write
  }
}

const captureStderrAsync = async (
  fn: () => number | undefined | Promise<number | undefined>,
): Promise<{ code: number | undefined; err: string }> => {
  const write = process.stderr.write
  let err = ''
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err += String(chunk)
    return true
  }) as typeof process.stderr.write
  try {
    return { code: await fn(), err }
  } finally {
    process.stderr.write = write
  }
}

const writeLayer1Project = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'ak-docs-cli-layer1-'))
  mkdirSync(join(root, 'docs/for-agents'), { recursive: true })
  writeFileSync(
    join(root, 'doc-bridge.config.json'),
    JSON.stringify({
      schemaVersion: 1,
      corpus: { agent: { root: 'docs/for-agents' } },
      intelligence: { enabled: true, adapter: { provider: 'ollama' } },
    }),
  )
  writeFileSync(join(root, 'docs/for-agents/INDEX.md'), '# Index\n\nLayer 1 docs.\n')
  return root
}

describe('ak-docs Layer 1 CLI commands', () => {
  const originalCwd = process.cwd()

  beforeEach(() => {
    vi.clearAllMocks()
    layer1.ingest.mockResolvedValue({ documentCount: 2, storePath: '/repo/.doc-bridge/vectors' })
    layer1.search.mockResolvedValue([{ content: 'RAG hit', score: 0.8 }])
    layer1.runChatOnce.mockResolvedValue({ content: 'Chat answer', handoffPrefixed: true })
    layer1.startInkChat.mockResolvedValue(undefined)
    layer1.retrieveHybridChunks.mockResolvedValue([{ id: 'chunk', content: 'Hybrid hit', score: 1 }])
  })

  afterEach(() => {
    process.chdir(originalCwd)
  })

  it('runs retrieve, rag ingest, and rag search through configured project state', async () => {
    const root = writeLayer1Project()
    process.chdir(root)
    expect(runCli(['index'])).toBe(0)

    const retrieve = await captureStdoutAsync(() => runCli(['retrieve', 'Layer 1']))
    expect(retrieve.code).toBe(0)
    expect(retrieve.out).toContain('"chunks"')
    expect(layer1.retrieveHybridChunks).toHaveBeenCalledWith(
      expect.stringContaining('ak-docs-cli-layer1-'),
      expect.any(Object),
      expect.any(Object),
      'Layer 1',
    )

    const ingest = await captureStdoutAsync(() => runCli(['rag', 'ingest']))
    expect(ingest.code).toBe(0)
    expect(ingest.out).toContain('"documentCount": 2')

    const search = await captureStdoutAsync(() => runCli(['rag', 'search', 'schemas']))
    expect(search.code).toBe(0)
    expect(search.out).toContain('"count": 1')
    expect(layer1.search).toHaveBeenCalledWith('schemas')
  })

  it('prints rag usage and provider errors clearly', async () => {
    const root = writeLayer1Project()
    process.chdir(root)
    expect(runCli(['index'])).toBe(0)

    expect((await captureStderrAsync(() => runCli(['rag']))).err).toContain('ak-docs rag ingest')
    expect((await captureStderrAsync(() => runCli(['rag', 'search']))).err).toContain('rag search <query>')

    layer1.createDocBridgeRag.mockImplementationOnce(() => {
      throw new Error('provider offline')
    })
    const result = await captureStderrAsync(() => runCli(['rag', 'ingest']))
    expect(result.code).toBe(1)
    expect(result.err).toContain('provider offline')
  })

  it('runs interactive chat and one-shot ask chat when intelligence is configured', async () => {
    const root = writeLayer1Project()
    process.chdir(root)
    expect(runCli(['index'])).toBe(0)

    expect(await runCli(['chat'])).toBe(0)
    expect(layer1.startInkChat).toHaveBeenCalledWith(
      expect.stringContaining('ak-docs-cli-layer1-'),
      expect.any(Object),
      expect.any(Object),
    )

    const ask = await captureStdoutAsync(() => runCli(['ask', 'Who owns docs?', '--chat']))
    expect(ask.code).toBe(0)
    expect(ask.out).toContain('Chat answer')
    expect(layer1.runChatOnce).toHaveBeenCalledWith(
      expect.stringContaining('ak-docs-cli-layer1-'),
      expect.any(Object),
      expect.any(Object),
      'Who owns docs?',
    )
  })

  it('prints chat and ask-chat errors clearly', async () => {
    const root = writeLayer1Project()
    process.chdir(root)
    expect(runCli(['index'])).toBe(0)

    layer1.startInkChat.mockRejectedValueOnce(new Error('terminal unavailable'))
    expect((await captureStderrAsync(() => runCli(['chat']))).err).toContain('terminal unavailable')

    layer1.runChatOnce.mockRejectedValueOnce(new Error('model unavailable'))
    expect((await captureStderrAsync(() => runCli(['ask', 'question', '--chat']))).err).toContain('model unavailable')

    expect((await captureStderrAsync(() => runCli(['ask', '--chat']))).err).toContain('ask <question> --chat')
  })
})
