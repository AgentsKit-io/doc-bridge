import { describe, expect, it } from 'vitest'

import { createAnalyzerRegistry, type AnalyzerPluginManifest } from '../src/plugins/contract.js'

const manifest = (overrides: Partial<AnalyzerPluginManifest> = {}): AnalyzerPluginManifest => ({
  id: 'fixture-analyzer', version: '1.0.0', languages: ['fixture'], frameworks: [],
  capabilities: ['entities'], knowledgeSchemaVersion: 1 as const,
  compatibility: { pipelineMajor: 1 }, unsupportedConstructs: [], resourceLimits: { maxFiles: 2 },
  ...overrides,
})

describe('analyzer plugin contract', () => {
  it('registers deterministically and stamps canonical output provenance', async () => {
    const registry = createAnalyzerRegistry({ pipelineVersion: '1.2.0' })
    registry.register({ manifest: manifest(), analyze: () => ({ entities: [], relations: [], coverage: [{ analyzer: 'wrong', scope: 'fixture', status: 'complete' }], diagnostics: [] }) })
    expect(registry.list()[0]?.id).toBe('fixture-analyzer')
    const output = await registry.analyze('fixture-analyzer', { language: 'fixture', files: [] })
    expect(output.coverage[0]).toMatchObject({ analyzer: 'fixture-analyzer', analyzerVersion: '1.0.0' })
  })

  it('isolates malformed plugin output as not analyzed', async () => {
    const registry = createAnalyzerRegistry()
    registry.register({ manifest: manifest({ id: 'broken-analyzer' }), analyze: () => ({ invalid: true }) })
    const output = await registry.analyze('broken-analyzer', { language: 'fixture', files: [] })
    expect(output.entities).toEqual([])
    expect(output.coverage[0]).toMatchObject({ status: 'not-analyzed', analyzer: 'broken-analyzer' })
  })

  it('rejects incompatible, duplicate, and over-limit plugins before analysis', () => {
    const registry = createAnalyzerRegistry({ pipelineVersion: '2.0.0' })
    expect(() => registry.register({ manifest: manifest(), analyze: () => ({}) })).toThrow('pipeline major')
    const compatible = createAnalyzerRegistry({ maxPlugins: 1 })
    compatible.register({ manifest: manifest(), analyze: () => ({}) })
    expect(() => compatible.register({ manifest: manifest(), analyze: () => ({}) })).toThrow('already registered')
    expect(() => compatible.register({ manifest: manifest({ id: 'second-analyzer' }), analyze: () => ({}) })).toThrow('limit')
  })

  it('rejects a resource overage at the trust boundary', async () => {
    const registry = createAnalyzerRegistry()
    registry.register({ manifest: manifest(), analyze: () => ({}) })
    await expect(registry.analyze('fixture-analyzer', { language: 'fixture', files: [{ path: 'a', bytes: 1 }, { path: 'b', bytes: 1 }, { path: 'c', bytes: 1 }] })).rejects.toThrow('file limit')
  })
})
