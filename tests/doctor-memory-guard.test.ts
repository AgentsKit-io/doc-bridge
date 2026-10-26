import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { runDoctor } from '../src/doctor/run-doctor.js'
import { runGate } from '../src/gates/run-gates.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { safeWalkFiles } from '../src/safety/repository.js'

vi.setConfig({ testTimeout: 120_000 })

const MIB = 1024 * 1024
const temporary: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const write = (root: string, path: string, content: string): void => {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

const fixture = (maxMemoryMb?: number): { readonly root: string; readonly config: DocBridgeConfigV1 } => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-memory-guard-'))
  temporary.push(root)
  write(root, 'package.json', JSON.stringify({ name: 'fixture', version: '0.0.0' }))
  write(root, 'docs/for-agents/INDEX.md', '# Agent index\n\nStart with [query](./query.md).\n')
  write(root, 'docs/for-agents/query.md', '---\nid: fixture-query\neditRoot: src/query\n---\n# Query layer\n\nExports `searchIndex`.\n')
  for (let i = 0; i < 40; i++) {
    write(root, `src/area-${i}/index.ts`, `export const value${i} = ${i}\n`)
    write(root, `docs/area-${i}.md`, `# Area ${i}\n\nThe \`src/area-${i}\` area exports \`value${i}\`.\n`)
  }
  const config = applyConfigDefaults(
    DocBridgeConfigV1Schema.parse({
      schemaVersion: 1,
      corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
      ...(maxMemoryMb === undefined ? {} : { safety: { maxMemoryMb } }),
    }),
  )
  return { root, config }
}

const limitedCoverage = (root: string, config: DocBridgeConfigV1): string[] =>
  discoverRepository({ root, config }).coverage.filter((entry) => entry.status === 'partial' && entry.scope.startsWith('limits:')).map((entry) => entry.scope)

describe('repository scan memory guard', () => {
  it('stops a scan whose own heap growth passes the limit', () => {
    const { root } = fixture()
    let heapUsed = 10 * MIB
    vi.spyOn(process, 'memoryUsage').mockImplementation(() => {
      heapUsed += 8 * MIB
      return { rss: 0, heapTotal: 0, heapUsed, external: 0, arrayBuffers: 0 }
    })
    const result = safeWalkFiles(root, { maxMemoryMb: 32 })
    expect(result.incomplete).toBe(true)
    expect(result.reason).toBe('Repository scan exceeded the 32 MiB memory limit.')
  })

  it('does not charge a scan for memory its caller already holds', () => {
    const { root } = fixture()
    vi.spyOn(process, 'memoryUsage').mockImplementation(() => ({ rss: 0, heapTotal: 0, heapUsed: 4096 * MIB, external: 0, arrayBuffers: 0 }))
    const result = safeWalkFiles(root, { maxMemoryMb: 32 })
    expect(result.incomplete).toBe(false)
    expect(result.files.length).toBeGreaterThan(80)
  })
})

describe('index-freshness inside doctor', () => {
  it('matches the standalone gate when the process already holds more than maxMemoryMb', () => {
    const { root, config } = fixture()
    buildDocBridgeIndex({ root, config: { ...config, safety: { ...config.safety, maxMemoryMb: 64 } }, write: true })
    const standalone = runGate(root, { ...config, safety: { ...config.safety, maxMemoryMb: 64 } }, 'index-freshness')
    expect(standalone.ok).toBe(true)

    // A caller that already holds memory, as doctor does with its own snapshot and index.
    const limited = { ...config, safety: { ...config.safety, maxMemoryMb: 64 } }
    const ballast = Array.from({ length: 12_000_000 }, (_, i) => i + 0.5)
    expect(process.memoryUsage().heapUsed).toBeGreaterThan(64 * MIB)

    expect(limitedCoverage(root, limited)).toEqual([])
    const gate = runGate(root, limited, 'index-freshness')
    expect(gate).toEqual(standalone)

    const report = runDoctor(root, limited)
    expect(report.coverage.freshness.ok).toBe(true)
    expect(report.coverage.reachability.documentsTotal).toBeGreaterThanOrEqual(40)
    expect(report.coverage.gates.results.find((result) => result.id === 'index-freshness')).toEqual(standalone)
    expect(report.issues.map((issue) => issue.code)).not.toContain('gate-index-freshness')
    expect(ballast.length).toBe(12_000_000)
  })

  it('compares against the index the caller already rebuilt instead of rebuilding', () => {
    const { root, config } = fixture()
    const { index } = buildDocBridgeIndex({ root, config, write: true })
    const gate = runGate(root, config, 'index-freshness', { rebuilt: { ...index, contentHash: 'rebuilt-by-caller' } })
    expect(gate.ok).toBe(false)
    expect(gate.expected).toBe('rebuilt-by-caller')
  })
})
