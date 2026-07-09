import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import type { DocBridgeConfigV1 } from '../../config/schema.js'
import { expandWorkspaceGlobs } from '../../lib/glob-expand.js'
import { toPosix } from '../../lib/paths.js'

export type DiscoveredPackage = {
  readonly id: string
  readonly path: string
  readonly name?: string
}

const parsePnpmWorkspace = (yaml: string): string[] => {
  const lines = yaml.split('\n')
  const patterns: string[] = []
  let inPackages = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'packages:') {
      inPackages = true
      continue
    }
    if (inPackages) {
      if (trimmed.startsWith('- ')) {
        patterns.push(trimmed.slice(2).trim().replace(/^['"]|['"]$/g, ''))
        continue
      }
      if (trimmed && !trimmed.startsWith('#')) inPackages = false
    }
  }
  return patterns
}

const readPackageJson = (dir: string): { name?: string } | null => {
  const file = join(dir, 'package.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as { name?: string }
  } catch {
    return null
  }
}

export const discoverPnpmPackages = (
  root: string,
  config: DocBridgeConfigV1,
): DiscoveredPackage[] => {
  const explicit = config.routing?.options?.packages
  let patterns = explicit
  if (!patterns?.length) {
    const workspaceFile = join(root, 'pnpm-workspace.yaml')
    if (existsSync(workspaceFile)) {
      patterns = parsePnpmWorkspace(readFileSync(workspaceFile, 'utf8'))
    }
  }
  if (!patterns?.length) return []

  const dirs = expandWorkspaceGlobs(root, patterns)
  const out: DiscoveredPackage[] = []

  for (const abs of dirs) {
    const pkg = readPackageJson(abs)
    if (!pkg) continue
    const rel = toPosix(abs.replace(`${toPosix(root)}/`, ''))
    const folderId = basename(abs)
    const id = pkg.name?.startsWith('@') ? pkg.name.split('/').pop() ?? folderId : (pkg.name ?? folderId)
    out.push({ id, path: rel, ...(pkg.name ? { name: pkg.name } : {}) })
  }

  return out.sort((a, b) => a.id.localeCompare(b.id))
}
