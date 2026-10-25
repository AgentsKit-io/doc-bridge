import { describe, expect, it } from 'vitest'

import {
  createFuzzyCandidateIndex,
  fuzzyMatchList,
  resolveFuzzyReference,
} from '../src/lib/fuzzy-match.js'

const paths = [
  'docs/guides/getting-started.md',
  'docs/guides/configuration-reference.md',
  'docs/architecture/overview.md',
  'src/lib/fuzzy-match.ts',
  'src/lib/fuzzy-matcher.ts',
  'src/ünïcode/日本語.md',
]

describe('fuzzy candidate index', () => {
  it('ranks exactly like a plain list, including non-ASCII characters', () => {
    const index = createFuzzyCandidateIndex(paths)
    for (const query of ['docs/guides/getting-startd.md', 'src/lib/fuzzy-match.ts', 'src/ünïcode/日本語.mdx', 'zzz']) {
      for (const threshold of [0.7, 0.85, 0.92]) {
        expect(fuzzyMatchList(query, index, { threshold })).toEqual(fuzzyMatchList(query, paths, { threshold }))
      }
    }
  })

  it('resolves like the unmemoized search, and a repeat returns the same result', () => {
    const index = createFuzzyCandidateIndex(paths)
    const query = 'docs/guides/getting-startd.md'
    const first = resolveFuzzyReference(query, index)
    expect(first).toEqual(resolveFuzzyReference(query, paths))
    expect(first?.candidate).toBe('docs/guides/getting-started.md')
    expect(resolveFuzzyReference(query, index)).toBe(first)
  })

  it('keeps an ambiguous or missing reference unresolved, per threshold', () => {
    const index = createFuzzyCandidateIndex(paths)
    expect(resolveFuzzyReference('src/lib/fuzzy-match', index, 0.8)).toBeUndefined()
    expect(resolveFuzzyReference('nothing/like/this.md', index)).toBeUndefined()
    expect(resolveFuzzyReference('docs/guides/getting-startd.md', index, 0.999)).toBeUndefined()
    expect(resolveFuzzyReference('docs/guides/getting-startd.md', index)).toBeDefined()
  })
})
