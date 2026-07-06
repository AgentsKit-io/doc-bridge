import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { toPosix } from './paths.js'

/** Expand simple workspace globs: `packages/*`, `apps/*`, literal paths. */
export const expandWorkspaceGlobs = (root: string, patterns: readonly string[]): string[] => {
  const dirs = new Set<string>()

  for (const pattern of patterns) {
    const normalized = toPosix(pattern).replace(/\/$/, '')
    if (!normalized.includes('*')) {
      const abs = join(root, normalized)
      if (existsSync(abs)) dirs.add(toPosix(abs))
      continue
    }

    const star = normalized.indexOf('*')
    const base = join(root, normalized.slice(0, star).replace(/\/$/, ''))
    if (!existsSync(base)) continue

    for (const name of readdirSync(base)) {
      const abs = join(base, name)
      try {
        if (statSync(abs).isDirectory()) dirs.add(toPosix(abs))
      } catch {
        // skip
      }
    }
  }

  return [...dirs].sort()
}