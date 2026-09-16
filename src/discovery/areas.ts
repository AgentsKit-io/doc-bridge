import { minimatch } from 'minimatch'

import { toPosix } from '../lib/paths.js'
import { entityId } from './identity.js'

/**
 * Code areas: the unit of architecture between a package and a file.
 *
 * Reconciliation could only compare at file, module or package level, and most repositories are a
 * single package — so every internal relation aggregated into one self-loop, which the comparison
 * skips. The result was a repository with a thousand observed relations reporting zero
 * diagnostics, and a health score of 100 out of 100 saying nothing at all.
 *
 * An area is a directory that groups modules. It is derived, not declared: the first directory
 * level under a package's source roots, plus any path an ownership record already names — because
 * a configuration saying `path: "src/mcp"` is a human telling us that directory is a unit, and the
 * graph had no entity for it.
 */

export const AREA_ANALYZER_VERSION = '1.0.0'

/**
 * Directories that contain areas rather than being one.
 *
 * `src` is not an area in any useful sense; `src/query` is. When a package keeps its code under
 * one of these, the area is the level below it.
 */
export const DEFAULT_AREA_ROOTS = ['src', 'lib', 'app', 'source', 'server', 'client', 'packages', 'apps'] as const

export const DEFAULT_AREA_DEPTH = 1

export type AreaModule = {
  readonly moduleId: string
  /** Repository-relative module path. */
  readonly path: string
  readonly packageId: string
  /** Repository-relative package path; `.` for the root package. */
  readonly packagePath: string
}

export type AreaOwnership = {
  readonly id: string
  readonly path: string
}

export type DerivedArea = {
  readonly id: string
  readonly path: string
  readonly name: string
  readonly packageId: string
  /** The most specific area that encloses this one, when there is one. */
  readonly parentId?: string
  readonly moduleIds: readonly string[]
  /** The ownership record that names exactly this path. */
  readonly ownershipId?: string
}

export type DeriveAreasOptions = {
  readonly modules: readonly AreaModule[]
  readonly ownership?: readonly AreaOwnership[]
  readonly depth?: number
  readonly roots?: readonly string[]
  /**
   * Glob patterns for directories that hold code without being a unit of architecture.
   *
   * A candidate that matches is not derived as an area, and its modules fall to the most
   * specific area that still encloses them — or to none, which is the honest answer for a
   * folder of fixtures. An ownership record naming the same path still wins: a person saying
   * a directory is a unit outranks a pattern saying it is not.
   */
  readonly exclude?: readonly string[]
}

/*
 * Trailing separators are trimmed with a loop rather than /\/+$/: a quantified group anchored at
 * the end backtracks quadratically on a path that is mostly separators, and a module path comes
 * from the repository being scanned.
 */
const normalize = (path: string): string => {
  const posix = toPosix(path).replace(/^\.\//, '')
  let end = posix.length
  while (end > 0 && posix[end - 1] === '/') end -= 1
  return posix.slice(0, end)
}

const relativeToPackage = (modulePath: string, packagePath: string): string | undefined => {
  if (packagePath === '.' || packagePath === '') return modulePath
  const prefix = `${packagePath}/`
  return modulePath.startsWith(prefix) ? modulePath.slice(prefix.length) : undefined
}

const join = (...parts: readonly string[]): string => parts.filter(Boolean).join('/')

/**
 * The area a module belongs to by convention: `depth` directory levels, counted below a source
 * root when the module sits under one. A module directly in the package or in a bare source root
 * has no conventional area — there is no directory grouping it with anything.
 */
export const conventionalAreaPath = (
  module: AreaModule,
  depth = DEFAULT_AREA_DEPTH,
  roots: readonly string[] = DEFAULT_AREA_ROOTS,
): string | undefined => {
  const relative = relativeToPackage(normalize(module.path), normalize(module.packagePath))
  if (relative === undefined) return undefined
  const segments = relative.split('/')
  segments.pop()
  if (!segments.length) return undefined

  const rootPrefix: string[] = []
  let rest = segments
  if (segments[0] && roots.includes(segments[0])) {
    rootPrefix.push(segments[0])
    rest = segments.slice(1)
  }
  const taken = rest.slice(0, Math.max(1, depth))
  if (!taken.length) return undefined

  const packagePath = normalize(module.packagePath)
  return join(packagePath === '.' ? '' : packagePath, ...rootPrefix, ...taken)
}

const encloses = (candidate: string, path: string): boolean => path === candidate || path.startsWith(`${candidate}/`)

/**
 * Derive the areas of a repository.
 *
 * Every module is assigned to exactly one area — the most specific one containing it — so the
 * containment graph stays a tree and an aggregation at area scope has one answer per module.
 * Nested areas keep their shape: `src` names the area that holds what is directly in `src`, and
 * `src/query` its own, with `src` recorded as the parent.
 */
export const deriveAreas = (options: DeriveAreasOptions): readonly DerivedArea[] => {
  const depth = options.depth ?? DEFAULT_AREA_DEPTH
  const roots = options.roots ?? [...DEFAULT_AREA_ROOTS]
  const ownership = (options.ownership ?? []).map((record) => ({ ...record, path: normalize(record.path) }))

  const excluded = options.exclude ?? []
  const isExcluded = (path: string): boolean =>
    excluded.some((pattern) => minimatch(path, pattern, { dot: true }))

  /** Candidate path to the package it belongs to. */
  const candidates = new Map<string, string>()
  for (const module of options.modules) {
    const path = conventionalAreaPath(module, depth, roots)
    if (path && !candidates.has(path) && !isExcluded(path)) candidates.set(path, module.packageId)
  }
  // An ownership record naming a directory that holds observed code is an area by declaration.
  for (const record of ownership) {
    if (!record.path || candidates.has(record.path)) continue
    const owner = options.modules.find((module) => encloses(record.path, normalize(module.path)))
    if (owner) candidates.set(record.path, owner.packageId)
  }

  const paths = [...candidates.keys()].sort()
  const byLength = [...paths].sort((a, b) => b.length - a.length || a.localeCompare(b))
  const moduleIds = new Map<string, string[]>(paths.map((path) => [path, []]))

  for (const module of options.modules) {
    const modulePath = normalize(module.path)
    const area = byLength.find((candidate) => encloses(candidate, modulePath))
    if (area) moduleIds.get(area)?.push(module.moduleId)
  }

  const ownershipByPath = new Map(ownership.map((record) => [record.path, record.id]))

  return paths.map((path) => {
    const parent = byLength.find((candidate) => candidate !== path && encloses(candidate, path))
    const ownershipId = ownershipByPath.get(path)
    return {
      id: entityId('area', path),
      path,
      name: path.split('/').pop() ?? path,
      packageId: candidates.get(path) as string,
      ...(parent ? { parentId: entityId('area', parent) } : {}),
      moduleIds: [...(moduleIds.get(path) ?? [])].sort(),
      ...(ownershipId ? { ownershipId } : {}),
    }
  })
}

/**
 * Ownership paths no observed entity lives under.
 *
 * A configured path that matches nothing is almost always a rename or a typo, and it is invisible
 * until something looks: the handoff still resolves, it just points at a directory that no longer
 * holds what it claims.
 */
export const unobservedOwnershipPaths = (
  ownership: readonly AreaOwnership[],
  observedPaths: readonly string[],
): readonly AreaOwnership[] => {
  const paths = observedPaths.map(normalize)
  return ownership
    .map((record) => ({ ...record, path: normalize(record.path) }))
    .filter((record) => record.path && !paths.some((path) => encloses(record.path, path)))
}
