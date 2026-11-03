import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { ChangeSetV1JsonSchema } from '../src/schemas/change-set.js'

/**
 * RF-07: the Layer 1 public API is frozen within a major version.
 * Baseline: docs/api/layer1-public-api.json. Regenerate on purpose with
 * `API_BASELINE_WRITE=1 pnpm vitest run tests/layer1-api-stability.test.ts`
 * (breaking changes require a new major version first).
 */
const root = resolve(import.meta.dirname, '..')
const baselinePath = resolve(root, 'docs/api/layer1-public-api.json')
const FUNCTIONS = ['defineConfig', 'discoverRepositoryWithRead', 'diffSnapshotsWithRead', 'parseChangeSet'] as const

const signatures = (): Record<string, string[]> => {
  const program = ts.createProgram([resolve(root, 'src/index.ts')], { noEmit: true, skipLibCheck: true, strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: ['node'] })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(resolve(root, 'src/index.ts'))!
  const exports = new Map(checker.getExportsOfModule(checker.getSymbolAtLocation(source)!).map((symbol) => [symbol.name, symbol]))
  const flags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
  return Object.fromEntries(FUNCTIONS.map((name) => {
    const symbol = exports.get(name)
    if (!symbol) throw new Error(`Layer 1 export removed: ${name}`)
    const type = checker.getTypeOfSymbolAtLocation(symbol, source)
    return [name, type.getCallSignatures().map((signature) => checker.signatureToString(signature, undefined, flags))]
  }))
}

type Schema = Record<string, unknown>
const asSchema = (value: unknown): Schema => (value && typeof value === 'object' ? value as Schema : {})
/** Breaking = something a valid old document/consumer relied on is gone or narrower. */
const schemaBreaks = (before: Schema, after: Schema, path = '$'): string[] => {
  const out: string[] = []
  for (const key of ['type', 'const', 'format', 'pattern']) if (JSON.stringify(before[key]) !== JSON.stringify(after[key]) && before[key] !== undefined) out.push(`${path}.${key} changed`)
  const enumBefore = before.enum as unknown[] | undefined
  if (enumBefore) { const enumAfter = new Set((after.enum as unknown[] | undefined ?? []).map(String)); for (const v of enumBefore) if (!enumAfter.has(String(v))) out.push(`${path}.enum lost ${String(v)}`) }
  const requiredBefore = new Set(before.required as string[] | undefined ?? [])
  for (const key of (after.required as string[] | undefined ?? [])) if (!requiredBefore.has(key)) out.push(`${path}.required gained ${key}`)
  const propsBefore = asSchema(before.properties); const propsAfter = asSchema(after.properties)
  for (const key of Object.keys(propsBefore)) {
    if (!(key in propsAfter)) out.push(`${path}.${key} removed`)
    else out.push(...schemaBreaks(asSchema(propsBefore[key]), asSchema(propsAfter[key]), `${path}.${key}`))
  }
  if (before.items) out.push(...schemaBreaks(asSchema(before.items), asSchema(after.items), `${path}[]`))
  for (const key of ['anyOf', 'oneOf']) {
    const a = before[key] as unknown[] | undefined; const b = after[key] as unknown[] | undefined
    if (a) a.forEach((entry, index) => b?.[index] ? out.push(...schemaBreaks(asSchema(entry), asSchema(b[index]), `${path}.${key}[${index}]`)) : out.push(`${path}.${key}[${index}] removed`))
  }
  for (const key of ['maxLength', 'maxItems', 'maximum']) if (typeof before[key] === 'number' && (typeof after[key] !== 'number' || after[key] < before[key])) out.push(`${path}.${key} narrowed`)
  for (const key of ['minLength', 'minItems', 'minimum']) if (typeof before[key] === 'number' && typeof after[key] === 'number' && after[key] > before[key]) out.push(`${path}.${key} narrowed`)
  if (before.additionalProperties !== undefined && JSON.stringify(before.additionalProperties) !== JSON.stringify(after.additionalProperties)) out.push(`${path}.additionalProperties changed`)
  return out
}

const major = (version: string) => Number(version.split('.')[0])
const current = () => ({ major: major(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version as string), signatures: signatures(), changeSetV1JsonSchema: JSON.parse(JSON.stringify(ChangeSetV1JsonSchema)) as Schema })

describe('Layer 1 public API stability (RF-07)', () => {
  const now = current()
  if (process.env.API_BASELINE_WRITE === '1') writeFileSync(baselinePath, `${JSON.stringify(now, null, 2)}\n`)
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as typeof now

  it('keeps the baseline in step with the major version', () => {
    expect(now.major, 'major bumped: regenerate docs/api/layer1-public-api.json (API_BASELINE_WRITE=1)').toBe(baseline.major)
  })
  it.each(FUNCTIONS)('%s keeps its signature', (name) => {
    expect(now.signatures[name], `${name} signature changed incompatibly; needs a major version`).toEqual(baseline.signatures[name])
  })
  it('ChangeSetV1 JSON schema has no breaking change', () => {
    expect(schemaBreaks(baseline.changeSetV1JsonSchema, now.changeSetV1JsonSchema)).toEqual([])
  })
  it('detects breaking schema edits', () => {
    const edited = JSON.parse(JSON.stringify(baseline.changeSetV1JsonSchema)) as Schema
    delete asSchema(edited.properties).branch
    expect(schemaBreaks(baseline.changeSetV1JsonSchema, edited)).toContain('$.branch removed')
  })
})
