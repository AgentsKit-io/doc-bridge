import { describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { replaceFiles } from '../src/fixes/write.js'

const root = () => realpathSync.native(mkdtempSync(join(tmpdir(), 'doc-bridge-fixes-write-')))
const seed = (dir: string, name: string, content: string) => {
  const absolute = join(dir, name)
  writeFileSync(absolute, content)
  return absolute
}

describe('replaceFiles', () => {
  it('replaces every file, preserves mode, and leaves no staging files', () => {
    const dir = root()
    const a = seed(dir, 'a.txt', 'one')
    const b = seed(dir, 'b.txt', 'two')
    chmodSync(b, 0o600)

    replaceFiles([{ absolute: a, before: 'one', after: 'ONE' }, { absolute: b, before: 'two', after: 'TWO' }])

    expect(readFileSync(a, 'utf8')).toBe('ONE')
    expect(readFileSync(b, 'utf8')).toBe('TWO')
    expect(statSync(b).mode & 0o777).toBe(0o600)
    expect(readdirSync(dir).sort()).toEqual(['a.txt', 'b.txt'])
  })

  it('accepts an empty change list and still runs verify', () => {
    let verified = 0
    replaceFiles([], () => { verified += 1 })
    expect(verified).toBe(1)
  })

  it('handles empty before and after content', () => {
    const dir = root()
    const a = seed(dir, 'a.txt', '')
    replaceFiles([{ absolute: a, before: '', after: 'filled' }])
    expect(readFileSync(a, 'utf8')).toBe('filled')
    replaceFiles([{ absolute: a, before: 'filled', after: '' }])
    expect(readFileSync(a, 'utf8')).toBe('')
  })

  it('runs verify after files are written', () => {
    const dir = root()
    const a = seed(dir, 'a.txt', 'one')
    let seen = ''
    replaceFiles([{ absolute: a, before: 'one', after: 'two' }], () => { seen = readFileSync(a, 'utf8') })
    expect(seen).toBe('two')
  })

  it('rolls back all files and cleans up when verify throws', () => {
    const dir = root()
    const a = seed(dir, 'a.txt', 'one')
    const b = seed(dir, 'b.txt', 'two')

    expect(() => replaceFiles(
      [{ absolute: a, before: 'one', after: 'ONE' }, { absolute: b, before: 'two', after: 'TWO' }],
      () => { throw new Error('verify failed') },
    )).toThrow('verify failed')

    expect(readFileSync(a, 'utf8')).toBe('one')
    expect(readFileSync(b, 'utf8')).toBe('two')
    expect(readdirSync(dir).sort()).toEqual(['a.txt', 'b.txt'])
  })

  it('rejects a target whose content differs from `before` without writing anything', () => {
    const dir = root()
    const a = seed(dir, 'a.txt', 'one')
    const b = seed(dir, 'b.txt', 'changed')

    expect(() => replaceFiles([
      { absolute: a, before: 'one', after: 'ONE' },
      { absolute: b, before: 'two', after: 'TWO' },
    ])).toThrow('Target changed before staging')

    expect(readFileSync(a, 'utf8')).toBe('one')
    expect(readFileSync(b, 'utf8')).toBe('changed')
    expect(readdirSync(dir).sort()).toEqual(['a.txt', 'b.txt'])
  })

  it('propagates ENOENT for a missing file and leaves no staging files', () => {
    const dir = root()
    const a = seed(dir, 'a.txt', 'one')

    expect(() => replaceFiles([
      { absolute: a, before: 'one', after: 'ONE' },
      { absolute: join(dir, 'missing.txt'), before: 'x', after: 'y' },
    ])).toThrow(/ENOENT/)

    expect(readFileSync(a, 'utf8')).toBe('one')
    expect(readdirSync(dir).sort()).toEqual(['a.txt'])
  })

  it('refuses a path that is not its own canonical real path', () => {
    const dir = root()
    const real = seed(dir, 'real.txt', 'one')
    const link = join(dir, 'link.txt')
    symlinkSync(real, link)

    expect(() => replaceFiles([{ absolute: link, before: 'one', after: 'ONE' }])).toThrow('Target changed before staging')

    expect(readFileSync(real, 'utf8')).toBe('one')
    expect(readdirSync(dir).sort()).toEqual(['link.txt', 'real.txt'])
  })

  it('refuses a directory target', () => {
    const dir = root()
    expect(() => replaceFiles([{ absolute: dir, before: '', after: 'x' }])).toThrow()
    expect(readdirSync(dir)).toEqual([])
  })
})
