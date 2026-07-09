import { existsSync, watch } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { buildDocBridgeIndex } from './build-index.js'

export type WatchIndexOptions = {
  readonly root: string
  readonly config: DocBridgeConfigV1
  readonly configPath?: string
  readonly debounceMs?: number
  readonly onRebuild?: (summary: { knowledgeCount: number; handoffCount: number; hash: string }) => void
}

const WATCH_PATTERN = /\.(md|mdx|json|ya?ml|mdc)$/i

const collectWatchRoots = (root: string, config: DocBridgeConfigV1, configPath?: string): string[] => {
  const roots = new Set<string>()
  roots.add(resolve(root, config.corpus.agent.root))
  const humanSources = config.corpus.human
    ? Array.isArray(config.corpus.human)
      ? config.corpus.human
      : [config.corpus.human]
    : []
  for (const source of humanSources) {
    const humanOpts = source.options ?? {}
    for (const key of ['contentDir', 'docsDir', 'root']) {
      const value = humanOpts[key]
      if (typeof value === 'string' && value.length) roots.add(resolve(root, value))
    }
  }
  if (configPath) roots.add(dirname(resolve(configPath)))
  return [...roots].filter((dir) => existsSync(dir))
}

export const watchDocBridgeIndex = (opts: WatchIndexOptions): Promise<number> => {
  const debounceMs = opts.debounceMs ?? 350
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false

  const rebuild = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      if (running) return
      running = true
      try {
        const result = buildDocBridgeIndex({ root: opts.root, config: opts.config })
        const handoffCount = Object.keys(result.index.handoffs ?? {}).length
        const summary = {
          knowledgeCount: result.index.knowledge.length,
          handoffCount,
          hash: result.index.contentHash.slice(0, 8),
        }
        opts.onRebuild?.(summary)
        process.stdout.write(
          `[ak-docs] indexed ${summary.knowledgeCount} docs, ${summary.handoffCount} handoffs (${summary.hash}…)\n`,
        )
      } catch (error) {
        process.stderr.write(
          `[ak-docs] index failed: ${error instanceof Error ? error.message : String(error)}\n`,
        )
      } finally {
        running = false
      }
    }, debounceMs)
  }

  rebuild()

  for (const dir of collectWatchRoots(opts.root, opts.config, opts.configPath)) {
    watch(dir, { recursive: true }, (_event, filename) => {
      if (!filename || !WATCH_PATTERN.test(filename)) return
      rebuild()
    })
  }

  const configDir = resolve(opts.root)
  if (existsSync(configDir)) {
    watch(configDir, (_event, filename) => {
      if (!filename || !/doc-bridge\.config/.test(filename)) return
      rebuild()
    })
  }

  process.stdout.write(
    `[ak-docs] watching ${collectWatchRoots(opts.root, opts.config, opts.configPath).join(', ') || opts.root} (Ctrl+C to stop)\n`,
  )

  return new Promise((resolvePromise) => {
    const onSignal = () => resolvePromise(0)
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)
  })
}