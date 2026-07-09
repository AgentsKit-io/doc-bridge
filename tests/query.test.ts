import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
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
  it('resolves package handoff with --agent shape', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const handoff = runQuery(index, config, { kind: 'package', id: 'os-core', agent: true })
    expect(handoff).toMatchObject({
      type: 'agent-handoff',
      schemaVersion: 1,
      target: { type: 'package', id: 'os-core', path: 'packages/os-core' },
      humanDoc: '/docs/packages/os-core',
    })
    if ('startHere' in handoff) {
      expect(handoff.startHere).toContain('os-core.md')
    }
  })

  it('searches knowledge and ownership', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const matches = searchIndex(index, 'os-core')
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.some((m) => m.id === 'os-core')).toBe(true)
  })

  it('searches useful markdown body text after frontmatter', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const matches = searchIndex(index, 'schema ownership')
    expect(matches.some((m) => m.path.endsWith('os-core.md'))).toBe(true)
  })

  it('returns AgentSearch payload when agent flag set', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const result = runQuery(index, config, { kind: 'search', term: 'schema', agent: true })
    expect(result).toMatchObject({
      type: 'agent-search',
      schemaVersion: 1,
      term: 'schema',
    })
    if ('nextCommands' in result) {
      expect(result.nextCommands).toEqual([...new Set(result.nextCommands)])
    }
  })

  it('resolves intent and change routes as agent handoffs', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index

    expect(runQuery(index, config, { kind: 'intent', id: 'find-package', agent: true })).toMatchObject({
      type: 'agent-handoff',
      target: { type: 'intent', id: 'find-package' },
      startHere: 'docs/for-agents/INDEX.md',
    })
    expect(runQuery(index, config, { kind: 'change', id: 'zod-schema', agent: true })).toMatchObject({
      type: 'agent-handoff',
      target: { type: 'change', id: 'zod-schema' },
      startHere: 'packages/os-core/src/errors/codes.ts',
    })
  })

  it('returns plain intent/change data and throws for unknown routes', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index

    expect(runQuery(index, config, { kind: 'intent', id: 'find-package' })).toMatchObject({
      type: 'intent',
      data: { id: 'find-package' },
    })
    expect(runQuery(index, config, { kind: 'change', id: 'zod-schema' })).toMatchObject({
      type: 'change',
      data: { id: 'zod-schema' },
    })
    expect(() => runQuery(index, config, { kind: 'intent', id: 'missing' })).toThrow('Unknown intent')
    expect(() => runQuery(index, config, { kind: 'change', id: 'missing' })).toThrow('Unknown change')
  })
})
