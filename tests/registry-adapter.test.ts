import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { createRegistryAgentAdapter, DEFAULT_REGISTRY_AGENT_ID, loadRegistryAgentMetadata, persistRegistryAgentProposal } from '../src/agents/registry-adapter.js'
import { contentHashForArtifactV1 } from '../src/index-builder/content-hash.js'
import { DiscoverySnapshotV1Schema, ReconciliationReportV1Schema } from '../src/schemas/knowledge.js'

const config = (enabled = true) => applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } }, intelligence: { registry: { enabled } } }))
const fixture = () => {
  const snapshot = DiscoverySnapshotV1Schema.parse({ type: 'discovery-snapshot', schemaVersion: 1, contentHash: 'a'.repeat(64), contentHashAlgo: 'sha256-normalized-v1', project: { name: 'fixture' }, sourceRevision: 'revision-1', sourceRevisionKind: 'content', configurationHash: 'b'.repeat(64), pipelineVersion: '1.0.0', analyzerVersions: { 'js-ts': '1.0.0' }, entities: [], relations: [], coverage: [] })
  const report = ReconciliationReportV1Schema.parse({ type: 'reconciliation-report', schemaVersion: 1, contentHash: 'c'.repeat(64), contentHashAlgo: 'sha256-normalized-v1', project: snapshot.project, sourceRevision: snapshot.sourceRevision, sourceRevisionKind: snapshot.sourceRevisionKind, configurationHash: snapshot.configurationHash, pipelineVersion: snapshot.pipelineVersion, analyzerVersions: snapshot.analyzerVersions, snapshotHash: snapshot.contentHash, diagnostics: [{ id: 'd1', code: 'TEST', status: 'undocumented', severity: 'warn', message: 'token=should-not-escape', evidence: [{ source: 'documentation', path: 'docs/a.md', context: 'token=hidden' }] }], summary: { entityCount: 0, relationCount: 0, diagnosticCount: 1 } })
  return { snapshot, report }
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
      const proposal = { type: 'agent-proposal' as const, schemaVersion: 1 as const, contentHash: '0'.repeat(64), contentHashAlgo: 'sha256-normalized-v1' as const, project: snapshot.project, sourceRevision: snapshot.sourceRevision, sourceRevisionKind: snapshot.sourceRevisionKind, configurationHash: snapshot.configurationHash, pipelineVersion: '1.0.0', analyzerVersions: { agent: '1.0.0' }, proposalId: 'p1', baseSnapshotHash: snapshot.contentHash, baseReportHash: report.contentHash, relatedDiagnosticIds: ['d1'], rationale: 'Review the finding.', confidence: 0.8, evidence: [], intendedChanges: ['Update the documentation.'], origin: { kind: 'registry-agent' as const, id: DEFAULT_REGISTRY_AGENT_ID, version: '1.0.0', capabilities: ['proposal.write'] }, checks: ['pnpm test'] }
      return { ...proposal, contentHash: contentHashForArtifactV1(proposal) }
    })
    const proposal = await adapter.run(snapshot, report)
    expect(proposal.origin.id).toBe(DEFAULT_REGISTRY_AGENT_ID)
    const saved = persistRegistryAgentProposal(join(root, '.doc-bridge', 'workflow'), proposal)
    expect(readFileSync(saved, 'utf8')).toContain(DEFAULT_REGISTRY_AGENT_ID)
  })

  it('fails closed when disabled, unavailable or replaced by another origin', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-agent-missing-'))
    expect(() => createRegistryAgentAdapter(root, config(false), () => ({}))).toThrow('disabled')
    expect(() => loadRegistryAgentMetadata(root, config())).toThrow('not installed')
  })
})
