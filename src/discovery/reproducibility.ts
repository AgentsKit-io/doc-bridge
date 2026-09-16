/**
 * Whether a committed index could have been produced by a clean checkout.
 *
 * The recommended setup commits `.doc-bridge/index.json` so a gate can verify it, and that only
 * works while the index is a function of committed content. A scan has no reason to know about
 * `.gitignore` — it walks what is on disk — so a generated module or document silently joins the
 * corpus on any machine that has built, and silently leaves it on one that has not. The index then
 * disagrees with itself between two checkouts of the same commit, `index-freshness` reports an
 * artifact that nothing invalidated, and regenerating cannot fix it because the next machine
 * disagrees in the other direction.
 *
 * Dogfooding found this the expensive way: a 25-package monorepo whose gate passed locally and
 * failed in CI because `pnpm lint` had generated one `.ts` file into the corpus before the index
 * was written. The scan cannot guess which files are generated, but Git already knows, so the
 * check is: of the paths this index carries, which ones does Git ignore?
 *
 * It only applies when the index is itself tracked. A consumer who regenerates on every run has
 * nothing to reproduce, and reporting generated files to them would be noise.
 */

import { execFileSync } from 'node:child_process'

export type IgnoredIndexEntry = {
  readonly path: string
  /** The ignore rule that matched, as `.gitignore:12:pattern`, so the fix is one lookup away. */
  readonly rule: string
}

export type IndexReproducibility = {
  /**
   * Whether the question was answerable. False outside a Git checkout, when Git is unavailable, or
   * when the index is not tracked — in all three cases `ignored` is empty and means nothing.
   */
  readonly checked: boolean
  /** Why the check did not run, for a caller that wants to say so. */
  readonly skipped?: 'no-git' | 'index-untracked'
  /** Indexed paths that Git ignores, in path order. */
  readonly ignored: readonly IgnoredIndexEntry[]
}

const NOT_CHECKED = (skipped: 'no-git' | 'index-untracked'): IndexReproducibility => ({
  checked: false,
  skipped,
  ignored: [],
})

/**
 * `undefined` means the command did not answer.
 *
 * `allowExit1` is for `check-ignore` alone, which exits 1 when nothing matched — the common answer
 * rather than a failure, and it still writes whatever did match to stdout. The probes must not
 * share that tolerance: `ls-files --error-unmatch` exits 1 precisely to say "not tracked", and
 * reading that as success made the untracked case look checked.
 */
const git = (
  root: string,
  args: readonly string[],
  options: { readonly input?: string; readonly allowExit1?: boolean } = {},
): string | undefined => {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
      ...(options.input === undefined ? {} : { input: options.input }),
    })
  } catch (error) {
    const status = (error as { status?: number }).status
    if (options.allowExit1 && status === 1) return (error as { stdout?: string }).stdout ?? ''
    return undefined
  }
}

/**
 * The paths a committed index carries that Git ignores.
 *
 * `git check-ignore` consults the index by default, so a tracked file that also matches an ignore
 * pattern is correctly reported as not ignored — being committed is the whole point. A test pins
 * that behaviour rather than trusting it.
 */
export const checkIndexReproducibility = (
  root: string,
  indexPath: string,
  paths: readonly string[],
): IndexReproducibility => {
  if (git(root, ['rev-parse', '--is-inside-work-tree']) === undefined) return NOT_CHECKED('no-git')
  if (git(root, ['ls-files', '--error-unmatch', '--', indexPath]) === undefined) {
    return NOT_CHECKED('index-untracked')
  }
  if (paths.length === 0) return { checked: true, ignored: [] }

  const unique = [...new Set(paths)].sort()
  const output = git(root, ['check-ignore', '--verbose', '-z', '--stdin'], {
    input: `${unique.join('\0')}\0`,
    allowExit1: true,
  })
  if (output === undefined) return NOT_CHECKED('no-git')

  /* `-z --verbose` emits four NUL-terminated fields per match: source, line, pattern, path. */
  const fields = output.split('\0')
  const ignored: IgnoredIndexEntry[] = []
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const [source, line, pattern, path] = [fields[index], fields[index + 1], fields[index + 2], fields[index + 3]]
    if (!path) continue
    ignored.push({ path, rule: `${source ?? '?'}:${line ?? '?'}:${pattern ?? '?'}` })
  }
  return { checked: true, ignored: ignored.sort((left, right) => left.path.localeCompare(right.path)) }
}
