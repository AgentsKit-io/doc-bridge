import { afterEach, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverRepository } from '../src/discovery/repository.js'
import { diffSnapshots } from '../src/diff/change-set.js'

// Real fixture discovery shares the signature suite budget.
vi.setConfig({ testTimeout: 30_000 })

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

/** Discover base files and a document, then overlay head files and head document, and diff them. */
const flow = (files: Record<string, string>, headFiles: Record<string, string>, document: string, headDocument = document) => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-entrypoint-')); roots.push(root)
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'entrypoint-fixture', version: '1.0.0' }))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  writeFileSync(join(root, 'docs/guide.md'), document)
  const base = discoverRepository({ root })
  for (const [path, text] of Object.entries(headFiles)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  writeFileSync(join(root, 'docs/guide.md'), headDocument)
  const head = discoverRepository({ root })
  return { base, head, result: diffSnapshots(base, head, { headRoot: root }) }
}

const entrypoint = (name: string) => `#!/usr/bin/env node\nexport function main() { return '${name}' }\nif (import.meta.url === \`file://\${process.argv[1]}\`) main()\n`
const moduleId = (snapshot: ReturnType<typeof flow>['base'], path: string) => snapshot.entities.find(entity => entity.kind === 'module' && entity.path === path)!.id
const mentionsOf = (snapshot: ReturnType<typeof flow>['base'], symbol: string) => snapshot.relations.filter(item => item.kind === 'mentions-symbol' && item.metadata?.symbol === symbol)

it('does not report prose about a branch as ambiguous when a second entrypoint script exports main', () => {
  const { base, result } = flow(
    { 'scripts/verify.mjs': entrypoint('verify') },
    { 'scripts/study.mjs': entrypoint('study') },
    '# Guide\n\nCI enforces the rules on `main`.\n',
  )
  expect(mentionsOf(base, 'main')).toEqual([])
  expect(result.findings.filter(item => item.code === 'AMBIGUOUS_REFERENCE')).toEqual([])
  expect(result.findings).toEqual([])
})

it('keeps a bare word resolving to an entrypoint script when its path is cited in the same paragraph', () => {
  const { base } = flow({ 'scripts/verify.mjs': entrypoint('verify') }, {}, '# Guide\n\nRun `scripts/verify.mjs` to check the `main` flow.\n')
  expect(mentionsOf(base, 'main').map(item => item.to)).toEqual([moduleId(base, 'scripts/verify.mjs')])
})

it('does not resolve a bare word to an entrypoint script when its path is cited only in another paragraph', () => {
  const { base } = flow({ 'scripts/verify.mjs': entrypoint('verify') }, {}, '# Guide\n\nRun `scripts/verify.mjs` to check it.\n\nThe `main` branch is protected.\n')
  expect(mentionsOf(base, 'main')).toEqual([])
})

it('keeps a bare library function that is not an entrypoint script, and its changed-claim finding', () => {
  const { base, result } = flow(
    { 'api.ts': 'export const make = () => 1' },
    { 'api.ts': 'export const make = (required: boolean) => 1' },
    '# API\n\nCall `make` with no arguments.\n',
  )
  expect(mentionsOf(base, 'make').map(item => item.to)).toEqual([moduleId(base, 'api.ts')])
  expect(result.findings.filter(item => item.code === 'CHANGED_REFERENCE')).toHaveLength(1)
})

it('still reports a bare word exported by two library modules as ambiguous', () => {
  const { base } = flow({ 'lib/a.ts': 'export function make() { return 1 }\n', 'lib/b.ts': 'export function make() { return 2 }\n' }, {}, '# API\n\nUse `make` to build it.\n')
  const document = base.entities.find(entity => entity.kind === 'document')!
  expect((document.metadata?.ambiguousSymbolReferences as { symbol: string }[] | undefined)?.map(item => item.symbol)).toEqual(['make'])
})

const scriptVerify = 'export function verify() { return 2 }\nif (import.meta.url === `file://${process.argv[1]}`) verify()\n'
const ambiguityOf = (snapshot: ReturnType<typeof flow>['base'], symbol: string) => {
  const document = snapshot.entities.find(entity => entity.kind === 'document')!
  return (document.metadata?.ambiguousSymbolReferences as { symbol: string; candidateModuleIds: string[]; candidateCount: number }[] | undefined)?.find(item => item.symbol === symbol)
}

