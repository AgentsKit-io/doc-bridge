import * as ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { discoverRepository, discoverRepositoryWithRead } from '../src/discovery/repository.js'
import { diffSnapshots } from '../src/diff/change-set.js'
import { surfaceFactFromEntity } from '../src/storage/facts.js'
import { analyzeMarkdownDocument, parseMarkdownDocument } from '../src/discovery/markdown.js'
import { createLocalRepositoryRead, contentRef } from '../src/storage/local.js'
import { safeWalkFiles } from '../src/safety/repository.js'
import { createJsTsPluginV2 } from '../src/discovery/plugins/js-ts.js'
import { createDiscoveryRegistryV2 } from '../src/plugins/contract.js'
import { factAnalyzerVersions } from '../src/discovery/facts/index.js'
import { signatureEntryPoints } from '../src/discovery/facts/signature-context.js'
import { extractSignatures } from '../src/discovery/facts/signatures.js'

// These tests build multi-package fixtures and run the TypeScript checker; the default 5s
// budget is too tight under CI coverage load.
vi.setConfig({ testTimeout: 30_000 })

const extract = (text: string) => extractSignatures(ts.createSourceFile('api.ts', text, ts.ScriptTarget.Latest, true), 'module:api.ts', 'api.ts', '0'.repeat(64))
const hash = (text: string, name = 'createThing') => extract(text).facts.find(fact => fact.name === name)!.valueHash

