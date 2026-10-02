import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { killProcessTree } from '@agentskit/cross-platform'
import { NetErrorCodes } from '@agentskit/net'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { createRegistryAgentAdapter, DEFAULT_REGISTRY_AGENT_ID, loadRegistryAgentMetadata, persistRegistryAgentProposal } from '../src/agents/registry-adapter.js'
import { DocumentationAuditReportV1Schema } from '../src/audit/documentation.js'
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
  const proposal = { type: 'agent-proposal' as const, schemaVersion: 1 as const, contentHash: '0'.repeat(64), contentHashAlgo: 'sha256-normalized-v1' as const, project: snapshot.project, sourceRevision: snapshot.sourceRevision, sourceRevisionKind: snapshot.sourceRevisionKind, configurationHash: snapshot.configurationHash, pipelineVersion: '1.0.0', analyzerVersions: { agent: '1.0.0' }, proposalId: 'p1', baseSnapshotHash: snapshot.contentHash, baseReportHash: report.contentHash, relatedDiagnosticIds: ['d1'], rationale: 'Review the finding.', confidence: 0.8, evidence: report.diagnostics[0]!.evidence, intendedChanges: ['Update the documentation.'], origin: { kind: 'registry-agent' as const, id, version: '1.0.0', capabilities: ['proposal.write'] }, checks: ['pnpm test'] }
  return { ...proposal, contentHash: contentHashForArtifactV1(proposal) }
}
const documentationAudit = (snapshot: ReturnType<typeof fixture>['snapshot'], report: ReturnType<typeof fixture>['report']) => DocumentationAuditReportV1Schema.parse({
  type: 'documentation-audit-report', schemaVersion: 1, contentHash: 'd'.repeat(64), contentHashAlgo: 'sha256-normalized-v1',
  project: snapshot.project, sourceRevision: snapshot.sourceRevision, sourceRevisionKind: snapshot.sourceRevisionKind,
  configurationHash: snapshot.configurationHash, pipelineVersion: snapshot.pipelineVersion, analyzerVersions: snapshot.analyzerVersions,
  snapshotHash: snapshot.contentHash, reconciliationHash: report.contentHash, status: 'needs-review',
  findings: [{ id: 'f1'.padEnd(64, '0'), code: 'DOCUMENTATION_SEMANTICS_NOT_ANALYZED', category: 'limitation', status: 'not-analyzed', severity: 'info', confidence: 'low', blocking: false, message: 'Review required.', evidence: [{ source: 'documentation', path: 'docs/a.md' }] }],
  metrics: {
    documentCount: 1, generatedDocumentCount: 0, packageCount: 0, coveredPackageCount: 0, coverageRate: null,
    documentsWithTitle: 1, titleRate: 1, documentsWithExamples: 0, examplesRate: 0, documentsMeetingRequiredSections: 0, requiredSectionsRate: 0,
    exactDuplicateGroups: 0, structureGapCount: 0, contradictionCount: 0, staleCount: 0, notAnalyzedCount: 1, blockingCount: 0,
    tierCounts: { 'tier-0': 0, 'tier-1': 0, 'tier-2': 1 }, criticalDocumentCount: 0, criticalDocumentsWithOwner: 0,
    criticalDocumentsWithLifecycle: 0, criticalDocumentsWithSourceOfTruth: 0, criticalDocumentsWithValidationPath: 0,
    dimensionStatus: {
      correctness: { validated: 0, partial: 0, 'not-analyzed': 1 }, completeness: { validated: 0, partial: 0, 'not-analyzed': 1 },
      clarity: { validated: 0, partial: 0, 'not-analyzed': 1 }, agentEfficiency: { validated: 0, partial: 0, 'not-analyzed': 1 },
      maintainability: { validated: 0, partial: 0, 'not-analyzed': 1 },
    },
  },
  documentAssessments: [], generatedDocuments: [], limitations: ['Semantic review is pending.'],
})

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

  it('rejects proposals that are not grounded in supplied diagnostics and evidence', async () => {
    const root = agentRoot()
    const { snapshot, report } = fixture()
    const adapter = createRegistryAgentAdapter(root, config(), () => {
      const proposal = validProposal(snapshot, report)
      return { ...proposal, relatedDiagnosticIds: ['missing-diagnostic'], contentHash: contentHashForArtifactV1({ ...proposal, relatedDiagnosticIds: ['missing-diagnostic'], contentHash: '0'.repeat(64) }) }
    })
    await expect(adapter.run(snapshot, report)).rejects.toThrow('unknown diagnostic')
  })

  it('supports an alternate installed Registry agent without changing the adapter contract', async () => {
    const alternate = 'alternate-doc-reviewer'
    const root = agentRoot(alternate)
    const { snapshot, report } = fixture()
    const adapter = createRegistryAgentAdapter(root, config(true, { agentId: alternate }), () => validProposal(snapshot, report, alternate))
    expect((await adapter.run(snapshot, report)).origin.id).toBe(alternate)
  })

  it('binds documentation-audit evidence when the agent is asked to review documentation', async () => {
    const root = agentRoot()
    const { snapshot, report } = fixture()
    const documentation = documentationAudit(snapshot, report)
    const adapter = createRegistryAgentAdapter(root, config(), (context) => {
      expect(context.documentation?.contentHash).toBe(documentation.contentHash)
      const base = validProposal(snapshot, report)
      const proposal = {
        ...base,
        baseDocumentationAuditHash: documentation.contentHash,
        relatedDiagnosticIds: [documentation.findings[0]!.id],
        evidence: documentation.findings[0]!.evidence,
      }
      return { ...proposal, contentHash: contentHashForArtifactV1({ ...proposal, contentHash: '0'.repeat(64) }) }
    })
    const proposal = await adapter.run(snapshot, report, undefined, documentation)
    expect(proposal.baseDocumentationAuditHash).toBe(documentation.contentHash)
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

  it('passes a separate deadline signal that closes a real HTTP request', async () => {
    const root = agentRoot()
    const { snapshot, report } = fixture()
    let requestSeenResolve: () => void = () => {}
    let responseClosedResolve: () => void = () => {}
    const requestSeen = new Promise<void>((resolve) => { requestSeenResolve = resolve })
    const responseClosed = new Promise<void>((resolve) => { responseClosedResolve = resolve })
    const server = createServer((request, response) => {
      requestSeenResolve()
      if (request.url === '/recover') {
        response.end('ok')
        return
      }
      response.on('close', responseClosedResolve)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a localhost TCP server address.')
    try {
      let calls = 0
      const adapter = createRegistryAgentAdapter(root, config(true, { timeoutMs: 200, deterministic: false }), (context, options) => {
        expect(Object.isFrozen(context)).toBe(true)
        expect('signal' in context).toBe(false)
        expect(options?.signal).toBeInstanceOf(AbortSignal)
        const path = calls++ === 0 ? '/wait' : '/recover'
        return fetch(`http://127.0.0.1:${address.port}${path}`, { signal: options?.signal }).then(() => validProposal(snapshot, report))
      })
      const pending = adapter.run(snapshot, report)
      await requestSeen
      await expect(pending).rejects.toMatchObject({ code: NetErrorCodes.AK_NET_TIMEOUT, message: 'Registry agent timed out after 200ms.' })
      await responseClosed
      await expect(adapter.run(snapshot, report)).resolves.toMatchObject({ contentHash: validProposal(snapshot, report).contentHash })
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      rmSync(root, { recursive: true, force: true })
    }
  }, 10_000)

  it('keeps enrichment capacity reserved until an uncooperative runner settles', async () => {
    const root = agentRoot()
    let calls = 0
    let settle: (() => void) | undefined
    const adapter = createRegistryAgentAdapter(root, config(true, { timeoutMs: 20, deterministic: false, maxConcurrency: 1 }), () => {
      calls += 1
      if (calls === 1) return new Promise((resolve) => { settle = () => resolve({ proposals: [{ kind: 'late' }] }) })
      return { proposals: [{ kind: 'recovered' }] }
    })
    const bounded = createRegistryAgentAdapter(root, config(true, { maxInputBytes: 16 }), () => ({ proposals: [] }))
    try {
      await expect(bounded.enrich('curate', [{ text: 'x'.repeat(100) }])).rejects.toThrow('input limit')
      const first = adapter.enrich('curate', [])
      await expect(first).rejects.toMatchObject({ code: NetErrorCodes.AK_NET_TIMEOUT, message: 'Registry agent timed out after 20ms.' })
      await expect(adapter.enrich('curate', [])).rejects.toThrow('concurrency limit')
      settle?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await expect(adapter.enrich('curate', [])).resolves.toEqual([{ kind: 'recovered' }])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('preserves UTF-8 when a CLI splits JSON bytes across stdout chunks', async () => {
    const root = agentRoot()
    const cliPath = join(root, 'split-utf8-cli.mjs')
    const output = JSON.stringify({ proposals: [{ fact: 'café' }] })
    writeFileSync(cliPath, `const output = Buffer.from(${JSON.stringify(output)})
const split = output.indexOf(Buffer.from('é')) + 1
process.stdout.write(output.subarray(0, split))
setTimeout(() => process.stdout.write(output.subarray(split)), 20)
`)
    try {
      const adapter = createRegistryAgentAdapter(root, config(true, { cli: { command: process.execPath, args: [cliPath] } }))
      await expect(adapter.enrich('curate', [])).resolves.toEqual([{ fact: 'café' }])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('kills CLI child trees on deadline and output overflow, then recovers', async () => {
    const root = agentRoot()
    const cliPath = join(root, 'registry-agent-cli.mjs')
    const childPidPath = join(root, 'child.pid')
    const modePath = join(root, 'mode.txt')
    const childPids: number[] = []
    writeFileSync(modePath, 'hang')
    writeFileSync(cliPath, `import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
const mode = readFileSync(${JSON.stringify(modePath)}, 'utf8')
if (mode === 'success') {
  process.stdout.write(JSON.stringify({ proposals: [{ kind: 'recovered' }] }))
} else {
  const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  writeFileSync(${JSON.stringify(childPidPath)}, String(child.pid))
  process.on('SIGTERM', () => {})
  if (mode === 'large') process.stdout.write('x'.repeat(1024))
  setInterval(() => {}, 1000)
}
`)
    const expectExit = async (pid: number): Promise<void> => {
      const deadline = Date.now() + 3_000
      while (Date.now() < deadline) {
        try { process.kill(pid, 0) } catch { return }
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      throw new Error(`Child process ${pid} remained alive.`)
    }
    try {
      const adapter = createRegistryAgentAdapter(root, config(true, {
        timeoutMs: 250,
        deterministic: false,
        maxResponseBytes: 64,
        cli: { command: process.execPath, args: [cliPath] },
      }))
      await expect(adapter.enrich('curate', [])).rejects.toMatchObject({ code: NetErrorCodes.AK_NET_TIMEOUT, message: 'Registry agent CLI timed out after 250ms.' })
      childPids.push(Number(readFileSync(childPidPath, 'utf8')))
      await expectExit(childPids[0]!)

      writeFileSync(modePath, 'large')
      await expect(adapter.enrich('curate', [])).rejects.toThrow('response limit 64 bytes exceeded')
      childPids.push(Number(readFileSync(childPidPath, 'utf8')))
      await expectExit(childPids[1]!)

      writeFileSync(modePath, 'success')
      await expect(adapter.enrich('curate', [])).resolves.toEqual([{ kind: 'recovered' }])
    } finally {
      for (const pid of childPids) await killProcessTree(pid, 'SIGKILL')
      rmSync(root, { recursive: true, force: true })
    }
  }, 10_000)

  it('keeps CLI input and stderr bounded and reports startup and stdin failures', async () => {
    const root = agentRoot()
    const missing = createRegistryAgentAdapter(root, config(true, { cli: { command: join(root, 'missing'), args: [] } }))
    const oversizedInput = createRegistryAgentAdapter(root, config(true, { maxInputBytes: 1, cli: { command: process.execPath, args: [] } }))
    const stdinPath = join(root, 'stdin-fails.mjs')
    const stdinPidPath = join(root, 'stdin-child.pid')
    const stderrPath = join(root, 'large-stderr.mjs')
    writeFileSync(stdinPath, `import { closeSync, writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(stdinPidPath)}, String(process.pid))
closeSync(0)
setInterval(() => {}, 1000)
`)
    writeFileSync(stderrPath, 'process.stderr.write("e".repeat(1024)); process.exit(1)\n')
    try {
      await expect(missing.enrich('curate', [])).rejects.toThrow('failed to start')
      await expect(oversizedInput.enrich('curate', [])).rejects.toThrow('input limit')
      const stdinFailure = createRegistryAgentAdapter(root, config(true, { timeoutMs: 2_000, maxInputBytes: 5_000_000, cli: { command: process.execPath, args: [stdinPath] } }))
      await expect(stdinFailure.enrich('curate', [{ value: 'x'.repeat(4_000_000) }])).rejects.toThrow('stdin failed')
      const stderrFailure = createRegistryAgentAdapter(root, config(true, { maxResponseBytes: 64, cli: { command: process.execPath, args: [stderrPath] } }))
      await expect(stderrFailure.enrich('curate', [])).rejects.toThrow('exited with code 1')
      await expect(stderrFailure.enrich('curate', [])).rejects.toThrow(new RegExp(`e{64}$`))
    } finally {
      try { await killProcessTree(Number(readFileSync(stdinPidPath, 'utf8')), 'SIGKILL') } catch { /* The child may not have started. */ }
      rmSync(root, { recursive: true, force: true })
    }
  }, 10_000)
})
