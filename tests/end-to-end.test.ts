import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { applyDocumentationDeclarations } from '../src/discovery/documentation.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { createArtifactNormalizationProposal, approveFixProposal, applyFixProposal } from '../src/fixes/proposals.js'
import { renderOfflineReport } from '../src/report/html.js'
import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'
import { loadWorkflowStepOutput, runWorkflow } from '../src/workflow/engine.js'

describe('Knowledge Engine end-to-end proof', () => {
  it('keeps architecture, documentation drift, workflow recovery, HTML and approved fixes on one canonical path', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-e2e-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'chaotic-fixture' }))
    writeFileSync(join(root, 'src.ts'), "import './dep.js'\n")
    writeFileSync(join(root, 'dep.ts'), 'export const dep = 1\n')
    writeFileSync(join(root, 'docs.md'), ['---', 'docbridge:', '  relations:', '    - from: module:dep.ts', '      to: module:src.ts', '      kind: imports', '      detection: static', '---', '# Architecture'].join('\n'))
    writeFileSync(join(root, 'metadata.json'), '{"z":1,"a":2}')
    const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } }))
    const observed = discoverRepository({ root, config })
    const declared = applyDocumentationDeclarations(observed, [{ path: 'docs.md', content: readFileSync(join(root, 'docs.md'), 'utf8') }]).snapshot
    const report = reconcileKnowledge(observed, declared)
    expect(report.diagnostics.some((diagnostic) => diagnostic.status === 'undocumented')).toBe(true)
    expect(report.diagnostics.some((diagnostic) => diagnostic.status === 'stale-or-unverified')).toBe(true)

    const workflow = runWorkflow({ root, sourceRevision: observed.sourceRevision, configurationHash: observed.configurationHash, stage: 'all', handlers: {
      collect: () => observed,
      normalize: ({ input }) => input,
      reconcile: () => report,
      evaluate: () => ({ ok: true }),
      report: ({ input }) => input,
    } })
    const resumed = runWorkflow({ root, sourceRevision: observed.sourceRevision, configurationHash: observed.configurationHash, stage: 'all', handlers: {
      collect: () => observed,
      normalize: ({ input }) => input,
      reconcile: () => report,
      evaluate: () => ({ ok: true }),
      report: ({ input }) => input,
    } })
    expect(resumed.reusedStages.length).toBeGreaterThan(0)
    expect(loadWorkflowStepOutput(workflow.stateDir, 'reconcile')).toEqual(report)
    expect(renderOfflineReport({ snapshot: observed, report })).toContain('Architecture map')

    const proposal = createArtifactNormalizationProposal(root, 'metadata.json', { baseRevision: observed.sourceRevision, configurationHash: observed.configurationHash })
    expect(proposal).toBeDefined()
    const applied = applyFixProposal(root, approveFixProposal(proposal, 'human'), { currentRevision: observed.sourceRevision })
    expect(applied.status).toBe('applied')
    expect(readFileSync(join(root, 'metadata.json'), 'utf8')).toContain('"a": 2')
  })
})
