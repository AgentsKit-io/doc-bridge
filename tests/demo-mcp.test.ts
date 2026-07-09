import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { formatDemoText, runDemo, withDemoWorkspace } from '../src/cli/demo.js'
import { installMcpConfig, mcpSnippet } from '../src/mcp/install.js'
import { runCli } from '../src/cli/program.js'

describe('demo and mcp install', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  it('runs bundled example demo with handoff output', () => {
    const result = withDemoWorkspace('example', (root, config) => runDemo(root, config, 'example'))

    expect(result.handoff.target.id).toBe('example')
    expect(result.handoff.editRoots).toContain('src')
    expect(result.gateAfter.ok).toBe(true)
    expect(formatDemoText(result).join('\n')).toContain('AgentHandoff in 60s')
  })

  it('runs bundled monorepo demo with auth handoff and bridge', () => {
    const result = withDemoWorkspace('monorepo', (root, config) => runDemo(root, config, 'monorepo'))

    expect(result.handoff.target.id).toBe('auth')
    expect(result.handoff.checks.length).toBeGreaterThan(0)
    expect(formatDemoText(result).join('\n')).toContain('Gate:')
  })

  it('copies bundled fixture files into an existing workspace for in-project demos', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-demo-copy-'))
    tempDirs.push(root)
    mkdirSync(join(root, 'scratch'), { recursive: true })

    const result = withDemoWorkspace('example', (_fixtureRoot, config) =>
      runDemo(root, config, 'example', { copyFixture: true }),
    )

    expect(result.ok).toBe(true)
    expect(existsSync(join(root, 'doc-bridge.config.json'))).toBe(true)
    expect(existsSync(join(root, 'docs'))).toBe(true)
    expect(existsSync(join(root, 'package.json'))).toBe(true)
  })

  it('installs cursor MCP config into project', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-mcp-install-'))
    tempDirs.push(root)
    const result = installMcpConfig(root, 'cursor')

    expect(result.ok).toBe(true)
    expect(existsSync(result.configPath)).toBe(true)
    const config = JSON.parse(readFileSync(result.configPath, 'utf8')) as {
      mcpServers: Record<string, { cwd: string }>
    }
    expect(config.mcpServers['ak-docs'].cwd).toBe(root)
    expect(mcpSnippet(root)).toContain('"ak-docs"')
  })

  it('prints demo from CLI without local config', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-cli-demo-'))
    tempDirs.push(root)
    const originalCwd = process.cwd()
    try {
      process.chdir(root)
      const write = process.stdout.write
      let out = ''
      process.stdout.write = ((chunk: string | Uint8Array) => {
        out += String(chunk)
        return true
      }) as typeof process.stdout.write
      try {
        expect(runCli(['demo', '--text'])).toBe(0)
      } finally {
        process.stdout.write = write
      }
      expect(out).toContain('AgentHandoff in 60s')
      expect(out).toContain('edit:')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('prints doctor from CLI on fixture project', () => {
    const fixtureRoot = join(import.meta.dirname, 'fixtures', 'sample-project')
    const originalCwd = process.cwd()
    try {
      process.chdir(fixtureRoot)
      const write = process.stdout.write
      let out = ''
      process.stdout.write = ((chunk: string | Uint8Array) => {
        out += String(chunk)
        return true
      }) as typeof process.stdout.write
      try {
        expect(runCli(['doctor', '--text'])).toBe(0)
      } finally {
        process.stdout.write = write
      }
      expect(out).toContain('doc-bridge doctor')
      expect(out).toContain('Score:')
    } finally {
      process.chdir(originalCwd)
    }
  })
})
