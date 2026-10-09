import { afterEach, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverRepository } from '../src/discovery/repository.js'
import { diffSnapshots, diffSnapshotsWithRead } from '../src/diff/change-set.js'
import { changedCitationClaims } from '../src/discovery/changed-claims.js'
import { parseMarkdownDocument } from '../src/discovery/markdown.js'
import { surfaceFactFromEntity } from '../src/storage/facts.js'
import { contentRef, createLocalRepositoryRead } from '../src/storage/local.js'

// Real fixture discovery and retained TypeScript proofs share the signature suite budget.
vi.setConfig({ testTimeout: 30_000 })

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const flow = (before: string, after: string, document: string, nextDocument = document, files: Record<string, string> = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-claims-')); roots.push(root)
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'doc-bridge-claim-fixture', version: '1.0.0', dependencies: { zod: '^4.0.0' } }))
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text)
  writeFileSync(join(root, 'api.ts'), before)
  writeFileSync(join(root, 'docs/guide.md'), document)
  const base = discoverRepository({ root })
  writeFileSync(join(root, 'api.ts'), after)
  writeFileSync(join(root, 'docs/guide.md'), nextDocument)
  const head = discoverRepository({ root })
  return { root, base, head, result: diffSnapshots(base, head, { headRoot: root }) }
}
const changed = (result: ReturnType<typeof diffSnapshots>) => result.findings.filter(item => item.code === 'CHANGED_REFERENCE')

it('preserves mention relations and removal findings but omits changed-shape export mentions', () => {
  const document = '# Exports\n\n| Export | Role |\n| --- | --- |\n| `Thing` | Configuration shape |\n'
  const { base, result } = flow('export interface Thing { value: string }', 'export interface Thing { value: number }', document)
  expect(base.relations.some(item => item.metadata?.symbol === 'Thing')).toBe(true)
  expect(result.changeSet.changes.some(item => item.kind === 'signature')).toBe(true)
  expect(changed(result)).toEqual([])
  expect(flow('export interface Thing { value: string }', '', document).result.findings.some(item => item.code === 'BROKEN_REFERENCE')).toBe(true)
})

it('retains explicit shape claims, required calls and unclear regions', () => {
  expect(changed(flow('export interface Thing { value: string }', 'export interface Thing { value: number }', '# API\n\nThe `Thing` signature:\n\n```ts\ninterface Thing { value: string }\n```\n').result)).toHaveLength(1)
  expect(changed(flow('export const make = () => 1', 'export const make = (required: boolean) => 1', '# API\n\n```ts\nmake()\n```\n').result)).toHaveLength(1)
  expect(changed(flow('export const make = () => 1', 'export const make = (required: boolean) => 1', '# API\n\nCall `make` with no arguments.\n').result)).toHaveLength(1)
  expect(changed(flow('export interface Thing { value: string }', 'export interface Thing { value: number }', '# API\n\n`Thing` <Widget type={Thing} />\n').result)).toHaveLength(1)
})

it('does not attribute an optional call change to unrelated opaque return types', () => {
  const { result } = flow('export const make = (): UnresolvedValue => 1 as UnresolvedValue', 'export const make = (optional?: boolean): UnresolvedValue => 1 as UnresolvedValue', '# API\n\n```ts\nimport { make } from "./api"\nmake()\n```\n')
  expect(changed(result)).toEqual([])
})

it('keeps an unverified return-shape use and snapshot-only claims', () => {
  const { base, head, result } = flow('export function make(): { value: string } { return { value: "" } }', 'export function make(): { value: number } { return { value: 1 } }', '# API\n\n```ts\nconst result = make()\nresult.value.toUpperCase()\n```\n')
  expect(changed(result)).toHaveLength(1)
  expect(changed(diffSnapshots(base, head))).toHaveLength(1)
})

it('proves updated enum claims from verified source and preserves stale unions', () => {
  const before = "import { z } from 'zod'; export const ConfigSchema = z.object({ settings: z.object({ mode: z.enum(['a']) }) })"
  const after = before.replace("['a']", "['a', 'b']")
  const document = '# Config\n\n## `settings`\n\n```ts\ntype SettingsConfig = { mode: \'a\' }\n```\n'
  expect(changed(flow(before, after, document).result)).toHaveLength(1)
  expect(changed(flow(before, after, document, document.replace("mode: 'a'", "mode: 'a' | 'b'")).result)).toEqual([])
})

it('distinguishes a type annotation from usage of a changed member', () => {
  const before = 'export interface Thing { value: string }'
  const after = 'export interface Thing { value: number; correlation?: string }'
  const mention = '# API\n\n```ts\nfunction run(request: Thing) { return 1 }\n```\n'
  const usage = mention.replace('return 1', 'return request.value.toUpperCase()')
  expect(changed(flow(before, after, mention).result)).toEqual([])
  expect(changed(flow(before, after, usage).result)).toHaveLength(1)
  const optional = 'export interface Thing { value: string; correlation?: string }'
  expect(changed(flow(before, optional, usage).result)).toEqual([])
})

