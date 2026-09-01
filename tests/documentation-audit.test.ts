import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { auditDocumentation } from '../src/audit/documentation.js'
import { applyDocumentationDeclarations } from '../src/discovery/documentation.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-audit-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'audit-fixture' }))
  writeFileSync(join(root, 'src', 'index.ts'), "import './worker.js'\nexport const run = 1\n")
  writeFileSync(join(root, 'src', 'worker.ts'), 'export const worker = 1\n')
  const duplicate = '# Same\n\nThis is duplicate content.\n'
  writeFileSync(join(root, 'docs', 'guide.md'), [
    '---', 'docbridge:', '  covers:', '    - package:audit-fixture', '---', '', '# Guide', '', 'Run the command.', '', '```sh', 'ak-docs check', '```',
  ].join('\n'))
  writeFileSync(join(root, 'docs', 'copy-a.md'), duplicate)
  writeFileSync(join(root, 'docs', 'copy-b.md'), duplicate)
  const snapshot = discoverRepository({ root })
  const documents = snapshot.entities.filter((entity) => entity.kind === 'document' && entity.path).map((entity) => ({ path: entity.path as string, content: readFileSync(join(root, entity.path as string), 'utf8') }))
  const analysis = applyDocumentationDeclarations(snapshot, documents)
  const reconciliation = reconcileKnowledge(snapshot, analysis.snapshot, { requiredRelationKinds: ['imports'], requiredRelationTargets: 'internal', includeOrphanedDocuments: true })
  return { root, snapshot, analysis, reconciliation }
}

describe('documentation audit', () => {
  it('reports measurable quality, coverage, redundancy, and structure findings deterministically', () => {
    const first = fixture()
    const second = fixture()
    const audit = (value: ReturnType<typeof fixture>) => auditDocumentation({
      root: value.root,
      snapshot: value.snapshot,
      declared: value.analysis.snapshot,
      reconciliation: value.reconciliation,
      declarationDiagnostics: value.analysis.diagnostics,
      config: { minWords: 5, requireExamples: true, exactDuplicates: true },
    })
    const report = audit(first)
    const repeat = audit(second)

    expect(report.status).toBe('needs-review')
    expect(report.metrics.documentCount).toBe(3)
    expect(report.metrics.packageCount).toBe(0)
    expect(report.metrics.coverageRate).toBeNull()
    expect(report.metrics.exactDuplicateGroups).toBe(1)
    expect(report.metrics.examplesRate).toBe(1 / 3)
    expect(report.metrics.structureGapCount).toBeGreaterThan(0)
    expect(report.limitations.some((item) => item.includes('Natural-language semantic contradiction'))).toBe(true)
    expect(report.contentHash).toBe(repeat.contentHash)
    expect(report.findings.map(({ id }) => id)).toEqual(repeat.findings.map(({ id }) => id))
  })

  it('blocks high-confidence structure gaps only when a configured critical path is affected', () => {
    const value = fixture()
    const report = auditDocumentation({
      root: value.root,
      snapshot: value.snapshot,
      declared: value.analysis.snapshot,
      reconciliation: value.reconciliation,
      declarationDiagnostics: value.analysis.diagnostics,
      config: { criticalPaths: ['src/**'], exactDuplicates: false },
    })
    expect(report.status).toBe('blocked')
    expect(report.metrics.blockingCount).toBeGreaterThan(0)
    expect(report.findings.some((finding) => finding.blocking && finding.code === 'RELATION_UNDOCUMENTED')).toBe(true)
  })

  it('recognizes frontmatter and HTML titles used by real documentation sites', () => {
    const value = fixture()
    writeFileSync(join(value.root, 'docs', 'frontmatter.md'), '---\ntitle: Frontmatter guide\n---\n\nUsage is documented here.\n')
    writeFileSync(join(value.root, 'docs', 'html.md'), '<h1>HTML guide</h1>\n\nUsage is documented here.\n')
    const report = auditDocumentation({
      root: value.root,
      snapshot: { ...value.snapshot, entities: [...value.snapshot.entities, { id: 'document:frontmatter', kind: 'document', name: 'frontmatter', path: 'docs/frontmatter.md', provenance: 'observed', evidence: [] }, { id: 'document:html', kind: 'document', name: 'html', path: 'docs/html.md', provenance: 'observed', evidence: [] }] },
      declared: value.analysis.snapshot,
      reconciliation: value.reconciliation,
      config: { exactDuplicates: false },
    })
    expect(report.findings.filter((finding) => finding.code === 'DOCUMENTATION_TITLE_MISSING').map((finding) => finding.evidence[0]?.path)).not.toEqual(expect.arrayContaining(['docs/frontmatter.md', 'docs/html.md']))
  })

  it('classifies tiers and reports independent quality and maintainability dimensions', () => {
    const value = fixture()
    writeFileSync(join(value.root, 'docs', 'critical.md'), [
      '---',
      'type: runbook',
      'audience: human-and-agent',
      'lifecycle: active',
      'owner: platform',
      'sourceOfTruth: docs/critical.md',
      'validationPath: pnpm test',
      'tier: tier-0',
      '---',
      '',
      '# Critical runbook',
      '',
      'Follow this operational procedure.',
      '',
      '```sh',
      'pnpm test',
      '```',
    ].join('\n'))
    const report = auditDocumentation({
      root: value.root,
      snapshot: { ...value.snapshot, entities: [...value.snapshot.entities, { id: 'document:critical', kind: 'document', name: 'critical', path: 'docs/critical.md', provenance: 'observed', evidence: [] }] },
      declared: value.analysis.snapshot,
      reconciliation: value.reconciliation,
      config: { tierRules: [{ pattern: 'docs/copy-a.md', tier: 'tier-0', critical: true }] },
    })
    const critical = report.documentAssessments.find((assessment) => assessment.path === 'docs/critical.md')
    const overridden = report.documentAssessments.find((assessment) => assessment.path === 'docs/copy-a.md')
    expect(critical?.classification).toMatchObject({ type: 'runbook', audience: 'human-and-agent', tier: 'tier-0', critical: true })
    expect(critical?.metadata).toMatchObject({ complete: true, missing: [] })
    expect(critical?.dimensions.correctness.status).toBe('not-analyzed')
    expect(critical?.dimensions.maintainability.status).toBe('validated')
    expect(overridden?.classification).toMatchObject({ tier: 'tier-0', critical: true })
    expect(report.metrics.tierCounts['tier-0']).toBe(2)
    expect(report.metrics.criticalDocumentsWithOwner).toBe(1)
    expect(report.findings.some((finding) => finding.code === 'DOCUMENTATION_CRITICAL_METADATA_MISSING')).toBe(true)
    const reclassified = auditDocumentation({
      root: value.root,
      snapshot: { ...value.snapshot, entities: [...value.snapshot.entities, { id: 'document:critical', kind: 'document', name: 'critical', path: 'docs/critical.md', provenance: 'observed', evidence: [] }] },
      declared: value.analysis.snapshot,
      reconciliation: value.reconciliation,
      config: { tierRules: [{ pattern: 'docs/copy-a.md', tier: 'tier-0', critical: false }] },
    })
    expect(reclassified.documentAssessments.find((assessment) => assessment.path === 'docs/copy-a.md')?.classification.critical).toBe(false)
  })
})