describe('syntactic exported signatures', () => {
  it('tracks parameter names, order, optionality, rest, defaults, types and return declarations', () => {
    const before = 'export function createThing(name: string, count?: number, ...items: string[]): void {}'
    for (const after of [before.replace('name:', 'label:'), before.replace('count?:', 'count:'), before.replace('...items', 'items'), before.replace('count?: number', 'count: number = 1'), before.replace('name: string', 'name: number'), before.replace(': void', ': string'), before.replace('name: string, count?: number', 'count: number, name?: string')]) expect(hash(after)).not.toBe(hash(before))
    expect(hash('export function createThing(count: number = 1): void {}')).toBe(hash('export function createThing(count: number = 2): void { console.log(count) }'))
    expect(extract(before).coverage[0]?.status).toBe('complete')
  })
  it('normalizes trivia without changing string literal types', () => {
    expect(hash('export function createThing(value: string /* note */): void {}')).toBe(hash('export function createThing( value : string ): void {}'))
    expect(hash("export function createThing(value: 'a b'): void {}")).not.toBe(hash("export function createThing(value: 'ab'): void {}"))
    expect(hash('export function createThing(value: `a ${string} b`): void {}')).not.toBe(hash('export function createThing(value: `a ${string}b`): void {}'))
  })
  it('uses declared overloads in source order and ignores the implementation signature/body', () => {
    const text = 'export function createThing(value: string): string;\nexport function createThing(value: number): number;\nexport function createThing(value: any) { return value }'
    expect(extract(text).facts).toHaveLength(1)
    expect(hash(text)).toBe(hash(text.replace('value: any', 'value: unknown').replace('return value', 'throw 1')))
    expect(hash(text)).not.toBe(hash(text.replace('value: number', 'value?: number')))
    expect(extract(text).coverage[0]?.status).toBe('complete')
  })
  it('extracts arrow constants and public class constructors/methods, excluding private/protected members', () => {
    expect(extract('export const createThing = (value: string): string => value').facts.map(fact => fact.name)).toEqual(['createThing'])
    const text = 'export class Thing { constructor(name: string) {} run(value?: number): void {} private hidden(): void {} protected secret(): void {} #local(): void {} static make(): Thing { return new Thing("x") } }'
    expect(extract(text).facts.map(fact => fact.name)).toEqual(['Thing', 'Thing.constructor', 'Thing.run', 'Thing.static:make'])
    expect(hash(text, 'Thing')).toBe(hash(text.replace('hidden(): void', 'hidden(value: string): void'), 'Thing'))
    expect(hash(text, 'Thing')).not.toBe(hash(text.replace('run(value?:', 'run(value:'), 'Thing'))
  })
  it('extracts type aliases and interface top-level members', () => {
    const result = extract('export interface Thing { name: string; readonly count?: number; run(value: string): void }\nexport type Options = { flag?: boolean }; export type Label = string | number')
    expect(result.facts.map(fact => fact.name)).toEqual(['Label', 'Options', 'Options.flag', 'Thing', 'Thing.count', 'Thing.name', 'Thing.run'])
    expect(result.coverage[0]?.status).toBe('complete')
    expect(hash('export type Things<T> = T[]', 'Things')).not.toBe(hash('export type Things<T extends string> = T[]', 'Things'))
  })
  it('reports inferred/dynamic/re-exported/unsupported syntax explicitly and bounds output', () => {
    for (const text of ['export const createThing = (value) => value', 'export {createThing} from "other"', 'export class Thing { [key](): void {} }', 'export default function (): void {}', 'export const createThing = factory()', 'export let createThing = (value: string): string => value', 'export function createThing( {']) expect(extract(text).coverage[0]?.status).toBe('partial')
    const bounded = extract(`export interface Thing { ${Array.from({length: 4100}, (_, i) => `p${i}: string;`).join('')} }`)
    expect(bounded.facts.length).toBeLessThanOrEqual(4096)
    expect(bounded.coverage[0]?.status).toBe('partial')
    expect(extract('const local = () => 1').facts).toEqual([])
  })
})

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
describe('signature fixture snapshot and delta acceptance', () => {
  it('emits facts through the strict builtin registry and exact-partition injected discovery', async () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
    cpSync(resolve('tests/fixtures/signature-api'), root, { recursive: true })
    const local = discoverRepository({ root })
    const plugin = createJsTsPluginV2()
    const read = await createLocalRepositoryRead({ root, partition: { repositoryId: 'doc-bridge', revision: local.sourceRevision }, limits: plugin.manifest.resourceLimits,
      inventory: Object.fromEntries(safeWalkFiles(root).files.map(path => [relative(root, path).split('\\').join('/'), contentRef(readFileSync(path))])) })
    const registry = createDiscoveryRegistryV2({ builtIns: [{ plugin, analyzerVersions: { 'js-ts': plugin.manifest.version, ...factAnalyzerVersions() } }] })
    registry.register(plugin)
    const output = await registry.discover('js-ts', { read, signal: new AbortController().signal, configuration: {}, resolution: { entities: [], relations: [] } })
    expect(output.facts.map(fact => fact.name)).toContain('createThing')
    expect(output.coverage).toContainEqual(expect.objectContaining({ analyzer: 'js-ts:signature', scope: 'signatures', status: 'complete' }))
    expect((await discoverRepositoryWithRead(read, { root })).snapshot).toEqual(local)
  })

  it('retains symbol citations and reports a required parameter change with before/after hashes', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
    cpSync(resolve('tests/fixtures/signature-api'), root, { recursive: true })
    const base = discoverRepository({ root })
    const symbol = base.relations.find(relation => relation.metadata?.symbol === 'createThing')
    const signature = base.relations.find(relation => relation.metadata?.factKind === 'signature' && relation.metadata?.factName === 'createThing')
    expect(symbol?.to).toBe('module:api.ts')
    expect(signature?.to).toBe(symbol?.to)
    const path = join(root, 'api.ts')
    const original = readFileSync(path, 'utf8')
    writeFileSync(path, original.replace('createThing(name: string)', 'createThing(name: string, enabled: boolean)'))
    const head = discoverRepository({ root })
    const result = diffSnapshots(base, head, { headRoot: root })
    const change = result.changeSet.changes.find(change => change.kind === 'signature' && change.before?.name === 'createThing')!
    expect(change.op).toBe('changed')
    expect(change.before?.valueHash).not.toBe(change.after?.valueHash)
    expect(change.before?.id).toBe(change.after?.id)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ code: 'CHANGED_REFERENCE', status: 'stale-or-unverified' })
    expect(result.policy.findings[0]?.routing).toBe('routed-to-L2')
    expect(result.impact.documentsToReview.map(doc => doc.path)).toContain('README.md')
    writeFileSync(path, original.replace(/export function createThing[\s\S]*?\n}\n/, ''))
    const removed = discoverRepository({ root })
    const removal = diffSnapshots(base, removed, { headRoot: root })
    expect(removal.changeSet.changes).toContainEqual(expect.objectContaining({ kind: 'signature', op: 'removed', before: expect.objectContaining({ name: 'createThing' }) }))
    expect(removal.findings).toContainEqual(expect.objectContaining({ code: 'BROKEN_REFERENCE', status: 'conflict', relationIds: [symbol!.id] }))
    const facts = base.entities.filter(entity => entity.kind === 'signature').map(surfaceFactFromEntity)
    expect(facts.map(fact => fact.name)).toContain('ThingStore.create')
  })

  it('keeps one proven symbol removal despite unrelated inferred signature coverage', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
    cpSync(resolve('tests/fixtures/signature-api'), root, { recursive: true })
    writeFileSync(join(root, 'api.ts'), 'export function removeThing() { return 1 }\nexport function retained() { return 2 }\n')
    writeFileSync(join(root, 'README.md'), '# Guide\n\nCall `removeThing` twice: `removeThing`.\n')
    const base = discoverRepository({ root })
    writeFileSync(join(root, 'api.ts'), 'export function retained() { return 2 }\n')
    const head = discoverRepository({ root })
    const findings = diffSnapshots(base, head, { headRoot: root }).findings
    expect(findings).toHaveLength(1)
    expect(findings[0]?.status).toBe('conflict')
    const evidence = findings[0]!.evidence
    expect(new Set(evidence.map(item => JSON.stringify(item))).size).toBe(evidence.length)
    expect(new Set(evidence.filter(item => item.source === 'documentation').map(item => item.context))).toEqual(new Set(['Base citation', 'Head citation']))
    expect(diffSnapshots(base, head).findings[0]?.status).toBe('stale-or-unverified')
    const repeated = structuredClone(base)
    const citation = repeated.relations.find(item => item.metadata?.symbol === 'removeThing')!
    repeated.relations.push({ ...citation, id: `${citation.id}:repeated`, kind: 'mentions' })
    expect(diffSnapshots(repeated, head).findings).toHaveLength(1)
    const partial = structuredClone(head)
    partial.coverage.push({ analyzer: 'js-ts', scope: 'static-imports-and-exports', status: 'partial' })
    expect(diffSnapshots(base, partial, { headRoot: root }).findings[0]?.status).toBe('stale-or-unverified')
  })
  it('partial extraction cannot prove removal and body-only changes do not change signatures', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
    cpSync(resolve('tests/fixtures/signature-api'), root, { recursive: true })
    const base = discoverRepository({ root })
    const path = join(root, 'api.ts'); const original = readFileSync(path, 'utf8')
    writeFileSync(path, original.replace('return { name }', 'return { name, enabled: true }'))
    expect(diffSnapshots(base, discoverRepository({ root }), { headRoot: root }).changeSet.changes.filter(change => change.kind === 'signature')).toEqual([])
    writeFileSync(path, original.replace(/export function createThing[\s\S]*?\n}\n/, '') + '\nexport {unknown} from "other"\n')
    const findings = diffSnapshots(base, discoverRepository({ root }), { headRoot: root }).findings.filter(finding => finding.code === 'BROKEN_REFERENCE')
    expect(findings.length).toBeGreaterThan(0)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.status).toBe('conflict')
  })
})