it('never proves an enum correction from denied or changed source bytes', async () => {
  const before = "import { z } from 'zod'; export const ConfigSchema = z.object({ settings: z.object({ mode: z.enum(['a']) }) })"
  const after = before.replace("['a']", "['a', 'b']")
  const document = '# Config\n\n## `settings`\n\n```ts\ntype SettingsConfig = { mode: \'a\' }\n```\n'
  const { root, base, head, result } = flow(before, after, document, document.replace("mode: 'a'", "mode: 'a' | 'b'"))
  expect(changed(result)).toEqual([])
  const read = await createLocalRepositoryRead({ root, partition: { repositoryId: 'doc-bridge', revision: head.sourceRevision },
    limits: { maxFiles: 100, maxBytes: 1_000_000, maxFileBytes: 1_000_000, maxTimeMs: 10_000, maxMemoryMb: 512 },
    inventory: Object.fromEntries(['api.ts', 'docs/guide.md', 'package.json'].map(path => [path, contentRef(readFileSync(join(root, path)))])) })
  expect(changed(await diffSnapshotsWithRead(base, head, read))).toEqual([])
  const denied = { ...read, read: (request: Parameters<typeof read.read>[0]) => request.path === 'api.ts'
    ? Promise.resolve({ status: 'denied' as const, code: 'PATH_DENIED' as const }) : read.read(request) }
  expect(changed(await diffSnapshotsWithRead(base, head, denied))).toHaveLength(1)
  writeFileSync(join(root, 'api.ts'), after.replace("'b'", "'c'"))
  expect(changed(diffSnapshots(base, head, { headRoot: root }))).toHaveLength(1)
})

it('does not borrow another subject claim, but retains pronoun continuations', () => {
  const before = 'export interface Thing { value: string }', after = 'export interface Thing { value: number }'
  const mention = '# API\n\n`Thing` is exported. Other signatures specify unrelated fields.\n'
  expect(changed(flow(before, after, mention).result)).toEqual([])
  const claim = mention.replace('Other signatures specify unrelated fields.', 'Its value is a string.')
  expect(changed(flow(before, after, claim).result)).toHaveLength(1)
})

it('binds adjacent examples to the cited symbol and accepts fence metadata', () => {
  const before = 'export interface Thing { value: string }', after = 'export interface Thing { value: string; correlation?: string }'
  expect(changed(flow(before, after, '# API\n\n`Thing` stores only application metadata.\n\n```sh\ninstall something\n```\n').result)).toEqual([])
  expect(changed(flow(before, after, '# API\n\n`Thing` accepts a request.\n\n```ts title="example.ts"\nfunction run(request: Thing) { return request.value }\n```\n').result)).toEqual([])
  expect(changed(flow(before, after.replace('correlation?', 'correlation'), '# API\n\n```ts title="example.ts"\nconst request: Thing = { value: "" }\n```\n').result)).toHaveLength(1)
})

it('proves shallow optional option additions without resolving unused opaque fields', () => {
  const before = 'export function make(options: { signal?: AbortSignal; branch?: string } = {}): UnresolvedValue { return 1 as UnresolvedValue }'
  const after = 'type Controls = Readonly<{ signal?: AbortSignal; limits?: UnresolvedValue; onProgress?: (value: UnresolvedValue) => void }>; export function make(options: Controls & { branch?: string } = {}): UnresolvedValue { return 1 as UnresolvedValue }'
  const document = '# API\n\n```ts\nmake({ signal })\n```\n'
  expect(changed(flow(before, after, document).result)).toEqual([])
  expect(changed(flow(before, after.replace('limits?', 'limits'), document).result)).toHaveLength(1)
  expect(changed(flow(before, after.replace('signal?: AbortSignal', 'signal?: string'), document).result)).toHaveLength(1)
  expect(changed(flow(before, 'type Readonly<T> = { required: T }; ' + after, document).result)).toHaveLength(1)
})

