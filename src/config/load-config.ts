import type { RepositoryReadV1 } from '../storage/contract.js'
import { readBoundedText } from '../lib/bounded-text.js'
import { executionContext, withExecutionProfile, denyServiceOperation, type ExecutionProfile } from '../execution/profile.js'
import { serviceConfig } from '../execution/config.js'
import { containedPath } from '../safety/repository.js'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { parseStaticJsObject } from '../lib/static-js-literal.js'
import { applyConfigDefaults } from './defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from './schema.js'

const CONFIG_CANDIDATES = [
  'doc-bridge.config.ts',
  'doc-bridge.config.mts',
  'doc-bridge.config.js',
  'doc-bridge.config.mjs',
  'doc-bridge.config.json',
  'doc-bridge.config.yaml',
  'doc-bridge.config.yml',
  'package.json',
] as const

export type LoadConfigOptions = {
  readonly profile?: ExecutionProfile
  readonly cwd?: string
  readonly explicitPath?: string
}

export type LoadConfigResult = {
  readonly config: DocBridgeConfigV1
  readonly path: string
  readonly diagnostics?: readonly string[]
}

export class ConfigNotFoundError extends Error {
  constructor(readonly cwd: string) {
    super(
      `No doc-bridge config found in ${cwd}. Run: ak-docs init — or pass --config <path>.`,
    )
    this.name = 'ConfigNotFoundError'
  }
}

const findConfigPath = (cwd: string, explicitPath?: string): string | null => {
  if (explicitPath) {
    const abs = resolve(cwd, explicitPath)
    return existsSync(abs) ? abs : null
  }
  for (const name of CONFIG_CANDIDATES) {
    const candidate = join(cwd, name)
    if (!existsSync(candidate)) continue
    if (name !== 'package.json') return candidate
    const pkg = parseJsonConfig(readFileSync(candidate, 'utf8'), candidate) as { docBridge?: unknown }
    if (pkg.docBridge) return candidate
  }
  return null
}

const parseJsonConfig = (raw: string, path: string): unknown => {
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse JSON config at ${path}: ${message}`)
  }
}

const parseCodeConfig = (raw: string, path: string): unknown => {
  const unsupportedImports = raw
    .replace(/import\s+type\s+[\s\S]*?;?\n/g, '')
    .replace(/import\s+\{\s*defineConfig\s*\}\s+from\s+['"]@agentskit\/doc-bridge(?:\/config)?['"];?\n?/g, '')
  if (/\bimport\b/.test(unsupportedImports)) {
    throw new Error(`Unsupported import in ${path}. Static config only supports defineConfig imports.`)
  }
  try {
    return parseStaticJsObject(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load config at ${path}: ${message}`)
  }
}

const parseConfig = (input: unknown): DocBridgeConfigV1 => {
  const result = DocBridgeConfigV1Schema.safeParse(input)
  if (result.success) return result.data
  throw new Error(
    `Invalid doc-bridge config:\n${result.error.issues.map((issue) =>
      `  - ${issue.path.join('.') || '(root)'}: ${
        issue.code === 'invalid_type' && issue.message.endsWith('received undefined')
          ? 'Required'
          : issue.code === 'invalid_value' && 'values' in issue
            ? 'Invalid enum value'
            : issue.message
      }`,
    ).join('\n')}`,
  )
}

/** v0.1 — static JS/TS config, JSON config files, and package.json#docBridge. */
export const loadCliConfig = (opts: LoadConfigOptions = {}): LoadConfigResult => withExecutionProfile(opts.profile, () => {
  const requestedCwd = resolve(opts.cwd ?? process.cwd())
  const cwd = executionContext().profile === 'service' ? realpathSync(requestedCwd) : requestedCwd
  const path = findConfigPath(cwd, opts.explicitPath)
  if (!path) throw new ConfigNotFoundError(cwd)
  if (executionContext().profile === 'service' && !containedPath(cwd, path)) throw new Error('Service configuration path escapes caller read root')

  const raw = executionContext().profile === 'service' ? readBoundedText(path, { used: 0 }) : readFileSync(path, 'utf8')
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'yaml' || ext === 'yml') {
    throw new Error(`YAML config is not supported yet (${path}). Use doc-bridge.config.json for now.`)
  }

  const parsed =
    basename(path) === 'package.json'
      ? (parseJsonConfig(raw, path) as { docBridge?: unknown }).docBridge
      : ext === 'ts' || ext === 'mts' || ext === 'js' || ext === 'mjs'
        ? parseCodeConfig(raw, path)
      : parseJsonConfig(raw, path)
  if (executionContext().profile === 'service') return { ...serviceConfig(parsed), path }
  const config = applyConfigDefaults(parseConfig(parsed))
  return { config, path }
})


/** Legacy local configuration API; service callers use bounded injected reads. */
export const loadConfig = (opts: LoadConfigOptions = {}): LoadConfigResult => withExecutionProfile(opts.profile, () => {
  denyServiceOperation('legacy configuration read')
  return loadCliConfig(opts)
})

/** Static config acquisition from a caller-owned exact repository partition. */
export const loadConfigWithRead = async (read: RepositoryReadV1, options: { profile?: ExecutionProfile; explicitPath?: string; signal?: AbortSignal } = {}): Promise<LoadConfigResult> => withExecutionProfile(options.profile, async () => {
  const signal = options.signal ?? new AbortController().signal
  for (const path of options.explicitPath ? [options.explicitPath] : CONFIG_CANDIDATES) {
    const meta = await read.stat({ partition: read.partition, signal, path })
    if (meta.status === 'missing' && !options.explicitPath) continue
    if (meta.status !== 'ok') throw new Error(`not-analyzed: configuration stat ${meta.code}`)
    if (meta.value.kind !== 'file' || meta.value.bytes > 4 * 1024 * 1024) throw new Error('Configuration byte limit exceeded')
    const result = await read.read({ partition: read.partition, signal, path })
    if (result.status === 'missing' && !options.explicitPath) continue
    if (result.status !== 'ok') throw new Error(`not-analyzed: configuration read ${result.code}`)
    if (result.value.bytes.length > 4 * 1024 * 1024) throw new Error('Configuration byte limit exceeded')
    try {
      const raw = Buffer.from(result.value.bytes).toString('utf8')
      const ext = path.split('.').pop()?.toLowerCase()
      if (ext === 'yaml' || ext === 'yml') throw new Error('Unsupported configuration format')
      const parsed = path === 'package.json' ? (parseJsonConfig(raw, path) as { docBridge?: unknown }).docBridge
        : ['ts', 'mts', 'js', 'mjs'].includes(ext ?? '') ? parseCodeConfig(raw, path) : parseJsonConfig(raw, path)
      if (path === 'package.json' && parsed === undefined) continue
      return executionContext().profile === 'service' ? { ...serviceConfig(parsed), path } : { config: applyConfigDefaults(parseConfig(parsed)), path }
    } catch (error) {
      if (executionContext().profile === 'service') throw new Error('Invalid service configuration at ' + path)
      throw error
    }
  }
  throw new Error('No configuration in caller repository partition')
})

export const resolveProjectRoot = (start = process.cwd()): string => {
  let cur = resolve(start)
  for (let i = 0; i < 12; i += 1) {
    if (findConfigPath(cur)) return cur
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return resolve(start)
}

/** Project root for a loaded config file path (directory of the config). */
export const projectRootFromConfigPath = (
  configFilePath: string,
  projectRootField?: string,
): string => {
  const configDir = dirname(resolve(configFilePath))
  if (projectRootField) return resolve(configDir, projectRootField)
  return configDir
}