describe('signature citation bounds and matching', () => {
  it('preserves all legacy edges at the cap and adds no qualified member token matching', () => {
    const names = Array.from({ length: 40 }, (_, i) => `createThing${i}`)
    const resolution = { documents: new Map<string, string>(), modules: new Map<string, string>(), packages: new Map<string, string>(),
      symbols: new Map(names.map(name => [name, ['module:api.ts']])),
      facts: new Map(names.map(name => [name, [{ kind: 'signature', name, ownerId: 'module:api.ts' }]])) }
    const document = parseMarkdownDocument('guide.md', names.map(name => `\`${name}\``).join(' '))
    const baseline = analyzeMarkdownDocument(document, 'document:guide.md', { ...resolution, facts: undefined })
    const result = analyzeMarkdownDocument(document, 'document:guide.md', resolution)
    expect(result.relations.filter(relation => relation.metadata?.symbol)).toEqual(baseline.relations)
    expect(result.relations).toHaveLength(80)
    expect(result.truncated).toBe(false)
    const classResolution = { ...resolution, symbols: new Map([['Thing', ['module:api.ts']]]), facts: new Map([['Thing.run', [{ kind: 'signature', name: 'Thing.run', ownerId: 'module:api.ts' }]]]) }
    expect(analyzeMarkdownDocument(parseMarkdownDocument('guide.md', '`Thing.run`'), 'document:guide.md', classResolution).relations).toEqual([])
  })
})