it('proves unused optional return additions only through unchanged positive wrappers', () => {
  const before = 'type Result<T> = Readonly<{ status: "ok"; value: T }> | { status: "error" }; export function make(): Promise<Result<{ value: string; opaque: UnresolvedValue }>> { throw 1 }'
  const after = before.replace('{ value: string; opaque: UnresolvedValue }>>', '{ value: string; opaque: UnresolvedValue; coverage?: UnresolvedValue }>>')
  const document = '# API\n\n```ts\nconst result = await make()\nif (result.status === "ok") console.log(result.value.value)\n```\n'
  expect(changed(flow(before, after, document).result)).toEqual([])
  expect(changed(flow(before, after, document.replace('result.value.value', 'result.value.coverage')).result)).toHaveLength(1)
  expect(changed(flow(before, after.replace('coverage?', 'coverage'), document).result)).toHaveLength(1)
  const opaque = before.replace('Readonly<{ status: "ok"; value: T }>', 'UnresolvedValue<T>')
  expect(changed(flow(opaque, opaque.replace('{ value: string; opaque: UnresolvedValue }>>', '{ value: string; opaque: UnresolvedValue; coverage?: UnresolvedValue }>>'), document).result)).toHaveLength(1)
  const contravariant = before.replace('value: T', 'value: (arg: T) => void')
  expect(changed(flow(contravariant, contravariant.replace('{ value: string; opaque: UnresolvedValue }>>', '{ value: string; opaque: UnresolvedValue; coverage?: UnresolvedValue }>>'), document).result)).toHaveLength(1)
})

it('uses owned imported wrappers while rejecting unresolved or shadowed ones', () => {
  const before = 'import type { Result } from "./types.js"; export function make(): Promise<Result<{ value: UnresolvedValue }>> { throw 1 }'
  const after = before.replace('value: UnresolvedValue', 'value: UnresolvedValue; coverage?: UnresolvedValue')
  const document = '# API\n\n```ts\nconst result = await make()\nif (result.status === "ok") console.log(result.value.value)\n```\n'
  const files = { 'types.ts': 'export type Result<T> = Readonly<{ status: "ok"; value: T }> | { status: "error" }' }
  expect(changed(flow(before, after, document, document, files).result)).toEqual([])
  expect(changed(flow(before, after, document).result)).toHaveLength(1)
  expect(changed(flow('type Promise<T> = keyof T; ' + before, 'type Promise<T> = keyof T; ' + after, document, document, files).result)).toHaveLength(1)
})

it('retains calls when an unchanged local parameter name gains required fields', () => {
  const before = 'type Options = { value?: string }; export function make(options: Options): UnresolvedValue { throw 1 }'
  const after = before.replace('value?: string', 'value?: string; required: boolean').replace('make(options:', 'make(request:')
  expect(changed(flow(before, after, '# API\n\n```ts\nmake({})\n```\n').result)).toHaveLength(1)
})

it('retains implicit default usage when a simultaneous signature change cannot verify the default', () => {
  const before = 'export function make(value: number = 1): UnresolvedValue { throw 1 }'
  const after = 'export function make(value: number = 2, extra?: boolean): UnresolvedValue { throw 1 }'
  const claim = (call: string) => {
    const text = '# API\n\n```ts\n' + call + '\n```\n'
    const { base, head } = flow(before, after, text)
    const fact = (snapshot: typeof base) => surfaceFactFromEntity(snapshot.entities.find(entity => entity.kind === 'signature' && entity.name === 'make')!)
    return changedCitationClaims({ before: fact(base), after: fact(head), base: base.entities, head: head.entities,
      document: parseMarkdownDocument('docs/guide.md', text), text, lines: [4], texts: new Map() })
  }
  expect(claim('make()')).toBe(true)
  expect(claim('make(5)')).toBe(false)
  expect(claim('make(...args)')).toBe(true)
})

it('retains explicit prose configuration values', () => {
  const before = "import { z } from 'zod'; export const ConfigSchema = z.object({ settings: z.object({ count: z.number().default(1) }) })"
  expect(changed(flow(before, before.replace('default(1)', 'default(2)'), '# Config\n\n`settings.count` is 1.\n').result)).toHaveLength(1)
})

it('proves schema-backed inputs independently of optional return additions', () => {
  const before = 'import { z } from "zod"; const RequestSchema = z.object({ partition: z.object({ revision: z.string() }), signal: z.instanceof(AbortSignal) }).strict(); type Request = Readonly<z.infer<typeof RequestSchema>>; type Options = Request & { config: string }; export function make(options: Options): { value: string } { throw 1 }'
  const after = before.replace('{ value: string } { throw', '{ value: string; coverage?: UnresolvedValue } { throw')
  const prose = '# API\n\n`make` accepts explicit configuration and a partition/signal.\n'
  expect(changed(flow(before, after, prose).result)).toEqual([])
  const call = '# API\n\n```ts\nconst result = make({ partition, signal, config })\nconsole.log(result.value)\n```\n'
  expect(changed(flow(before, after, call).result)).toEqual([])
  expect(changed(flow(before, after.replace('revision: z.string()', 'revision: z.number()'), call).result)).toHaveLength(1)
  expect(changed(flow(before, after.replace('}).strict(); type Request', '}).transform(value => value); type Request'), call).result)).toHaveLength(1)
  expect(changed(flow(before, after, call.replace('result.value', 'result.coverage')).result)).toHaveLength(1)
  expect(changed(flow(before, after.replace('const RequestSchema =', 'const RequestSchema: OpaqueSchema ='), call).result)).toHaveLength(1)
})

