import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { createRegistryAgentAdapter, DEFAULT_REGISTRY_AGENT_ID, loadRegistryAgentMetadata, persistRegistryAgentProposal } from '../src/agents/registry-adapter.js'
import { contentHashForArtifactV1 } from '../src/index-builder/content-hash.js'
import { DiscoverySnapshotV1Schema, ReconciliationReportV1Schema } from '../src/schemas/knowledge.js'

const config = (enabled = true, registry: Record<string, unknown> = {}) => applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } }, intelligence: { registry: { enabled, ...registry } } }))
const fixture = () => {
  const snapshot = DiscoverySnapshotV1Schema.parse({ type: 'discovery-snapshot', schemaVersion: 1, contentHash: 'a'.repeat(64), contentHashAlgo: 'sha256-normalized-v1', project: { name: 'fixture' }, sourceRevision: 'revision-1', sourceRevisionKind: 'content', configurationHash: 'b'.repeat(64), pipelineVersion: '1.0.0', analyzerVersions: { 'js-ts': '1.0.0' }, entities: [], relations: [], coverage: [] })
  const report = ReconciliationReportV1Schema.parse({ type: 'reconciliation-report', schemaVersion: 1, contentHash: 'c'.repeat(64), contentHashAlgo: 'sha256-normalized-v1', project: snapshot.project, sourceRevision: snapshot.sourceRevision, sourceRevisionKind: snapshot.sourceRevisionKind, configurationHash: snapshot.configurationHash, pipelineVersion: snapshot.pipelineVersion, analyzerVersions: snapshot.analyzerVersions, snapshotHash: snapshot.contentHash, diagnostics: [{ id: 'd1', code: 'TEST', status: 'undocumented', severity: 'warn', message: 'token=should-not-escape', evidence: [{ source: 'documentation', path: 'docs/a.md', context: 'token=hidden' }] }], summary: { entityCount: 0, relationCount: 0, diagnosticCount: 1 } })
  return { snapshot, report }
}
const agentRoot = (id = DEFAULT_REGISTRY_AGENT_ID) => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-agent-guardrails-'))
  const agentPath = join(root, 'agents', id)
  mkdirSync(agentPath, { recursive: true })
  writeFileSync(join(agentPath, 'agent.json'), JSON.stringify({ id, version: '1.0.0', provider: 'agentskit', model: 'fixture', capabilities: ['snapshot.read', 'evidence.read', 'proposal.write'] }))
  return root
}
const validProposal = (snapshot: ReturnType<typeof fixture>['snapshot'], report: ReturnType<typeof fixture>['report'], id = DEFAULT_REGISTRY_AGENT_ID) => {
  const proposal = { type: 'agent-proposal' as const, schemaVersion: 1 as const, contentHash: '0'.repeat(64), contentHashAlgo: 'sha256-normalized-v1' as const, project: snapshot.project, sourceRevision: snapshot.sourceRevision, sourceRevisionKind: snapshot.sourceRevisionKind, configurationHash: snapshot.configurationHash, pipelineVersion: '1.0.0', analyzerVersions: { agent: '1.0.0' }, proposalId: 'p1', baseSnapshotHash: snapshot.contentHash, baseReportHash: report.contentHash, relatedDiagnosticIds: ['d1'], rationale: 'Review the finding.', confidence: 0.8, evidence: [], intendedChanges: ['Update the documentation.'], origin: { kind: 'registry-agent' as const, id, version: '1.0.0', capabilities: ['proposal.write'] }, checks: ['pnpm test'] }
  return { ...proposal, contentHash: contentHashForArtifactV1(proposal) }
}

