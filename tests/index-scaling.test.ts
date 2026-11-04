import { describe, expect, it } from 'vitest'
import { createFuzzyCandidateIndex, resolveFuzzyReference } from '../src/lib/fuzzy-match.js'

class CountingMap<K, V> extends Map<K, V> {
  scans = 0
  override [Symbol.iterator](): MapIterator<[K, V]> {
    this.scans += 1
    return super[Symbol.iterator]()
  }
}

describe('index scaling', () => {
  it('scans the path universe once per distinct fuzzy reference, not once per mention', () => {
    const paths = ['docs/guides/installation.md', 'docs/guides/configuration.md', 'docs/api/overview.md', 'src/lib/parser.ts']
    const index = createFuzzyCandidateIndex(paths)
    const counting = new CountingMap(index.byLength)
    const counted = { ...index, byLength: counting } as typeof index
    const queries = ['docs/guides/instalation.md', 'docs/api/overveiw.md']
    for (let i = 0; i < 25; i += 1) {
      for (const query of queries) {
        expect(resolveFuzzyReference(query, counted)).toEqual(resolveFuzzyReference(query, paths))
      }
    }
    expect(counting.scans).toBe(2)
  })
})
