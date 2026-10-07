import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ parses: [] as string[], extractions: 0 }))
vi.mock('typescript', async importOriginal => {
  const real = await importOriginal<typeof import('typescript')>()
  return { ...real, createSourceFile: (...args: Parameters<typeof real.createSourceFile>) => { state.parses.push(args[0]); return real.createSourceFile(...args) } }
})
vi.mock('../src/discovery/facts/index.js', async importOriginal => {
  const real = await importOriginal<typeof import('../src/discovery/facts/index.js')>()
  const { sha256NormalizedV1 } = await import('../src/index-builder/content-hash.js')
  const { surfaceFactEntityId } = await import('../src/storage/facts.js')
  const testExtractor: import('../src/discovery/facts/index.js').FactExtractor = {
    id: 'js-ts:test', version: '1.0.0', kinds: ['signature'], inputScope: 'global', inputExtensions: ['.json'],
    extract(input) {
      state.extractions++
      const module = [...input.modules.values()].find(module => module.path === 'src/a.ts')!
      const text = input.sourceFiles.get(module.path)!.getFullText()
      const name = text.includes('Changed') ? 'Changed()' : 'Stable()'
      const jsonPath = join(input.root, 'value.config-schema.json')
      const json = input.io.host.fileExists(jsonPath) ? input.io.readText(jsonPath) : ''
      const evidence = [{ source: 'code' as const, path: module.path, lineStart: 1, contentHash: sha256NormalizedV1(text) }]
      if (json) evidence.push({ source: 'code', path: 'value.config-schema.json', lineStart: 1, contentHash: sha256NormalizedV1(json) })
      return { facts: [{ kind: 'signature', id: surfaceFactEntityId('signature', module.entityId, name), ownerId: module.entityId, name, valueHash: sha256NormalizedV1([name, json]), evidence }], coverage: [{ analyzer: 'js-ts:test', scope: 'signatures', status: 'complete', evidence }] }
    },
  }
  ;(real.FACT_EXTRACTORS as import('../src/discovery/facts/index.js').FactExtractor[]).push(testExtractor)
  return real
})
import { discoverRepository } from '../src/discovery/repository.js'

it('reuses codec facts and stable Markdown resolution with registered global extractors', () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-fact-reuse-'))
  try {
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture"}')
    writeFileSync(join(root, 'src/a.ts'), 'export function Stable() {}\n')
    writeFileSync(join(root, 'src/b.ts'), 'export const Other = 1\n')
    writeFileSync(join(root, 'README.md'), '# Guide\n`Stable()`\n')
    const cold = discoverRepository({ root })
    const count = state.extractions
    state.parses.length = 0
    const warm = discoverRepository({ root, previous: JSON.parse(JSON.stringify(cold)) })
    expect(state.parses).toEqual([])
    expect(state.extractions).toBe(count)
    expect(warm.entities).toEqual(cold.entities)
    expect(warm.relations).toEqual(cold.relations)
    expect(warm.contentHash).toBe(cold.contentHash)
    expect(warm.coverage.find(entry => entry.scope === 'reused-entities')?.reason).toContain('Reused 3 entities')
    state.parses.length = 0
    writeFileSync(join(root, 'src/a.ts'), 'export function Changed() {}\n')
    const changed = discoverRepository({ root, previous: cold })
    expect([...new Set(state.parses)]).toEqual([join(root, 'src/a.ts')])
    const clean = discoverRepository({ root })
    expect(changed.entities).toEqual(clean.entities)
    expect(changed.relations).toEqual(clean.relations)
    expect(changed.contentHash).toBe(clean.contentHash)
  } finally { rmSync(root, { recursive: true, force: true }) }
})


it('invalidates warm facts for JSON defaults, empty schema edits and file-list changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-fact-json-'))
  try {
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture"}')
    writeFileSync(join(root, 'src/a.ts'), 'export function Stable() {}\n')
    const path = join(root, 'value.config-schema.json')
    let previous = discoverRepository({ root })
    for (const value of ['{"properties":{"mode":{"default":"memory"}}}', '{"properties":{"mode":{"default":"disk"}}}', '{"properties":{}}', '{"properties":{},"title":"Config"}', null]) {
      if (value === null) rmSync(path)
      else writeFileSync(path, value)
      const count = state.extractions
      const warm = discoverRepository({ root, previous: JSON.parse(JSON.stringify(previous)) })
      expect(state.extractions).toBeGreaterThan(count)
      const cold = discoverRepository({ root })
      expect(warm.entities).toEqual(cold.entities)
      expect(warm.contentHash).toBe(cold.contentHash)
      previous = warm
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
