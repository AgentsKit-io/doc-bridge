import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import type { DocBridgeConfigV1 } from '../../config/schema.js'
import { detectPackageManager } from '../../lib/package-manager.js'
import { toPosix } from '../../lib/paths.js'
import { walkFiles } from '../../lib/walk.js'
import type { DiscoveredPackage } from './pnpm-monorepo.js'

const NX_SCAN_SKIP = new Set([
  'node_modules',
  '.git',
  '.nx',
  'dist',
  'coverage',
  '.doc-bridge',
])
const NX_PROJECT_NAME = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readJsonRecord = (path: string): JsonRecord | undefined => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

const safeProjectPath = (
  root: string,
  manifestDir: string,
  declaredRoot?: unknown,
): string | undefined => {
  const candidate = typeof declaredRoot === 'string' ? resolve(root, declaredRoot) : manifestDir
  const rel = toPosix(relative(root, candidate)) || '.'
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('../')) return undefined
  try {
    if (!lstatSync(candidate).isDirectory()) return undefined
    const canonicalRoot = realpathSync.native(root)
    const canonicalCandidate = realpathSync.native(candidate)
    const canonicalRel = relative(canonicalRoot, canonicalCandidate)
    if (
      isAbsolute(canonicalRel) ||
      canonicalRel === '..' ||
      canonicalRel.startsWith(`..${sep}`)
    ) {
      return undefined
    }
  } catch {
    return undefined
  }
  return rel
}

const packageId = (name: string): string =>
  name.startsWith('@') ? (name.split('/').at(-1) ?? name) : name

const commandPrefix = (root: string): string => {
  const manager = detectPackageManager(root)
  if (manager === 'pnpm') return 'pnpm exec nx run'
  if (manager === 'yarn') return 'yarn nx run'
  if (manager === 'bun') return 'bunx nx run'
  return 'npx nx run'
}

const inferredChecks = (
  root: string,
  config: DocBridgeConfigV1,
  projectName: string,
  targets: ReadonlySet<string>,
): string[] | undefined => {
  const prefix = commandPrefix(root)
  const strict = (config.gates?.preset ?? 'minimal') !== 'minimal'
  const checks = [
    ...(targets.has('test') ? [`${prefix} ${projectName}:test`] : []),
    ...(strict && targets.has('lint') ? [`${prefix} ${projectName}:lint`] : []),
  ]
  return checks.length ? checks : undefined
}

type RankedProject = DiscoveredPackage & {
  readonly rank: number
  readonly targets: readonly string[]
}

export const discoverNxProjects = (
  root: string,
  config: DocBridgeConfigV1,
): DiscoveredPackage[] => {
  if (!existsSync(resolve(root, 'nx.json'))) return []

  const manifests = walkFiles(root, {
    extensions: ['project.json', 'package.json'],
    skipDirs: NX_SCAN_SKIP,
    maxFiles: 10_000,
  })
  const projects = new Map<string, RankedProject>()

  for (const manifest of manifests) {
    const json = readJsonRecord(manifest)
    if (!json) continue
    const manifestDir = dirname(manifest)
    const manifestName = basename(manifest)
    const isProjectJson = manifestName === 'project.json'
    if (!isProjectJson && manifestName !== 'package.json') continue
    const nx = json.nx
    if (!isProjectJson && !isRecord(nx)) continue

    const path = safeProjectPath(root, manifestDir, isProjectJson ? json.root : undefined)
    if (!path) continue
    const projectPackage = isProjectJson
      ? readJsonRecord(resolve(root, path, 'package.json'))
      : undefined
    const projectName =
      typeof json.name === 'string'
        ? json.name
        : typeof projectPackage?.name === 'string'
          ? projectPackage.name
          : basename(path === '.' ? root : path)
    if (!NX_PROJECT_NAME.test(projectName)) continue

    const targets = new Set<string>()
    const targetRecord = isProjectJson ? json.targets : isRecord(nx) ? nx.targets : undefined
    if (isRecord(targetRecord)) {
      for (const target of Object.keys(targetRecord)) targets.add(target)
    }
    if (!isProjectJson && isRecord(json.scripts)) {
      for (const script of Object.keys(json.scripts)) targets.add(script)
    }

    const id = packageId(projectName)
    const rank = isProjectJson ? 2 : 1
    const existing = projects.get(id)
    if (existing && existing.path !== path) {
      throw new Error(
        `Nx project identity collision for "${id}": "${existing.name ?? id}" at "${existing.path}" and "${projectName}" at "${path}". Use unique Nx project names.`,
      )
    }
    const mergedTargets = [...new Set([...(existing?.targets ?? []), ...targets])]
    const projectJsonWins = rank >= (existing?.rank ?? 0)
    const resolvedName = projectJsonWins ? projectName : (existing?.name ?? projectName)
    const checks = inferredChecks(root, config, resolvedName, new Set(mergedTargets))
    projects.set(id, {
      id,
      path,
      name: resolvedName,
      ...(checks ? { checks } : {}),
      rank: projectJsonWins ? rank : (existing?.rank ?? rank),
      targets: mergedTargets,
    })
  }

  return [...projects.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ rank: _rank, targets: _targets, ...project }) => project)
}
