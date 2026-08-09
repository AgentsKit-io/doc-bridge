import { EventEmitter } from 'node:events'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const fsMock = vi.hoisted(() => ({
  callbacks: [] as Array<(event: string, filename: string | null) => void>,
  watchedDirs: [] as string[],
  watchedOptions: [] as unknown[],
  existsSync: vi.fn(() => true),
  watch: vi.fn((dir: string, _opts: unknown, cb?: (event: string, filename: string | null) => void) => {
    fsMock.watchedDirs.push(dir)
    fsMock.watchedOptions.push(_opts)
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
    fsMock.watchedDirs.length = 0
    fsMock.watchedOptions.length = 0
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

  it('watches a VitePress srcDir and rebuilds when its Markdown changes', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    try {
      const pending = watchDocBridgeIndex({
        root: '/repo',
        debounceMs: 5,
        config: {
          schemaVersion: 1,
          corpus: {
            agent: { root: 'docs/for-agents' },
            human: { plugin: 'vitepress', options: { srcDir: 'website/vitepress' } },
          },
        },
      })

      await vi.advanceTimersByTimeAsync(5)
      const vitepressWatch = fsMock.watchedDirs.indexOf('/repo/website/vitepress')
      expect(vitepressWatch).toBeGreaterThanOrEqual(0)
      fsMock.callbacks[vitepressWatch]?.('change', 'guide.md')
      await vi.advanceTimersByTimeAsync(5)

      process.emit('SIGTERM')
      await expect(pending).resolves.toBe(0)
      expect(buildMock.buildDocBridgeIndex).toHaveBeenCalledTimes(2)
      expect(stderr).not.toHaveBeenCalled()
    } finally {
      stdout.mockRestore()
      stderr.mockRestore()
      vi.useRealTimers()
    }
  })

  it('watches a Nextra content directory and rebuilds when its MDX changes', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    try {
      const pending = watchDocBridgeIndex({
        root: '/repo',
        debounceMs: 5,
        config: {
          schemaVersion: 1,
          corpus: {
            agent: { root: 'docs/for-agents' },
            human: { plugin: 'nextra', options: { contentDir: 'content' } },
          },
        },
      })

      await vi.advanceTimersByTimeAsync(5)
      const nextraWatch = fsMock.watchedDirs.indexOf('/repo/content')
      expect(nextraWatch).toBeGreaterThanOrEqual(0)
      fsMock.callbacks[nextraWatch]?.('change', 'guide.mdx')
      await vi.advanceTimersByTimeAsync(5)

      process.emit('SIGTERM')
      await expect(pending).resolves.toBe(0)
      expect(buildMock.buildDocBridgeIndex).toHaveBeenCalledTimes(2)
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

  it('rebuilds for Nx project and package manifests only', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    try {
      const pending = watchDocBridgeIndex({
        root: '/repo',
        debounceMs: 10,
        config: {
          schemaVersion: 1,
          corpus: { agent: { root: 'docs' } },
          routing: { plugin: 'nx' },
        },
      })
      await vi.advanceTimersByTimeAsync(10)

      const nxWatcherIndex = fsMock.watchedDirs.findIndex((dir, index) => {
        const options = fsMock.watchedOptions[index]
        return dir === '/repo' && typeof options === 'object' && options !== null && 'recursive' in options
          ? options.recursive === true
          : false
      })
      expect(nxWatcherIndex).toBeGreaterThanOrEqual(0)
      const nxCallback = fsMock.callbacks[nxWatcherIndex]
      nxCallback?.('change', 'apps/store/project.json')
      await vi.advanceTimersByTimeAsync(10)
      nxCallback?.('change', 'libs/data/package.json')
      await vi.advanceTimersByTimeAsync(10)
      nxCallback?.('change', 'tools/unrelated.json')
      await vi.advanceTimersByTimeAsync(10)

      process.emit('SIGTERM')
      await expect(pending).resolves.toBe(0)
      expect(buildMock.buildDocBridgeIndex).toHaveBeenCalledTimes(3)
    } finally {
      stdout.mockRestore()
      vi.useRealTimers()
    }
  })
})
