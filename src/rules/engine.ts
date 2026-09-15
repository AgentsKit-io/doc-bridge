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
  /**
   * Betweenness per entity, from `centrality` in the graph layer.
   *
   * Required for `centrality-risk`: without it the rule reports nothing. It used to count how
   * many undocumented-relation findings an entity had, which measures documentation debt and
   * calls it architecture — a module every import path runs through scored zero if it happened to
   * be documented. Reporting nothing is better than reporting the wrong thing under a name people
   * will act on.
   */
  readonly centrality?: ReadonlyMap<string, number>
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
  OWNERSHIP_PATH_UNOBSERVED: 'ownership',
  IMPORT_CYCLE: 'centrality-risk',
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

  /*
   * Centrality risk: how much of the dependency structure runs through one entity.
   *
   * The threshold reads as a rank when it is 1 or more — "flag the three most central entities",
   * which is what the previous count-based threshold meant to say — and as a minimum betweenness
   * when it is below 1, for a repository that would rather set an absolute bar.
   */
  const centralitySeverity = severityFor('centrality-risk', resolved.mode, resolved.severity)
  if (options.centrality?.size && !resolved.ignore.has('centrality-risk') && centralitySeverity !== 'off') {
    const threshold = resolved.warningThresholds['centrality-risk'] ?? 3
    const ranked = [...options.centrality.entries()]
      .filter(([, score]) => score > 0)
      .sort(([leftId, left], [rightId, right]) => right - left || leftId.localeCompare(rightId))
    const flagged = threshold >= 1 ? ranked.slice(0, Math.floor(threshold)) : ranked.filter(([, score]) => score >= threshold)

    for (const [entityId, score] of [...flagged].sort(([a], [b]) => a.localeCompare(b))) {
      const related = findings.filter((item) => item.entityIds?.includes(entityId))
      findings.push({
        id: `centrality-risk:${entityId}`,
        ruleId: 'centrality-risk',
        code: 'centrality-risk',
        status: 'unresolved',
        severity: centralitySeverity,
        message: `${entityId} carries betweenness ${score} on the import graph${criticalEntitySet.has(entityId) ? ' and is declared critical' : ''}; static centrality is a review signal, not a runtime availability claim.`,
        evidence: related.flatMap((item) => item.evidence).slice(0, 16),
        entityIds: [entityId],
        remediation: 'Review ownership, dependency boundaries, and runtime availability before declaring an SPOF.',
      })
    }
  }

  const sortedFindings = [...findings].sort((a, b) => a.id.localeCompare(b.id))
  return { mode: resolved.mode, findings: sortedFindings, exitCode: sortedFindings.some((finding) => finding.severity === 'error') ? 1 : 0 }
}

export const parseRuleId = (value: string): RuleId => {
  try {
    return RuleIdSchema.parse(value)
  } catch {
    throw new Error(`Invalid enum value: ${value}`)
  }
}

export const parseRuleSeverity = (value: string): RuleSeverity => {
  try {
    return RuleSeveritySchema.parse(value)
  } catch {
    throw new Error(`Invalid enum value: ${value}`)
  }
}
