import type { Bm25FieldWeights, Bm25Params } from './bm25.js'

/**
 * Which field an agent's query is most likely aiming at, in ranking order.
 *
 * These are a starting point, not a truth: they live in the index so a repository can retune
 * retrieval from configuration, and a tuning change shows up as a changed artifact rather than a
 * silent behaviour change. `symbols` sits near the top because an agent that types an exported
 * name wants the module that defines it; `body` sits at the bottom because a passing mention in
 * prose is the weakest evidence a record is the answer.
 */
export const DEFAULT_SEARCH_WEIGHTS: Bm25FieldWeights = {
  id: 8,
  symbols: 7,
  title: 6,
  path: 4,
  tags: 3,
  description: 2,
  body: 1,
}

export const DEFAULT_SEARCH_PARAMS: Required<Bm25Params> = { k1: 1.2, b: 0.75 }

/** Configured weights override the defaults field by field; an unknown field is ignored. */
export const resolveSearchWeights = (configured?: Readonly<Record<string, number>>): Bm25FieldWeights => {
  if (!configured) return DEFAULT_SEARCH_WEIGHTS
  const merged: Record<string, number> = { ...DEFAULT_SEARCH_WEIGHTS }
  for (const [field, weight] of Object.entries(configured)) {
    if (field in DEFAULT_SEARCH_WEIGHTS) merged[field] = weight
  }
  return merged
}

export const resolveSearchParams = (
  configured?: { readonly k1?: number | undefined; readonly b?: number | undefined },
): Required<Bm25Params> => ({
  k1: configured?.k1 ?? DEFAULT_SEARCH_PARAMS.k1,
  b: configured?.b ?? DEFAULT_SEARCH_PARAMS.b,
})
