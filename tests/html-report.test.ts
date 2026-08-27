import { describe, expect, it } from 'vitest'

import { renderOfflineReport } from '../src/report/html.js'
import { DiscoverySnapshotV1Schema, ReconciliationReportV1Schema } from '../src/schemas/knowledge.js'

const hash = (character: string): string => character.repeat(64)

const artifacts = () => {
  const snapshot = DiscoverySnapshotV1Schema.parse({
    type: 'discovery-snapshot',
    schemaVersion: 1,
    contentHash: hash('a'),
    contentHashAlgo: 'sha256-normalized-v1',
    project: { name: 'HTML fixture', root: '.' },
    sourceRevision: 'revision-1',
    sourceRevisionKind: 'content',
    configurationHash: hash('b'),
    pipelineVersion: '1.0.0',
    analyzerVersions: { 'js-ts': '1.0.0' },
    entities: [
      { id: 'module:a', kind: 'module', name: 'A <unsafe>', provenance: 'observed', evidence: [{ source: 'code', path: 'src/a.ts', lineStart: 1 }] },
      { id: 'module:b', kind: 'module', name: 'B', provenance: 'observed', evidence: [{ source: 'code', path: 'src/b.ts', lineStart: 1 }] },
    ],
    relations: [{ id: 'relation:a-b', kind: 'imports', from: 'module:a', to: 'module:b', provenance: 'observed', evidence: [{ source: 'code', path: 'src/a.ts', lineStart: 4, lineEnd: 5 }] }],
    coverage: [{ analyzer: 'js-ts', scope: 'dynamic-imports', status: 'not-analyzed', reason: 'Dynamic imports are not resolved.' }],
  })
  const report = ReconciliationReportV1Schema.parse({
    type: 'reconciliation-report',
    schemaVersion: 1,
    contentHash: hash('c'),
    contentHashAlgo: 'sha256-normalized-v1',
    project: snapshot.project,
    sourceRevision: snapshot.sourceRevision,
    sourceRevisionKind: snapshot.sourceRevisionKind,
    configurationHash: snapshot.configurationHash,
    pipelineVersion: snapshot.pipelineVersion,
    analyzerVersions: snapshot.analyzerVersions,
    snapshotHash: snapshot.contentHash,
    diagnostics: [{ id: 'diagnostic:one', code: 'RELATION_UNDOCUMENTED', status: 'undocumented', severity: 'warn', message: 'A <unsafe> is undocumented', evidence: [{ source: 'code', path: 'src/a.ts', lineStart: 4, lineEnd: 5, context: 'secret snippet' }], relationIds: ['relation:a-b'] }],
    summary: { entityCount: 2, relationCount: 1, diagnosticCount: 1 },
  })
  return { snapshot, report }
}

describe('offline HTML report', () => {
  it('renders deterministic architecture and diagnostic lenses without external assets', () => {
    const input = artifacts()
    const html = renderOfflineReport(input)

    expect(html).toContain('Architecture map')
    expect(html).toContain('Diagnostic lens')
    expect(html).toContain('src/a.ts:4-5')
    expect(html).toContain('dynamic-imports')
    expect(html).toContain('id="entity-module-a"')
    expect(html).toContain('id="relation-relation-a-b"')
    expect(html).toContain('id="diagnostic-diagnostic-one"')
    expect(html).toContain('search')
    expect(html).not.toContain('secret snippet')
    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=/i)
    expect(html).not.toContain('https://')
    expect(renderOfflineReport(input)).toBe(html)
  })

  it('allows evidence context only with explicit snippet opt-in and escapes content', () => {
    const input = artifacts()
    const redacted = renderOfflineReport(input)
    const detailed = renderOfflineReport(input, { includeSnippets: true })

    expect(redacted).toContain('A &lt;unsafe&gt;')
    expect(redacted).not.toContain('secret snippet')
    expect(detailed).toContain('secret snippet')
    expect(detailed).not.toContain('<unsafe>')
  })

  it('renders actionable error pages for malformed or mismatched artifacts', () => {
    expect(renderOfflineReport({})).toContain('Doc Bridge report unavailable')
    expect(renderOfflineReport({ snapshot: artifacts().snapshot, report: { ...artifacts().report, snapshotHash: hash('d') } })).toContain('does not match')
  })
})
