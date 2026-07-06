import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { applyConfigDefaults } from './defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from './schema.js'

const CONFIG_CANDIDATES = [
  'doc-bridge.config.json',
  'doc-bridge.config.yaml',
  'doc-bridge.config.yml',
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
    if (existsSync(candidate)) return candidate
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

/** v0.1 — JSON config files. TypeScript config import lands in a follow-up. */
export const loadConfig = (opts: LoadConfigOptions = {}): LoadConfigResult => {
  const cwd = resolve(opts.cwd ?? process.cwd())
  const path = findConfigPath(cwd, opts.explicitPath)
  if (!path) throw new ConfigNotFoundError(cwd)

  const raw = readFileSync(path, 'utf8')
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'yaml' || ext === 'yml') {
    throw new Error(`YAML config is not supported yet (${path}). Use doc-bridge.config.json for now.`)
  }

  const parsed = parseJsonConfig(raw, path)
  const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse(parsed))
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