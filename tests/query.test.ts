import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, beforeAll } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { loadDocBridgeIndex } from '../src/query/load-index.js'
import { runQuery } from '../src/query/query.js'
import { searchIndex } from '../src/query/search.js'

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample-project')

const loadFixtureConfig = () => {
  const raw = JSON.parse(
    readFileSync(join(fixtureRoot, 'doc-bridge.config.json'), 'utf8'),
  ) as unknown
  return applyConfigDefaults(DocBridgeConfigV1Schema.parse(raw))
}

describe('query + search', () => {
  beforeAll(() => {
    buildDocBridgeIndex({ root: fixtureRoot, config: loadFixtureConfig() })
  })

  it('resolves package handoff with --agent shape', () => {
    const config = loadFixtureConfig()
    const index = loadDocBridgeIndex(fixtureRoot, config)
    const handoff = runQuery(index, config, { kind: 'package', id: 'os-core', agent: true })
    expect(handoff).toMatchObject({
      type: 'agent-handoff',
      schemaVersion: 1,
      target: { type: 'package', id: 'os-core', path: 'packages/os-core' },
    })
    if ('startHere' in handoff) {
      expect(handoff.startHere).toContain('os-core.md')
    }
  })

  it('searches knowledge and ownership', () => {
    const config = loadFixtureConfig()
    const index = loadDocBridgeIndex(fixtureRoot, config)
    const matches = searchIndex(index, 'os-core')
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.some((m) => m.id === 'os-core')).toBe(true)
  })

  it('returns AgentSearch payload when agent flag set', () => {
    const config = loadFixtureConfig()
    const index = loadDocBridgeIndex(fixtureRoot, config)
    const result = runQuery(index, config, { kind: 'search', term: 'schema', agent: true })
    expect(result).toMatchObject({
      type: 'agent-search',
      schemaVersion: 1,
      term: 'schema',
    })
  })
})