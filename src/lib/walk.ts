import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { toPosix } from './paths.js'

const DEFAULT_SKIP = new Set(['node_modules', '.git', 'dist', 'coverage', '.doc-bridge'])

export const walkFiles = (
  root: string,
  opts?: { readonly extensions?: readonly string[]; readonly skipDirs?: ReadonlySet<string> },
): string[] => {
  const extensions = opts?.extensions ?? ['.md']
  const skip = opts?.skipDirs ?? DEFAULT_SKIP
  const out: string[] = []

  const visit = (dir: string) => {
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
        st = statSync(abs)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (skip.has(name)) continue
        visit(abs)
        continue
      }
      if (!st.isFile()) continue
      if (extensions.some((ext) => name.endsWith(ext))) {
        out.push(toPosix(abs))
      }
    }
  }

  visit(root)
  return out.sort()
}