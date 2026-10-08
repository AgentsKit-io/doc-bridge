import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { toPosix } from '@agentskit/cross-platform'

import { minimatch } from 'minimatch'

import { createIgnoreFilter } from '../lib/ignore-filter.js'

export const DEFAULT_SAFETY_EXCLUDES = ['**/.git/**', '**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/.doc-bridge/**', '**/.next/**', '**/out/**', '**/.turbo/**', '**/.svelte-kit/**', '**/.mcpb-build/**', '**/.mcpb-output/**', '**/.env', '**/.env.*', '**/*secret*', '**/*credential*', '**/*.pem', '**/*.key'] as const

export type SafeWalkOptions = {
  readonly extensions?: readonly string[]
  readonly exclude?: readonly string[]
  readonly maxFiles?: number
  readonly maxBytes?: number
  readonly maxTimeMs?: number
  readonly maxMemoryMb?: number
  /**
   * Skip what the repository ignores (Git ignore rules, or `.gitignore` files outside Git) in
   * addition to `exclude`, so build output never reaches the index. Defaults to true.
   */
  readonly respectIgnore?: boolean
  readonly collectExcludedDocumentation?: boolean
}

export type SafeWalkResult = {
  readonly files: readonly string[]
  readonly incomplete: boolean
  readonly reason?: string
  readonly excludedDocumentation?: readonly string[]
  readonly excludedDocumentationOmitted?: number
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
  const excludedDocumentation: string[] = []
  let excludedDocumentationOmitted = 0
  let bytes = 0
  let reason: string | undefined
  const started = Date.now()
  const matchesExclude = (path: string): boolean => excludes.some((pattern) => minimatch(path, pattern, { dot: true }))
  const ignored = options.respectIgnore === false ? undefined : createIgnoreFilter(projectRoot)
  const visit = (directory: string): void => {
    if (reason) return
    if (options.maxTimeMs !== undefined && Date.now() - started >= options.maxTimeMs) { reason = `Repository scan exceeded the ${options.maxTimeMs} ms time limit.`; return }
    if (options.maxMemoryMb !== undefined && process.memoryUsage().heapUsed > options.maxMemoryMb * 1024 * 1024) { reason = `Repository scan exceeded the ${options.maxMemoryMb} MiB memory limit.`; return }
    let entries: string[]
    try { entries = readdirSync(directory) } catch { return }
    for (const name of entries.sort()) {
      const absolute = resolve(directory, name)
      const relativePath = toPosix(relative(projectRoot, absolute))
      if (matchesExclude(relativePath) || name === '.git') {
        if (options.collectExcludedDocumentation) {
          let excludedPath: string | undefined
          if (/\.mdx?$/.test(name)) excludedPath = relativePath
          else if (/secret|credential/.test(name)) {
            try { if (lstatSync(absolute).isDirectory()) excludedPath = `${relativePath}/` } catch { /* Unreadable excluded paths stay excluded. */ }
          }
          if (excludedPath) { if (excludedDocumentation.length < 32) excludedDocumentation.push(excludedPath); else excludedDocumentationOmitted++ }
        }
        continue
      }
      let stats
      try { stats = lstatSync(absolute) } catch { continue }
      if (stats.isSymbolicLink()) continue
      if (ignored?.isIgnored(absolute, stats.isDirectory())) continue
      if (stats.isDirectory()) { visit(absolute); if (reason) return; continue }
      if (!stats.isFile() || (extensions.length > 0 && !extensions.some((extension) => name.endsWith(extension)))) continue
      if (files.length >= (options.maxFiles ?? 10_000)) { reason = `Repository scan exceeded the ${options.maxFiles ?? 10_000} file limit.`; return }
      bytes += statSync(absolute).size
      if (options.maxBytes !== undefined && bytes > options.maxBytes) { reason = `Repository scan exceeded the ${options.maxBytes} byte limit.`; return }
      files.push(absolute)
    }
  }
  visit(projectRoot)
  return { files: files.sort(), incomplete: reason !== undefined, ...(reason ? { reason } : {}), ...(options.collectExcludedDocumentation ? { excludedDocumentation, excludedDocumentationOmitted } : {}) }
}

/**
 * The one secret-shape list Doc Bridge redacts with. Specific, prefix-anchored token shapes come
 * first; the generic `key=value` credential pattern runs last. Every pattern is global, so use
 * `redactSecrets` / `containsSecret` rather than calling `.test()` on these directly.
 */
export const SECRET_PATTERNS: readonly RegExp[] = Object.freeze([
  // PEM private key blocks (RSA, EC, OPENSSH, PGP, ...); an unterminated block is redacted to the end.
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g,
  // Stripe secret, publishable and restricted keys.
  /\b(?:sk|pk|rk)[_-](?:live|test)[_-][A-Za-z0-9_-]{12,}\b/g,
  // Anthropic keys, then OpenAI project/service/admin keys and legacy alphanumeric keys.
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  // GitHub classic (ghp/gho/ghu/ghs/ghr) and fine-grained tokens.
  /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_-]{12,}\b/g,
  // Slack bot/user/app/refresh/config tokens and app-level tokens.
  /\b(?:xox[abeoprs]|xapp)[-_][A-Za-z0-9-]{10,}/g,
  // AWS access key ids (long-term and temporary).
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  // Google API keys.
  /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g,
  // npm access tokens.
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  // HTTP bearer credentials; the scheme word is kept.
  /(?<=\bBearer\s+)[A-Za-z0-9._~+/-]{16,}=*/gi,
  /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s,"']+/gi,
])

export const redactSecrets = (value: string): string => SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, '[REDACTED]'), value)

export const containsSecret = (value: string): boolean => redactSecrets(value) !== value

export const redactValue = (value: unknown): unknown => Array.isArray(value)
  ? value.map(redactValue)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactValue(item)]))
    : typeof value === 'string' ? redactSecrets(value) : value
