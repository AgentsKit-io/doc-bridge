import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export const toPosix = (value: string): string => value.split('\\').join('/')

export const resolveFromRoot = (root: string, rel: string): string =>
  resolve(root, rel)

export const containedProjectPath = (root: string, path: string): string | undefined => {
  const projectRoot = realpathSync.native(resolve(root))
  const unresolved = resolve(projectRoot, path)
  const unresolvedRelative = relative(projectRoot, unresolved)
  if (
    isAbsolute(unresolvedRelative) ||
    unresolvedRelative === '..' ||
    unresolvedRelative.startsWith(`..${sep}`)
  ) return undefined

  const canonical = existsSync(unresolved) ? realpathSync.native(unresolved) : unresolved
  const canonicalRelative = relative(projectRoot, canonical)
  return isAbsolute(canonicalRelative) || canonicalRelative === '..' || canonicalRelative.startsWith(`..${sep}`)
    ? undefined
    : canonical
}
