import { Minimatch } from 'minimatch'

/** Patterns come from configuration and requests; the bound keeps long-lived servers from growing it. */
const MAX_COMPILED = 1024
const compiled = new Map<string, Minimatch | null>()

/**
 * `minimatch(path, pattern, { dot: true })` with the pattern compiled once. The function form
 * re-parses its pattern on every call, which dominated discovery on large repositories
 * (files x patterns compilations); the result for any input is unchanged.
 */
export const globMatch = (path: string, pattern: string): boolean => {
  let matcher = compiled.get(pattern)
  if (matcher === undefined) {
    // minimatch() treats a leading `#` as a comment that matches nothing.
    matcher = pattern.charAt(0) === '#' ? null : new Minimatch(pattern, { dot: true })
    if (compiled.size >= MAX_COMPILED) compiled.clear()
    compiled.set(pattern, matcher)
  }
  return matcher ? matcher.match(path) : false
}