it('anchors a bare word through the package name cited in the same paragraph', () => {
  const { base } = flow({ 'scripts/verify.mjs': entrypoint('verify') }, {}, '# Guide\n\nRun `entrypoint-fixture` to check the `main` flow.\n')
  expect(mentionsOf(base, 'main').map(item => item.to)).toEqual([moduleId(base, 'scripts/verify.mjs')])
})

it('keeps a fenced exact citation of a script symbol without the bare-word filter', () => {
  const { base } = flow({ 'scripts/verify.mjs': entrypoint('verify') }, {}, '# Guide\n\n```ts\nmain()\n```\n')
  expect(mentionsOf(base, 'main').map(item => item.to)).toEqual([moduleId(base, 'scripts/verify.mjs')])
})

it('resolves a bare word shared by a library and a script to the library, with no ambiguity', () => {
  const { base, result } = flow({ 'lib/verify.ts': 'export function verify() { return 1 }\n', 'scripts/verify.mjs': scriptVerify }, {}, '# Guide\n\nCall `verify` to check it.\n')
  expect(mentionsOf(base, 'verify').map(item => item.to)).toEqual([moduleId(base, 'lib/verify.ts')])
  expect(result.findings.filter(item => item.code === 'AMBIGUOUS_REFERENCE')).toEqual([])
})

it('leaves an unanchored script out of the ambiguity candidates and the note of a bare word', () => {
  const { base } = flow(
    { 'lib/a.ts': 'export function verify() { return 1 }\n', 'lib/b.ts': 'export function verify() { return 3 }\n', 'scripts/verify.mjs': scriptVerify },
    {},
    '# Guide\n\nCall `verify` to check it.\n',
  )
  expect(ambiguityOf(base, 'verify')?.candidateModuleIds).toEqual([moduleId(base, 'lib/a.ts'), moduleId(base, 'lib/b.ts')].sort())
  expect(ambiguityOf(base, 'verify')?.candidateCount).toBe(2)
  expect(base.coverage.find(entry => entry.scope === 'mentions-symbol:docs/guide.md:verify')?.reason).toContain('exported by 2 modules')
})

it('reports AMBIGUOUS_REFERENCE when a head library joins a base library and an unanchored script that share a bare word', () => {
  const { base, result } = flow(
    { 'scripts/verify.mjs': entrypoint('verify'), 'lib/x.ts': 'export function main() { return 1 }\n' },
    { 'lib/y.ts': 'export function main() { return 2 }\n' },
    '# Guide\n\nUse `main` to start.\n',
  )
  expect(mentionsOf(base, 'main').map(item => item.to)).toEqual([moduleId(base, 'lib/x.ts')])
  expect(result.findings.filter(item => item.code === 'AMBIGUOUS_REFERENCE')).toHaveLength(1)
})

it('re-analyses a document when a module it cites starts or stops being an entrypoint script', () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-entrypoint-flip-')); roots.push(root)
  mkdirSync(join(root, 'docs'))
  mkdirSync(join(root, 'scripts'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'entrypoint-flip', version: '1.0.0' }))
  writeFileSync(join(root, 'scripts/verify.mjs'), 'export function main() { return 1 }\n')
  writeFileSync(join(root, 'docs/guide.md'), '# Guide\n\nCall `main` to start.\n')
  const cold = discoverRepository({ root })
  expect(mentionsOf(cold, 'main').map(item => item.to)).toEqual([moduleId(cold, 'scripts/verify.mjs')])

  writeFileSync(join(root, 'scripts/verify.mjs'), entrypoint('verify'))
  const started = discoverRepository({ root, previous: cold })
  expect(mentionsOf(started, 'main')).toEqual(mentionsOf(discoverRepository({ root }), 'main'))
  expect(mentionsOf(started, 'main')).toEqual([])

  writeFileSync(join(root, 'scripts/verify.mjs'), 'export function main() { return 1 }\n')
  const stopped = discoverRepository({ root, previous: started })
  expect(mentionsOf(stopped, 'main').map(item => item.to)).toEqual([moduleId(stopped, 'scripts/verify.mjs')])
})
