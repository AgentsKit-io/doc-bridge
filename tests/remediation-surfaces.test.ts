import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config/load-config.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { diffSnapshots } from '../src/diff/change-set.js'
import { applyRemediation, approveRemediation, createRemediation, regionHash } from '../src/fixes/regions.js'
import { remediationWorkflow } from '../src/fixes/workflow.js'
import { handleMcpRequest } from '../src/mcp/server.js'
import { readEnrichmentOverlay, sealEnrichmentOverlay, writeEnrichmentOverlay } from '../src/enrich/overlay.js'
import { findingSuppressed } from '../src/enrich/settled.js'
import { runCli } from '../src/cli/program.js'

// Real remediation flows repeatedly discover fixtures and run retained TypeScript proofs.
vi.setConfig({ testTimeout: 30_000 })

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })
const fixture = (excludeFreshness = true) => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-regions-')); roots.push(root)
  mkdirSync(join(root, 'docs')); mkdirSync(join(root, '.doc-bridge'))
  writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture","version":"1.0.0"}')
  writeFileSync(join(root, '.gitignore'), '.doc-bridge/\n')
  const text = '# Guide\n\nUse `changed` with one string argument.\n'
  writeFileSync(join(root, 'docs/guide.md'), text)
  writeFileSync(join(root, 'api.ts'), 'export function changed(value: string): void {}\n')
  const path = join(root, 'doc-bridge.config.json')
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs' } }, retrieval: { corpus: { enabled: false } }, gates: { preset: 'minimal', exclude: excludeFreshness ? ['index-freshness'] : [], include: ['human-guide-links'] } }))
  const config = loadConfig({ explicitPath: path }).config
  const base = discoverRepository({ root, config })
  writeFileSync(join(root, 'api.ts'), 'export function changed(value: string, enabled: boolean): void {}\n')
  const head = discoverRepository({ root, config })
  const finding = diffSnapshots(base, head, { headRoot: root }).policy.findings.find(item => item.assertion.document === 'docs/guide.md')!
  expect(finding.routing).toBe('routed-to-L2')
  const start = text.indexOf('Use'), original = 'Use `changed` with one string argument.'
  const proposal = createRemediation(root, { findingId: finding.id, evidenceHash: finding.evidenceHash, baseRevision: head.sourceRevision, configurationHash: head.configurationHash, edits: [{ path: 'docs/guide.md', range: { start, end: start + original.length }, original, replacement: 'Use `changed` with an explicit enabled argument.', expectedRegionHash: regionHash(original), lineStart: 3, lineEnd: 3 }] }, { currentRevision: head.sourceRevision, configurationHash: head.configurationHash, evidenceHash: finding.evidenceHash, allowedRoots: ['docs'], validateEvidence: () => true })
  writeFileSync(join(root, '.doc-bridge/base.json'), JSON.stringify(base))
  writeFileSync(join(root, '.doc-bridge/remediation.json'), JSON.stringify(proposal))
  return { root, config, base, proposal, text, path, finding, head }
}

it('recomputes routed findings through MCP and refuses mismatched evidence and scope', () => {
  const { root, config, base, proposal, text } = fixture()
  const response = handleMcpRequest({ root, config }, { method: 'tools/call', params: { name: 'docbridge.proposals', arguments: { action: 'propose', base, proposal, allowedRoots: ['docs'] } } }) as { content: { text: string }[] }
  expect(JSON.parse(response.content[0]!.text).proposal.type).toBe('remediation')
  expect(readFileSync(join(root, 'docs/guide.md'), 'utf8')).toBe(text)
  expect(() => remediationWorkflow(root, config, base, { ...proposal, evidenceHash: 'a'.repeat(64) }, ['docs'])).toThrow('Fresh evidence')
  expect(() => remediationWorkflow(root, config, base, proposal, ['.doc-bridge'])).toThrow('allowed roots')
  writeFileSync(join(root, 'api.ts'), 'export function changed(value: number): void {}\n')
  expect(() => remediationWorkflow(root, config, base, proposal, ['docs'])).toThrow('Fresh evidence')
})

