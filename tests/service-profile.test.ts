import { runEnrichment } from '../src/enrich/stage.js'
import { knowledgeLookup } from '../src/mcp/knowledge.js'
import { loadConfigWithRead, loadConfig } from '../src/config/load-config.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { serviceConfig, SERVICE_CONFIG_LEAVES } from '../src/execution/config.js'
import { executionContext, withExecutionProfile } from '../src/execution/profile.js'
import { createLocalRepositoryRead, contentRef } from '../src/storage/local.js'
import { createLocalArtifactIO } from '../src/storage/artifacts.js'
import { markdownManifest } from '../src/discovery/plugins/markdown.js'
import { discoverRepository, discoverRepositoryWithRead } from '../src/discovery/repository.js'
import { buildDocBridgeIndex, buildStoredDocBridgeIndex } from '../src/index-builder/build-index.js'
import { handleMcpRequest } from '../src/mcp/server.js'
import { runCli } from '../src/cli/program.js'
import { loadRegistryAgentRunner, createRegistryAgentAdapter } from '../src/agents/registry-adapter.js'
import { loadFederatedChunks } from '../src/federation/llms.js'
import { promoteMemoryToGithubPr } from '../src/memory/github-pr.js'
import { watchDocBridgeIndex } from '../src/index-builder/watch-index.js'
import { createEnrichmentCache } from '../src/enrich/cache.js'

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); syncBuiltinESMExports(); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })
const fixture = (url = 'http://127.0.0.1:1/llms.txt') => {
  const root = mkdtempSync(join(tmpdir(), 'service-profile-')); roots.push(root)
  mkdirSync(join(root, 'docs'), { recursive: true })
  const text = '# Guide\n\nA bounded public guide. password=synthetic-test-value\n'
  writeFileSync(join(root, 'docs', 'INDEX.md'), text)
  writeFileSync(join(root, 'runner.mjs'), "import {writeFileSync} from 'node:fs'; writeFileSync(new URL('./module-marker', import.meta.url), 'executed'); export default () => ({})")
  const hostile = { schemaVersion: 1 as const, corpus: { agent: { root: 'docs', index: 'docs/INDEX.md' } },
    intelligence: { enabled: true, runtime: 'custom' as const, runtimeModule: 'runner.mjs', registry: { enabled: true, runnerModule: 'runner.mjs', cli: { command: process.execPath, args: ['-e', "require('node:fs').writeFileSync('cli-marker','executed')"] } } },
    federation: { enabled: true, sources: [{ id: 'hostile', llmsTxt: url }] }, index: { outFile: '../write-marker' }, safety: { redactSecrets: false },
  }
  writeFileSync(join(root, 'doc-bridge.config.json'), JSON.stringify(hostile))
  return { root, hostile, text }
}
const blockIO = () => {
  const calls: string[] = []
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { calls.push('fetch'); throw new Error('Blocked fetch') })
  for (const name of ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork'] as const) vi.spyOn(childProcess, name).mockImplementation((() => { calls.push(name); throw new Error('Blocked subprocess') }) as never)
  syncBuiltinESMExports()
  return { calls, fetch }
}

