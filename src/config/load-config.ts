import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import vm from 'node:vm'

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
  readonly cwd?: string
  readonly explicitPath?: string
}

export type LoadConfigResult = {
  readonly config: DocBridgeConfigV1
  readonly path: string
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
  const code = raw
    .replace(/import\s+type\s+[\s\S]*?;?\n/g, '')
    .replace(/import\s+\{\s*defineConfig\s*\}\s+from\s+['"]@agentskit\/doc-bridge(?:\/config)?['"];?\n?/g, '')
    .replace(/\s+satisfies\s+[A-Za-z0-9_.$<>{}\[\],\s]+(?=\s*(?:;|\)|$))/g, '')
    .replace(/export\s+default/, 'module.exports.default =')

  if (/\bimport\b/.test(code)) {
    throw new Error(`Unsupported import in ${path}. Static config only supports defineConfig imports.`)
  }

  const sandbox = {
    module: { exports: {} as { default?: unknown } },
    exports: {},
    defineConfig: (config: unknown) => config,
  }
  try {
    vm.runInNewContext(code, sandbox, { timeout: 250, filename: path })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load config at ${path}: ${message}`)
  }
  return sandbox.module.exports.default
}

const parseConfig = (input: unknown): DocBridgeConfigV1 => {
  const result = DocBridgeConfigV1Schema.safeParse(input)
  if (result.success) return result.data
  throw new Error(
    `Invalid doc-bridge config:\n${result.error.issues.map((issue) =>
      `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    ).join('\n')}`,
  )
}

/** v0.1 — static JS/TS config, JSON config files, and package.json#docBridge. */
export const loadConfig = (opts: LoadConfigOptions = {}): LoadConfigResult => {
  const cwd = resolve(opts.cwd ?? process.cwd())
  const path = findConfigPath(cwd, opts.explicitPath)
  if (!path) throw new ConfigNotFoundError(cwd)

  const raw = readFileSync(path, 'utf8')
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
  const config = applyConfigDefaults(parseConfig(parsed))
  return { config, path }
}

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
