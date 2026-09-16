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

/**
 * The lengths a candidate can have and still reach a threshold.
 *
 * Jaro-Winkler is bounded by the lengths of the two strings, so most candidates can be discarded
 * without computing anything. With `m` matching characters, `jaro ≤ (m/|a| + m/|b| + 1) / 3`, and
 * the prefix bonus can only raise the result: `jw ≤ 0.6·jaro + 0.4`. Requiring `jw ≥ t` therefore
 * requires `jaro ≥ (t − 0.4) / 0.6`, hence `m/|a| + m/|b| ≥ 3·that − 1 = R`. Since `m` cannot
 * exceed the shorter string, a candidate longer than the query needs `|b| ≤ |a| / (R − 1)` and a
 * shorter one needs `|b| ≥ |a| · (R − 1)`.
 *
 * At the resolution threshold of 0.92 that is a window of 0.6× to 1.67× the query's length. When
 * `R ≤ 1` the inequality constrains nothing and every length stays a candidate, so a low threshold
 * still scans everything — as it must.
 */
export const fuzzyLengthWindow = (queryLength: number, threshold: number): { readonly min: number; readonly max: number } => {
  const jaroFloor = Math.max(0, (threshold - 0.4) / 0.6)
  const ratio = 3 * jaroFloor - 1
  if (ratio <= 1) return { min: 0, max: Number.POSITIVE_INFINITY }
  return { min: queryLength * (ratio - 1), max: queryLength / (ratio - 1) }
}

/**
 * Candidates grouped by length, so a scan only visits the lengths that can pass.
 *
 * Built once per universe and reused by every query. Without it, resolving references across a
 * repository is quadratic: each document rebuilt the candidate list and ran the full similarity
 * scan per reference, which on a four-thousand-document repository did not finish.
 */
type IndexedCandidate = {
  readonly value: string
  /** Length after normalization, which is what the similarity compares. */
  readonly length: number
  readonly counts: Uint16Array
  /** Position in the universe the index was built from, so a filtered scan stays in the caller's order. */
  readonly order: number
}

export type FuzzyCandidateIndex = {
  readonly byLength: ReadonlyMap<number, readonly IndexedCandidate[]>
}

/**
 * Character counts over a fixed alphabet slot per code unit.
 *
 * Every code unit at or above the alphabet shares the last slot, which can only over-count the
 * characters two strings share — the safe direction for a bound that decides what to skip.
 */
const ALPHABET = 128
const countsOf = (value: string): Uint16Array => {
  const counts = new Uint16Array(ALPHABET)
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    const slot = code < ALPHABET ? code : ALPHABET - 1
    counts[slot] = (counts[slot] ?? 0) + 1
  }
  return counts
}

/**
 * The form the bounds are computed over.
 *
 * `jaroWinkler` compares normalized strings, so the index has to measure normalized ones: a
 * candidate padded with whitespace is sixteen characters on disk and ten to the similarity, and a
 * window built on the wrong number would skip a candidate that matches. Case is folded even for a
 * case-sensitive query — folding can only raise the shared-character count, and the bound is
 * allowed to over-estimate, never to under-estimate.
 */
const indexedForm = (value: string): string => normalize(value, false)

export const createFuzzyCandidateIndex = (candidates: readonly string[]): FuzzyCandidateIndex => {
  const byLength = new Map<number, IndexedCandidate[]>()
  for (const [order, value] of candidates.entries()) {
    const form = indexedForm(value)
    const entry: IndexedCandidate = { value, length: form.length, counts: countsOf(form), order }
    const bucket = byLength.get(entry.length)
    if (bucket) bucket.push(entry)
    else byLength.set(entry.length, [entry])
  }
  return { byLength }
}

/**
 * The characters two strings share, as an upper bound on Jaro's `m`.
 *
 * Jaro counts a character as matching only if it appears in both strings (within a window), so `m`
 * can never exceed the multiset intersection. Comparing two count vectors costs one pass over the
 * alphabet, where computing Jaro costs a pass over one string per character of the other — so this
 * is the cheap half of the test, and it is exact in the direction that matters: it only ever
 * over-estimates `m`, and therefore only ever keeps a candidate that might have passed.
 */
const sharedCharacterBound = (a: Uint16Array, b: Uint16Array): number => {
  let shared = 0
  for (let slot = 0; slot < ALPHABET; slot += 1) {
    const left = a[slot] ?? 0
    if (left === 0) continue
    const right = b[slot] ?? 0
    shared += left < right ? left : right
  }
  return shared
}

const candidatesWithin = (
  index: FuzzyCandidateIndex,
  query: string,
  threshold: number,
): readonly string[] => {
  const form = indexedForm(query)
  const { min, max } = fuzzyLengthWindow(form.length, threshold)
  const jaroFloor = Math.max(0, (threshold - 0.4) / 0.6)
  const required = 3 * jaroFloor - 1
  const queryCounts = countsOf(form)
  const within: IndexedCandidate[] = []
  for (const [length, bucket] of index.byLength) {
    if (length < min || length > max) continue
    for (const candidate of bucket) {
      if (required > 1) {
        const bound = sharedCharacterBound(queryCounts, candidate.counts)
        if (bound / form.length + bound / candidate.length < required) continue
      }
      within.push(candidate)
    }
  }
  /*
   * Back into the universe's own order. Scores that tie are ordered by the scan that found them, so
   * an index that visits candidates grouped by length would otherwise rank equal matches differently
   * from a plain list — the filter is meant to be invisible, and a test asserts the two agree.
   */
  return within.sort((left, right) => left.order - right.order).map((candidate) => candidate.value)
}

export const fuzzyMatchList = (
  query: string,
  candidates: readonly string[] | FuzzyCandidateIndex,
  options: { readonly threshold?: number; readonly topK?: number; readonly caseSensitive?: boolean } = {},
): FuzzyMatch[] => {
  const threshold = options.threshold ?? 0.85
  const topK = options.topK ?? 10
  const searched = Array.isArray(candidates)
    ? candidates
    : candidatesWithin(candidates as FuzzyCandidateIndex, query, threshold)
  const matches: FuzzyMatch[] = []
  for (const candidate of searched) {
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
  candidates: readonly string[] | FuzzyCandidateIndex,
  threshold = FUZZY_RESOLUTION_THRESHOLD,
): { readonly candidate: string; readonly score: number } | undefined => {
  const matches = fuzzyMatchList(query, candidates, { threshold, topK: 2 })
  return matches.length === 1 ? matches[0] : undefined
}
