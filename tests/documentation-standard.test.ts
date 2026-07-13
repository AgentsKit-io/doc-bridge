import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import {
  formatDocumentationStandardText,
  runDocumentationStandardV1,
} from '../src/conformance/documentation-standard-v1.js'
import { runGates } from '../src/gates/run-gates.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { renderLlmsTxt } from '../src/index-builder/llms-txt.js'

const tempDirs: string[] = []

const fixture = (): { root: string; config: DocBridgeConfigV1 } => {
  const root = mkdtempSync(join(tmpdir(), 'ak-docs-standard-'))
  tempDirs.push(root)
  mkdirSync(join(root, 'agent-docs/packages'), { recursive: true })
  mkdirSync(join(root, 'human-docs'), { recursive: true })
  mkdirSync(join(root, 'src/auth'), { recursive: true })
  mkdirSync(join(root, 'tests'), { recursive: true })
  mkdirSync(join(root, 'docs/assets'), { recursive: true })

  writeFileSync(join(root, 'agent-docs/INDEX.md'), '# Agent docs\n')
  writeFileSync(
    join(root, 'agent-docs/packages/auth.md'),
    '---\npackage: auth\neditRoot: src/auth\nhumanDoc: /docs/auth\n---\n\n# Auth\n',
  )
  writeFileSync(join(root, 'human-docs/auth.md'), '---\npackage: auth\n---\n\n# Auth guide\n')
  writeFileSync(join(root, 'README.md'), '# Demo\n\nhttps://www.agentskit.io\n')
  writeFileSync(join(root, 'CONTRIBUTING.md'), '# Contributing\n\nRun tests before a PR.\n')
  writeFileSync(join(root, 'docs/index.html'), '<title>Demo</title><meta name="description" content="Demo" />')
  writeFileSync(join(root, 'docs/architecture.md'), '# Architecture\n\n```mermaid\nflowchart LR\n```\n')
  writeFileSync(join(root, 'docs/assets/overview.webp'), 'visual')
  writeFileSync(join(root, 'tests/quickstart.test.ts'), "it('runs quickstart', () => runDemo())\n")
  writeFileSync(join(root, 'ecosystem.json'), readFileSync(join(import.meta.dirname, '..', 'ecosystem.json')))
  writeFileSync(join(root, 'ecosystem-claims.json'), readFileSync(join(import.meta.dirname, '..', 'ecosystem-claims.json')))

  const config = applyConfigDefaults(
    DocBridgeConfigV1Schema.parse({
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: {
          plugin: 'plain-markdown',
          options: { root: 'human-docs', urlPrefix: '/docs' },
        },
      },
      routing: {
        options: {
          ownership: {
            auth: {
              path: 'src/auth',
              checks: ['pnpm test'],
              agentDoc: 'agent-docs/packages/auth.md',
              humanDoc: '/docs/auth',
            },
          },
        },
      },
      conformance: {
        documentationStandardV1: {
          rawSources: ['README.md'],
          contributionPaths: ['CONTRIBUTING.md'],
          metadata: [{ path: 'docs/index.html', contains: ['<title>', 'name="description"'] }],
          links: [{ url: 'https://www.agentskit.io', paths: ['README.md'] }],
          ecosystemContract: {
            manifest: 'ecosystem.json',
            claims: 'ecosystem-claims.json',
            productId: 'doc-bridge',
          },
          quickstarts: [{
            id: 'demo',
            doc: 'README.md',
            test: 'tests/quickstart.test.ts',
            command: 'pnpm vitest run tests/quickstart.test.ts',
            testContains: ['runs quickstart', 'runDemo'],
          }],
          visuals: ['docs/assets/overview.webp'],
          diagrams: [{ path: 'docs/architecture.md', contains: ['```mermaid'] }],
        },
      },
    }),
  )
  buildDocBridgeIndex({ root, config })
  return { root, config }
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  tempDirs.length = 0
})