it('keeps legacy and unsupported schema inputs unproven', () => {
  const before = 'import { z } from "zod"; const Schema = z.object({ value: z.string() }); type Options = z.infer<typeof Schema>; export function make(options: Options): string { throw 1 }'
  const after = before.replace('): string', ', extra?: boolean): string')
  const { base, head } = flow(before, after, '# API\n\n`make` accepts an input.\n')
  for (const snapshot of [base, head]) for (const entity of snapshot.entities) if (entity.kind === 'module' && entity.metadata) entity.metadata.signatureContext = String(entity.metadata.signatureContext).replace(/const Schema[^\n]*\n?/, '')
  expect(changed(diffSnapshots(base, head, { headRoot: roots.at(-1)! }))).toHaveLength(1)
})

it('resolves bounded local schema values and pure schema expression helpers', () => {
  const before = 'import { z } from "zod"; import { PartSchema } from "./parts.js"; const Schema = z.object({ part: PartSchema }); type Options = z.infer<typeof Schema>; export function make(options: Options): { value: string } { throw 1 }'
  const after = before.replace('{ value: string } { throw', '{ value: string; coverage?: UnresolvedValue } { throw')
  const document = '# API\n\n`make` accepts an input.\n'
  const files = { 'parts.ts': 'import { z } from "zod"; const bounded = (max: number) => z.string().min(1).max(max); export const PartSchema = z.object({ value: bounded(8) }); export type Part = z.infer<typeof PartSchema>' }
  expect(changed(flow(before, after, document, document, files).result)).toEqual([])
  expect(changed(flow(before, after, document, document, { ...files, 'package.json': '{"name":"doc-bridge-claim-fixture","version":"1.0.0","dependencies":{"zod":"^3.0.0"}}' }).result)).toHaveLength(1)
})

it('proves literal-bound schema helpers, object extension and closed schema registries', () => {
  const before = 'import { z } from "zod"; const fields = { signal: z.instanceof(AbortSignal) }; const payloads = { a: z.object({ value: z.string() }) } as const; const shape = <K extends keyof typeof payloads>(kind: K) => z.object({ ...fields, kind: z.literal(kind), payload: payloads[kind] }).extend({ bytes: z.instanceof(Uint8Array) }); const Schema = shape("a"); type Options = z.infer<typeof Schema>; export function make(options: Options): { value: string } { throw 1 }'
  const after = before.replace('{ value: string } { throw', '{ value: string; coverage?: UnresolvedValue } { throw')
  const document = '# API\n\n`make` accepts an input.\n'
  expect(changed(flow(before, after, document).result)).toEqual([])
  expect(changed(flow(before, after.replace('shape("a")', 'shape("missing")'), document).result)).toHaveLength(1)
  expect(changed(flow(before, after.replace('value: z.string()', 'value: z.number()'), document).result)).toHaveLength(1)
})

it('does not let local standard-type aliases mask schema changes', () => {
  const before = 'import { z } from "zod"; type Record<K, V> = { fixed: string }; const Schema = z.object({ values: z.record(z.string(), z.string()) }); type Options = z.infer<typeof Schema>; export function make(options: Options): { value: string } { throw 1 }'
  const after = before.replace('z.record(z.string(), z.string())', 'z.record(z.string(), z.number())').replace('{ value: string } { throw', '{ value: string; coverage?: UnresolvedValue } { throw')
  expect(changed(flow(before, after, '# API\n\n`make` accepts an input.\n').result)).toHaveLength(1)
})

it('does not substitute helper parameters into global schema objects', () => {
  const before = 'import { z } from "zod"; let dynamic: string = "global"; const fields = { value: z.literal(dynamic) }; const shape = (dynamic: string) => z.object({ ...fields }); const Schema = shape("fixed"); type Options = z.infer<typeof Schema>; export function make(options: Options): { value: string } { throw 1 }'
  const after = before.replace('dynamic: string = "global"', 'dynamic: number = 1').replace('{ value: string } { throw', '{ value: string; coverage?: UnresolvedValue } { throw')
  expect(changed(flow(before, after, '# API\n\n`make` accepts an input.\n').result)).toHaveLength(1)
})

it('keeps type-only schema factory imports unproven', () => {
  const before = 'import type { z } from "zod"; const Schema = z.object({ value: z.string() }); type Options = z.infer<typeof Schema>; export function make(options: Options): { value: string } { throw 1 }'
  const after = before.replace('{ value: string } { throw', '{ value: string; coverage?: UnresolvedValue } { throw')
  expect(changed(flow(before, after, '# API\n\n`make` accepts an input.\n').result)).toHaveLength(1)
})
