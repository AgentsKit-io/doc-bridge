import { repositoryHas, repositoryText, type RepositoryFiles } from '../repository-io.js'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { splitLines } from '@agentskit/cross-platform'

import type { DocBridgeConfigV1 } from '../../config/schema.js'
import { expandWorkspaceGlobs } from '../../lib/glob-expand.js'
import { toPosix } from '../../lib/paths.js'

export type DiscoveredPackage = {
  readonly id: string
  readonly path: string
  readonly name?: string
  readonly checks?: readonly string[]
}

const parsePnpmWorkspace = (yaml: string): string[] => {
  const lines = splitLines(yaml, { dropTrailingEmpty: false })
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

const readPackageJson = (dir: string, root: string, files?: RepositoryFiles): { name?: string } | null => {
  const file = join(dir, 'package.json')
  if (!(files ? repositoryHas(files, root, file) : existsSync(file))) return null
  try {
    return JSON.parse(files ? repositoryText(files, root, file) : readFileSync(file, 'utf8')) as { name?: string }
  } catch {
    return null
  }
}

export const discoverPnpmPackages = (
  root: string,
  config: DocBridgeConfigV1,
  files?: RepositoryFiles,
): DiscoveredPackage[] => {
  const explicit = config.routing?.options?.packages
  let patterns = explicit
  if (!patterns?.length) {
    const workspaceFile = join(root, 'pnpm-workspace.yaml')
    if ((files ? repositoryHas(files, root, workspaceFile) : existsSync(workspaceFile))) {
      patterns = parsePnpmWorkspace(files ? repositoryText(files, root, workspaceFile) : readFileSync(workspaceFile, 'utf8'))
    }
  }
  if (!patterns?.length) return []

  const dirs = files ? [...new Set(patterns.flatMap(pattern => {
    const normalized = toPosix(pattern).replace(/\/$/, '')
    if (!normalized.includes('*')) return repositoryHas(files, root, join(root, normalized)) ? [join(root, normalized)] : []
    const base = normalized.slice(0, normalized.indexOf('*')).replace(/\/$/, '')
    return [...files.keys()].filter(path => base ? path.startsWith(`${base}/`) : true).map(path => {
      const child = path.slice(base ? base.length + 1 : 0).split('/')[0]
      return child && path.includes('/') ? join(root, base, child) : undefined
    }).filter((path): path is string => Boolean(path))
  }))].sort() : expandWorkspaceGlobs(root, patterns)
  const out: DiscoveredPackage[] = []

  for (const abs of dirs) {
    const pkg = readPackageJson(abs, root, files)
    if (!pkg) continue
    const rel = toPosix(abs.replace(`${toPosix(root)}/`, ''))
    const folderId = basename(abs)
    const id = pkg.name?.startsWith('@') ? pkg.name.split('/').pop() ?? folderId : (pkg.name ?? folderId)
    out.push({ id, path: rel, ...(pkg.name ? { name: pkg.name } : {}) })
  }

  return out.sort((a, b) => a.id.localeCompare(b.id))
}