describe('cross-module callable compatibility', () => {
  it.each([
    ['relative named import', './types.js', 'export interface Base { value: string }', true],
    ['external import', 'external-types', 'export interface Base { value: string }', false],
    ['unresolved nested type', './types.js', 'export interface Base { value: Missing }', false],
    ['unsafe any type', './types.js', 'export interface Base { value: any }', false],
  ])('%s uses historical syntax and keeps unsupported findings', (_name, from, declaration, compatible) => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'doc-bridge-fixture', version: '1.0.0' }))
    writeFileSync(join(root, 'README.md'), '# Guide\n\nCall `createThing` with its declared parameters and return type.\n')
    writeFileSync(join(root, 'types.ts'), declaration)
    const source = `import type { Base as Result } from '${from}'; export function createThing(): Result { throw 0 }`
    writeFileSync(join(root, 'api.ts'), source)
    const base = discoverRepository({ root })
    const changed = source.replace('export function', 'interface Extended extends Result { extra: number }; export function').replace('(): Result', '(): Extended')
    writeFileSync(join(root, 'api.ts'), from === 'external-types' ? changed.replace('extends Result { extra: number }', '{ value: Result }') : changed)
    const head = discoverRepository({ root })
    // No filesystem/source dependency at diff time; serialized historical metadata is sufficient.
    rmSync(join(root, 'types.ts'))
    const result = diffSnapshots(JSON.parse(JSON.stringify(base)), JSON.parse(JSON.stringify(head)), { headRoot: root })
    expect(result.changeSet.changes.find(change => change.before?.name === 'createThing' && change.kind === 'signature')?.compatibility).toBe(compatible ? 'compatible' : undefined)
    expect(result.findings.filter(finding => finding.code === 'CHANGED_REFERENCE')).toHaveLength(compatible ? 0 : 1)
  })

  it('rejects a changed imported base instead of substituting the head for history', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
    writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture","version":"1.0.0"}')
    writeFileSync(join(root, 'README.md'), '# Guide\n\nCall `createThing` with its declared parameters and return type.\n')
    writeFileSync(join(root, 'types.ts'), 'export interface Base { value: string }')
    writeFileSync(join(root, 'api.ts'), "import type { Base } from './types.js'; export function createThing(): Base { throw 0 }")
    const base = discoverRepository({ root })
    writeFileSync(join(root, 'types.ts'), 'export interface Base { value: number }')
    writeFileSync(join(root, 'api.ts'), "import type { Base } from './types.js'; interface Extended extends Base { extra: number }; export function createThing(): Extended { throw 0 }")
    const result = diffSnapshots(base, discoverRepository({ root }), { headRoot: root })
    expect(result.changeSet.changes.find(change => change.before?.name === 'createThing' && change.kind === 'signature')?.compatibility).toBeUndefined()
    expect(result.findings.some(finding => finding.code === 'CHANGED_REFERENCE')).toBe(true)
  })
})


