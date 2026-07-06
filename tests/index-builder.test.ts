import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { parseDocBridgeIndex } from '../src/validate.js'

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample-project')

const loadFixtureConfig = () => {
  const raw = JSON.parse(
    readFileSync(join(fixtureRoot, 'doc-bridge.config.json'), 'utf8'),
  ) as unknown
  return applyConfigDefaults(DocBridgeConfigV1Schema.parse(raw))
}

describe('buildDocBridgeIndex', () => {
  it('builds index with corpus, ownership, and llms.txt', () => {
    const config = loadFixtureConfig()
    const result = buildDocBridgeIndex({ root: fixtureRoot, config })

    expect(existsSync(join(fixtureRoot, '.doc-bridge/index.json'))).toBe(true)
    expect(existsSync(join(fixtureRoot, 'llms.txt'))).toBe(true)
    expect(result.index.knowledge.length).toBeGreaterThanOrEqual(2)
    expect(result.index.lookup?.packages).toContain('os-core')
    expect(result.index.lookup?.ownership?.['os-core']?.path).toBe('packages/os-core')
    expect(result.index.handoffs?.['os-core']?.startHere).toContain('os-core.md')
    expect(result.index.contentHash).toMatch(/^[a-f0-9]{64}$/)

    const parsed = parseDocBridgeIndex(
      JSON.parse(readFileSync(join(fixtureRoot, '.doc-bridge/index.json'), 'utf8')) as unknown,
    )
    expect(parsed.schemaVersion).toBe(1)
  })
})