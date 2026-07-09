import type { DocBridgeConfigV1 } from '../config/schema.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'
import { scanAgentCorpus } from '../index-builder/scan-corpus.js'
import { runGates, type GateRunResult } from '../gates/run-gates.js'
import { IndexNotFoundError, loadDocBridgeIndex } from '../query/load-index.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { doctorBadgeMetrics, type DoctorBadgeMetrics } from './badge.js'

export type DoctorIssue = {
  readonly severity: 'error' | 'warn' | 'info'
  readonly code: string
  readonly message: string
  readonly action?: string
}

export type DoctorCoverage = {
  readonly packages: {
    readonly total: number
    readonly withAgentDoc: number
    readonly withHumanDoc: number
    readonly missingAgentDoc: readonly string[]
    readonly missingHumanDoc: readonly string[]
  }
  readonly agentDocs: {
    readonly total: number
    readonly indexed: number
    readonly unindexed: readonly string[]
  }
  readonly freshness: {
    readonly ok: boolean
    readonly message: string
    readonly hasIndex: boolean
  }
  readonly gates: GateRunResult
}

export type DoctorReport = {
  readonly ok: boolean
  readonly score: number
  readonly grade: 'A' | 'B' | 'C' | 'D' | 'F'
  readonly coverage: DoctorCoverage
  readonly badge: DoctorBadgeMetrics
  readonly issues: readonly DoctorIssue[]
  readonly nextActions: readonly string[]
}

