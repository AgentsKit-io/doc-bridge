import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { toPosix } from './paths.js'

const DEFAULT_SKIP = new Set(['node_modules', '.git', 'dist', 'coverage', '.doc-bridge'])
const DEFAULT_MAX_FILES = 10_000

export const walkFiles = (
  root: string,
  opts?: {
    readonly extensions?: readonly string[]
    readonly skipDirs?: ReadonlySet<string>
    readonly maxFiles?: number
  },
): string[] => {
  const extensions = opts?.extensions ?? ['.md']
  const skip = opts?.skipDirs ?? DEFAULT_SKIP
  const out: string[] = []
  const visited = new Set<string>()

  const visit = (dir: string) => {
    let canonicalDir: string
    try {
      canonicalDir = realpathSync.native(dir)
    } catch {
      return
    }
    if (visited.has(canonicalDir)) return
    visited.add(canonicalDir)

    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const abs = join(dir, name)
      let st
      try {
        st = lstatSync(abs)
      } catch {
        continue
      }
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) {
        if (skip.has(name)) continue
        visit(abs)
        continue
      }
      if (!st.isFile()) continue
      if (extensions.some((ext) => name.endsWith(ext))) {
        if (out.length >= (opts?.maxFiles ?? DEFAULT_MAX_FILES)) {
          throw new Error(`Documentation corpus exceeds the ${opts?.maxFiles ?? DEFAULT_MAX_FILES} file limit.`)
        }
        out.push(toPosix(abs))
      }
    }
  }

  visit(root)
  return out.sort()
}
