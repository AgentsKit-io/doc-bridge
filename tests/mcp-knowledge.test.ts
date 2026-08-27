import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { applyDocumentationDeclarations } from '../src/discovery/documentation.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'
import { handleMcpRequest } from '../src/mcp/server.js'
import { sha256NormalizedV1 } from '../src/index-builder/content-hash.js'
import { loadWorkflowStepOutput, runWorkflow } from '../src/workflow/engine.js'

const call = (ctx: { root: string; config: ReturnType<typeof applyConfigDefaults> }, name: string, args: Record<string, unknown> = {}): unknown => {
  const response = handleMcpRequest(ctx, { method: 'tools/call', params: { name, arguments: args } }) as { content: { text: string }[] }
  return JSON.parse(response.content[0]?.text ?? '{}') as unknown
}

describe('MCP knowledge parity', () => {
  it('returns the same canonical snapshot/report/run artifacts exposed by the CLI', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-mcp-knowledge-'))
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'mcp-fixture' }))
    writeFileSync(join(root, 'src.ts'), "import './dep.js'\n")
    writeFileSync(join(root, 'dep.ts'), 'export const dep = 1\n')
    writeFileSync(join(root, 'docs', 'guide.md'), '# Guide\n')
    const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } }))
    const observed = discoverRepository({ root, config })
    const declared = applyDocumentationDeclarations(observed, [{ path: 'docs/guide.md', content: '# Guide\n' }]).snapshot
    const report = reconcileKnowledge(observed, declared)
    const workflow = (stage: 'collect' | 'normalize' | 'reconcile', handler: (input: unknown) => unknown) => runWorkflow({ root, sourceRevision: observed.sourceRevision, configurationHash: sha256NormalizedV1(config), stage, handlers: { [stage]: ({ input }) => handler(input) } })
    workflow('collect', () => observed)
    workflow('normalize', (input) => input)
    const result = workflow('reconcile', () => report)
    const ctx = { root, config }

    expect(call(ctx, 'docbridge.snapshot')).toEqual(loadWorkflowStepOutput(result.stateDir, 'normalize'))
    expect(call(ctx, 'docbridge.report')).toEqual(report)
    expect(call(ctx, 'docbridge.diagnostics')).toMatchObject({ reportHash: report.contentHash, diagnostics: report.diagnostics })
    expect(call(ctx, 'docbridge.relations')).toMatchObject({ snapshotHash: observed.contentHash, relations: observed.relations })
    expect(call(ctx, 'docbridge.run')).toMatchObject({ runId: result.run.runId, state: result.run.state })
    expect(call(ctx, 'docbridge.proposals')).toEqual({ runId: result.run.runId, proposals: [] })
  })

  it('fails closed for missing artifacts, invalid arguments and approval shortcuts', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-mcp-missing-'))
    const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } }))
    const ctx = { root, config }
    expect(() => call(ctx, 'docbridge.run')).toThrow()
    expect(() => call(ctx, 'docbridge.diagnostics', { severity: 42 })).toThrow('invalid arguments')
    expect(() => call(ctx, 'docbridge.proposals', { action: 'approve', proposalHash: 'a'.repeat(64) })).toThrow('approval is unavailable')
  })
})
