import { minimatch } from 'minimatch'

import {
  RuleIdSchema,
  RuleSeveritySchema,
  RulesConfigSchema,
  type RuleId,
  type RuleSeverity,
  type RulesConfig,
} from '../config/schema.js'
import type { ReconciliationReportV1 } from '../schemas/knowledge.js'

export type RuleMode = 'default' | 'recommended' | 'strict'

export type RuleEngineOptions = {
  readonly config?: RulesConfig
  readonly preset?: RuleMode
  readonly severity?: Partial<Record<RuleId, RuleSeverity>>
  readonly ignore?: readonly RuleId[]
  readonly criticalEntities?: readonly string[]
  readonly criticalPaths?: readonly string[]
  readonly warningThresholds?: Partial<Record<RuleId, number>>
}

export type RuleFinding = {
  readonly id: string
  readonly ruleId: RuleId
  readonly code: string
  readonly status: ReconciliationReportV1['diagnostics'][number]['status']
  readonly severity: RuleSeverity
  readonly message: string
  readonly evidence: ReconciliationReportV1['diagnostics'][number]['evidence']
  readonly entityIds?: readonly string[]
  readonly relationIds?: readonly string[]
  readonly remediation?: string
  readonly sourceDiagnosticCode?: string
}

export type RuleEvaluationResult = {
  readonly mode: RuleMode
  readonly findings: readonly RuleFinding[]
  readonly exitCode: 0 | 1
}

const diagnosticRules: Readonly<Record<string, RuleId>> = {
  DOCUMENTATION_QUALITY: 'documentation-quality',
  RELATION_UNDOCUMENTED: 'graph-undocumented-relation',
  DECLARED_RELATION_STALE: 'declared-unobserved-relation',
  UNRESOLVED_ENTITY_REFERENCE: 'unresolved-reference',
  CONFLICTING_DECLARATIONS: 'conflicting-declaration',
  RELATION_NOT_ANALYZED: 'not-analyzed-coverage',
  STALE_DOCUMENTATION: 'stale-documentation',
  FRESHNESS_FAILURE: 'freshness',
  OWNERSHIP_GAP: 'ownership',
  CENTRALITY_RISK: 'centrality-risk',
  CRITICAL_PATH_RISK: 'critical-path-risk',
}

const defaultSeverity = (mode: RuleMode, ruleId: RuleId): RuleSeverity => {
  if (mode === 'default') return 'info'
  if (mode === 'strict') return ruleId === 'not-analyzed-coverage' ? 'warn' : 'error'
  return ruleId === 'not-analyzed-coverage' ? 'info' : 'warn'
}

const resolvedOptions = (options: RuleEngineOptions): {
  readonly mode: RuleMode
  readonly severity: Partial<Record<RuleId, RuleSeverity>>
  readonly ignore: ReadonlySet<RuleId>
  readonly criticalEntities: readonly string[]
  readonly criticalPaths: readonly string[]
  readonly warningThresholds: Partial<Record<RuleId, number>>
} => {
  const config = RulesConfigSchema.parse(options.config ?? {})
  const mode = options.preset ?? config.mode ?? 'default'
  const severity = { ...config.severity, ...options.severity }
  const ignore = new Set<RuleId>([...(config.ignore ?? []), ...(options.ignore ?? [])])
  return {
    mode,
    severity,
    ignore,
    criticalEntities: options.criticalEntities ?? config.criticalEntities ?? [],
    criticalPaths: options.criticalPaths ?? config.criticalPaths ?? [],
    warningThresholds: { ...config.warningThresholds, ...options.warningThresholds },
  }
}

const severityFor = (
  ruleId: RuleId,
  mode: RuleMode,
  overrides: Partial<Record<RuleId, RuleSeverity>>,
): RuleSeverity => overrides[ruleId] ?? defaultSeverity(mode, ruleId)