const gradeForScore = (score: number): DoctorReport['grade'] => {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

const agentDocPaths = (index: DocBridgeIndexV1): Set<string> => {
  const paths = new Set<string>()
  for (const owner of Object.values(index.lookup?.ownership ?? {})) {
    if (owner.agentDoc) paths.add(owner.agentDoc)
  }
  for (const handoff of Object.values(index.handoffs ?? {})) {
    if (handoff.startHere) paths.add(handoff.startHere)
  }
  return paths
}

const computeScore = (coverage: DoctorCoverage): number => {
  let score = 0

  if (coverage.freshness.hasIndex) score += 15
  if (coverage.freshness.ok) score += 15

  const { total, withAgentDoc, withHumanDoc } = coverage.packages
  if (total > 0) {
    score += Math.round((withAgentDoc / total) * 35)
    score += Math.round((withHumanDoc / total) * 20)
  } else if (coverage.agentDocs.indexed > 0) {
    score += 35
  }

  if (coverage.gates.ok) score += 15
  else {
    const passed = coverage.gates.results.filter((gate) => gate.ok).length
    const totalGates = coverage.gates.results.length || 1
    score += Math.round((passed / totalGates) * 10)
  }

  return Math.min(100, Math.max(0, score))
}

const buildIssues = (coverage: DoctorCoverage): DoctorIssue[] => {
  const issues: DoctorIssue[] = []

  if (!coverage.freshness.hasIndex) {
    issues.push({
      severity: 'error',
      code: 'index-missing',
      message: 'No doc-bridge index found.',
      action: 'ak-docs index',
    })
  } else if (!coverage.freshness.ok) {
    issues.push({
      severity: 'error',
      code: 'index-stale',
      message: coverage.freshness.message,
      action: 'ak-docs index',
    })
  }

  for (const id of coverage.packages.missingAgentDoc) {
    issues.push({
      severity: 'warn',
      code: 'missing-agent-doc',
      message: `Package "${id}" has no dedicated agent doc.`,
      action: `ak-docs init --scaffold-workspaces  # or edit docs/for-agents/packages/${id}.md`,
    })
  }

  for (const id of coverage.packages.missingHumanDoc) {
    issues.push({
      severity: 'info',
      code: 'missing-human-doc',
      message: `Package "${id}" has no linked human guide.`,
      action: 'ak-docs bootstrap agent-docs',
    })
  }

  for (const gate of coverage.gates.results.filter((result) => !result.ok)) {
    issues.push({
      severity: gate.id === 'index-freshness' ? 'error' : 'warn',
      code: `gate-${gate.id}`,
      message: gate.message,
      action: gate.id === 'index-freshness' ? 'ak-docs index' : 'ak-docs gate run',
    })
  }

  return issues
}

const buildNextActions = (issues: readonly DoctorIssue[], coverage: DoctorCoverage): string[] => {
  const actions = new Set<string>()
  for (const issue of issues) {
    if (issue.action) actions.add(issue.action)
  }

  if (!coverage.freshness.hasIndex || !coverage.freshness.ok) {
    actions.add('ak-docs index')
  }
  if (coverage.packages.missingHumanDoc.length) {
    actions.add('ak-docs bootstrap agent-docs')
  }
  if (coverage.packages.total > 0) {
    const sample =
      coverage.packages.missingAgentDoc[0] ??
      coverage.packages.missingHumanDoc[0]
    if (sample) actions.add(`ak-docs query package ${sample} --agent`)
  }
  if (!actions.size) {
    actions.add('ak-docs mcp install --cursor')
    actions.add('ak-docs gate run')
  }

  return [...actions].slice(0, 6)
}

export const runDoctor = (root: string, config: DocBridgeConfigV1): DoctorReport => {
  let index: DocBridgeIndexV1 | undefined
  let hasIndex = true
  let freshnessOk = false
  let freshnessMessage = 'Index is fresh'

  try {
    index = loadDocBridgeIndex(root, config)
    const next = buildDocBridgeIndex({ root, config, write: false }).index.contentHash
    freshnessOk = index.contentHash === next
    freshnessMessage = freshnessOk ? 'Index is fresh' : 'Index is stale. Run: ak-docs index'
  } catch (error) {
    if (error instanceof IndexNotFoundError) {
      hasIndex = false
      freshnessOk = false
      freshnessMessage = error.message
      index = buildDocBridgeIndex({ root, config, write: false }).index
    } else {
      throw error
    }
  }

  const ownership = Object.entries(index.lookup?.ownership ?? {})
  const missingAgentDoc = ownership
    .filter(([, owner]) => !owner.agentDoc || owner.agentDoc === config.corpus.agent.index)
    .map(([id]) => id)
  const missingHumanDoc = ownership.filter(([, owner]) => !owner.humanDoc).map(([id]) => id)

  const indexedPaths = new Set(index.knowledge.map((entry) => entry.path))
  const expectedAgentDocs = agentDocPaths(index)
  const unindexed = [...expectedAgentDocs].filter((path) => !indexedPaths.has(path))

  const corpusDocs = scanAgentCorpus(root, config).filter(
    (doc) => doc.path !== config.corpus.agent.index,
  )

  const gates = runGates(root, config)

  const coverage: DoctorCoverage = {
    packages: {
      total: ownership.length,
      withAgentDoc: ownership.length - missingAgentDoc.length,
      withHumanDoc: ownership.length - missingHumanDoc.length,
      missingAgentDoc,
      missingHumanDoc,
    },
    agentDocs: {
      total: corpusDocs.length,
      indexed: corpusDocs.filter((doc) => indexedPaths.has(doc.path)).length,
      unindexed: corpusDocs.filter((doc) => !indexedPaths.has(doc.path)).map((doc) => doc.path),
    },
    freshness: {
      ok: freshnessOk,
      message: freshnessMessage,
      hasIndex,
    },
    gates,
  }

  const issues = buildIssues(coverage)
  const score = computeScore(coverage)
  const nextActions = buildNextActions(issues, coverage)

  const report: DoctorReport = {
    ok: issues.every((issue) => issue.severity !== 'error') && gates.ok,
    score,
    grade: gradeForScore(score),
    coverage,
    badge: { handoffPct: 0, bridgePct: 0, score, grade: gradeForScore(score), packages: 0 },
    issues,
    nextActions,
  }
  return { ...report, badge: doctorBadgeMetrics(report) }
}

export const formatDoctorText = (report: DoctorReport): string[] => {
  const { coverage } = report
  const handoffPct =
    coverage.packages.total > 0
      ? Math.round((coverage.packages.withAgentDoc / coverage.packages.total) * 100)
      : 0
  const humanPct =
    coverage.packages.total > 0
      ? Math.round((coverage.packages.withHumanDoc / coverage.packages.total) * 100)
      : 0

  const lines = [
    'doc-bridge doctor',
    '─'.repeat(40),
    `Score: ${report.score}/100 (${report.grade})`,
    '',
    'Coverage',
    `  Packages:        ${coverage.packages.total}`,
    `  Agent docs:      ${coverage.packages.withAgentDoc}/${coverage.packages.total} (${handoffPct}% handoff-ready)`,
    `  Human guides:    ${coverage.packages.withHumanDoc}/${coverage.packages.total} (${humanPct}% bridged)`,
    `  Corpus indexed:  ${coverage.agentDocs.indexed}/${coverage.agentDocs.total} agent docs`,
    `  Index freshness: ${coverage.freshness.ok ? 'fresh' : 'stale or missing'}`,
    `  Gates:           ${coverage.gates.results.filter((g) => g.ok).length}/${coverage.gates.results.length} passing`,
    `  Badge:           handoff ${report.badge.handoffPct}% · bridge ${report.badge.bridgePct}%`,
  ]

  if (coverage.packages.missingHumanDoc.length) {
    lines.push('', 'Missing humanDoc (bridge gap)', ...coverage.packages.missingHumanDoc.map((id) => `  • ${id}`))
  }
  if (coverage.packages.missingAgentDoc.length) {
    lines.push('', 'Missing agent doc', ...coverage.packages.missingAgentDoc.map((id) => `  • ${id}`))
  }

  if (report.issues.length) {
    lines.push('', 'Issues')
    for (const issue of report.issues.slice(0, 8)) {
      const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warn' ? '!' : '·'
      lines.push(`  ${icon} [${issue.code}] ${issue.message}`)
    }
    if (report.issues.length > 8) {
      lines.push(`  … +${report.issues.length - 8} more`)
    }
  }

  lines.push('', 'Next actions', ...report.nextActions.map((action) => `  → ${action}`))
  return lines
}