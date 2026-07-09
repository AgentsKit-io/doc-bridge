import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { scanHumanDocRecords } from '../src/index-builder/human-adapters/index.js'
import {
  guessAgentDocForPackage,
  ownershipFromCorpus,
  ownershipFromFrontmatter,
  scanAgentCorpus,
} from '../src/index-builder/scan-corpus.js'
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

  it('infers ownership from packages/*.md paths and uses pnpm checks in workspaces', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-path-own-'))
    mkdirSync(join(root, 'docs/for-agents/packages'), { recursive: true })
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'ws', packageManager: 'pnpm@10.0.0' }))
    writeFileSync(
      join(root, 'docs/for-agents/packages/auth.md'),
      '# auth\n\nAuth package ownership doc.\n',
    )
    const config = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse({
        schemaVersion: 1,
        corpus: { agent: { root: 'docs/for-agents' } },
        gates: { preset: 'standard' },
      }),
    )

    const result = buildDocBridgeIndex({ root, config })
    expect(result.index.handoffs?.auth?.editRoots).toEqual(['packages/auth'])
    expect(result.index.handoffs?.auth?.checks.some((c) => c.includes('pnpm'))).toBe(true)
  })

  it('infers playbook pattern ownership from pillars paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-pattern-own-'))
    mkdirSync(join(root, 'content/docs/pillars/ai-collaboration'), { recursive: true })
    writeFileSync(
      join(root, 'content/docs/pillars/ai-collaboration/open-knowledge-format-pattern.md'),
      '# Open Knowledge Format\n\nPattern body.\n',
    )
    const config = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse({
        schemaVersion: 1,
        corpus: { agent: { root: 'content/docs' } },
        gates: { preset: 'playbook' },
      }),
    )

    const result = buildDocBridgeIndex({ root, config })
    expect(result.index.handoffs?.['open-knowledge-format-pattern']?.startHere).toContain(
      'open-knowledge-format-pattern.md',
    )
  })

  it('scans agent corpus and resolves package docs by frontmatter, path, and index files', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-scan-corpus-'))
    mkdirSync(join(root, 'docs/for-agents/packages/auth'), { recursive: true })
    mkdirSync(join(root, 'docs/for-agents/packages/billing'), { recursive: true })
    writeFileSync(
      join(root, 'docs/for-agents/packages/auth/index.mdx'),
      [
        '---',
        'type: package',
        'package: auth',
        'editRoot: services/auth',
        'checks: [pnpm --filter auth test]',
        'humanDoc: /docs/auth',
        'purpose: Auth package.',
        '---',
        '',
        '# Auth',
        '',
        'Auth owns login.',
      ].join('\n'),
    )
    writeFileSync(join(root, 'docs/for-agents/packages/billing.mdx'), '# Billing\n\nBilling owns invoices.\n')
    writeFileSync(join(root, 'docs/for-agents/core.md'), '---\ntype: module\nid: core\n---\n\n# Core\n\nCore package.\n')

    const config = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse({
        schemaVersion: 1,
        corpus: { agent: { root: 'docs/for-agents' } },
      }),
    )
    const corpus = scanAgentCorpus(root, config)

    expect(corpus.map((doc) => doc.id)).toEqual(expect.arrayContaining(['auth', 'billing', 'core']))
    expect(guessAgentDocForPackage(corpus, 'auth')).toBe('docs/for-agents/packages/auth/index.mdx')
    expect(guessAgentDocForPackage(corpus, 'billing')).toBe('docs/for-agents/packages/billing.mdx')
    expect(guessAgentDocForPackage(corpus, 'core')).toBe('docs/for-agents/core.md')
    expect(guessAgentDocForPackage(corpus, 'missing')).toBeUndefined()

    expect(ownershipFromFrontmatter(corpus)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'auth',
          path: 'services/auth',
          checks: ['pnpm --filter auth test'],
          humanDoc: '/docs/auth',
        }),
        expect.objectContaining({ id: 'core', path: 'packages/core' }),
      ]),
    )
  })

  it('infers ownership from registry, pattern, top-level, and package index corpus paths once', () => {
    const docs = [
      {
        id: 'auth',
        type: 'agent-doc',
        title: 'Auth',
        path: 'docs/for-agents/packages/auth/index.md',
        absPath: '/repo/docs/for-agents/packages/auth/index.md',
        relPath: 'docs/for-agents/packages/auth/index.md',
        frontmatter: {},
      },
      {
        id: 'auth-dupe',
        type: 'agent-doc',
        title: 'Auth duplicate',
        path: 'docs/for-agents/packages/auth/extra.md',
        absPath: '/repo/docs/for-agents/packages/auth/extra.md',
        relPath: 'docs/for-agents/packages/auth/extra.md',
        frontmatter: {},
      },
      {
        id: 'connector',
        type: 'agent-doc',
        title: 'Connector',
        path: 'docs/for-agents/registry/connector/README.md',
        absPath: '/repo/docs/for-agents/registry/connector/README.md',
        relPath: 'docs/for-agents/registry/connector/README.md',
        frontmatter: { purpose: 'Connector registry.' },
      },
      {
        id: 'session-pattern',
        type: 'agent-doc',
        title: 'Session Pattern',
        path: 'docs/for-agents/pillars/runtime/session-pattern.md',
        absPath: '/repo/docs/for-agents/pillars/runtime/session-pattern.md',
        relPath: 'docs/for-agents/pillars/runtime/session-pattern.md',
        frontmatter: { humanDoc: '/docs/session-pattern' },
      },
      {
        id: 'worker',
        type: 'agent-doc',
        title: 'Worker',
        path: 'docs/for-agents/worker.mdx',
        absPath: '/repo/docs/for-agents/worker.mdx',
        relPath: 'docs/for-agents/worker.mdx',
        frontmatter: {},
      },
      {
        id: 'already-frontmatter',
        type: 'agent-doc',
        title: 'Already',
        path: 'docs/for-agents/packages/already.md',
        absPath: '/repo/docs/for-agents/packages/already.md',
        relPath: 'docs/for-agents/packages/already.md',
        frontmatter: { package: 'already', editRoot: 'src/already' },
      },
    ]

    expect(ownershipFromCorpus(docs)).toEqual([
      expect.objectContaining({ id: 'auth', path: 'packages/auth' }),
      expect.objectContaining({ id: 'connector', path: 'registry/connector', purpose: 'Connector registry.' }),
      expect.objectContaining({
        id: 'session-pattern',
        path: 'docs/for-agents/pillars/runtime/session-pattern.md',
        humanDoc: '/docs/session-pattern',
      }),
      expect.objectContaining({ id: 'worker', path: 'packages/worker' }),
    ])
  })
})
