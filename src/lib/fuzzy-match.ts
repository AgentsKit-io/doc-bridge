/**
 * Jaro-Winkler similarity, mirroring `fuzzyMatchList` from `@agentskit/core/fuzzy-match`.
 *
 * The ecosystem owns this contract; it is mirrored rather than imported for the same reason the
 * eval format is: `@agentskit/core` is an optional peer, loaded dynamically, and discovery is
 * synchronous — an analyzer that resolved a reference only when an optional package happened to
 * be installed would make the snapshot depend on the installation. A test cross-checks these
 * functions against the real ones when the peer is present, so the mirror cannot drift.
 */

export type FuzzyMatch = {
  readonly candidate: string
  readonly score: number
}

const normalize = (value: string, caseSensitive: boolean): string =>
  (caseSensitive ? value : value.toLowerCase()).trim().replace(/\s+/g, ' ')

/** Jaro similarity: matching characters within a sliding window, minus half the transpositions. */
export const jaro = (a: string, b: string): number => {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const matchedA = new Array<boolean>(a.length).fill(false)
  const matchedB = new Array<boolean>(b.length).fill(false)
  let matches = 0

  for (let index = 0; index < a.length; index += 1) {
    const from = Math.max(0, index - window)
    const to = Math.min(index + window + 1, b.length)
    for (let candidate = from; candidate < to; candidate += 1) {
      if (matchedB[candidate] || a[index] !== b[candidate]) continue
      matchedA[index] = true
      matchedB[candidate] = true
      matches += 1
      break
    }
  }
  if (matches === 0) return 0

  let transpositions = 0
  let position = 0
  for (let index = 0; index < a.length; index += 1) {
    if (!matchedA[index]) continue
    while (!matchedB[position]) position += 1
    if (a[index] !== b[position]) transpositions += 1
    position += 1
  }
  transpositions /= 2

  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3
}

/** Jaro, plus a bonus for up to four shared leading characters. Case-insensitive by default. */
export const jaroWinkler = (a: string, b: string, options: { readonly caseSensitive?: boolean } = {}): number => {
  const caseSensitive = options.caseSensitive ?? false
  const left = normalize(a, caseSensitive)
  const right = normalize(b, caseSensitive)
  const similarity = jaro(left, right)
  if (similarity === 0) return 0

  let prefix = 0
  for (let index = 0; index < Math.min(4, left.length, right.length) && left[index] === right[index]; index += 1) {
    prefix += 1
  }
  return similarity + prefix * 0.1 * (1 - similarity)
}

export const fuzzyMatchList = (
  query: string,
  candidates: readonly string[],
  options: { readonly threshold?: number; readonly topK?: number; readonly caseSensitive?: boolean } = {},
): FuzzyMatch[] => {
  const threshold = options.threshold ?? 0.85
  const topK = options.topK ?? 10
  const matches: FuzzyMatch[] = []
  for (const candidate of candidates) {
    const score = jaroWinkler(query, candidate, { caseSensitive: options.caseSensitive ?? false })
    if (score >= threshold) matches.push({ candidate, score })
  }
  return matches.sort((left, right) => right.score - left.score).slice(0, topK)
}

/**
 * Resolve a reference only when the evidence is unambiguous.
 *
 * A near-miss is a guess, and a guess in a knowledge graph is worse than a gap: it sends an agent
 * to the wrong file with the same confidence as a fact. So a fuzzy resolution requires a high
 * score *and* a single candidate at that score — two plausible targets mean the reference stays
 * unresolved and is reported instead.
 */
export const FUZZY_RESOLUTION_THRESHOLD = 0.92

export const resolveFuzzyReference = (
  query: string,
  candidates: readonly string[],
  threshold = FUZZY_RESOLUTION_THRESHOLD,
): { readonly candidate: string; readonly score: number } | undefined => {
  const matches = fuzzyMatchList(query, candidates, { threshold, topK: 2 })
  return matches.length === 1 ? matches[0] : undefined
}
