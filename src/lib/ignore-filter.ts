/**
 * Which files a repository scan may see.
 *
 * A committed index is only reproducible while it is a function of committed (or at least
 * non-ignored) content. Build output — `.next/`, `.source/`, generated API docs, files that a dev
 * server writes such as `next-env.d.ts` — exists on one machine and not on the next, so every walk
 * that feeds the index honours the repository's ignore rules in addition to its own excludes.
 *
 * Inside a Git work tree the answer comes from Git itself (`git ls-files --cached --others
 * --exclude-standard`), which applies nested `.gitignore` files, `.git/info/exclude`, and the
 * user's global excludes exactly as `git status` does, and still lists tracked files that happen to
 * match an ignore rule. Outside Git (a tarball, a CI cache, Git not installed) the `.gitignore`
 * files on disk are applied with the same semantics, one directory at a time.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import ignore, { type Ignore } from 'ignore'

export type IgnoreFilterMode = 'git' | 'gitignore'

export type IgnoreFilter = {
  /** `git` when Git answered for this root, `gitignore` for the on-disk fallback. */
  readonly mode: IgnoreFilterMode
  /** True when `absolutePath` (a file, or a directory when `isDirectory`) must not be scanned. */
  readonly isIgnored: (absolutePath: string, isDirectory: boolean) => boolean
}

const toPosix = (value: string): string => value.split(sep).join('/')

const canonical = (path: string): string => {
  try {
    return realpathSync.native(resolve(path))
  } catch {
    return resolve(path)
  }
}

/** Path of `candidate` below `root` in POSIX form, or undefined when it is outside `root`. */
const below = (root: string, candidate: string): string | undefined => {
  const rel = relative(root, candidate)
  if (rel === '') return ''
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) return undefined
  return toPosix(rel)
}

const gitVisibleFiles = (root: string): readonly string[] | undefined => {
  try {
    const inside = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (inside !== 'true') return undefined
    const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    // Paths are relative to `cwd`. A nested repository shows up as `name/`; its files stay hidden.
    return output.split('\0').filter(Boolean)
  } catch {
    return undefined
  }
}

const gitFilter = (root: string, canonicalRoot: string, visible: readonly string[]): IgnoreFilter => {
  const files = new Set(visible.filter((path) => !path.endsWith('/')))
  const directories = new Set<string>([''])
  for (const file of visible) {
    let parent = file
    for (;;) {
      const slash = parent.lastIndexOf('/')
      if (slash === -1) break
      parent = parent.slice(0, slash)
      if (directories.has(parent)) break
      directories.add(parent)
    }
  }
  return {
    mode: 'git',
    isIgnored: (absolutePath, isDirectory) => {
      const rel = below(root, resolve(absolutePath)) ?? below(canonicalRoot, canonical(absolutePath))
      if (rel === undefined) return false
      return isDirectory ? !directories.has(rel) : !files.has(rel)
    },
  }
}

const gitignoreFilter = (root: string): IgnoreFilter => {
  const rules = new Map<string, Ignore | undefined>()
  const rulesFor = (directory: string): Ignore | undefined => {
    if (rules.has(directory)) return rules.get(directory)
    const file = join(directory, '.gitignore')
    let matcher: Ignore | undefined
    if (existsSync(file)) {
      try {
        matcher = ignore().add(readFileSync(file, 'utf8'))
      } catch {
        matcher = undefined
      }
    }
    rules.set(directory, matcher)
    return matcher
  }
  const ignoredCache = new Map<string, boolean>()
  const isIgnored = (absolutePath: string, isDirectory: boolean): boolean => {
    const target = resolve(absolutePath)
    const rel = below(root, target)
    if (rel === undefined || rel === '') return false
    const key = `${isDirectory ? 'd' : 'f'}:${rel}`
    const cached = ignoredCache.get(key)
    if (cached !== undefined) return cached
    // A path is ignored when an ancestor directory is ignored, or when the nearest applicable rule
    // in any `.gitignore` between the root and its parent matches it (deeper files win).
    const parent = dirname(target)
    let result = parent !== root && below(root, parent) !== undefined ? isIgnored(parent, true) : false
    if (!result) {
      let decided: boolean | undefined
      let directory = root
      const segments = below(root, parent)?.split('/').filter(Boolean) ?? []
      for (let index = 0; index <= segments.length; index += 1) {
        if (index > 0) directory = join(directory, segments[index - 1] as string)
        const matcher = rulesFor(directory)
        if (!matcher) continue
        const local = toPosix(relative(directory, target)) + (isDirectory ? '/' : '')
        const verdict = matcher.test(local)
        if (verdict.ignored) decided = true
        else if (verdict.unignored) decided = false
      }
      result = decided ?? false
    }
    ignoredCache.set(key, result)
    return result
  }
  return { mode: 'gitignore', isIgnored }
}

/**
 * Build the filter for one scan root. Call once per walk: the Git listing reflects the working
 * tree at that moment, so a long-lived watcher rebuilds it on every rescan.
 */
export const createIgnoreFilter = (root: string): IgnoreFilter => {
  const base = resolve(root)
  const canonicalRoot = canonical(root)
  const visible = gitVisibleFiles(canonicalRoot)
  return visible ? gitFilter(base, canonicalRoot, visible) : gitignoreFilter(base)
}
