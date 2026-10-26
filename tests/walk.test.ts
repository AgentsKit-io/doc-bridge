import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { walkFiles } from '../src/lib/walk.js'

const temporary: string[] = []
afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-walk-'))
  temporary.push(root)
  return root
}

const write = (root: string, path: string, content = 'x\n'): void => {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

const rel = (root: string, files: readonly string[]): string[] =>
  files.map((file) => relative(root, file).split(sep).join('/'))

describe('walkFiles', () => {
  it('returns markdown files only by default, sorted, as POSIX paths', () => {
    const root = makeRoot()
    write(root, 'b.md')
    write(root, 'a.md')
    write(root, 'notes.txt')
    write(root, 'docs/deep/c.md')

    const files = walkFiles(root, { respectIgnore: false })

    expect(rel(root, files)).toEqual(['a.md', 'b.md', 'docs/deep/c.md'])
    expect(files).toEqual([...files].sort())
    expect(files.every((file) => !file.includes('\\'))).toBe(true)
  })

  it('returns an empty list for an empty directory', () => {
    expect(walkFiles(makeRoot(), { respectIgnore: false })).toEqual([])
  })

  it('returns an empty list when the root does not exist', () => {
    const root = join(makeRoot(), 'missing')
    expect(walkFiles(root, { respectIgnore: false })).toEqual([])
  })

  it('honours custom extensions', () => {
    const root = makeRoot()
    write(root, 'a.md')
    write(root, 'b.mdx')
    write(root, 'c.json')

    expect(rel(root, walkFiles(root, { extensions: ['.mdx', '.json'], respectIgnore: false }))).toEqual([
      'b.mdx',
      'c.json',
    ])
  })

  it('skips the default directories', () => {
    const root = makeRoot()
    write(root, 'keep.md')
    for (const dir of ['node_modules', '.git', 'dist', 'coverage', '.doc-bridge']) write(root, `${dir}/x.md`)
    write(root, 'pkg/node_modules/y.md')

    expect(rel(root, walkFiles(root, { respectIgnore: false }))).toEqual(['keep.md'])
  })

  it('replaces the default skip set with skipDirs', () => {
    const root = makeRoot()
    write(root, 'node_modules/x.md')
    write(root, 'private/y.md')
    write(root, 'public/z.md')

    const files = walkFiles(root, { skipDirs: new Set(['private']), respectIgnore: false })

    expect(rel(root, files)).toEqual(['node_modules/x.md', 'public/z.md'])
  })

  it('does not follow symbolic links to files or directories', () => {
    const root = makeRoot()
    const outside = makeRoot()
    write(root, 'real.md')
    write(outside, 'outside.md')
    try {
      symlinkSync(join(outside, 'outside.md'), join(root, 'link.md'))
      symlinkSync(outside, join(root, 'linked-dir'), 'dir')
    } catch {
      return // symlinks unavailable on this platform
    }

    expect(rel(root, walkFiles(root, { respectIgnore: false }))).toEqual(['real.md'])
  })

  it('ignores directories whose name merely looks like a matching file', () => {
    const root = makeRoot()
    mkdirSync(join(root, 'folder.md'))
    write(root, 'folder.md/inner.md')

    expect(rel(root, walkFiles(root, { respectIgnore: false }))).toEqual(['folder.md/inner.md'])
  })

  it('applies .gitignore rules by default and not when respectIgnore is false', () => {
    const root = makeRoot()
    write(root, '.gitignore', 'generated/\nsecret.md\n')
    write(root, 'docs/a.md')
    write(root, 'generated/b.md')
    write(root, 'secret.md')

    expect(rel(root, walkFiles(root))).toEqual(['docs/a.md'])
    expect(rel(root, walkFiles(root, { respectIgnore: false }))).toEqual([
      'docs/a.md',
      'generated/b.md',
      'secret.md',
    ])
  })

  it('accepts exactly maxFiles files', () => {
    const root = makeRoot()
    write(root, 'a.md')
    write(root, 'b.md')

    expect(walkFiles(root, { maxFiles: 2, respectIgnore: false })).toHaveLength(2)
  })

  it('throws once the file limit is exceeded', () => {
    const root = makeRoot()
    write(root, 'a.md')
    write(root, 'b.md')
    write(root, 'c.md')

    expect(() => walkFiles(root, { maxFiles: 2, respectIgnore: false })).toThrow(
      'Documentation corpus exceeds the 2 file limit.',
    )
  })

  it('does not count files with other extensions toward the limit', () => {
    const root = makeRoot()
    write(root, 'a.md')
    write(root, 'b.txt')
    write(root, 'c.txt')

    expect(rel(root, walkFiles(root, { maxFiles: 1, respectIgnore: false }))).toEqual(['a.md'])
  })
})
