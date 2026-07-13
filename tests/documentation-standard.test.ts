import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import {
  formatDocumentationStandardText,
  runDocumentationStandardV1,
} from '../src/conformance/documentation-standard-v1.js'
import { runGates } from '../src/gates/run-gates.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'

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
      profile: { id: 'documentation-standard-v1', version: 1, status: 'proposed' },
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
    const removeGeneratedLlms = !existsSync(llmsPath)
    if (removeGeneratedLlms) writeFileSync(llmsPath, '# Doc Bridge\n\nGenerated test evidence.\n')
    try {
      const report = runDocumentationStandardV1(root, config)
      expect(report.ok).toBe(true)
      expect(report.recommendedOk).toBe(true)
    } finally {
      if (removeGeneratedLlms) unlinkSync(llmsPath)
    }
  })
})