it('exercises CLI confirmation, exact approval, real writes and Action denial', async () => {
  const { root, path, text } = fixture()
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.stubEnv('GITHUB_ACTIONS', 'false')
  const args = ['.doc-bridge/remediation.json', '--base', '.doc-bridge/base.json', '--allowed-root', 'docs', '--config', path, '--by', 'maintainer']
  expect(await runCli(['fix', 'approve', ...args])).toBe(2)
  expect(stderr.mock.calls.map(call => call[0]).join('')).toContain('Interactive human confirmation')
  expect(await runCli(['fix', 'approve', ...args, '--yes'])).toBe(0)
  expect(await runCli(['fix', 'apply', ...args, '--yes'])).toBe(0)
  expect(readFileSync(join(root, 'docs/guide.md'), 'utf8')).toContain('explicit enabled argument')
  expect(readFileSync(join(root, 'docs/guide.md'), 'utf8')).not.toBe(text)
  const fresh = fixture()
  vi.stubEnv('GITHUB_ACTIONS', 'true')
  expect(await runCli(['fix', 'approve', ...args.slice(0, -4), '--config', fresh.path, '--by', 'maintainer', '--yes'])).toBe(2)
  expect(stderr.mock.calls.map(call => call[0]).join('')).toContain('forbidden in the Action')
})

it('rolls back region writes when actual configured gates fail', () => {
  const { root, config, base, proposal, text } = fixture(false)
  const workflow = remediationWorkflow(root, config, base, proposal, ['docs'])
  const approved = approveRemediation(workflow.proposal, 'maintainer', () => true)
  expect(() => applyRemediation(root, approved, workflow.options)).toThrow('Post-apply gates failed')
  expect(readFileSync(join(root, 'docs/guide.md'), 'utf8')).toBe(text)
})

it('persists both CLI rejection targets without requiring the wrong correction to be applicable', async () => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const errors = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  vi.stubEnv('GITHUB_ACTIONS', 'false')
  for (const kind of ['finding', 'remediation'] as const) {
    const { root, config, base, proposal, text, path, finding, head } = fixture()
    const { project, sourceRevision, sourceRevisionKind, configurationHash, pipelineVersion, analyzerVersions } = head
    writeEnrichmentOverlay(root, sealEnrichmentOverlay({ type: 'enrichment-overlay', schemaVersion: 1, contentHashAlgo: 'sha256-normalized-v1', project, sourceRevision, sourceRevisionKind, configurationHash, pipelineVersion, analyzerVersions, baseSnapshotHash: head.contentHash, accepted: [], pending: [], rejected: [], stats: { byKind: {}, rejectionReasons: {}, inventedReferences: 0, agentRuns: 0, cacheHits: 0, cacheHitRate: 1, packs: 0, inputBytes: 0, outputBytes: 0, wallTimeMs: 0, expired: 0 } }))
    const wrong = { ...proposal, edits: proposal.edits.map(edit => ({ ...edit, expectedRegionHash: '0'.repeat(64) })) }
    writeFileSync(join(root, '.doc-bridge/remediation.json'), JSON.stringify(wrong))
    const decision = { type: 'decision', schemaVersion: 1, target: { kind, id: kind === 'finding' ? finding.id : proposal.id }, by: 'maintainer', reason: kind === 'finding' ? 'not-a-divergence' : 'wrong-fix', evidenceHash: proposal.evidenceHash }
    writeFileSync(join(root, '.doc-bridge/decision.json'), JSON.stringify(decision))
    expect(await runCli(['fix', 'reject', '.doc-bridge/remediation.json', '--base', '.doc-bridge/base.json', '--allowed-root', 'docs', '--config', path, '--by', 'maintainer', '--yes', '--decision', '.doc-bridge/decision.json']), errors.mock.calls.map(call => call[0]).join('')).toBe(0)
    const rejected = readEnrichmentOverlay(root)!.rejected
    expect(rejected[0]!.decision).toEqual(decision)
    expect(findingSuppressed(finding, rejected)).toBe(kind === 'finding')
    expect(() => remediationWorkflow(root, config, base, proposal, ['docs'])).toThrow()
    expect(readFileSync(join(root, 'docs/guide.md'), 'utf8')).toBe(text)
  }
})

it('refuses corrupt settled decision evidence instead of treating it as missing', () => {
  const { root, config, base, proposal } = fixture()
  mkdirSync(join(root, '.doc-bridge/enrich'))
  writeFileSync(join(root, '.doc-bridge/enrich/overlay.json'), '{}')
  expect(() => remediationWorkflow(root, config, base, proposal, ['docs'])).toThrow('Invalid settled overlay')
})
