import { describe, expect, it } from 'vitest'

import { evaluateRules, parseRuleId, parseRuleSeverity } from '../src/rules/engine.js'
import { ReconciliationReportV1Schema, type ReconciliationReportV1 } from '../src/schemas/knowledge.js'

const hash = (character: string): string => character.repeat(64)

const report = (diagnostics: ReconciliationReportV1['diagnostics']): ReconciliationReportV1 => ReconciliationReportV1Schema.parse({
  type: 'reconciliation-report',
  schemaVersion: 1,
  contentHash: hash('a'),
  contentHashAlgo: 'sha256-normalized-v1',
  project: { name: 'fixture', root: '.' },
  sourceRevision: 'revision-1',
  sourceRevisionKind: 'content',
  configurationHash: hash('b'),
  pipelineVersion: '1.0.0',
  analyzerVersions: { 'js-ts': '1.0.0' },
  snapshotHash: hash('c'),
  diagnostics,
  summary: { entityCount: 3, relationCount: 2, diagnosticCount: diagnostics.length },
})

const diagnostic = (
  id: string,
  code: string,
  entityIds?: readonly string[],
): ReconciliationReportV1['diagnostics'][number] => ({
  id,
  code,
  status: code === 'RELATION_UNDOCUMENTED' ? 'undocumented' : 'unresolved',
  severity: 'warn',
  message: code,
  evidence: [{ source: 'code', path: 'src/core.ts', lineStart: 1 }],
  ...(entityIds ? { entityIds } : {}),
})

describe('rule engine', () => {
  it('applies default, recommended and strict presets with deterministic findings and exit policy', () => {
    const input = report([
      diagnostic('b', 'RELATION_UNDOCUMENTED', ['module:core']),
      diagnostic('a', 'UNRESOLVED_ENTITY_REFERENCE'),
    ])
    const defaults = evaluateRules(input)
    const recommended = evaluateRules(input, { preset: 'recommended' })
    const strict = evaluateRules(input, { preset: 'strict' })

    expect(defaults.findings.map((finding) => finding.severity)).toEqual(['info', 'info'])
    expect(defaults.exitCode).toBe(0)
    expect(recommended.findings.map((finding) => finding.severity)).toEqual(['warn', 'warn'])
    expect(recommended.exitCode).toBe(0)
    expect(strict.findings.map((finding) => finding.severity)).toEqual(['error', 'error'])
    expect(strict.exitCode).toBe(1)
    expect(strict.findings.map((finding) => finding.id)).toEqual([...strict.findings].map((finding) => finding.id).sort())
  })

  it('uses CLI-like options over config, supports ignores and critical policy', () => {
    const input = report([
      diagnostic('a', 'RELATION_UNDOCUMENTED', ['module:core']),
      diagnostic('b', 'RELATION_UNDOCUMENTED', ['module:core']),
      diagnostic('c', 'RELATION_UNDOCUMENTED', ['module:core']),
    ])
    const result = evaluateRules(input, {
      config: {
        mode: 'recommended',
        severity: { 'graph-undocumented-relation': 'error' },
        criticalEntities: ['module:core'],
        warningThresholds: { 'centrality-risk': 2 },
      },
      preset: 'default',
      severity: { 'graph-undocumented-relation': 'warn' },
      criticalPaths: ['src/**'],
    })

    expect(result.findings.some((finding) => finding.ruleId === 'critical-path-risk')).toBe(true)
    expect(result.findings.some((finding) => finding.ruleId === 'centrality-risk')).toBe(true)
    expect(result.findings.filter((finding) => finding.ruleId === 'graph-undocumented-relation')).toHaveLength(3)
    expect(result.findings.filter((finding) => finding.ruleId === 'graph-undocumented-relation').every((finding) => finding.severity === 'warn')).toBe(true)
    expect(result.exitCode).toBe(0)

    const ignored = evaluateRules(input, { preset: 'strict', ignore: ['graph-undocumented-relation', 'critical-path-risk', 'centrality-risk'] })
    expect(ignored.findings).toEqual([])
  })

  it('rejects invalid rule configuration values before evaluation', () => {
    expect(() => parseRuleId('unknown-rule')).toThrow()
    expect(() => parseRuleSeverity('fatal')).toThrow()
    expect(() => evaluateRules(report([]), { config: { severity: { 'unknown-rule': 'warn' } as never } })).toThrow()
  })
})
