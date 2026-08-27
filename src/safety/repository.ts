import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { minimatch } from 'minimatch'

export const DEFAULT_SAFETY_EXCLUDES = ['**/.git/**', '**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/.doc-bridge/**', '**/.env', '**/.env.*', '**/*secret*', '**/*credential*', '**/*.pem', '**/*.key'] as const

export type SafeWalkOptions = {
  readonly extensions?: readonly string[]
  readonly exclude?: readonly string[]
  readonly maxFiles?: number
  readonly maxBytes?: number
  readonly maxTimeMs?: number
  readonly maxMemoryMb?: number
}

export type SafeWalkResult = {
  readonly files: readonly string[]
  readonly incomplete: boolean
  readonly reason?: string
}

export const containedPath = (root: string, candidate: string): string | undefined => {
  const projectRoot = realpathSync.native(resolve(root))
  const unresolved = resolve(projectRoot, candidate)
  const unresolvedRelative = relative(projectRoot, unresolved)
  if (isAbsolute(unresolvedRelative) || unresolvedRelative === '..' || unresolvedRelative.startsWith(`..${sep}`)) return undefined
  try {
    const canonical = realpathSync.native(unresolved)
    const canonicalRelative = relative(projectRoot, canonical)
    return isAbsolute(canonicalRelative) || canonicalRelative === '..' || canonicalRelative.startsWith(`..${sep}`) ? undefined : canonical
  } catch {
    return unresolved
  }
}

export const safeWalkFiles = (root: string, options: SafeWalkOptions = {}): SafeWalkResult => {
  const projectRoot = resolve(root)
  const extensions = options.extensions ?? []
  const excludes = options.exclude ?? DEFAULT_SAFETY_EXCLUDES
  const files: string[] = []
  let bytes = 0
  let reason: string | undefined
  const started = Date.now()
  const matchesExclude = (path: string): boolean => excludes.some((pattern) => minimatch(path, pattern, { dot: true }))
  const visit = (directory: string): void => {
    if (reason) return
    if (options.maxTimeMs !== undefined && Date.now() - started >= options.maxTimeMs) { reason = `Repository scan exceeded the ${options.maxTimeMs} ms time limit.`; return }
    if (options.maxMemoryMb !== undefined && process.memoryUsage().heapUsed > options.maxMemoryMb * 1024 * 1024) { reason = `Repository scan exceeded the ${options.maxMemoryMb} MiB memory limit.`; return }
    let entries: string[]
    try { entries = readdirSync(directory) } catch { return }
    for (const name of entries.sort()) {
      const absolute = resolve(directory, name)
      const relativePath = relative(projectRoot, absolute).split(sep).join('/')
      if (matchesExclude(relativePath) || name === '.git') continue
      let stats
      try { stats = lstatSync(absolute) } catch { continue }
      if (stats.isSymbolicLink()) continue
      if (stats.isDirectory()) { visit(absolute); if (reason) return; continue }
      if (!stats.isFile() || (extensions.length > 0 && !extensions.some((extension) => name.endsWith(extension)))) continue
      if (files.length >= (options.maxFiles ?? 10_000)) { reason = `Repository scan exceeded the ${options.maxFiles ?? 10_000} file limit.`; return }
      bytes += statSync(absolute).size
      if (options.maxBytes !== undefined && bytes > options.maxBytes) { reason = `Repository scan exceeded the ${options.maxBytes} byte limit.`; return }
      files.push(absolute)
    }
  }
  visit(projectRoot)
  return { files: files.sort(), incomplete: reason !== undefined, ...(reason ? { reason } : {}) }
}

const SECRET_PATTERNS = [
  /\b(?:sk|pk)[_-](?:live|test)[_-][A-Za-z0-9_-]{12,}\b/g,
  /\b(?:ghp|github_pat|xox[baprs])_[A-Za-z0-9_-]{12,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s,"']+/gi,
]

export const redactSecrets = (value: string): string => SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, '[REDACTED]'), value)

export const redactValue = (value: unknown): unknown => Array.isArray(value)
  ? value.map(redactValue)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactValue(item)]))
    : typeof value === 'string' ? redactSecrets(value) : value
