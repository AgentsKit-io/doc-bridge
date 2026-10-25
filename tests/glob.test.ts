import { minimatch } from 'minimatch'
import { describe, expect, it } from 'vitest'

import { globMatch } from '../src/lib/glob.js'

describe('globMatch', () => {
  it('matches like minimatch with dot files, and treats a leading # as a comment', () => {
    for (const [path, pattern] of [
      ['src/a.ts', 'src/**/*.ts'],
      ['.github/x.yml', '.github/**'],
      ['src/a.ts', 'docs/**'],
      ['#a', '#a'],
    ] as const) {
      expect(globMatch(path, pattern)).toBe(pattern.startsWith('#') ? false : minimatch(path, pattern, { dot: true }))
    }
  })

  it('keeps answering correctly once the compiled-pattern cache has filled and been cleared', () => {
    for (let i = 0; i < 2500; i++) expect(globMatch(`dir${i}/file.md`, `dir${i}/*.md`)).toBe(true)
    expect(globMatch('dir0/file.md', 'dir0/*.md')).toBe(true)
    expect(globMatch('dir0/file.md', 'dir1/*.md')).toBe(false)
  })
})
