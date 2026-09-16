import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { measureAgentEfficiency, measureAgentTaskEfficiency } from '../src/metrics/benchmark.js'
import { runQuery } from '../src/query/query.js'
import { searchIndex } from '../src/query/search.js'
import { loadFreshDocBridgeIndex } from '../src/query/load-index.js'

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

  it('routes natural-language discovery to declared intents and changes', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    expect(searchIndex(index, 'find package')[0]).toMatchObject({ type: 'intent', id: 'find-package' })
    expect(searchIndex(index, 'change zod schema')[0]).toMatchObject({ type: 'change', id: 'zod-schema' })

    const result = runQuery(index, config, { kind: 'search', term: 'find package', agent: true, contextBudgetTokens: 256 })
    expect(result).toMatchObject({ bestMatch: { type: 'intent', id: 'find-package' } })
    if ('nextCommands' in result) expect(result.nextCommands[0]).toBe('ak-docs query intent find-package --agent')
  })

  it('does not return ownership results for an unrelated query', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    expect(searchIndex(index, 'zxqvnomatch987654321')).toEqual([])
  })

  it('does not spend context on substring-only decoys', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    // Rewrites `knowledge[]`, which only the pre-projection ranking reads: this exercises the compatibility path.
    const decoyIndex = {
      ...index,
      projection: undefined,
      knowledge: [
        { ...index.knowledge[0]!, id: 'auth', title: 'Auth', path: 'docs/auth.md', body: 'Authentication boundaries.' },
        { ...index.knowledge[0]!, id: 'billing', title: 'Billing', path: 'docs/billing.md', body: 'Authoritative billing notes.' },
      ],
      lookup: undefined,
    }
    expect(searchIndex(decoyIndex, 'auth').map((match) => match.id)).toEqual(['auth'])
  })

  it('rejects an index after an indexed document changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-freshness-'))
    cpSync(fixtureRoot, root, { recursive: true })
    const config = loadFixtureConfig()
    buildDocBridgeIndex({ root, config, write: true })
    const document = join(root, 'docs/for-agents/packages/os-core.md')
    writeFileSync(document, `${readFileSync(document, 'utf8')}\nChanged after indexing.\n`)

    expect(() => loadFreshDocBridgeIndex(root, config)).toThrow('Index is stale')
  })

  it('ranks exact package id above mentions in other summaries', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    // Inject a decoy ownership that mentions os-core in purpose (like angular mentioning @agentskit/core).
    // Rewrites the lookup, which only the pre-projection ranking reads: this exercises the compatibility path.
    const poisoned = {
      ...index,
      projection: undefined,
      lookup: {
        ...index.lookup!,
        packages: [...(index.lookup?.packages ?? []), 'decoy'],
        ownership: {
          ...index.lookup?.ownership,
          decoy: {
            id: 'decoy',
            path: 'packages/decoy',
            purpose: 'Binding that uses @agentskit/os-core contracts',
            checks: ['npm test'],
            agentDoc: 'docs/for-agents/packages/decoy.md',
          },
        },
      },
    }
    const matches = searchIndex(poisoned, 'os-core')
    expect(matches[0]?.id).toBe('os-core')
  })

  it('dedupes knowledge and ownership rows for the same path', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const matches = searchIndex(index, 'os-core')
    const paths = matches.map((m) => m.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('searches useful markdown body text after frontmatter', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const matches = searchIndex(index, 'schema ownership')
    expect(matches.some((m) => m.path.endsWith('os-core.md'))).toBe(true)
  })

  it('uses linked agent documentation to route ownership searches', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const owner = index.lookup?.ownership?.['os-core']
    if (!owner) throw new Error('Fixture ownership is missing')
    const linked = {
      ...index,
      lookup: {
        ...index.lookup!,
        ownership: {
          ...index.lookup?.ownership,
          'os-core': { ...owner, agentDoc: 'docs/for-agents/packages/os-core.md' },
        },
      },
    }

    expect(searchIndex(linked, 'event bus')[0]).toMatchObject({ type: 'ownership', id: 'os-core' })
  })

  it('searches non-English documentation without ASCII-only token loss', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const knowledge = index.knowledge[0]
    // Rewrites `knowledge[]`, which only the pre-projection ranking reads: this exercises the compatibility path.
    const localized = {
      ...index,
      projection: undefined,
      knowledge: [
        ...index.knowledge,
        {
          ...knowledge,
          id: 'localized-authentication',
          title: 'Autenticação',
          path: 'docs/for-agents/localized-authentication.md',
          description: 'Autenticação e autorização do sistema.',
          body: '認証と認可の境界を確認する。',
        },
      ],
    }

    expect(searchIndex(localized, 'autenticação')[0]?.id).toBe('localized-authentication')
    expect(searchIndex(localized, '認証')[0]?.id).toBe('localized-authentication')
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
      expect(result.telemetry).toMatchObject({ tokenMethod: 'estimate' })
      expect(result.telemetry?.contextBudgetTokens).toBe(32)
      expect(result.telemetry?.estimatedTokens).toBeGreaterThan(0)
      expect(result.matches[0]).not.toHaveProperty('score')
    }
  })

  it('measures bounded agent retrieval against the real fixture index', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const queries = ['schema', 'ownership', 'os-core', 'find package']
    const observations = queries.map((term) => {
      const result = runQuery(index, config, { kind: 'search', term, agent: true, contextBudgetTokens: 256 })
      if (!('telemetry' in result) || !result.telemetry) throw new Error(`Missing telemetry for ${term}`)
      return {
        hit: result.bestMatch !== null,
        latencyMs: [0],
        responseBytes: [result.telemetry.contextBytes],
        estimatedTokens: [result.telemetry.estimatedTokens],
      }
    })
    const metrics = measureAgentEfficiency({
      hits: observations.filter((observation) => observation.hit).length,
      queries: observations.length,
      latencyMs: observations.flatMap((observation) => observation.latencyMs),
      responseBytes: observations.flatMap((observation) => observation.responseBytes),
      estimatedTokens: observations.flatMap((observation) => observation.estimatedTokens),
      corpusBytes: Buffer.byteLength(JSON.stringify(index), 'utf8'),
    })

    expect(metrics.hitRate).toBe(1)
    expect(metrics.contextReduction).toBeGreaterThan(0.8)
    expect(metrics.estimatedTokensP95).toBeLessThan(100)
    console.error(JSON.stringify({ benchmark: 'agent-retrieval-v1', queries: queries.length, hitRate: metrics.hitRate, estimatedTokensP95: metrics.estimatedTokensP95, contextReduction: metrics.contextReduction }))
  })

  it('enforces an explicit agent context budget and reports truncation', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const result = runQuery(index, config, { kind: 'search', term: 'schema', agent: true, mode: 'documentation', contextBudgetTokens: 32 })
    expect(result).toMatchObject({ type: 'agent-search', telemetry: { contextBudgetTokens: 32, mode: 'documentation', truncated: true } })
    if ('telemetry' in result && result.telemetry) {
      expect(result.telemetry.estimatedTokens).toBeGreaterThan(0)
      expect(result.telemetry.estimatedTokens).toBeLessThanOrEqual(32)
      expect(result.bestMatch?.id).toBe('os-core')
    }
    expect(() => runQuery(index, config, { kind: 'search', term: 'schema', agent: true, contextBudgetTokens: 8 })).toThrow('too small for the minimum grounded result')
  })

  it('measures correctly grounded tasks separately from retrieval hits', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const tasks = [
      { term: 'schema', expectedId: 'os-core' },
      { term: 'start here', expectedId: 'INDEX' },
      { term: 'os-core', expectedId: 'os-core' },
      { term: 'routing', expectedId: 'INDEX' },
    ]
    const observations = tasks.map(({ term, expectedId }) => {
      const result = runQuery(index, config, { kind: 'search', term, agent: true, contextBudgetTokens: 256 })
      if (!('telemetry' in result) || !result.telemetry) throw new Error(`Missing telemetry for ${term}`)
      return {
        correct: result.bestMatch?.id === expectedId,
        latencyMs: 0,
        responseBytes: result.telemetry.contextBytes,
        estimatedTokens: result.telemetry.estimatedTokens,
      }
    })
    const metrics = measureAgentTaskEfficiency(observations)

    // 58 estimated tokens: the agent payload for these four queries, measured, so a payload that grows is noticed.
    expect(metrics).toMatchObject({ taskCount: 4, correctTaskCount: 4, correctnessRate: 1, tokensToCorrectAnswerP95: 58 })
    console.error(JSON.stringify({ benchmark: 'agent-task-efficiency-v1', tasks: metrics.taskCount, correctTasks: metrics.correctTaskCount, correctnessRate: metrics.correctnessRate, tokensToCorrectAnswerP95: metrics.tokensToCorrectAnswerP95 }))
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