describe('Documentation Standard v1', () => {
  it('returns deterministic, actionable pass evidence', () => {
    const { root, config } = fixture()
    const first = runDocumentationStandardV1(root, config)
    const second = runDocumentationStandardV1(root, config)

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      schemaVersion: 1,
      profile: { id: 'documentation-standard-v1', version: 1, status: 'stable' },
      ok: true,
      recommendedOk: true,
      summary: {
        required: { passed: 7, failed: 0, excepted: 0 },
        recommended: { passed: 2, failed: 0, excepted: 0 },
      },
    })
    expect(first.results.every((result) => result.remediation.command.length > 0)).toBe(true)
    expect(runGates(root, config, ['documentation-standard-v1']).results[0]?.details).toEqual(first)
  })

  it('reports exact failed evidence and remediation', () => {
    const { root, config } = fixture()
    unlinkSync(join(root, 'CONTRIBUTING.md'))
    writeFileSync(join(root, 'docs/index.html'), '<title>Missing description</title>')
    writeFileSync(join(root, 'tests/quickstart.test.ts'), "it('does something else', () => {})\n")

    const report = runDocumentationStandardV1(root, config)
    expect(report.ok).toBe(false)
    expect(report.summary.required.failed).toBe(3)
    expect(report.results.find((result) => result.id === 'contribution')).toMatchObject({
      status: 'fail',
      evidence: [{ path: 'CONTRIBUTING.md', detail: 'File does not exist.' }],
      remediation: { command: 'edit CONTRIBUTING.md' },
    })
    expect(report.results.find((result) => result.id === 'metadata')?.evidence[0]?.detail).toContain('name="description"')
    expect(report.results.find((result) => result.id === 'tested-quickstarts')?.evidence[1]?.detail).toContain('runDemo')
  })

  it('rejects evidence symlinks that escape the project root', () => {
    const { root, config } = fixture()
    const outside = mkdtempSync(join(tmpdir(), 'ak-docs-standard-outside-'))
    tempDirs.push(outside)
    writeFileSync(join(outside, 'metadata.html'), '<title>Outside</title><meta name="description">')
    unlinkSync(join(root, 'docs/index.html'))
    symlinkSync(join(outside, 'metadata.html'), join(root, 'docs/index.html'))

    const metadata = runDocumentationStandardV1(root, config).results.find((result) => result.id === 'metadata')
    expect(metadata).toMatchObject({ status: 'fail' })
    expect(metadata?.evidence[0]?.detail).toBe('Path escapes the project root.')
  })

  it('requires a raw source distinct from generated llms.txt', () => {
    const { root, config } = fixture()
    const duplicate = DocBridgeConfigV1Schema.parse({
      ...config,
      conformance: {
        documentationStandardV1: {
          ...config.conformance?.documentationStandardV1,
          rawSources: ['llms.txt', './llms.txt'],
        },
      },
    })
    const result = runDocumentationStandardV1(root, duplicate).results.find(
      (candidate) => candidate.id === 'llms-and-raw-source',
    )
    expect(result).toMatchObject({ status: 'fail' })
    expect(result?.evidence).toHaveLength(1)
  })

  it('fails when llms.txt differs from the deterministic generated output', () => {
    const { root, config } = fixture()
    writeFileSync(join(root, 'llms.txt'), '# Hand-written and stale\n')

    const result = runDocumentationStandardV1(root, config).results.find(
      (candidate) => candidate.id === 'llms-and-raw-source',
    )
    expect(result).toMatchObject({ status: 'fail' })
    expect(result?.evidence[0]?.detail).toContain('stale')
  })

  it('fails when ecosystem links drift from the canonical manifest and claims ledger', () => {
    const { root, config } = fixture()
    const manifest = JSON.parse(readFileSync(join(root, 'ecosystem.json'), 'utf8')) as {
      products: Array<{ id: string; surfaces: { home?: string } }>
      properties: Array<{ id: string; url: string; domain: string }>
    }
    const agentskit = manifest.products.find((product) => product.id === 'agentskit')
    const legacyAgentskit = manifest.properties.find((product) => product.id === 'agentskit')
    if (!agentskit || !legacyAgentskit) throw new Error('Invalid test fixture')
    agentskit.surfaces.home = 'https://example.com'
    legacyAgentskit.url = 'https://example.com'
    legacyAgentskit.domain = 'example.com'
    writeFileSync(join(root, 'ecosystem.json'), JSON.stringify(manifest))

    const result = runDocumentationStandardV1(root, config).results.find(
      (candidate) => candidate.id === 'cross-links',
    )
    expect(result).toMatchObject({ status: 'fail' })
    expect(result?.evidence.some((item) => item.detail.includes('absent from the canonical'))).toBe(true)
  })

  it('rejects structurally incomplete canonical ecosystem snapshots', () => {
    const { root, config } = fixture()
    writeFileSync(join(root, 'ecosystem-claims.json'), JSON.stringify({
      schemaVersion: 1,
      manifestSchemaVersion: 2,
      products: [{ productId: 'doc-bridge', claims: [] }],
    }))

    const result = runDocumentationStandardV1(root, config).results.find(
      (candidate) => candidate.id === 'cross-links',
    )
    expect(result).toMatchObject({ status: 'fail' })
  })

  it('rejects whitespace-only canonical contract strings', () => {
    const { root, config } = fixture()
    const manifest = JSON.parse(readFileSync(join(root, 'ecosystem.json'), 'utf8')) as {
      parentBrand: { name: string }
    }
    manifest.parentBrand.name = '   '
    writeFileSync(join(root, 'ecosystem.json'), JSON.stringify(manifest))
    const result = runDocumentationStandardV1(root, config).results.find(
      (candidate) => candidate.id === 'cross-links',
    )
    expect(result).toMatchObject({ status: 'fail' })
  })

  it('bounds text evidence reads and rejects non-file visual evidence', () => {
    const { root, config } = fixture()
    writeFileSync(join(root, 'docs/index.html'), Buffer.alloc(4 * 1_024 * 1_024 + 1, 65))
    const standard = config.conformance?.documentationStandardV1
    const bounded = DocBridgeConfigV1Schema.parse({
      ...config,
      conformance: {
        documentationStandardV1: { ...standard, visuals: ['docs/assets'] },
      },
    })

    const report = runDocumentationStandardV1(root, bounded)
    expect(report.results.find((result) => result.id === 'metadata')?.evidence[0]?.detail).toContain('exceeds')
    expect(report.results.find((result) => result.id === 'visual-explanations')?.evidence[0]?.detail).toBe(
      'Path is not a regular file.',
    )
  })

  it('rejects an agent corpus file above the per-file budget', () => {
    const { root, config } = fixture()
    writeFileSync(join(root, 'agent-docs/INDEX.md'), Buffer.alloc(4 * 1_024 * 1_024 + 1, 65))
    expect(() => runDocumentationStandardV1(root, config)).toThrow('exceeds')
  })

  it('rejects an agent corpus root outside the project', () => {
    const { root, config } = fixture()
    const outside = mkdtempSync(join(tmpdir(), 'ak-docs-agent-outside-'))
    tempDirs.push(outside)
    writeFileSync(join(outside, 'INDEX.md'), '# Outside')
    const escaped = DocBridgeConfigV1Schema.parse({
      ...config,
      corpus: { ...config.corpus, agent: { ...config.corpus.agent, root: relative(root, outside) } },
    })
    expect(() => runDocumentationStandardV1(root, escaped)).toThrow('escapes')
  })

  it('keeps recommended failures visible without failing required conformance', () => {
    const { root, config } = fixture()
    unlinkSync(join(root, 'docs/assets/overview.webp'))

    const report = runDocumentationStandardV1(root, config)
    expect(report.ok).toBe(true)
    expect(report.recommendedOk).toBe(false)
    expect(report.summary.recommended.failed).toBe(1)
  })

  it('records approved exceptions instead of hiding required failures', () => {
    const { root, config } = fixture()
    unlinkSync(join(root, 'CONTRIBUTING.md'))
    const withException = DocBridgeConfigV1Schema.parse({
      ...config,
      conformance: {
        documentationStandardV1: {
          ...config.conformance?.documentationStandardV1,
          exceptions: [{
            ruleId: 'contribution',
            reason: 'Contribution workflow is temporarily maintained in the parent repository.',
            approvedBy: 'Documentation Working Group',
            trackingUrl: 'https://github.com/AgentsKit-io/doc-bridge/issues/27',
          }],
        },
      },
    })

    const report = runDocumentationStandardV1(root, withException)
    expect(report.ok).toBe(true)
    expect(report.summary.required.excepted).toBe(1)
    expect(report.results.find((result) => result.id === 'contribution')).toMatchObject({
      status: 'excepted',
      exception: { approvedBy: 'Documentation Working Group' },
    })
    expect(formatDocumentationStandardText(report).join('\n')).toContain('EXCEPTED [required] contribution')
  })

  it('rejects incomplete exception approvals at the config boundary', () => {
    const { config } = fixture()
    const raw = JSON.parse(JSON.stringify(config)) as Record<string, unknown>
    const conformance = raw.conformance as { documentationStandardV1: Record<string, unknown> }
    conformance.documentationStandardV1.exceptions = [{
      ruleId: 'contribution',
      reason: 'Too short',
      approvedBy: '',
      trackingUrl: 'not-a-url',
    }]
    expect(DocBridgeConfigV1Schema.safeParse(raw).success).toBe(false)
  })

  it('rejects unknown and duplicate exception rule IDs', () => {
    const { config } = fixture()
    const standard = config.conformance?.documentationStandardV1
    const approval = {
      reason: 'A temporary exception approved for migration tracking.',
      approvedBy: 'Documentation Working Group',
      trackingUrl: 'https://github.com/AgentsKit-io/doc-bridge/issues/27',
    }
    expect(DocBridgeConfigV1Schema.safeParse({
      ...config,
      conformance: { documentationStandardV1: { ...standard, exceptions: [{ ruleId: 'unknown', ...approval }] } },
    }).success).toBe(false)
    expect(DocBridgeConfigV1Schema.safeParse({
      ...config,
      conformance: {
        documentationStandardV1: {
          ...standard,
          exceptions: [
            { ruleId: 'contribution', ...approval },
            { ruleId: 'contribution', ...approval },
          ],
        },
      },
    }).success).toBe(false)
  })

  it('dogfoods the profile against the real Doc Bridge repository', () => {
    const root = join(import.meta.dirname, '..')
    const config = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse(JSON.parse(readFileSync(join(root, 'doc-bridge.config.json'), 'utf8'))),
    )
    const llmsPath = join(root, config.index?.llmsTxt?.outFile ?? 'llms.txt')
    const originalLlms = existsSync(llmsPath) ? readFileSync(llmsPath, 'utf8') : undefined
    const generated = buildDocBridgeIndex({ root, config, write: false }).index
    writeFileSync(llmsPath, renderLlmsTxt(config, generated.knowledge, generated.project?.name ?? 'project'))
    try {
      const report = runDocumentationStandardV1(root, config)
      expect(report.ok).toBe(true)
      expect(report.recommendedOk).toBe(true)
    } finally {
      if (originalLlms === undefined) unlinkSync(llmsPath)
      else writeFileSync(llmsPath, originalLlms)
    }
  })
})
