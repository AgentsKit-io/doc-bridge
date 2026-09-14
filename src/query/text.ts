const SEARCH_TOKEN_SEPARATOR = /[^\p{L}\p{N}@/_-]+/gu

/**
 * Bumped whenever a stopword list or the token expansion changes. The index records it, so a
 * ranking that depended on a different list is visible rather than silently incomparable.
 */
export const SEARCH_LEXICON_VERSION = 1 as const

/**
 * Words that carry no retrieval signal because they appear in nearly every sentence of the
 * corpus. Without them `search and` scores every record that has a prose summary.
 *
 * Portuguese is here for the same reason English is: the repository targets non-English
 * documentation, and a query in one language must be ranked by the same rules as the other.
 * Single characters never reach these sets, since tokens shorter than two characters are dropped.
 */
const ENGLISH_STOPWORDS = [
  'about', 'after', 'again', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been',
  'before', 'being', 'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing',
  'done', 'during', 'each', 'either', 'else', 'for', 'from', 'had', 'has', 'have', 'he', 'her',
  'here', 'hers', 'him', 'his', 'how', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'me', 'more',
  'most', 'much', 'must', 'my', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'our', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than',
  'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'us', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would', 'you', 'your',
] as const

const PORTUGUESE_STOPWORDS = [
  'ainda', 'ao', 'aos', 'aquela', 'aquelas', 'aquele', 'aqueles', 'aquilo', 'as', 'até', 'com',
  'como', 'da', 'das', 'de', 'dela', 'delas', 'dele', 'deles', 'depois', 'do', 'dos', 'ela',
  'elas', 'ele', 'eles', 'em', 'entre', 'era', 'eram', 'essa', 'essas', 'esse', 'esses', 'esta',
  'estas', 'este', 'estes', 'está', 'estão', 'eu', 'fica', 'ficam', 'foi', 'foram', 'isso',
  'isto', 'já', 'lhe', 'lhes', 'mais', 'mas', 'me', 'menos', 'mesmo', 'meu', 'minha', 'muito',
  'na', 'nas', 'nem', 'no', 'nos', 'nossa', 'nosso', 'num', 'numa', 'não', 'onde', 'os', 'ou',
  'para', 'pela', 'pelas', 'pelo', 'pelos', 'per', 'por', 'porque', 'pra', 'qual', 'quais',
  'quando', 'que', 'quem', 'se', 'sem', 'ser', 'seu', 'seus', 'sobre', 'sua', 'suas', 'são',
  'também', 'tem', 'ter', 'teu', 'toda', 'todas', 'todo', 'todos', 'tua', 'têm', 'um', 'uma',
  'umas', 'uns', 'vira', 'você', 'vocês',
] as const

/**
 * Strip diacritics so `reconciliacao` and `reconciliação` are the same term.
 *
 * Non-English documentation is written with accents and queried without them at least as often as
 * the reverse, and a retrieval path that treats the two as different words fails a question it has
 * the answer to. Folding happens on both sides — the indexed text and the query — so the two can
 * never disagree.
 */
export const foldAccents = (value: string): string =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').normalize('NFC')

export const SEARCH_STOPWORDS: ReadonlySet<string> = new Set<string>(
  [...ENGLISH_STOPWORDS, ...PORTUGUESE_STOPWORDS].map(foldAccents),
)

export const isSearchStopword = (token: string): boolean => SEARCH_STOPWORDS.has(foldAccents(token))

/** Keep the deterministic search path usable for non-English documentation too. */
export const tokenizeSearchText = (value: string): string[] =>
  value
    .toLowerCase()
    .split(SEARCH_TOKEN_SEPARATOR)
    .filter((token) => token.length >= 2)

const CAMEL_BOUNDARY = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/g

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu

/**
 * Characters and character bigrams of a CJK run.
 *
 * CJK text has no spaces, so a whole sentence arrives as one token and an exact-term index would
 * never match a query for two of its characters. Indexing unigrams and bigrams on both sides is
 * the standard answer: the bigram carries the signal, the unigram keeps a one-character query
 * answerable.
 */
const cjkGrams = (run: string): string[] => {
  const characters = [...run]
  const grams = [...characters]
  for (let position = 0; position + 1 < characters.length; position += 1) {
    grams.push(`${characters[position]}${characters[position + 1]}`)
  }
  return grams
}

/**
 * A code identifier or path, plus the words inside it.
 *
 * `reconcileKnowledge` yields the whole identifier and `reconcile` and `knowledge`, so an agent
 * that types the exact symbol gets an exact match while a human who half-remembers it still
 * lands nearby. `src/mcp/server.ts` yields the whole path and each segment without its extension.
 */
export const expandSearchToken = (token: string): string[] => {
  const whole = foldAccents(token.toLowerCase())
  const parts = foldAccents(token)
    .replace(CAMEL_BOUNDARY, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .map((part) => part.toLowerCase())
    .filter((part) => part.length >= 2 && part !== whole)
  const grams = CJK.test(token) ? [...token.matchAll(CJK_RUN)].flatMap(([run]) => cjkGrams(run)) : []
  return [...new Set([whole, ...parts, ...grams])]
}

/**
 * Collapse a plural to its singular so `schema` finds `schemas`.
 *
 * The substring matcher this path replaced accepted an optional plural suffix, and losing that
 * would have made an exact-term index quietly worse at the most ordinary query there is. These
 * are the safe rules only: applied to both the indexed text and the query, an imperfect stem
 * still matches itself, so the worst case is a missed relation rather than a wrong one.
 */
export const singularizeSearchToken = (token: string): string => {
  if (token.length <= 3) return token
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (/(?:sses|xes|ches|shes|zes)$/.test(token)) return token.slice(0, -2)
  if (/(?:ss|us|is|os)$/.test(token)) return token
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -1)
  if (token.endsWith('s')) return token.slice(0, -1)
  return token
}

export type SearchTokenizeOptions = {
  /** Drop stopwords. On for queries and for indexed text; off only when a caller needs raw tokens. */
  readonly dropStopwords?: boolean
  /** Also emit the words inside an identifier or path. */
  readonly expand?: boolean
}

/**
 * The tokenizer both indexing and querying use, so a term can never be present on one side and
 * absent on the other.
 */
export const searchTokens = (value: string, options: SearchTokenizeOptions = {}): string[] => {
  const dropStopwords = options.dropStopwords ?? true
  const expand = options.expand ?? true
  const tokens: string[] = []
  for (const raw of value.split(SEARCH_TOKEN_SEPARATOR)) {
    if (!raw) continue
    for (const token of expand ? expandSearchToken(raw) : [raw.toLowerCase()]) {
      if (token.length < 2 && !CJK.test(token)) continue
      if (dropStopwords && isSearchStopword(token)) continue
      tokens.push(CJK.test(token) ? token : singularizeSearchToken(token))
    }
  }
  return tokens
}

export const hasSearchToken = (hay: string, token: string): boolean => {
  // CJK text commonly has no whitespace; substring matching is the native word boundary there.
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(token)) return hay.includes(token)
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:s|es)?(?:[^\\p{L}\\p{N}]|$)`, 'u').test(hay)
}
