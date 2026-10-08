import { dirname, resolve, extname } from 'node:path'
import type * as ts from 'typescript'
import { safeWalkFiles, type SafeWalkOptions, type SafeWalkResult } from '../safety/repository.js'
import type { DiscoveryOptions } from './repository.js'
import { createScanMap } from './preload.js'
import { readBoundedText } from '../lib/bounded-text.js'
import { jsTsManifest } from './plugins/js-ts.js'
import { safeWalkOptions } from './inputs.js'
import { obsidianCorpora } from './obsidian.js'

export type ScanIO = {
  readonly readText: (path: string) => string
  readonly exists: (path: string) => boolean
  readonly workspaceDirectories: (patterns: readonly string[]) => string[]
  readonly packageManager: () => string
  readonly walk: (extensions: readonly string[], options: SafeWalkOptions) => SafeWalkResult
  readonly host: ts.ParseConfigHost & ts.ModuleResolutionHost
  readonly visibilityPolicyHash?: string
  readonly revision?: { readonly value: string; readonly kind: 'git' | 'content' }
  readonly excludedDocumentation?: readonly string[]
  readonly excludedDocumentationOmitted?: number
}

/** Compatibility acquisition is synchronous; extraction and TS hosts share the injected map. */
export const createLocalScanIO = (root: string, opts: DiscoveryOptions): ScanIO => {
  const ceilings = jsTsManifest.resourceLimits
  const maxBytes = Math.min(opts.maxBytes ?? opts.config?.safety?.maxBytes ?? ceilings.maxBytes, ceilings.maxBytes)
  const options = { ...safeWalkOptions(opts.config, { maxFiles: Math.min(ceilings.maxFiles, Math.max(10_000, (opts.maxFiles ?? opts.config?.safety?.maxFiles ?? 10_000) * 3)), maxBytes }), maxTimeMs: Math.min(opts.config?.safety?.maxTimeMs ?? ceilings.maxTimeMs, ceilings.maxTimeMs), maxMemoryMb: Math.min(opts.config?.safety?.maxMemoryMb ?? ceilings.maxMemoryMb, ceilings.maxMemoryMb) }
  const listing = safeWalkFiles(root, { ...options, ...(obsidianCorpora(opts.config).length ? { collectExcludedDocumentation: true } : {}) })
  const files = new Map<string, { text: string; bytes: number }>()
  const directories = new Set([resolve(root)])
  const budget = { used: 0 }
  const limited = new Set<string>()
  for (const path of listing.files) {
    try {
      const before = budget.used
      const text = readBoundedText(path, budget, { maxFileBytes: ceilings.maxFileBytes, maxCorpusBytes: maxBytes })
      files.set(path, { text, bytes: budget.used - before })
      for (let directory = dirname(path); directory !== dirname(directory); directory = dirname(directory)) {
        directories.add(directory)
        if (directory === root) break
      }
    } catch (error) {
      if (error instanceof Error && (error.message.includes('byte limit') || error.message.includes('byte read budget'))) limited.add(path)
      // Other unreadable paths retain the established extraction failure/coverage behavior.
    }
  }
  const map = createScanMap(root, files, directories, { value: '', kind: 'content' }, !listing.incomplete, listing.reason)
  const { revision: _revision, ...view } = map
  return { ...view, ...(listing.excludedDocumentation ? { excludedDocumentation: listing.excludedDocumentation, excludedDocumentationOmitted: listing.excludedDocumentationOmitted } : {}), walk(extensions, limits) {
    const selected = view.walk(extensions, limits)
    const omitted = [...limited].some(path => extensions.includes(extname(path)))
    const incomplete = selected.incomplete || listing.incomplete || omitted
    const reason = selected.reason ?? (listing.incomplete ? listing.reason : omitted ? 'Repository scan exceeded the built-in acquisition byte limits.' : undefined)
    return { files: selected.files, incomplete, ...(reason ? { reason } : {}) }
  } }
}