describe('workspace exports and traversal bounds', { timeout: 30_000 }, () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'doc-bridge-fixture', version: '1.0.0', workspaces: ['packages/*'] }))
    writeFileSync(join(root, 'README.md'), '# Guide\n\nCall `createThing` with its declared parameters and return type.\n')
    return root
  }
  it('follows an explicit workspace entrypoint and named re-export', () => {
    const root = setup()
    mkdirSync(join(root, 'packages/types'), { recursive: true })
    writeFileSync(join(root, 'packages/types/package.json'), JSON.stringify({ name: '@agentskit/fixture-types', version: '1.0.0', exports: { '.': { types: './index.ts' } } }))
    writeFileSync(join(root, 'packages/types/index.ts'), "export type { Base as Result } from './types.js'")
    writeFileSync(join(root, 'packages/types/types.ts'), 'export interface Base { value: string }')
    const text = "import type { Result } from '@agentskit/fixture-types'; export function createThing(): Result { throw 0 }"
    writeFileSync(join(root, 'api.ts'), text)
    const base = discoverRepository({ root })
    writeFileSync(join(root, 'api.ts'), text.replace('export function', 'interface Extended extends Result { extra: number }; export function').replace('(): Result', '(): Extended'))
    const head = discoverRepository({ root })
    const result = diffSnapshots(base, head, { headRoot: root })
    expect(result.changeSet.changes.find(change => change.before?.name === 'createThing' && change.kind === 'signature')?.compatibility).toBe('compatible')
    expect(result.findings).toHaveLength(0)
    for (const entity of [...base.entities, ...head.entities]) delete entity.metadata?.signatureContext
    expect(diffSnapshots(base, head, { headRoot: root }).findings.some(finding => finding.code === 'CHANGED_REFERENCE')).toBe(true)
  })
  it.each([2, 10])('bounds depth while terminating an import cycle (depth %i)', count => {
    const root = setup()
    for (let i = 0; i < count; i++) writeFileSync(join(root, `types${i}.ts`), `import type { T${(i+1)%count} } from './types${(i+1)%count}.js'; export interface T${i} { value: string; next?: T${(i+1)%count} }`)
    const text = "import type { T0 } from './types0.js'; export function createThing(): T0 { throw 0 }"
    writeFileSync(join(root, 'api.ts'), text)
    const base = discoverRepository({ root })
    writeFileSync(join(root, 'api.ts'), text.replace('export function', 'interface Extended extends T0 { extra: number }; export function').replace('(): T0', '(): Extended'))
    const result = diffSnapshots(base, discoverRepository({ root }), { headRoot: root })
    expect(result.changeSet.changes.find(change => change.before?.name === 'createThing' && change.kind === 'signature')?.compatibility).toBe(count === 2 ? 'compatible' : undefined)
  })
  it('omits oversized module context and keeps its changed signature unproven', () => {
    const root = setup()
    writeFileSync(join(root, 'types.ts'), `export interface Base { value: string }; type Unused = '${'x'.repeat(65536)}'`)
    const text = "import type { Base } from './types.js'; export function createThing(): Base { throw 0 }"
    writeFileSync(join(root, 'api.ts'), text)
    const base = discoverRepository({ root })
    expect(base.entities.find(entity => entity.path === 'types.ts')?.metadata?.signatureContext).toBeNull()
    writeFileSync(join(root, 'api.ts'), text.replace('export function', 'interface Extended extends Base { extra: number }; export function').replace('(): Base', '(): Extended'))
    expect(diffSnapshots(base, discoverRepository({ root }), { headRoot: root }).findings.some(finding => finding.code === 'CHANGED_REFERENCE')).toBe(true)
  })
})