const findingFromDiagnostic = (
  diagnostic: ReconciliationReportV1['diagnostics'][number],
  ruleId: RuleId,
  severity: RuleSeverity,
): RuleFinding => ({
  id: `${diagnostic.id}:${ruleId}`,
  ruleId,
  code: ruleId,
  status: diagnostic.status,
  severity,
  message: diagnostic.message,
  evidence: diagnostic.evidence,
  ...(diagnostic.entityIds ? { entityIds: diagnostic.entityIds } : {}),
  ...(diagnostic.relationIds ? { relationIds: diagnostic.relationIds } : {}),
  ...(diagnostic.remediation ? { remediation: diagnostic.remediation } : {}),
  sourceDiagnosticCode: diagnostic.code,
})

const criticalFinding = (
  finding: RuleFinding,
  severity: RuleSeverity,
  target: string,
): RuleFinding => ({
  ...finding,
  id: `${finding.id}:critical:${target}`,
  ruleId: 'critical-path-risk',
  code: 'critical-path-risk',
  severity,
  message: `Critical path or entity is affected: ${target}. ${finding.message}`,
})

export const evaluateRules = (
  report: ReconciliationReportV1,
  options: RuleEngineOptions = {},
): RuleEvaluationResult => {
  const resolved = resolvedOptions(options)
  const findings: RuleFinding[] = []

  for (const diagnostic of [...report.diagnostics].sort((a, b) => a.id.localeCompare(b.id))) {
    const ruleId = diagnosticRules[diagnostic.code]
    if (!ruleId || resolved.ignore.has(ruleId)) continue
    const severity = severityFor(ruleId, resolved.mode, resolved.severity)
    if (severity !== 'off') findings.push(findingFromDiagnostic(diagnostic, ruleId, severity))
  }

  const criticalSeverity = severityFor('critical-path-risk', resolved.mode, resolved.severity)
  const criticalEntitySet = new Set(resolved.criticalEntities)
  for (const finding of [...findings]) {
    const matchingEntity = (finding.entityIds ?? []).find((id) => criticalEntitySet.has(id))
    if (matchingEntity && !resolved.ignore.has('critical-path-risk') && criticalSeverity !== 'off') {
      findings.push(criticalFinding(finding, criticalSeverity, matchingEntity))
    }
    for (const path of resolved.criticalPaths) {
      if (finding.evidence.some((item) => minimatch(item.path, path, { dot: true })) && !resolved.ignore.has('critical-path-risk') && criticalSeverity !== 'off') {
        findings.push(criticalFinding(finding, criticalSeverity, path))
      }
    }
  }

  const centralityThreshold = resolved.warningThresholds['centrality-risk'] ?? 3
  const centralitySeverity = severityFor('centrality-risk', resolved.mode, resolved.severity)
  if (!resolved.ignore.has('centrality-risk') && centralitySeverity !== 'off') {
    const counts = new Map<string, number>()
    for (const finding of findings.filter((item) => item.ruleId === 'graph-undocumented-relation')) {
      for (const entityId of finding.entityIds ?? []) counts.set(entityId, (counts.get(entityId) ?? 0) + 1)
    }
    for (const [entityId, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (count < centralityThreshold || !criticalEntitySet.has(entityId)) continue
      findings.push({
        id: `centrality-risk:${entityId}`,
        ruleId: 'centrality-risk',
        code: 'centrality-risk',
        status: 'unresolved',
        severity: centralitySeverity,
        message: `Critical entity has ${count} undocumented relation finding(s); static centrality is a review signal, not a runtime availability claim.`,
        evidence: findings.filter((item) => item.ruleId === 'graph-undocumented-relation' && item.entityIds?.includes(entityId)).flatMap((item) => item.evidence),
        entityIds: [entityId],
        remediation: 'Review ownership, dependency boundaries, and runtime availability before declaring an SPOF.',
      })
    }
  }

  const sortedFindings = [...findings].sort((a, b) => a.id.localeCompare(b.id))
  return { mode: resolved.mode, findings: sortedFindings, exitCode: sortedFindings.some((finding) => finding.severity === 'error') ? 1 : 0 }
}

export const parseRuleId = (value: string): RuleId => RuleIdSchema.parse(value)
export const parseRuleSeverity = (value: string): RuleSeverity => RuleSeveritySchema.parse(value)
