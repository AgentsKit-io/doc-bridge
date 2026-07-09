import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { MCP_TOOLS, handleMcpRequest, startMcpStdioServer } from '../src/mcp/server.js'
import { runQuery } from '../src/query/query.js'

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample-project')

const loadFixtureConfig = () => {
  const raw = JSON.parse(
    readFileSync(join(fixtureRoot, 'doc-bridge.config.json'), 'utf8'),
  ) as unknown
  return applyConfigDefaults(DocBridgeConfigV1Schema.parse(raw))
}

describe('MCP tools', () => {
  it('lists deterministic tools', () => {
    const config = loadFixtureConfig()
    const result = handleMcpRequest(
      { root: fixtureRoot, config },
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    ) as { tools: { name: string }[] }

    expect(result.tools).toBe(MCP_TOOLS)
    expect(result.tools.map((tool) => tool.name)).toContain('handoff.resolve')
    expect(result.tools.map((tool) => tool.name)).toContain('doc.search')
    expect(result.tools.map((tool) => tool.name)).toContain('doc.get')
  })

  it('resolves handoff, searches docs, and reads docs', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const ctx = { root: fixtureRoot, config, loadIndex: () => index }

    const handoff = handleMcpRequest(ctx, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'handoff.resolve', arguments: { id: 'os-core' } },
    }) as { content: { text: string }[] }
    expect(handoff.content[0]?.text).toContain('"type": "agent-handoff"')
    expect(JSON.parse(handoff.content[0]?.text ?? '{}')).toEqual(
      runQuery(index, config, { kind: 'ownership', id: 'os-core', agent: true }),
    )

    const search = handleMcpRequest(ctx, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'doc.search', arguments: { term: 'schema' } },
    }) as { content: { text: string }[] }
    expect(search.content[0]?.text).toContain('os-core')

    const doc = handleMcpRequest(ctx, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'doc.get', arguments: { id: 'os-core' } },
    }) as { content: { text: string }[] }
    expect(doc.content[0]?.text).toContain('# os-core')

    const byPath = handleMcpRequest(ctx, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'doc.get', arguments: { path: 'docs/for-agents/packages/os-core.md' } },
    }) as { content: { text: string }[] }
    expect(byPath.content[0]?.text).toContain('# os-core')

    const packageHandoff = handleMcpRequest(ctx, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'handoff.resolve', arguments: { id: 'os-core', kind: 'package' } },
    }) as { content: { text: string }[] }
    expect(packageHandoff.content[0]?.text).toContain('"id": "os-core"')
  })

  it('initializes and rejects unsupported MCP calls', () => {
    const config = loadFixtureConfig()
    expect(handleMcpRequest({ root: fixtureRoot, config }, { method: 'initialize' })).toMatchObject({
      serverInfo: { name: 'ak-docs' },
    })
    expect(handleMcpRequest({ root: fixtureRoot, config }, { method: 'notifications/cancelled' })).toBeUndefined()
    expect(() =>
      handleMcpRequest(
        { root: fixtureRoot, config },
        { method: 'tools/call', params: { name: 'nope', arguments: {} } },
      ),
    ).toThrow('Unknown tool "nope"')
    expect(() => handleMcpRequest({ root: fixtureRoot, config }, { method: 'ping' })).toThrow(
      'Unsupported MCP method "ping"',
    )
  })

  it('validates tool arguments with Zod', () => {
    const config = loadFixtureConfig()
    expect(() =>
      handleMcpRequest(
        { root: fixtureRoot, config },
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'doc.search', arguments: { limit: 10 } },
        },
      ),
    ).toThrow('doc.search invalid arguments')
  })

  it('rejects unknown doc ids', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index

    expect(() =>
      handleMcpRequest(
        { root: fixtureRoot, config, loadIndex: () => index },
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'doc.get', arguments: { id: 'missing' } },
        },
      ),
    ).toThrow('Unknown doc id "missing"')
  })

  it('rejects doc.get paths outside the project root', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index
    const unsafeIndex = {
      ...index,
      knowledge: [
        ...index.knowledge,
        {
          id: 'unsafe',
          type: 'agent-doc',
          title: 'Unsafe',
          path: '../doc-bridge.config.json',
        },
      ],
    }

    expect(() =>
      handleMcpRequest(
        { root: fixtureRoot, config, loadIndex: () => unsafeIndex },
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'doc.get', arguments: { path: '../doc-bridge.config.json' } },
        },
      ),
    ).toThrow('doc.get path escapes project root')
  })

  it('rejects doc.get paths that are not indexed docs', () => {
    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root: fixtureRoot, config, write: false }).index

    expect(() =>
      handleMcpRequest(
        { root: fixtureRoot, config, loadIndex: () => index },
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'doc.get', arguments: { path: 'package.json' } },
        },
      ),
    ).toThrow('Unknown indexed doc path "package.json"')
  })

  it('rejects doc.get symlinks that resolve outside the project root', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'ak-docs-mcp-symlink-')), 'sample-project')
    cpSync(fixtureRoot, root, { recursive: true })
    const outside = join(mkdtempSync(join(tmpdir(), 'ak-docs-mcp-outside-')), 'secret.md')
    writeFileSync(outside, '# outside\n')
    symlinkSync(outside, join(root, 'outside.md'))

    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root, config, write: false }).index
    const unsafeIndex = {
      ...index,
      knowledge: [
        ...index.knowledge,
        {
          id: 'outside',
          type: 'agent-doc',
          title: 'Outside',
          path: 'outside.md',
        },
      ],
    }

    expect(() =>
      handleMcpRequest(
        { root, config, loadIndex: () => unsafeIndex },
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'doc.get', arguments: { path: 'outside.md' } },
        },
      ),
    ).toThrow('doc.get path escapes project root')
  })

  it('exposes retriever, memory, and registry tools', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'ak-docs-mcp-pipeline-')), 'sample-project')
    cpSync(fixtureRoot, root, { recursive: true })
    mkdirSync(join(root, '.agent-memory'), { recursive: true })
    writeFileSync(join(root, '.agent-memory/sidecar.md'), '# Sidecar\n\npackage os-core owns schema contracts.\n')

    const config = loadFixtureConfig()
    const index = buildDocBridgeIndex({ root, config, write: false }).index
    const ctx = { root, config, loadIndex: () => index }

    for (const name of ['retriever.query', 'memory.classify', 'memory.promoteDraft', 'registry.topology']) {
      const result = handleMcpRequest(ctx, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: name === 'retriever.query' ? { query: 'schema', limit: 1 } : {} },
      }) as { content: { text: string }[] }
      expect(result.content[0]?.text.length).toBeGreaterThan(10)
    }
  })

  it('handles stdio frames and JSON-RPC errors', () => {
    const config = loadFixtureConfig()
    const previous = process.stdin.listeners('data')
    const write = process.stdout.write
    let out = ''
    process.stdin.removeAllListeners('data')
    process.stdout.write = ((chunk: string | Uint8Array) => {
      out += String(chunk)
      return true
    }) as typeof process.stdout.write
    try {
      startMcpStdioServer({ root: fixtureRoot, config })
      const frame = (value: unknown) => {
        const body = JSON.stringify(value)
        return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
      }
      process.stdin.emit('data', Buffer.from('Bad: header\r\n\r\n'))
      process.stdin.emit(
        'data',
        Buffer.from(
          [
            frame({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
            frame({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'nope', arguments: {} } }),
          ].join(''),
        ),
      )
      expect(out).toContain('"id":1')
      expect(out).toContain('"tools"')
      expect(out).toContain('"id":2')
      expect(out).toContain('Unknown tool')
    } finally {
      process.stdout.write = write
      process.stdin.removeAllListeners('data')
      for (const listener of previous) process.stdin.on('data', listener)
    }
  })
})
