import { EventEmitter } from 'node:events'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const fsMock = vi.hoisted(() => ({
  callbacks: [] as Array<(event: string, filename: string | null) => void>,
  existsSync: vi.fn(() => true),
  watch: vi.fn((_dir: string, _opts: unknown, cb?: (event: string, filename: string | null) => void) => {
    const callback = typeof _opts === 'function' ? _opts : cb
    if (callback) fsMock.callbacks.push(callback)
    return new EventEmitter()
  }),
}))

const buildMock = vi.hoisted(() => ({
  buildDocBridgeIndex: vi.fn(() => ({
    index: {
      contentHash: 'abcdef1234567890',
      knowledge: [{ id: 'doc' }],
      handoffs: { core: {} },
    },
  })),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: fsMock.existsSync, watch: fsMock.watch }
})

vi.mock('../src/index-builder/build-index.js', () => buildMock)

const { watchDocBridgeIndex } = await import('../src/index-builder/watch-index.js')

describe('watchDocBridgeIndex', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    fsMock.callbacks.length = 0
    buildMock.buildDocBridgeIndex.mockReturnValue({
      index: {
        contentHash: 'abcdef1234567890',
        knowledge: [{ id: 'doc' }],
        handoffs: { core: {} },
      },
    })
  })

  it('watches agent, human, and config roots and rebuilds on matching file changes', async () => {
    const summaries: Array<{ knowledgeCount: number; handoffCount: number; hash: string }> = []
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    try {
      const pending = watchDocBridgeIndex({
        root: '/repo',
        configPath: '/repo/doc-bridge.config.json',
        debounceMs: 10,
        config: {
          schemaVersion: 1,
          corpus: {
            agent: { root: 'docs/for-agents' },
            human: [
              { plugin: 'fumadocs', options: { contentDir: 'apps/web/content/docs' } },
              { plugin: 'docusaurus', options: { docsDir: 'website/docs' } },
              { plugin: 'plain-markdown', options: { root: 'docs/human' } },
            ],
          },
        },
        onRebuild: (summary) => summaries.push(summary),
      })

      await vi.advanceTimersByTimeAsync(10)
      fsMock.callbacks[0]?.('change', 'guide.mdx')
      fsMock.callbacks[0]?.('change', 'ignored.txt')
      await vi.advanceTimersByTimeAsync(10)

      process.emit('SIGTERM')
      await expect(pending).resolves.toBe(0)
      expect(buildMock.buildDocBridgeIndex).toHaveBeenCalledTimes(2)
      expect(summaries).toEqual([
        { knowledgeCount: 1, handoffCount: 1, hash: 'abcdef12' },
        { knowledgeCount: 1, handoffCount: 1, hash: 'abcdef12' },
      ])
      expect(stdout).toHaveBeenCalledWith(expect.stringContaining('[ak-docs] watching'))
      expect(stderr).not.toHaveBeenCalled()
    } finally {
      stdout.mockRestore()
      stderr.mockRestore()
      vi.useRealTimers()
    }
  })

  it('prints rebuild errors without terminating the watcher', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    buildMock.buildDocBridgeIndex.mockImplementation(() => {
      throw new Error('bad docs')
    })

    try {
      const pending = watchDocBridgeIndex({
        root: '/repo',
        debounceMs: 1,
        config: { schemaVersion: 1, corpus: { agent: { root: 'docs' } } },
      })
      await vi.advanceTimersByTimeAsync(1)
      process.emit('SIGINT')
      await expect(pending).resolves.toBe(0)
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('bad docs'))
    } finally {
      stdout.mockRestore()
      stderr.mockRestore()
      vi.useRealTimers()
    }
  })
})
