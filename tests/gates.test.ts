import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { resolveGateIds, runGates } from '../src/gates/run-gates.js'

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample-project')

const loadFixtureConfig = () => {
  const raw = JSON.parse(
    readFileSync(join(fixtureRoot, 'doc-bridge.config.json'), 'utf8'),
  ) as unknown
  return applyConfigDefaults(DocBridgeConfigV1Schema.parse(raw))
}

describe('gates', () => {
  it('resolves supported preset and include/exclude gate ids', () => {
    const config = loadFixtureConfig()
    expect(resolveGateIds(config)).toEqual(['index-freshness'])
    expect(resolveGateIds({ ...config, gates: { preset: 'standard' } })).toEqual([
      'index-freshness',
      'human-guide-links',
    ])
    expect(resolveGateIds({ ...config, gates: { include: ['human-guide-links'] } })).toEqual([
      'index-freshness',
      'human-guide-links',
    ])
    expect(resolveGateIds({ ...config, gates: { preset: 'standard', exclude: ['human-guide-links'] } })).toEqual([
      'index-freshness',
    ])
    expect(resolveGateIds({ ...config, gates: { preset: 'strict' } })).toEqual([
      'index-freshness',
      'human-guide-links',
      'okf-type',
    ])
  })

  it('runs the configured supported gates when no explicit id is passed', () => {
    const config = { ...loadFixtureConfig(), gates: { preset: 'standard' as const } }
    buildDocBridgeIndex({ root: fixtureRoot, config })

    const result = runGates(fixtureRoot, config)
    expect(result.ok).toBe(true)
    expect(result.results.map((gate) => gate.id)).toEqual(['index-freshness', 'human-guide-links'])
  })

  it('checks OKF type frontmatter only when required', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-okf-'))
    mkdirSync(join(root, 'docs/for-agents/modules'), { recursive: true })
    writeFileSync(join(root, 'docs/for-agents/INDEX.md'), '# Agent docs index\n')
    writeFileSync(
      join(root, 'docs/for-agents/modules/auth.md'),
      '---\ntype: module\n---\n\n# Auth\n\nOwns login.\n',
    )

    const config = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse({
        schemaVersion: 1,
        corpus: {
          agent: {
            root: 'docs/for-agents',
            okf: { requireType: true, allowedTypes: ['module'] },
          },
        },
      }),
    )

    expect(runGates(root, config, ['okf-type']).ok).toBe(true)

    writeFileSync(join(root, 'docs/for-agents/modules/auth.md'), '# Auth\n\nOwns login.\n')
    const result = runGates(root, config, ['okf-type'])
    expect(result.ok).toBe(false)
    expect(result.results[0]?.message).toContain('docs/for-agents/modules/auth.md')
  })

  it('runs opt-in docs style profiles with actionable file messages', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-style-'))
    mkdirSync(join(root, 'docs/for-agents/modules'), { recursive: true })
    writeFileSync(join(root, 'docs/for-agents/INDEX.md'), '# Agent docs index\n')
    writeFileSync(
      join(root, 'docs/for-agents/modules/auth.md'),
      [
        '---',
        'type: module',
        'purpose: Explain authentication ownership.',
        'audience: Engineers editing auth flows.',
        '---',
        '',
        '# Auth',
        '',
        '## Usage',
        '',
        'Use this doc before changing login handlers.',
        '',
        '## Example',
        '',
        '```ts',
        'runAuthFlow()',
        '```',
        '',
      ].join('\n'),
    )

    const config = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse({
        schemaVersion: 1,
        corpus: { agent: { root: 'docs/for-agents' } },
        gates: {
          include: ['docs-style'],
          options: { 'docs-style': { profile: 'google-dev-docs' } },
        },
      }),
    )

    expect(runGates(root, config, ['docs-style']).ok).toBe(true)

    writeFileSync(
      join(root, 'docs/for-agents/modules/auth.md'),
      '# Auth\n\nTODO: fill this in eventually.\n',
    )
    const result = runGates(root, config, ['docs-style'])
    expect(result.ok).toBe(false)
    expect(result.results[0]?.message).toContain('docs/for-agents/modules/auth.md')
    expect(result.results[0]?.message).toContain('purpose')
    expect(result.results[0]?.message).toContain('no-stale-wording')
  })
})
