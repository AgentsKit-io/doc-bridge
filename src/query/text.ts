const SEARCH_TOKEN_SEPARATOR = /[^\p{L}\p{N}@/_-]+/gu

/** Keep the deterministic search path usable for non-English documentation too. */
export const tokenizeSearchText = (value: string): string[] =>
  value
    .toLowerCase()
    .split(SEARCH_TOKEN_SEPARATOR)
    .filter((token) => token.length >= 2)

export const hasSearchToken = (hay: string, token: string): boolean => {
  // CJK text commonly has no whitespace; substring matching is the native word boundary there.
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(token)) return hay.includes(token)
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:s|es)?(?:[^\\p{L}\\p{N}]|$)`, 'u').test(hay)
}
