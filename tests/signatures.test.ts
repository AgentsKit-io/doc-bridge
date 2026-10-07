import * as ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
import { extractSignatures } from '../src/discovery/facts/signatures.js'

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
    expect(result.findings).toEqual([])
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