describe('AgentsKit Registry adapter', () => {
  it('requires an installed source-owned Registry agent and returns typed proposals', async () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-agent-'))
    const agentPath = join(root, 'agents', DEFAULT_REGISTRY_AGENT_ID)
    mkdirSync(agentPath, { recursive: true })
    writeFileSync(join(agentPath, 'agent.json'), JSON.stringify({ id: DEFAULT_REGISTRY_AGENT_ID, version: '1.0.0', provider: 'agentskit', model: 'fixture', capabilities: ['snapshot.read', 'evidence.read', 'proposal.write'] }))
    const { snapshot, report } = fixture()
    const adapter = createRegistryAgentAdapter(root, config(), (context) => {
      expect(Object.isFrozen(context)).toBe(true)
      expect(JSON.stringify(context)).not.toContain('token=hidden')
      return validProposal(snapshot, report)
    })
    const proposal = await adapter.run(snapshot, report)
    expect(proposal.origin.id).toBe(DEFAULT_REGISTRY_AGENT_ID)
    const saved = persistRegistryAgentProposal(join(root, '.doc-bridge', 'workflow'), proposal)
    expect(readFileSync(saved, 'utf8')).toContain(DEFAULT_REGISTRY_AGENT_ID)
  })

  it('runs a configured CLI with a JSON stdin/stdout protocol', async () => {
    const root = agentRoot()
    const { snapshot, report } = fixture()
    const proposal = validProposal(snapshot, report)
    const cliPath = join(root, 'registry-agent-cli.mjs')
    writeFileSync(cliPath, `import { readFileSync } from 'node:fs'
const input = readFileSync(0, 'utf8')
if (!input.includes('doc-bridge.registry-agent.v1')) process.exit(3)
process.stdout.write(${JSON.stringify(JSON.stringify(proposal))})
`)
    const adapter = createRegistryAgentAdapter(root, config(true, { cli: { command: process.execPath, args: [cliPath] } }), () => {
      throw new Error('local runner must not be called when CLI mode is configured')
    })
    const result = await adapter.run(snapshot, report)
    expect(result.contentHash).toBe(proposal.contentHash)
  })

  it('fails closed when the configured CLI does not return JSON', async () => {
    const root = agentRoot()
    const { snapshot, report } = fixture()
    const cliPath = join(root, 'invalid-registry-agent-cli.mjs')
    writeFileSync(cliPath, 'process.stdout.write("not-json")\n')
    const adapter = createRegistryAgentAdapter(root, config(true, { cli: { command: process.execPath, args: [cliPath] } }))
    await expect(adapter.run(snapshot, report)).rejects.toThrow('must return one JSON object')
  })

  it('fails closed when disabled, unavailable or replaced by another origin', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-agent-missing-'))
    expect(() => createRegistryAgentAdapter(root, config(false), () => ({}))).toThrow('disabled')
    expect(() => loadRegistryAgentMetadata(root, config())).toThrow('not installed')
  })

  it('replays deterministic output without rerunning the Registry agent', async () => {
    const root = agentRoot()
    const { snapshot, report } = fixture()
    let calls = 0
    const adapter = createRegistryAgentAdapter(root, config(true, { deterministic: true }), () => { calls += 1; return validProposal(snapshot, report) })
    await adapter.run(snapshot, report)
    await adapter.run(snapshot, report)
    expect(calls).toBe(1)
  })

  it('enforces timeout and response budgets', async () => {
    const root = agentRoot()
    const { snapshot, report } = fixture()
    const slow = createRegistryAgentAdapter(root, config(true, { timeoutMs: 5 }), () => new Promise((resolve) => setTimeout(() => resolve(validProposal(snapshot, report)), 25)))
    await expect(slow.run(snapshot, report)).rejects.toThrow('timed out')
    const large = createRegistryAgentAdapter(root, config(true, { maxResponseBytes: 20 }), () => ({ oversized: 'x'.repeat(100) }))
    await expect(large.run(snapshot, report)).rejects.toThrow('response limit')
  })

  it('enforces concurrency limits', async () => {
    const root = agentRoot()
    const { snapshot, report } = fixture()
    let release: (() => void) | undefined
    const adapter = createRegistryAgentAdapter(root, config(true, { deterministic: false, maxConcurrency: 1 }), () => new Promise((resolve) => { release = () => resolve(validProposal(snapshot, report)) }))
    const first = adapter.run(snapshot, report)
    await expect(adapter.run(snapshot, report)).rejects.toThrow('concurrency limit')
    release?.()
    await first
  })
})
