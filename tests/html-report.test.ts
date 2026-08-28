import { describe, expect, it } from 'vitest'

import { renderOfflineReport, renderOfflineReportArtifact } from '../src/report/html.js'
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
      { id: 'package:core', kind: 'package', name: '@fixture/core', path: 'packages/core', provenance: 'observed', evidence: [{ source: 'configuration', path: 'packages/core/package.json', lineStart: 1 }] },
      { id: 'package:ui', kind: 'package', name: '@fixture/ui', path: 'packages/ui', provenance: 'observed', evidence: [{ source: 'configuration', path: 'packages/ui/package.json', lineStart: 1 }] },
      { id: 'module:a', kind: 'module', name: 'A <unsafe>', provenance: 'observed', evidence: [{ source: 'code', path: 'src/a.ts', lineStart: 1 }] },
      { id: 'module:b', kind: 'module', name: 'B', provenance: 'observed', evidence: [{ source: 'code', path: 'src/b.ts', lineStart: 1 }] },
    ],
    relations: [
      { id: 'relation:core-a', kind: 'contains', from: 'package:core', to: 'module:a', provenance: 'observed', evidence: [{ source: 'configuration', path: 'packages/core/package.json', lineStart: 1 }] },
      { id: 'relation:ui-b', kind: 'contains', from: 'package:ui', to: 'module:b', provenance: 'observed', evidence: [{ source: 'configuration', path: 'packages/ui/package.json', lineStart: 1 }] },
      { id: 'relation:a-b', kind: 'imports', from: 'module:a', to: 'module:b', provenance: 'observed', evidence: [{ source: 'code', path: 'src/a.ts', lineStart: 4, lineEnd: 5 }] },
    ],
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
  it('renders deterministic lenses and an interactive read-only graph without external assets', () => {
    const input = artifacts()
    const html = renderOfflineReport(input)

    expect(html).toContain('Architecture map')
    expect(html).toContain('Jest-like diagnostics')
    expect(html).toContain('Documentation drift')
    expect(html).toContain('Risks &amp; hotspots')
    expect(html).toContain('Evidence')
    expect(html).toContain('id="graph"')
    expect(html).toContain('group:core')
    expect(html).toContain('memberCount')
    expect(html).toContain('findingGroups')
    expect(html).toContain('data-finding-page')
    expect(html).toContain('relationIds')
    expect(html).not.toContain('findings.slice(0,300)')
    expect(html).toContain('data-lens="architecture"')
    expect(html).toContain('data-level="overview"')
    expect(html).toContain('document.addEventListener("dblclick"')
    expect(html).toContain('preserveAspectRatio",dense?"xMinYMin meet":"xMidYMid meet"')
    expect(html).not.toContain('if(event.detail>=2){enterNode')
    expect(html).toContain('Read-only snapshot')
    expect(html).toContain('heuristic')
    expect(html).toContain('dynamic-imports')
    expect(html).toContain('src/a.ts')
    const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/i)?.[1]
    expect(script).toBeDefined()
    expect(() => new Function(script as string)).not.toThrow()
    expect(html).not.toContain('secret snippet')
    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=/i)
    expect(html).not.toContain('https://')
    expect(renderOfflineReport(input)).toBe(html)
  })

  it('keeps small reports single-file and packages large reports into local chunks', () => {
    const input = artifacts()
    const single = renderOfflineReportArtifact(input)
    expect(single.mode).toBe('single-file')
    expect(Object.keys(single.files)).toEqual(['index.html'])

    const packaged = renderOfflineReportArtifact(input, { thresholdBytes: 1 })
    expect(packaged.mode).toBe('directory')
    const fileNames = Object.keys(packaged.files)
    expect(fileNames).toContain('chunks/overview.js')
    expect(fileNames).toContain('chunks/findings.js')
    expect(fileNames.filter((name) => name.startsWith('chunks/levels-')).length).toBeGreaterThan(0)
    expect(fileNames).not.toContain('chunks/levels.js')
    expect(packaged.files['index.html']).toContain('__DOC_BRIDGE_LAZY_CHUNKS__')
    expect(packaged.files['index.html']).toContain('__DOC_BRIDGE_HAS_LEVEL_CHUNKS__=true')
    expect(packaged.files['index.html']).toContain('__DOC_BRIDGE_LAZY_CHUNKS__=["chunks/findings.js"]')
    expect(packaged.files['index.html']).toContain('chunks/findings.js')
    expect(packaged.files['index.html']).toContain('src="chunks/overview.js"')
    expect(packaged.files['index.html']).not.toContain('src="chunks/levels-')
    expect(packaged.files['index.html']).not.toContain('src="chunks/findings.js"')
    expect(packaged.files['chunks/overview.js']).toContain('levelChunks')
    expect(Object.entries(packaged.files).some(([name, content]) => name.startsWith('chunks/levels-') && content.includes('__DOC_BRIDGE_LEVEL_PAYLOAD__'))).toBe(true)
    expect(Object.entries(packaged.files).some(([name, content]) => name.startsWith('chunks/levels-package-') && !content.includes('"evidence"'))).toBe(true)
    expect(Object.entries(packaged.files).some(([name, content]) => name.startsWith('chunks/details-') && content.includes('"evidence"'))).toBe(true)
    expect(packaged.manifest).toContain('configurationHash')
    expect(packaged.manifest).toContain('"thresholdBytes": 1')
  })

  it('uses UTF-8 bytes for the artifact threshold', () => {
    const input = artifacts()
    const unicodeInput = { ...input, snapshot: { ...input.snapshot, project: { name: '🧭 report', root: '.' } } }
    const html = renderOfflineReport(unicodeInput)
    expect(renderOfflineReportArtifact(unicodeInput, { thresholdBytes: html.length }).mode).toBe('directory')
  })

  it('starts monorepo topology at applications and shared packages', () => {
    const input = artifacts()
    const snapshot = {
      ...input.snapshot,
      entities: input.snapshot.entities.map((entity) => entity.id === 'package:core'
        ? { ...entity, path: 'apps/console' }
        : entity.id === 'package:ui' ? { ...entity, path: 'packages/ui' } : entity),
    }
    const html = renderOfflineReport({ ...input, snapshot })
    expect(html).toContain('group:app:console')
    expect(html).toContain('group:shared-packages')
    expect(html).toContain('Console app')
  })

  it('keeps external dependencies out of the architecture overview', () => {
    const input = artifacts()
    const snapshot = {
      ...input.snapshot,
      entities: [
        ...input.snapshot.entities,
        { id: 'external:react', kind: 'external', name: 'react', provenance: 'observed' as const, evidence: [{ source: 'configuration' as const, path: 'package.json', lineStart: 1 }] },
      ],
      relations: [
        ...input.snapshot.relations,
        { id: 'relation:core-react', kind: 'depends-on', from: 'package:core', to: 'external:react', provenance: 'observed' as const, evidence: [{ source: 'configuration' as const, path: 'package.json', lineStart: 1 }] },
      ],
    }
    const html = renderOfflineReport({ ...input, snapshot })
    const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/i)?.[1] ?? ''
    const payload = JSON.parse(script.match(/const data=(\{[\s\S]*\});\ndata\.entities/)?.[1] ?? '{}')

    expect(payload.view.overview.nodes).not.toContainEqual(expect.objectContaining({ kind: 'external' }))
    expect(payload.view.overview.edges).not.toContainEqual(expect.objectContaining({ to: 'group:external-dependencies' }))
  })

  it('allows evidence context only with explicit snippet opt-in and escapes content', () => {
    const input = artifacts()
    const redacted = renderOfflineReport(input)
    const detailed = renderOfflineReport(input, { includeSnippets: true })

    expect(redacted).toContain('A \\u003cunsafe>')
    expect(redacted).not.toContain('secret snippet')
    expect(detailed).toContain('secret snippet')
    expect(detailed).not.toContain('<unsafe>')
  })

  it('anonymizes every report payload while preserving topology and counts', () => {
    const input = artifacts()
    const html = renderOfflineReport(input, { privacy: 'anonymized', includeSnippets: true })
    const artifact = renderOfflineReportArtifact(input, { privacy: 'anonymized', thresholdBytes: 1 })
    const publicFiles = Object.values(artifact.files).join('\n')

    for (const content of [html, publicFiles]) {
      expect(content).toContain('Anonymized repository')
      expect(content).toContain('group:001')
      expect(content).not.toContain('HTML fixture')
      expect(content).not.toContain('@fixture/core')
      expect(content).not.toContain('packages/core')
      expect(content).not.toContain('src/a.ts')
      expect(content).not.toContain('revision-1')
      expect(content).not.toContain('secret snippet')
      expect(content).not.toContain('A &lt;unsafe&gt;')
    }
    expect(publicFiles).toContain('"count":1')
    expect(publicFiles).toContain('"kinds":["imports"]')
    expect(publicFiles).toContain('"entityGroup"')
    expect(artifact.manifest).toContain('"sourceRevision": "redacted"')
    expect(artifact.manifest).not.toContain('revision-1')
  })

  it('keeps every relation endpoint in the canonical graph data for large snapshots', () => {
    const input = artifacts()
    const entities = Array.from({ length: 205 }, (_, index) => ({
      id: `module:${index}`,
      kind: 'module' as const,
      name: `Module ${index}`,
      provenance: 'observed' as const,
      evidence: [{ source: 'code' as const, path: `src/${index}.ts` }],
    }))
    const snapshot = DiscoverySnapshotV1Schema.parse({
      ...input.snapshot,
      entities,
      relations: [{ ...input.snapshot.relations[2], from: 'module:0', to: 'module:204' }],
    })
    const report = ReconciliationReportV1Schema.parse({
      ...input.report,
      project: snapshot.project,
      snapshotHash: snapshot.contentHash,
      diagnostics: [],
      summary: { entityCount: 205, relationCount: 1, diagnosticCount: 0 },
    })
    const html = renderOfflineReport({ snapshot, report })

    expect(html).toContain('module:204')
    expect(html).toContain('relation:a-b')
    expect(html).toContain('data-level="file"')
  })

  it('uses compact client rendering for enterprise-sized reports', () => {
    const input = artifacts()
    const entities = Array.from({ length: 501 }, (_, index) => ({
      id: `module:${index}`,
      kind: 'module' as const,
      name: `Module ${index}`,
      provenance: 'observed' as const,
      evidence: [{ source: 'code' as const, path: `src/${index}.ts` }],
    }))
    const snapshot = DiscoverySnapshotV1Schema.parse({
      ...input.snapshot,
      entities,
      relations: [{ ...input.snapshot.relations[0], from: 'module:0', to: 'module:500' }],
    })
    const report = ReconciliationReportV1Schema.parse({
      ...input.report,
      project: snapshot.project,
      snapshotHash: snapshot.contentHash,
      summary: { entityCount: 501, relationCount: 1, diagnosticCount: 1 },
    })
    const html = renderOfflineReport({ snapshot, report }, { includeSnippets: true })

    expect(html).toContain('Large snapshots are rendered from compact canonical data')
    expect(html).toContain('const data=')
    expect(html).toContain('module:500')
    expect(html).toContain('progressive graph levels')
    expect(html).toContain('secret snippet')
  })

  it('renders actionable error pages for malformed or mismatched artifacts', () => {
    expect(renderOfflineReport({})).toContain('Doc Bridge report unavailable')
    expect(renderOfflineReport({ snapshot: artifacts().snapshot, report: { ...artifacts().report, snapshotHash: hash('d') } })).toContain('does not match')
  })
})
