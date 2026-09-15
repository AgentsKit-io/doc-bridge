import { searchTokens } from '../query/text.js'

/**
 * Field-weighted BM25 (BM25F).
 *
 * Retrieval used to score a record by summing token lengths over one flattened haystack, which
 * made a long document beat a short exact match and gave every field the same authority. BM25
 * fixes both: a term that appears in nearly every record earns almost nothing (IDF), a term in a
 * short title outranks the same term buried in a body (per-field length normalization), and the
 * field a term matched in is part of the result, so ranking can be explained rather than guessed.
 *
 * Ordering is total: score descending, then `ref` ascending. Scores are rounded before comparison
 * so a ranking is reproducible and never depends on floating-point accumulation order.
 */

export const BM25_VERSION = 1 as const

const DEFAULT_K1 = 1.2
const DEFAULT_B = 0.75
const SCORE_PRECISION = 1_000_000

/** Per-field multipliers. A field absent from the map is not indexed at all. */
export type Bm25FieldWeights = Readonly<Record<string, number>>

export type Bm25Params = {
  /** Term-frequency saturation. Higher rewards repetition more. */
  readonly k1?: number
  /** Length-normalization strength, 0 to 1. */
  readonly b?: number
}

export type Bm25FieldValue = string | readonly string[] | undefined

export type Bm25Input = {
  readonly ref: string
  readonly fields: Readonly<Record<string, Bm25FieldValue>>
}

export type Bm25Hit = {
  readonly ref: string
  readonly score: number
  /** Query terms that matched, per field, sorted. The raw material for an explain view. */
  readonly matched: Readonly<Record<string, readonly string[]>>
}

type FieldPosting = {
  readonly frequency: number
  readonly length: number
}

type IndexedDocument = {
  readonly ref: string
  /** field -> term -> frequency, plus the field's token length. */
  readonly fields: ReadonlyMap<string, { readonly tokens: ReadonlyMap<string, number>; readonly length: number }>
}

export type Bm25Index = {
  readonly documents: readonly IndexedDocument[]
  readonly documentFrequency: ReadonlyMap<string, number>
  readonly averageFieldLength: ReadonlyMap<string, number>
  readonly weights: Bm25FieldWeights
  readonly k1: number
  readonly b: number
}

const fieldText = (value: Bm25FieldValue): string =>
  value === undefined ? '' : Array.isArray(value) ? value.join(' ') : String(value)

const round = (value: number): number => Math.round(value * SCORE_PRECISION) / SCORE_PRECISION

export const buildBm25Index = (
  inputs: readonly Bm25Input[],
  weights: Bm25FieldWeights,
  params: Bm25Params = {},
): Bm25Index => {
  const fieldNames = Object.keys(weights).sort()
  const documents: IndexedDocument[] = []
  const documentFrequency = new Map<string, number>()
  const fieldLengthTotal = new Map<string, number>(fieldNames.map((name) => [name, 0]))

  for (const input of inputs) {
    const fields = new Map<string, { tokens: ReadonlyMap<string, number>; length: number }>()
    const seen = new Set<string>()
    for (const name of fieldNames) {
      const tokens = searchTokens(fieldText(input.fields[name]))
      const frequencies = new Map<string, number>()
      for (const token of tokens) {
        frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
        seen.add(token)
      }
      fields.set(name, { tokens: frequencies, length: tokens.length })
      fieldLengthTotal.set(name, (fieldLengthTotal.get(name) ?? 0) + tokens.length)
    }
    for (const token of seen) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
    documents.push({ ref: input.ref, fields })
  }

  const count = documents.length || 1
  return {
    documents,
    documentFrequency,
    averageFieldLength: new Map(fieldNames.map((name) => [name, (fieldLengthTotal.get(name) ?? 0) / count])),
    weights,
    k1: params.k1 ?? DEFAULT_K1,
    b: params.b ?? DEFAULT_B,
  }
}

/** Probabilistic IDF, floored at zero so a term in every document can never subtract score. */
export const bm25Idf = (documentCount: number, documentFrequency: number): number =>
  Math.max(0, Math.log(1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5)))

const posting = (document: IndexedDocument, field: string, term: string): FieldPosting | undefined => {
  const stats = document.fields.get(field)
  if (!stats) return undefined
  const frequency = stats.tokens.get(term)
  return frequency === undefined ? undefined : { frequency, length: stats.length }
}

/**
 * Score every document against the query terms. Documents with no matched term are omitted, so an
 * unrelated query returns nothing rather than a list of weak guesses.
 */
export const bm25Search = (index: Bm25Index, terms: readonly string[]): Bm25Hit[] => {
  if (!terms.length || !index.documents.length) return []
  const unique = [...new Set(terms)].sort()
  const fieldNames = Object.keys(index.weights).sort()
  const hits: Bm25Hit[] = []

  for (const document of index.documents) {
    let score = 0
    const matched = new Map<string, string[]>()

    for (const term of unique) {
      const idf = bm25Idf(index.documents.length, index.documentFrequency.get(term) ?? 0)
      if (idf <= 0) continue
      let weightedFrequency = 0
      for (const field of fieldNames) {
        const found = posting(document, field, term)
        if (!found) continue
        const average = index.averageFieldLength.get(field) ?? 0
        const normalization = average > 0 ? 1 - index.b + index.b * (found.length / average) : 1
        weightedFrequency += ((index.weights[field] ?? 0) * found.frequency) / normalization
        const list = matched.get(field)
        if (list) list.push(term)
        else matched.set(field, [term])
      }
      if (weightedFrequency <= 0) continue
      score += (idf * weightedFrequency) / (index.k1 + weightedFrequency)
    }

    if (score <= 0) continue
    hits.push({
      ref: document.ref,
      score: round(score),
      matched: Object.fromEntries([...matched.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([field, list]) => [field, [...list].sort()])),
    })
  }

  return hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.ref.localeCompare(b.ref)))
}