describe('caller service ceiling', () => {
  it('filters exact leaves, rejects malformed permitted values and prevents nested widening', () => {
    const { hostile } = fixture()
    const { config, diagnostics } = serviceConfig(hostile)
    expect(diagnostics).toContain('intelligence')
    expect(diagnostics).toContain('federation')
    expect(diagnostics).toContain('intelligence.registry.runnerModule')
    expect(diagnostics.join(' ')).not.toContain('runner.mjs')
    expect(() => serviceConfig({ ...hostile, unknown: Object.fromEntries(Array.from({ length: 129 }, (_, index) => ['key' + index, 'private-value'])) })).toThrow('diagnostic budget')
    expect(config.safety?.redactSecrets).toBe(true)
    expect(Object.isFrozen(config.corpus.agent)).toBe(true)
    expect(SERVICE_CONFIG_LEAVES).toContain('audit.documentation.tierRules[].critical')
    expect(() => serviceConfig({ ...hostile, safety: { maxFiles: 'bad' } })).toThrow('safety.maxFiles')
    expect(() => serviceConfig({ ...hostile, corpus: { agent: { root: '../escape' } } })).toThrow('read roots')
    withExecutionProfile('service', () => withExecutionProfile('local', () => expect(executionContext().profile).toBe('service')))
  })

  it('runs injected library discovery/index and real MCP calls with globally blocked execution and fetch', async () => {
    let hits = 0
    const server = createServer((_req, res) => { hits++; res.end('# Remote') })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address() as { port: number }
      const { root, hostile, text } = fixture(`http://127.0.0.1:${address.port}/llms.txt`)
      const blocked = blockIO()
      const partition = { repositoryId: 'fixture', revision: 'head' }
      const limits = markdownManifest.resourceLimits
      const read = await withExecutionProfile('service', () => createLocalRepositoryRead({ root, partition, limits, inventory: Object.fromEntries(['docs/INDEX.md', 'runner.mjs', 'doc-bridge.config.json'].map(path => [path, contentRef(readFileSync(join(root, path)))])) }))
      const loaded = await loadConfigWithRead(read, { profile: 'service' })
      expect(loaded.diagnostics).toContain('intelligence')
      expect(() => loadConfig({ cwd: root, profile: 'service' })).toThrow('legacy')
      const artifactRoot = mkdtempSync(join(tmpdir(), 'service-artifacts-')); roots.push(artifactRoot)
      const artifacts = await createLocalArtifactIO({ root: artifactRoot, partition, limits })
      const found = await discoverRepositoryWithRead(read, { config: loaded.config })
      expect(found.snapshot.coverage.some(item => item.analyzer === 'service-profile' && item.status === 'not-analyzed')).toBe(true)
      const built = await buildStoredDocBridgeIndex({ repository: read, artifacts, partition, signal: new AbortController().signal, config: hostile, snapshot: found.snapshot, profile: 'service' })
      expect(built.status).toBe('ok')
      if (built.status !== 'ok') throw new Error(built.code)
      expect(JSON.stringify(built.value.index)).not.toContain('synthetic-test-value')
      await expect(runEnrichment({ root, config: hostile, snapshot: found.snapshot } as never)).rejects.toThrow('not-analyzed')
      expect(knowledgeLookup(built.value.index, hostile, { path: 'docs/INDEX.md' })).toBeDefined()
      expect(() => knowledgeLookup(built.value.index, hostile, { path: 'docs/INDEX.md' }, { root })).toThrow('not-analyzed')
      expect(built.value.coverage?.some(item => item.status === 'not-analyzed')).toBe(true)
      const ctx = { root, config: hostile, profile: 'service' as const, loadIndex: () => built.value.index, readDocument: () => text }
      const mcpResult = handleMcpRequest(ctx, { method: 'tools/call', params: { name: 'knowledge.search', arguments: { query: 'guide' } } }) as { _meta: { serviceProfile: { diagnostics: string[]; coverage: { status: string }[] } } }
      expect(mcpResult._meta.serviceProfile.diagnostics).toContain('intelligence.registry.runnerModule')
      expect(mcpResult._meta.serviceProfile.coverage.some(item => item.status === 'not-analyzed')).toBe(true)
      expect(() => handleMcpRequest(ctx, { method: 'tools/call', params: { name: 'docbridge.proposals', arguments: { action: 'agent' } } })).toThrow('not-analyzed')
      expect(() => handleMcpRequest(ctx, { method: 'tools/call', params: { name: 'memory.promoteDraft' } })).toThrow('not-analyzed')
      await withExecutionProfile('service', async () => {
        await expect(loadRegistryAgentRunner(root, hostile)).rejects.toThrow('not-analyzed')
        expect(() => createRegistryAgentAdapter(root, hostile)).toThrow('not-analyzed')
        await expect(loadFederatedChunks(root, hostile)).rejects.toThrow('not-analyzed')
        expect(() => promoteMemoryToGithubPr(root, {} as never)).toThrow('not-analyzed')
        expect(() => watchDocBridgeIndex({ root, config: hostile })).toThrow('not-analyzed')
        expect(() => discoverRepository({ root, config: hostile })).toThrow('legacy')
        expect(() => buildDocBridgeIndex({ root, config: hostile })).toThrow('legacy')
      })
      await expect(discoverRepositoryWithRead(read, { profile: 'service', config: { ...hostile, safety: { maxFiles: 1 } } })).rejects.toThrow('FILE_LIMIT')
      expect(blocked.calls).toEqual([])
      expect(hits).toBe(0)
      for (const marker of ['module-marker', 'cli-marker', 'write-marker']) expect(existsSync(join(root, marker))).toBe(false)
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })

  it('runs real CLI service flows and rejects implicit writes; cached local writes fail closed', async () => {
    const { root } = fixture()
    const cached = createEnrichmentCache(root)
    const blocked = blockIO()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const result = await runCli(['validate-config', '--profile', 'service', '--root', root])
    expect(result, stderr.mock.calls.map(call => String(call[0])).join('')).toBe(0)
    expect(stdout.mock.calls.map(call => String(call[0])).join('')).toContain('not-analyzed')
    expect(stderr.mock.calls.map(call => String(call[0])).join('')).toContain('ignored intelligence')
    expect(await runCli(['index', '--profile', 'service', '--root', root])).toBe(2)
    expect(await runCli(['discover', '--profile', 'service', '--root', root])).toBe(0)
    expect(await runCli(['index', '--profile', 'service', '--root', root, '--artifact-root', join(root, 'artifacts')])).toBe(0)
    withExecutionProfile('service', () => expect(() => cached.write({ task: 'curate', agentId: 'test', agentVersion: '1', promptVersion: '1', packHash: '0'.repeat(64) }, [])).toThrow('not-analyzed'))
    expect(blocked.calls).toEqual([])
    expect(existsSync(join(root, 'module-marker'))).toBe(false)
    expect(existsSync(join(root, 'cli-marker'))).toBe(false)
  })
})
