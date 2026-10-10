import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { exportVault } from '../src/vault/export.js'
import { diffVault } from '../src/vault/diff.js'
import { readEnrichmentOverlay } from '../src/enrich/overlay.js'
import { StudioGraphV1Schema, StudioSearchV1Schema, StudioWhyV1Schema } from '../src/schemas/studio-graph.js'
import { createStudioBackend, serveStudio, type StudioAction } from '../packages/studio/src/server.js'

const roots: string[] = []; const servers: Awaited<ReturnType<typeof serveStudio>>[] = []
afterEach(async () => { for (const server of servers.splice(0)) await server.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'studio-server-')); roots.push(root)
  mkdirSync(join(root, 'docs')); mkdirSync(join(root, 'src')); mkdirSync(join(root, 'assets'))
  writeFileSync(join(root, '.gitignore'), '.doc-bridge/\n')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@agentskit/example', version: '1.0.0' }))
  writeFileSync(join(root, 'src/module.ts'), 'export const sample = 1\n')
  writeFileSync(join(root, 'docs/guide.md'), '# Sample guide\n\n`sample`\n')
  const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, project: { name: 'studio-example' }, corpus: { agent: { root: 'docs/agent' }, human: { plugin: 'plain-markdown', options: { root: 'docs' } } } }))
  writeFileSync(join(root, 'doc-bridge.config.json'), JSON.stringify(config))
  writeFileSync(join(root, 'assets/index.html'), '<script src="/app.js?token=SESSION_TOKEN"></script>')
  writeFileSync(join(root, 'assets/app.js'), 'console.log("sample")'); writeFileSync(join(root, 'assets/app.css'), 'body{color:black}')
  buildDocBridgeIndex({ root, config, write: true })
  return { root, config }
}
async function open(root: string) {
  const server = await serveStudio({ backend: createStudioBackend({ cwd: root }), stateDir: join(root, '.doc-bridge/studio'), assetsDir: join(root, 'assets') }); servers.push(server)
  const url = new URL(server.url); const origin = url.origin; const headers = { Authorization: `Bearer ${url.searchParams.get('token')}`, Origin: origin, 'Content-Type': 'application/json' }
  return { server, origin, headers, get: (path: string) => fetch(origin + path, { headers }), post: (body: unknown) => fetch(origin + '/api/actions', { method: 'POST', headers, body: JSON.stringify(body) }) }
}
async function proposals(root: string, config: ReturnType<typeof applyConfigDefaults>) {
  await exportVault(root, config)
  const note = join(root, '.doc-bridge/vault', `${createHash('sha256').update('document:docs/guide.md').digest('hex')}.md`)
  writeFileSync(note, readFileSync(note, 'utf8') + '\nHuman suggestion.\n'); await diffVault(root, config)
  buildDocBridgeIndex({ root, config, write: true })
}
it('binds only to loopback and authenticates every route and asset without CORS; rejects foreign origins/hosts/methods', async () => {
  const { root } = fixture(); const { server, origin, headers, get } = await open(root)
  expect(server.server.address()).toMatchObject({ address: '127.0.0.1' })
  for (const path of ['/', '/app.js', '/app.css', '/api/graph', '/api/search?q=sample', '/api/why', '/missing']) {
    expect((await fetch(origin + path)).status).toBe(401)
    expect((await fetch(origin + path, { headers: { Authorization: 'Bearer invalid' } })).status).toBe(401)
  }
  const page = await fetch(server.url); expect(page.status).toBe(200)
  expect(await page.text()).not.toContain('SESSION_TOKEN')
  expect(page.headers.get('content-security-policy')).toContain("script-src 'self'")
  expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  expect(page.headers.get('access-control-allow-origin')).toBeNull()
  expect(page.headers.get('cache-control')).toBe('no-store')
  expect(page.headers.get('referrer-policy')).toBe('no-referrer')
  for (const path of ['/app.js', '/app.css']) expect((await get(path)).status).toBe(200)
  expect((await fetch(origin + '/api/graph', { headers: { ...headers, Origin: 'https://example.invalid' } })).status).toBe(403)
  const foreignHost = await new Promise<number>(accept => { const req = request(origin + '/api/graph', { headers: { ...headers, Host: 'example.invalid' } }, response => { response.resume(); accept(response.statusCode!) }); req.end() }); expect(foreignHost).toBe(403)
  expect((await fetch(origin + '/api/actions', { method: 'OPTIONS', headers })).status).toBe(405)
  expect((await fetch(origin + '/../../package.json', { headers })).status).toBe(404)
  expect((await get('/api/search?q=' + 'x'.repeat(1025))).status).toBe(400)
})
it('serves real engine graph/search/why contracts and exposes missing targets and stale index errors', async () => {
  const { root } = fixture(); const { get } = await open(root)
  const graph = StudioGraphV1Schema.parse(await (await get('/api/graph')).json()); expect(graph.nodes.length).toBeGreaterThan(0)
  const search = StudioSearchV1Schema.parse(await (await get('/api/search?q=sample')).json()); expect(search.results.length).toBeGreaterThan(0)
  const why = StudioWhyV1Schema.parse(await (await get('/api/why?id=' + encodeURIComponent(search.results[0]!.nodeId))).json()); expect(why.indexHash).toBe(graph.source.indexHash)
  expect((await get('/api/why?id=missing')).status).toBe(409)
  writeFileSync(join(root, 'src/module.ts'), 'export const sample = 2\n')
  const stale = await get('/api/graph'); expect(stale.status).toBe(409); expect((await stale.json()).error).toContain('stale')
})
it('records and replays a real vault decision across restart, refuses conflicting request IDs and preserves source docs', async () => {
  const { root, config } = fixture(); await proposals(root, config)
  let client = await open(root); const graph = StudioGraphV1Schema.parse(await (await client.get('/api/graph')).json()); const proposal = graph.proposals[0]!
  const action: StudioAction = { requestId: 'review-request-0001', action: 'approve', proposalId: proposal.id, evidenceHash: proposal.evidenceHash, indexHash: graph.source.indexHash, by: 'human-reviewer', reason: 'Reviewed current evidence' }
  const response = await client.post(action); expect(response.status).toBe(200); const result = await response.json()
  expect(readEnrichmentOverlay(root)?.accepted.some(entry => entry.proposal.proposalId === proposal.id)).toBe(true)
  expect(await (await client.post(action)).json()).toEqual(result)
  expect((await client.post({ ...action, action: 'reject' })).status).toBe(409)
  await client.server.close(); servers.splice(servers.indexOf(client.server), 1); client = await open(root)
  expect(await (await client.post(action)).json()).toEqual(result)
  const journal = readFileSync(join(root, '.doc-bridge/studio/actions.jsonl'), 'utf8'); expect(journal.split('\n').filter(Boolean)).toHaveLength(2)
  expect(journal).not.toContain(new URL(client.server.url).searchParams.get('token'))
  expect(readFileSync(join(root, 'docs/guide.md'), 'utf8')).toBe('# Sample guide\n\n`sample`\n')
})
it('prepares an idempotent local draft preview, rejects malformed or stale actions and a real rejection persists', async () => {
  const { root, config } = fixture(); await proposals(root, config); const client = await open(root)
  const graph = StudioGraphV1Schema.parse(await (await client.get('/api/graph')).json()); const proposal = graph.proposals[0]!
  const action = { requestId: 'draft-request-0001', action: 'prepare-draft', proposalId: proposal.id, evidenceHash: proposal.evidenceHash, indexHash: graph.source.indexHash, by: 'human-reviewer', reason: 'Prepare review' }
  const response = await client.post(action); expect(response.status).toBe(200); const draft = await response.json()
  expect(draft.dryRun).toBe(true); expect(draft.prUrl).toBeUndefined(); expect(draft.commands.at(-1)).toContain('--draft'); expect(draft.draftPath).not.toContain(root)
  expect(readFileSync(join(root, draft.draftPath), 'utf8')).toContain(proposal.id)
  expect(await (await client.post(action)).json()).toEqual(draft)
  const second = await (await client.post({ ...action, requestId: 'draft-request-0002' })).json(); expect(second.draftPath).not.toBe(draft.draftPath)
  expect(readFileSync(join(root, draft.draftPath), 'utf8')).toContain(proposal.id)
  expect((await client.post({ ...action, requestId: 'token-input-0001', reason: new URL(client.server.url).searchParams.get('token') })).status).toBe(400)
  expect(readFileSync(join(root, '.doc-bridge/studio/actions.jsonl'), 'utf8')).not.toContain(new URL(client.server.url).searchParams.get('token'))
  expect((await client.post({ ...action, push: true })).status).toBe(400)
  expect((await client.post({ ...action, requestId: 'empty-review-0001', reason: '' })).status).toBe(400)
  expect((await fetch(client.origin + '/api/actions', { method: 'POST', headers: client.headers, body: 'x'.repeat(8193) })).status).toBe(413)
  expect((await client.post({ ...action, requestId: 'bad-binding-0001', evidenceHash: '0'.repeat(64) })).status).toBe(409)
  const rejection = await client.post({ ...action, requestId: 'reject-request-0001', action: 'reject' }); expect(rejection.status).toBe(200)
  expect(readEnrichmentOverlay(root)?.rejected.some(entry => entry.proposalId === proposal.id)).toBe(true)
})
it('fails closed after source changes and on interrupted journal entries without replaying an operation', async () => {
  const { root, config } = fixture(); await proposals(root, config); const client = await open(root)
  const graph = StudioGraphV1Schema.parse(await (await client.get('/api/graph')).json()); const proposal = graph.proposals[0]!
  const action = { requestId: 'stale-request-0001', action: 'approve', proposalId: proposal.id, evidenceHash: proposal.evidenceHash, indexHash: graph.source.indexHash, by: 'human-reviewer', reason: 'Review' }
  writeFileSync(join(root, 'docs/guide.md'), '# Changed guide\n'); buildDocBridgeIndex({ root, config, write: true })
  expect((await client.post(action)).status).toBe(409); expect(readEnrichmentOverlay(root)?.pending).toHaveLength(1)
  expect((await client.post({ ...action, indexHash: StudioGraphV1Schema.parse(await (await client.get('/api/graph')).json()).source.indexHash, requestId: 'fresh-index-0001' })).status).toBe(409)
  expect(readEnrichmentOverlay(root)?.accepted).toHaveLength(0)
})
it('refuses a symlink action journal', async () => {
  const { root } = fixture(); const stateDir = join(root, 'state'); mkdirSync(stateDir); symlinkSync(join(root, 'package.json'), join(stateDir, 'actions.jsonl'))
  await expect(serveStudio({ backend: createStudioBackend({ cwd: root }), stateDir })).rejects.toThrow()
})
it('never repeats an interrupted operation and serializes concurrent duplicates', async () => {
  const { root } = fixture(); const stateDir = join(root, 'interrupted'); mkdirSync(stateDir)
  const action: StudioAction = { requestId: 'interrupted-request-01', action: 'approve', proposalId: 'proposal', evidenceHash: 'a'.repeat(64), indexHash: 'b'.repeat(64), by: 'human', reason: 'Review' }
  const hash = createHash('sha256').update(JSON.stringify(Object.entries(action).sort())).digest('hex')
  writeFileSync(join(stateDir, 'actions.jsonl'), JSON.stringify({ request: action, hash, state: 'started' }) + '\n')
  let calls = 0
  const backend = createStudioBackend({ cwd: root }); backend.act = async () => { calls += 1; await new Promise(accept => setTimeout(accept, 20)); return { ok: true } }
  const server = await serveStudio({ backend, stateDir }); servers.push(server)
  const url = new URL(server.url); const headers = { Authorization: `Bearer ${url.searchParams.get('token')}`, Origin: url.origin, 'Content-Type': 'application/json' }
  const post = (requestId: string) => fetch(url.origin + '/api/actions', { method: 'POST', headers, body: JSON.stringify({ ...action, requestId }) })
  expect((await post(action.requestId)).status).toBe(409); expect(calls).toBe(0)
  const responses = await Promise.all([post('concurrent-request-01'), post('concurrent-request-01')])
  expect(responses.map(response => response.status)).toEqual([200, 200]); expect(calls).toBe(1)
})
it('the executable gives optional-package guidance without loading UI and validates startup arguments', async () => {
  const { cpSync, realpathSync } = await import('node:fs')
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const root = mkdtempSync(join(tmpdir(), 'studio-package-')); roots.push(root)
  const repository = fileURLToPath(new URL('..', import.meta.url))
  mkdirSync(join(root, 'bin')); mkdirSync(join(root, 'dist/cli'), { recursive: true }); mkdirSync(join(root, 'node_modules'))
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  cpSync(join(repository, 'bin/ak-docs.js'), join(root, 'bin/ak-docs.js')); cpSync(join(repository, 'dist/cli/program.js'), join(root, 'dist/cli/program.js'))
  const metadata = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8'))
  for (const name of Object.keys(metadata.dependencies)) { mkdirSync(join(root, 'node_modules', name, '..'), { recursive: true }); symlinkSync(realpathSync(join(repository, 'node_modules', name)), join(root, 'node_modules', name)) }
  const { spawnSync } = await import('node:child_process')
  const absent = spawnSync(process.execPath, ['bin/ak-docs.js', 'studio'], { cwd: root, encoding: 'utf8' }); expect(absent.status).toBe(1); expect(absent.stderr).toContain('Studio is optional. Install @agentskit/doc-bridge-studio')
  const invalid = spawnSync(process.execPath, ['bin/ak-docs.js', 'studio', '--push'], { cwd: root, encoding: 'utf8' }); expect(invalid.status).toBe(1); expect(invalid.stderr).toContain('Usage: ak-docs studio')
  expect(execFileSync(process.execPath, ['bin/ak-docs.js', 'studio', '--help'], { cwd: root, encoding: 'utf8' })).toContain('Install @agentskit/doc-bridge-studio')
})
it('decides a native overlay proposal through the same real engine approval path', async () => {
  const { root, config } = fixture(); await proposals(root, config)
  const { EnrichmentProposalV1Schema, enrichmentProposalId } = await import('../src/schemas/enrichment.js')
  const { enrichmentApprovalId } = await import('../src/enrich/approvals.js')
  const { sealEnrichmentOverlay, writeEnrichmentOverlay } = await import('../src/enrich/overlay.js')
  const overlay = readEnrichmentOverlay(root)!
  const identity = { ...overlay.pending[0]!.proposal, kind: 'summarize' as const, payload: { summary: 'Sample guide explains the sample export.', language: 'en' } }
  const proposal = EnrichmentProposalV1Schema.parse({ ...identity, proposalId: enrichmentProposalId(identity) })
  writeEnrichmentOverlay(root, sealEnrichmentOverlay({ ...overlay, pending: [{ proposal, approvalId: enrichmentApprovalId(proposal.proposalId, proposal.targetContentHash) }] }))
  buildDocBridgeIndex({ root, config, write: true })
  const client = await open(root); const graph = StudioGraphV1Schema.parse(await (await client.get('/api/graph')).json()); const item = graph.proposals[0]!
  expect(item.kind).toBe('overlay')
  const body = Buffer.from(JSON.stringify({ requestId: 'overlay-review-0001', action: 'approve', proposalId: item.id, evidenceHash: item.evidenceHash, indexHash: graph.source.indexHash, by: 'reviewer-é', reason: 'Revisão da evidência' }))
  const status = await new Promise<number>(accept => {
    const req = request(client.origin + '/api/actions', { method: 'POST', headers: client.headers }, response => { response.resume(); accept(response.statusCode!) })
    const boundary = body.indexOf(Buffer.from('é')) + 1
    req.write(body.subarray(0, boundary)); setImmediate(() => req.end(body.subarray(boundary)))
  }); expect(status).toBe(200)
  expect(readEnrichmentOverlay(root)?.accepted[0]?.acceptedBy).toBe('reviewer-é')
  expect(readEnrichmentOverlay(root)?.accepted[0]?.proposal.kind).toBe('summarize')
})
it('shutdown drains decided actions and disconnects incomplete HTTP bodies', async () => {
  const { root } = fixture(); const client = await open(root)
  const req = request(client.origin + '/api/actions', { method: 'POST', headers: { ...client.headers, 'Content-Length': '100' } }); req.on('error', () => {}); req.write('{')
  await new Promise(accept => setTimeout(accept, 30))
  await client.server.close(); servers.splice(servers.indexOf(client.server), 1)
  expect(client.server.server.listening).toBe(false)
})
