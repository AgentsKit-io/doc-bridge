import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { scanHumanDocRecords } from '../src/index-builder/human-adapters/index.js'
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
    expect(existsSync(join(fixtureRoot, '.doc-bridge/capabilities.json'))).toBe(true)
    expect(result.index.knowledge.length).toBeGreaterThanOrEqual(2)
    expect(result.index.lookup?.packages).toContain('os-core')
    expect(result.index.lookup?.ownership?.['os-core']?.path).toBe('packages/os-core')
    expect(result.index.lookup?.ownership?.['os-core']?.humanDoc).toBe('/docs/packages/os-core')
    expect(result.index.handoffs?.['os-core']?.startHere).toContain('os-core.md')
    expect(result.index.handoffs?.['os-core']?.humanDoc).toBe('/docs/packages/os-core')
    expect(result.index.contentHash).toMatch(/^[a-f0-9]{64}$/)

    const parsed = parseDocBridgeIndex(
      JSON.parse(readFileSync(join(fixtureRoot, '.doc-bridge/index.json'), 'utf8')) as unknown,
    )
    expect(parsed.schemaVersion).toBe(1)

    const capabilities = JSON.parse(
      readFileSync(join(fixtureRoot, '.doc-bridge/capabilities.json'), 'utf8'),
    ) as { contentHash: string; artifacts: { index: string; llmsTxt?: string } }
    expect(capabilities.contentHash).toBe(result.index.contentHash)
    expect(capabilities.artifacts.index).toBe('.doc-bridge/index.json')
    expect(capabilities.artifacts.llmsTxt).toBe('llms.txt')
  })

  it('respects Fumadocs meta.json pages allowlist', () => {
    const config = loadFixtureConfig()
    const docs = scanHumanDocRecords(fixtureRoot, config)

    expect(docs.some((doc) => doc.id === 'os-core')).toBe(true)
    expect(docs.some((doc) => doc.id === 'hidden')).toBe(false)
  })

  it('keeps regenerated index bytes stable when content is unchanged', async () => {
    const root = join(mkdtempSync(join(tmpdir(), 'ak-docs-stable-index-')), 'sample-project')
    cpSync(fixtureRoot, root, { recursive: true })
    const config = loadFixtureConfig()

    buildDocBridgeIndex({ root, config })
    const first = readFileSync(join(root, '.doc-bridge/index.json'), 'utf8')
    await new Promise((resolve) => setTimeout(resolve, 5))
    buildDocBridgeIndex({ root, config })

    expect(readFileSync(join(root, '.doc-bridge/index.json'), 'utf8')).toBe(first)
  })

  it('builds handoffs from ownership-only config without monorepo plugin', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-ownership-only-'))
    mkdirSync(join(root, 'docs/for-agents/packages'), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'docs/for-agents/INDEX.md'),
      '# Index\n\n- [auth](./packages/auth.md)\n',
    )
    writeFileSync(
      join(root, 'docs/for-agents/packages/auth.md'),
      '---\ntype: package\npackage: auth\neditRoot: src/auth\n---\n\n# auth\n\nOwns authentication.\n',
    )
    const config = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse({
        schemaVersion: 1,
        corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
        routing: {
          options: {
            ownership: {
              auth: {
                path: 'src/auth',
                purpose: 'Authentication',
                checks: ['npm test -- auth'],
              },
            },
          },
        },
      }),
    )

    const result = buildDocBridgeIndex({ root, config })
    expect(result.index.lookup?.packages).toContain('auth')
    expect(result.index.handoffs?.auth?.editRoots).toEqual(['src/auth'])
    expect(result.index.handoffs?.auth?.checks).toContain('npm test -- auth')
    expect(result.index.handoffs?.auth?.startHere).toContain('auth.md')
  })

  it('seeds ownership from package frontmatter alone', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-frontmatter-own-'))
    mkdirSync(join(root, 'docs/for-agents'), { recursive: true })
    writeFileSync(
      join(root, 'docs/for-agents/billing.md'),
      '---\npackage: billing\neditRoot: packages/billing\nchecks: [pnpm test billing]\npurpose: Payments\n---\n\n# billing\n\nPayment domain.\n',
    )
    const config = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse({
        schemaVersion: 1,
        corpus: { agent: { root: 'docs/for-agents' } },
      }),
    )

    const result = buildDocBridgeIndex({ root, config })
    expect(result.index.lookup?.packages).toContain('billing')
    expect(result.index.handoffs?.billing?.editRoots).toEqual(['packages/billing'])
    expect(result.index.handoffs?.billing?.notes).toContain('Payments')
  })
})
