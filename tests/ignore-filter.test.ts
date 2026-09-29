import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { createIgnoreFilter } from '../src/lib/ignore-filter.js'
import { walkFiles } from '../src/lib/walk.js'
import { safeWalkFiles } from '../src/safety/repository.js'

const temporary: string[] = []
afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const write = (root: string, path: string, content = 'x\n'): void => {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

const git = (root: string, ...args: readonly string[]): void => {
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  })
}

const rel = (root: string, files: readonly string[]): string[] =>
  files.map((file) => relative(root, file).split(sep).join('/')).sort()

/**
 * The shape that leaked into real indexes: a Next.js docs app whose build and dev server write
 * `.next/`, `.source/`, generated API pages and `next-env.d.ts`, plus a nested `.gitignore`.
 */
const layout = (root: string): void => {
  write(root, '.gitignore', '.next/\n.source/\nnext-env.d.ts\n*.log\n!keep.log\n')
  write(root, 'apps/docs/.gitignore', 'content/docs/api/\n')
  write(root, 'docs/guide.md', '# Guide\n')
  write(root, 'apps/docs/app/page.tsx', 'export default function Page() { return null }\n')
  write(root, 'apps/docs/next-env.d.ts', '/// <reference types="next" />\n')
  write(root, 'apps/docs/.next/server/app.md', '# built\n')
  write(root, 'apps/docs/.source/index.ts', 'export const generated = 1\n')
  write(root, 'apps/docs/content/docs/api/generated.md', '# generated API\n')
  write(root, 'apps/docs/debug.log')
  write(root, 'apps/docs/keep.log')
  write(root, 'packages/lib/.gitignore', 'local-notes.md\n')
  write(root, 'packages/lib/local-notes.md', '# private\n')
  write(root, 'packages/lib/README.md', '# Lib\n')
  write(root, 'packages/lib/src/index.ts', 'export const lib = 1\n')
}

const visible = [
  '.gitignore',
  'apps/docs/.gitignore',
  'apps/docs/app/page.tsx',
  'apps/docs/keep.log',
  'docs/guide.md',
  'packages/lib/.gitignore',
  'packages/lib/README.md',
  'packages/lib/src/index.ts',
]

describe('repository scans respect ignore rules', () => {
  it('uses Git inside a work tree, including nested .gitignore files and untracked files', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-ignore-git-'))
    temporary.push(root)
    layout(root)
    git(root, 'init', '--quiet', '--initial-branch=main')
    git(root, 'add', '.gitignore', 'docs/guide.md')
    git(root, 'commit', '--quiet', '--message', 'fixture')
    /* The rest stays untracked: visible unless ignored, like `git status`. */

    expect(createIgnoreFilter(root).mode).toBe('git')
    expect(rel(root, safeWalkFiles(root).files)).toEqual(visible)
    expect(rel(root, walkFiles(root, { extensions: ['.md'] }))).toEqual(['docs/guide.md', 'packages/lib/README.md'])
  })

  it('keeps a tracked file even when an ignore rule also matches it', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-ignore-tracked-'))
    temporary.push(root)
    layout(root)
    git(root, 'init', '--quiet', '--initial-branch=main')
    git(root, 'add', '--all')
    git(root, 'add', '--force', 'apps/docs/next-env.d.ts')
    git(root, 'commit', '--quiet', '--message', 'fixture')

    expect(rel(root, safeWalkFiles(root).files)).toEqual([...visible, 'apps/docs/next-env.d.ts'].sort())
  })

  it('answers for a scan rooted in a subdirectory of the work tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-ignore-sub-'))
    temporary.push(root)
    layout(root)
    git(root, 'init', '--quiet', '--initial-branch=main')

    const docsApp = join(root, 'apps/docs')
    expect(rel(docsApp, safeWalkFiles(docsApp).files)).toEqual(['.gitignore', 'app/page.tsx', 'keep.log'])
  })

  it('falls back to the .gitignore files on disk outside Git', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-ignore-plain-'))
    temporary.push(root)
    layout(root)

    const filter = createIgnoreFilter(root)
    expect(filter.mode).toBe('gitignore')
    expect(filter.isIgnored(join(root, 'apps/docs/.next'), true)).toBe(true)
    expect(filter.isIgnored(join(root, 'apps/docs/keep.log'), false)).toBe(false)
    expect(filter.isIgnored(join(root, 'packages/lib/local-notes.md'), false)).toBe(true)
    expect(rel(root, safeWalkFiles(root).files)).toEqual(visible)
    expect(rel(root, walkFiles(root, { extensions: ['.md'] }))).toEqual(['docs/guide.md', 'packages/lib/README.md'])
  })

  it('lets a caller opt out for input that is not repository content', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-ignore-optout-'))
    temporary.push(root)
    layout(root)

    expect(rel(root, walkFiles(root, { extensions: ['.md'], respectIgnore: false }))).toContain('packages/lib/local-notes.md')
  })

  it('keeps generated output out of the index', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-ignore-index-'))
    temporary.push(root)
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0' }), 'utf8')
    write(root, '.gitignore', 'src/generated/\n.source/\n')
    write(root, 'src/query/search.ts', 'export const searchIndex = (): number => 1\n')
    write(root, 'src/generated/client.ts', 'export const generatedClient = (): number => 2\n')
    write(root, '.source/index.ts', 'export const source = (): number => 3\n')
    write(root, 'docs/for-agents/INDEX.md', '# Agent index\n\nStart with [query](./query.md).\n')
    write(root, 'docs/for-agents/query.md', '---\nid: fixture-query\neditRoot: src/query\n---\n# Query\n\nExports `searchIndex`.\n')
    write(root, 'docs/for-agents/notes/.gitignore', 'scratch.md\n')
    write(root, 'docs/for-agents/notes/scratch.md', '# Scratch\n')
    git(root, 'init', '--quiet', '--initial-branch=main')

    const config = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse({
        schemaVersion: 1,
        corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
      }),
    )
    buildDocBridgeIndex({ root, config })
    const index = readFileSync(join(root, '.doc-bridge/index.json'), 'utf8')

    expect(index).toContain('src/query/search.ts')
    expect(index).not.toContain('src/generated/client.ts')
    expect(index).not.toContain('.source/index.ts')
    expect(index).not.toContain('scratch.md')
  })
})