it.each([['file count', 33, 0], ['total context bytes', 5, 60000]] as const)('keeps %s over-budget proofs unproven', (_bound, count, padding) => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
  writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture","version":"1.0.0"}')
  writeFileSync(join(root, 'README.md'), '# Guide\n\nCall `createThing` with its declared parameters and return type.\n')
  const imports: string[] = [], members: string[] = []
  for (let i = 0; i < count; i++) {
    imports.push(`import type { Item${i} } from './item${i}.js';`)
    members.push(`item${i}: Item${i};`)
    writeFileSync(join(root, `item${i}.ts`), `export interface Item${i} { value: string }; type Padding = '${'x'.repeat(padding)}'`)
  }
  const text = `${imports.join('\n')} interface Base { ${members.join(' ')} }; export function createThing(): Base { throw 0 }`
  writeFileSync(join(root, 'api.ts'), text)
  const base = discoverRepository({ root })
  writeFileSync(join(root, 'api.ts'), text.replace('export function', 'interface Extended extends Base { extra: number }; export function').replace('(): Base', '(): Extended'))
  const result = diffSnapshots(base, discoverRepository({ root }), { headRoot: root })
  expect(result.changeSet.changes.find(change => change.before?.name === 'createThing' && change.kind === 'signature')?.compatibility).toBeUndefined()
  expect(result.findings.some(finding => finding.code === 'CHANGED_REFERENCE')).toBe(true)
})

it.each(["import type Promise from 'external-types'", "import type * as Intl from 'external-types'"])('never substitutes a compiler builtin for an unsupported import (%s)', statement => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
  writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture","version":"1.0.0"}')
  writeFileSync(join(root, 'README.md'), '# Guide\n\nCall `createThing` with its declared parameters and return type.\n')
  const type = statement.includes('Promise') ? 'Promise<string>' : 'Intl.DateTimeFormat'
  const text = `${statement}; export function createThing(): ${type} { throw 0 }`
  writeFileSync(join(root, 'api.ts'), text)
  const base = discoverRepository({ root })
  writeFileSync(join(root, 'api.ts'), text.replace('createThing()', 'createThing(optional?: boolean)'))
  expect(diffSnapshots(base, discoverRepository({ root }), { headRoot: root }).findings.some(finding => finding.code === 'CHANGED_REFERENCE')).toBe(true)
})


it('labels direct opaque imported heritage as conditional and leaves other external shapes unproven', () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
  writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture","version":"1.0.0"}')
  writeFileSync(join(root, 'README.md'), '# Guide\n\nCall `createThing` with its declared parameters and return type.\n')
  const text = "import type { Base } from 'external-types'; export function createThing(): Base { throw 0 }"
  writeFileSync(join(root, 'api.ts'), text)
  const base = discoverRepository({ root })
  for (const [shape, compatible] of [['interface Extended extends Base { extra: UnknownExternal }', true], ['class Base {}; interface Extended extends Base { extra: number }', false], ['interface Extended<T> extends Base { extra: T }', false], ['type Extended = Base & { extra: number }', false], ['interface Middle extends Base {}; interface Extended extends Middle { extra: number }', false]] as const) {
    writeFileSync(join(root, 'api.ts'), text.replace('export function', `${shape}; export function`).replace('(): Base', '(): Extended'))
    const result = diffSnapshots(base, discoverRepository({ root }), { headRoot: root })
    const change = result.changeSet.changes.find(change => change.kind === 'signature' && change.before?.name === 'createThing')
    expect(change?.compatibility).toBe(compatible ? 'compatible' : undefined)
    expect(change?.after?.evidence.some(item => item.context === 'heritage proof (assumes head compiles)')).toBe(compatible)
    expect(result.findings.some(finding => finding.code === 'CHANGED_REFERENCE')).toBe(!compatible)
  }
})

