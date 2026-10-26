import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { replaceFiles } from '../src/fixes/write.js'

const root = () => realpathSync.native(mkdtempSync(join(tmpdir(), 'doc-bridge-write-')))
const seed = (dir: string, name: string, content: string): string => {
  const absolute = join(dir, name)
  writeFileSync(absolute, content)
  return absolute
}

describe('replaceFiles', () => {
  it('replaces multiple files and leaves no staging files', () => {
    const dir = root()
    const a = seed(dir, 'a.md', 'a1')
    const b = seed(dir, 'b.md', 'b1')

    replaceFiles([{ absolute: a, before: 'a1', after: 'a2' }, { absolute: b, before: 'b1', after: 'b2' }])

    expect(readFileSync(a, 'utf8')).toBe('a2')
    expect(readFileSync(b, 'utf8')).toBe('b2')
    expect(readdirSync(dir).sort()).toEqual(['a.md', 'b.md'])
  })

  it('preserves the file mode', () => {
    const dir = root()
    const file = seed(dir, 'run.sh', 'old')
    chmodSync(file, 0o750)

    replaceFiles([{ absolute: file, before: 'old', after: 'new' }])

    expect(statSync(file).mode & 0o777).toBe(0o750)
  })

  it('handles empty before and after contents', () => {
    const dir = root()
    const file = seed(dir, 'empty.md', '')

    replaceFiles([{ absolute: file, before: '', after: 'filled' }])
    expect(readFileSync(file, 'utf8')).toBe('filled')

    replaceFiles([{ absolute: file, before: 'filled', after: '' }])
    expect(readFileSync(file, 'utf8')).toBe('')
  })

  it('runs verify for an empty change list', () => {
    let calls = 0
    replaceFiles([], () => { calls += 1 })
    expect(calls).toBe(1)
  })

  it('runs verify after files are written', () => {
    const dir = root()
    const file = seed(dir, 'a.md', 'old')
    let seen = ''

    replaceFiles([{ absolute: file, before: 'old', after: 'new' }], () => { seen = readFileSync(file, 'utf8') })

    expect(seen).toBe('new')
  })

  it('restores every file and removes staging files when verify throws', () => {
    const dir = root()
    const a = seed(dir, 'a.md', 'a1')
    const b = seed(dir, 'b.md', 'b1')

    expect(() => replaceFiles(
      [{ absolute: a, before: 'a1', after: 'a2' }, { absolute: b, before: 'b1', after: 'b2' }],
      () => { throw new Error('verify failed') }
    )).toThrow('verify failed')

    expect(readFileSync(a, 'utf8')).toBe('a1')
    expect(readFileSync(b, 'utf8')).toBe('b1')
    expect(readdirSync(dir).sort()).toEqual(['a.md', 'b.md'])
  })

  it('refuses a target whose content differs from before and writes nothing', () => {
    const dir = root()
    const a = seed(dir, 'a.md', 'a1')
    const b = seed(dir, 'b.md', 'changed')

    expect(() => replaceFiles([{ absolute: a, before: 'a1', after: 'a2' }, { absolute: b, before: 'b1', after: 'b2' }]))
      .toThrow('Target changed before staging')

    expect(readFileSync(a, 'utf8')).toBe('a1')
    expect(readFileSync(b, 'utf8')).toBe('changed')
    expect(readdirSync(dir).sort()).toEqual(['a.md', 'b.md'])
  })

  it('throws ENOENT for a missing file and leaves no staging files', () => {
    const dir = root()

    expect(() => replaceFiles([{ absolute: join(dir, 'missing.md'), before: 'x', after: 'y' }]))
      .toThrow(/ENOENT/)

    expect(readdirSync(dir)).toEqual([])
  })

  it('refuses a symlinked path', () => {
    const dir = root()
    const real = seed(dir, 'real.md', 'old')
    const link = join(dir, 'link.md')
    symlinkSync(real, link)

    expect(() => replaceFiles([{ absolute: link, before: 'old', after: 'new' }]))
      .toThrow('Target changed before staging')

    expect(readFileSync(real, 'utf8')).toBe('old')
  })

  it('refuses a directory target', () => {
    const dir = root()
    const sub = join(dir, 'sub')
    mkdirSync(sub)

    expect(() => replaceFiles([{ absolute: sub, before: '', after: 'x' }]))
      .toThrow('Target changed before staging')

    expect(readdirSync(dir)).toEqual(['sub'])
  })
})
