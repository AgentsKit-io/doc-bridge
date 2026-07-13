import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'

const tempDirs: string[] = []
const projectRoot = join(import.meta.dirname, '..')

const capture = (fn: () => number): { code: number; out: string; err: string } => {
  const stdout = process.stdout.write
  const stderr = process.stderr.write
  let out = ''
  let err = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk)
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err += String(chunk)
    return true
  }) as typeof process.stderr.write
  try {
    return { code: fn(), out, err }
  } finally {
    process.stdout.write = stdout
    process.stderr.write = stderr
  }
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  tempDirs.length = 0
  process.chdir(projectRoot)
})

describe('documentation conformance CLI', () => {
  it('prints a passing report as text and JSON', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-standard-cli-pass-'))
    tempDirs.push(root)
    for (const dir of ['agent-docs', 'human-docs', 'src/demo', 'tests', 'docs/assets']) {
      mkdirSync(join(root, dir), { recursive: true })
    }
    writeFileSync(join(root, 'agent-docs/INDEX.md'), '# Agent docs\n')
    writeFileSync(join(root, 'human-docs/demo.md'), '---\npackage: demo\n---\n# Demo\n')
    writeFileSync(join(root, 'README.md'), '# Demo\nhttps://www.agentskit.io\n')
    writeFileSync(join(root, 'CONTRIBUTING.md'), '# Contributing\nRun tests.\n')
    writeFileSync(join(root, 'docs/index.html'), '<title>Demo</title>')
    writeFileSync(join(root, 'docs/architecture.md'), '```mermaid\nflowchart LR\n```\n')
    writeFileSync(join(root, 'docs/assets/overview.webp'), 'visual')
    writeFileSync(join(root, 'tests/demo.test.ts'), "it('runs demo', () => {})\n")
    const configPath = join(root, 'doc-bridge.config.json')
    writeFileSync(configPath, JSON.stringify({
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: { plugin: 'plain-markdown', options: { root: 'human-docs', urlPrefix: '/docs' } },
      },
      routing: { options: { ownership: { demo: {
        path: 'src/demo', checks: ['pnpm test'], agentDoc: 'agent-docs/INDEX.md', humanDoc: '/docs/demo',
      } } } },
      conformance: { documentationStandardV1: {
        rawSources: ['README.md'],
        contributionPaths: ['CONTRIBUTING.md'],
        metadata: [{ path: 'docs/index.html', contains: ['<title>'] }],
        links: [{ url: 'https://www.agentskit.io', paths: ['README.md'] }],
        quickstarts: [{
          id: 'demo', doc: 'README.md', test: 'tests/demo.test.ts',
          command: 'pnpm vitest run tests/demo.test.ts', testContains: ['runs demo'],
        }],
        visuals: ['docs/assets/overview.webp'],
        diagrams: [{ path: 'docs/architecture.md', contains: ['```mermaid'] }],
      } },
    }))
    expect(capture(() => runCli(['index', '--config', configPath])).code).toBe(0)

    const text = capture(() => runCli([
      'conformance', 'run', 'documentation-standard-v1', '--text', '--config', configPath,
    ]))
    expect(text.code).toBe(0)
    expect(text.err).toBe('')
    expect(text.out).toContain('Documentation Standard v1 (proposed)')
    expect(text.out).toContain('PASS [required] tested-quickstarts')

    const json = capture(() => runCli([
      'conformance', 'run', 'documentation-standard-v1', '--json', '--config', configPath,
    ]))
    expect(json.code).toBe(0)
    expect(JSON.parse(json.out)).toMatchObject({
      schemaVersion: 1,
      profile: { id: 'documentation-standard-v1' },
      ok: true,
    })
  })

  it('returns exit 1 with remediation for a failing repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-standard-cli-'))
    tempDirs.push(root)
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'docs/INDEX.md'), '# Agent docs\n')
    const configPath = join(root, 'doc-bridge.config.json')
    writeFileSync(configPath, JSON.stringify({
      schemaVersion: 1,
      corpus: { agent: { root: 'docs' } },
      conformance: { documentationStandardV1: {} },
    }))

    const result = capture(() => runCli([
      'conformance',
      'run',
      'documentation-standard-v1',
      '--config',
      configPath,
    ]))
    expect(result.code).toBe(1)
    const report = JSON.parse(result.out) as {
      ok: boolean
      results: Array<{ id: string; remediation: { command: string } }>
    }
    expect(report.ok).toBe(false)
    expect(report.results.find((rule) => rule.id === 'contribution')?.remediation.command).toBe('edit CONTRIBUTING.md')
  })

  it('rejects unknown conformance profile usage', () => {
    const result = capture(() => runCli(['conformance', 'run', 'future-standard']))
    expect(result.code).toBe(1)
    expect(result.err).toContain('Usage: ak-docs conformance run documentation-standard-v1')
  })
})