it.each(["import type { Base } from './types.js'; import type { Base } from './other.js'", "import type { Base } from './types.mjs'"])('does not select an ambiguous binding or wrong extension (%s)', imports => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
  writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture","version":"1.0.0"}')
  writeFileSync(join(root, 'README.md'), '# Guide\n\nCall `createThing` with its declared parameters and return type.\n')
  writeFileSync(join(root, 'types.ts'), 'export interface Base { value: string }')
  writeFileSync(join(root, 'other.ts'), 'export interface Base { value: number }')
  const text = `${imports}; export function createThing(): Base { throw 0 }`
  writeFileSync(join(root, 'api.ts'), text)
  const base = discoverRepository({ root })
  writeFileSync(join(root, 'api.ts'), text.replace('export function', 'interface Extended extends Base { extra: number }; export function').replace('(): Base', '(): Extended'))
  expect(diffSnapshots(base, discoverRepository({ root }), { headRoot: root }).findings.some(finding => finding.code === 'CHANGED_REFERENCE')).toBe(true)
})


it('bounds package export conditions and never falls through an explicit invalid export', () => {
  expect(signatureEntryPoints({ exports: null, types: './src/api.ts' })).toBeUndefined()
  expect(signatureEntryPoints({ exports: { types: null, default: './src/api.ts' } })).toBeUndefined()
  expect(signatureEntryPoints({ exports: { require: './src/api.ts' }, types: './src/api.ts' })).toBeUndefined()
  let value: unknown = './src/api.ts'
  for (let i = 0; i < 10; i++) value = { types: value }
  expect(signatureEntryPoints({ exports: value })).toBeUndefined()
  expect(signatureEntryPoints({ exports: { '.': { types: './src/api.ts', default: './dist/api.js' } } })).toEqual({ '.': './src/api.ts' })
})


it.each(['enum Date { value }', 'class Date {}', 'import Date = require("external-types")', 'declare namespace Local { export type Value = string }'])('does not substitute a builtin for an unsupported local type (%s)', declaration => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
  writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture","version":"1.0.0"}')
  writeFileSync(join(root, 'README.md'), '# Guide\n\nCall `createThing` with its declared parameters and return type.\n')
  const text = `${declaration}; export function createThing(): Date { throw 0 }`
  writeFileSync(join(root, 'api.ts'), text)
  const base = discoverRepository({ root })
  writeFileSync(join(root, 'api.ts'), text.replace('export function', 'interface Extended extends Date { extra: number }; export function').replace('(): Date', '(): Extended'))
  expect(diffSnapshots(base, discoverRepository({ root }), { headRoot: root }).findings.some(finding => finding.code === 'CHANGED_REFERENCE')).toBe(true)
})


it('proves a dependency cycle through the owner module without inventing namespaces', () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-signatures-')); roots.push(root)
  writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture","version":"1.0.0"}')
  writeFileSync(join(root, 'README.md'), '# Guide\n\nCall `createThing` with its declared parameters and return type.\n')
  writeFileSync(join(root, 'types.ts'), "import type { Base } from './api.js'; export interface Extended extends Base { extra: number }")
  const text = "import type { Extended } from './types.js'; export interface Base { value: string }; export function createThing(): Base { throw 0 }"
  writeFileSync(join(root, 'api.ts'), text)
  const base = discoverRepository({ root })
  writeFileSync(join(root, 'api.ts'), text.replace('(): Base', '(): Extended'))
  expect(diffSnapshots(base, discoverRepository({ root }), { headRoot: root }).changeSet.changes.find(change => change.kind === 'signature' && change.before?.name === 'createThing')?.compatibility).toBe('compatible')
  writeFileSync(join(root, 'api.ts'), text.replace('(): Base', '(): Before.Base'))
  expect(diffSnapshots(base, discoverRepository({ root }), { headRoot: root }).findings.some(finding => finding.code === 'CHANGED_REFERENCE')).toBe(true)
})
