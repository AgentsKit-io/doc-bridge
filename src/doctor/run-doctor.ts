import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { parseRetrievalSuite, runRetrievalBench } from '../bench/retrieval.js'
import { discoverRepository } from '../discovery/repository.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'
import { scanAgentCorpus } from '../index-builder/scan-corpus.js'
import { runGates, type GateRunResult } from '../gates/run-gates.js'
import { IndexNotFoundError, loadDocBridgeIndex } from '../query/load-index.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'
import { doctorBadgeMetrics, type DoctorBadgeMetrics } from './badge.js'

/** Where the golden retrieval suite lives unless `retrieval.benchmark.suite` says otherwise. */
export const DEFAULT_RETRIEVAL_SUITE = 'docs/bench/retrieval-suite-v1.json'

/**
 * What an A requires beyond the score, as fractions the doctor measured rather than declared.
 *
 * Reachability must be complete: a document retrieval cannot find is a document the product does
 * not deliver, and no other dimension compensates for it. Connectivity and the benchmark have a
 * floor rather than a ceiling, because a repository with a few undocumented utility areas is
 * still healthy and a suite that misses a hard case in ten is still a good ranker.
 */
export const A_GRADE_REQUIREMENTS = { reachabilityPct: 100, connectivityPct: 80, benchmarkHitAt3: 0.8 } as const

/** How many offenders a dimension lists, so the report stays readable on a large repository. */
const MAX_LISTED = 20

export type DoctorIssue = {
  readonly severity: 'error' | 'warn' | 'info'
  readonly code: string
  readonly message: string
  readonly action?: string
}

/** The share of the snapshot's documents an agent can retrieve: present in the retrieval projection. */
export type DoctorReachability = {
  readonly documentsTotal: number
  readonly documentsReachable: number
  readonly unreachable: readonly string[]
  readonly pct: number
}

/**
 * Whether the graph connects documentation to code both ways: an area with at least one document
 * that covers or mentions it, and a document with at least one edge into code (an area, a module
 * or a package it covers or mentions). `pct` is the mean of the two shares.
 */
export type DoctorConnectivity = {
  readonly areasTotal: number
  readonly areasDocumented: number
  readonly undocumentedAreas: readonly string[]
  readonly documentsTotal: number
  readonly documentsLinked: number
  readonly unlinkedDocuments: readonly string[]
  readonly pct: number
}

export type DoctorBenchmark =
  | {
      readonly status: 'measured'
      readonly suite: string
      readonly caseCount: number
      readonly hitAt1: number
      readonly hitAt3: number
      readonly meanReciprocalRank: number
    }
  | {
      /** No golden suite, or one that could not be run: reported, never silently omitted. */
      readonly status: 'not-analyzed'
      readonly suite: string
      readonly reason: string
    }

/** Which of the three measured dimensions meet the bar an A requires, and why not when one does not. */
export type DoctorGrading = {
  readonly reachability: boolean
  readonly connectivity: boolean
  readonly benchmark: boolean
  readonly unmet: readonly string[]
}

export type DoctorCoverage = {
  readonly reachability: DoctorReachability
  readonly connectivity: DoctorConnectivity
  readonly benchmark: DoctorBenchmark
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
  readonly grading: DoctorGrading
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

/**
 * One hundred points, each traceable to something measured.
 *
 * The index (present, fresh), the handoff corpus (agent docs, human guides) and the gates were
 * the whole score once, and it reported 100/100 on a repository where most documents were
 * unreachable, because nothing in it measured what retrieval could see. Forty of the hundred now
 * come from reachability, connectivity and the benchmark; a suite that does not exist scores
 * nothing, since an unmeasured ranker is not a good ranker.
 */
export const computeScore = (coverage: DoctorCoverage): number => {
  let score = 0

  if (coverage.freshness.hasIndex) score += 10
  if (coverage.freshness.ok) score += 10

  const { total, withAgentDoc, withHumanDoc } = coverage.packages
  if (total > 0) {
    score += Math.round((withAgentDoc / total) * 20)
    score += Math.round((withHumanDoc / total) * 10)
  } else if (coverage.agentDocs.indexed > 0) {
    score += 20
  }

  if (coverage.gates.ok) score += 10
  else {
    const passed = coverage.gates.results.filter((gate) => gate.ok).length
    const totalGates = coverage.gates.results.length || 1
    score += Math.round((passed / totalGates) * 7)
  }

  score += Math.round((coverage.reachability.pct / 100) * 15)
  score += Math.round((coverage.connectivity.pct / 100) * 15)
  if (coverage.benchmark.status === 'measured') score += Math.round(coverage.benchmark.hitAt3 * 10)

  return Math.min(100, Math.max(0, score))
}

const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/**
 * An A requires all three measured dimensions, whatever the score says. A repository with no
 * golden suite tops out at B: the ranker may be excellent, but nobody has checked.
 */
export const gradeFor = (score: number, coverage: DoctorCoverage): { readonly grade: DoctorReport['grade']; readonly grading: DoctorGrading } => {
  const reachability = coverage.reachability.pct >= A_GRADE_REQUIREMENTS.reachabilityPct
  const connectivity = coverage.connectivity.pct >= A_GRADE_REQUIREMENTS.connectivityPct
  const benchmark = coverage.benchmark.status === 'measured' && coverage.benchmark.hitAt3 >= A_GRADE_REQUIREMENTS.benchmarkHitAt3
  const unmet = [
    ...(reachability ? [] : [`reachability ${coverage.reachability.pct}% < ${A_GRADE_REQUIREMENTS.reachabilityPct}%`]),
    ...(connectivity ? [] : [`connectivity ${coverage.connectivity.pct}% < ${A_GRADE_REQUIREMENTS.connectivityPct}%`]),
    ...(benchmark
      ? []
      : coverage.benchmark.status === 'measured'
        ? [`benchmark hit@3 ${(coverage.benchmark.hitAt3 * 100).toFixed(1)}% < ${A_GRADE_REQUIREMENTS.benchmarkHitAt3 * 100}%`]
        : ['benchmark not-analyzed']),
  ]
  const grade = gradeForScore(score)
  return { grade: grade === 'A' && unmet.length ? 'B' : grade, grading: { reachability, connectivity, benchmark, unmet } }
}

/** The documents an agent can retrieve: those the projection carries, of those the snapshot observed. */
export const measureReachability = (snapshot: DiscoverySnapshotV1, index: DocBridgeIndexV1): DoctorReachability => {
  const projected = new Set((index.projection?.entries ?? []).filter((entry) => entry.kind === 'document').map((entry) => entry.id))
  const documents = snapshot.entities.filter((entity) => entity.kind === 'document').map((entity) => entity.id).sort()
  const unreachable = documents.filter((id) => !projected.has(id))
  return {
    documentsTotal: documents.length,
    documentsReachable: documents.length - unreachable.length,
    unreachable: unreachable.slice(0, MAX_LISTED),
    pct: pct(documents.length - unreachable.length, documents.length),
  }
}

/** Both directions of the documentation graph, from the projection's own edges. */
export const measureConnectivity = (index: DocBridgeIndexV1): DoctorConnectivity => {
  const entries = index.projection?.entries ?? []
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const areas = entries.filter((entry) => entry.kind === 'area').sort((a, b) => a.id.localeCompare(b.id))
  const undocumentedAreas = areas.filter((entry) => !entry.graph.coveredBy.length && !entry.graph.mentionedBy.length).map((entry) => entry.id)
  const documents = entries.filter((entry) => entry.kind === 'document').sort((a, b) => a.id.localeCompare(b.id))
  const linksToCode = (entry: (typeof entries)[number]): boolean =>
    entry.graph.outbound.some((edge) => {
      const target = byId.get(edge.id)
      return target !== undefined && target.kind !== 'document'
    })
  const unlinkedDocuments = documents.filter((entry) => !linksToCode(entry)).map((entry) => entry.id)
  const areaShare = areas.length ? (areas.length - undocumentedAreas.length) / areas.length : 0
  const documentShare = documents.length ? (documents.length - unlinkedDocuments.length) / documents.length : 0
  return {
    areasTotal: areas.length,
    areasDocumented: areas.length - undocumentedAreas.length,
    undocumentedAreas: undocumentedAreas.slice(0, MAX_LISTED),
    documentsTotal: documents.length,
    documentsLinked: documents.length - unlinkedDocuments.length,
    unlinkedDocuments: unlinkedDocuments.slice(0, MAX_LISTED),
    pct: Math.round(((areaShare + documentShare) / 2) * 100),
  }
}

/** hit@3 over the golden suite when the repository has one; the honest `not-analyzed` when it does not. */
export const measureBenchmark = (root: string, config: DocBridgeConfigV1, index: DocBridgeIndexV1): DoctorBenchmark => {
  const suite = config.retrieval?.benchmark?.suite ?? DEFAULT_RETRIEVAL_SUITE
  const suitePath = resolve(root, suite)
  if (!existsSync(suitePath)) return { status: 'not-analyzed', suite, reason: `No retrieval suite at ${suite}` }
  if (!index.projection) return { status: 'not-analyzed', suite, reason: 'The index carries no retrieval projection. Run: ak-docs index' }
  try {
    const parsed = parseRetrievalSuite(JSON.parse(readFileSync(suitePath, 'utf8')) as unknown)
    const result = runRetrievalBench({ index, suite: parsed })
    return {
      status: 'measured',
      suite,
      caseCount: result.metrics.caseCount,
      hitAt1: result.metrics.hitAt1,
      hitAt3: result.metrics.hitAt3,
      meanReciprocalRank: result.metrics.meanReciprocalRank,
    }
  } catch (error) {
    return { status: 'not-analyzed', suite, reason: `The retrieval suite could not be run: ${error instanceof Error ? error.message : String(error)}` }
  }
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

  const { reachability, connectivity, benchmark } = coverage
  if (reachability.pct < A_GRADE_REQUIREMENTS.reachabilityPct) {
    issues.push({
      severity: 'warn',
      code: 'documents-unreachable',
      message: `${reachability.documentsTotal - reachability.documentsReachable} of ${reachability.documentsTotal} documents are not in the retrieval projection (${reachability.pct}% reachable).`,
      action: 'ak-docs index',
    })
  }
  if (connectivity.undocumentedAreas.length) {
    issues.push({
      severity: 'info',
      code: 'areas-undocumented',
      message: `${connectivity.areasTotal - connectivity.areasDocumented} of ${connectivity.areasTotal} areas have no document that covers or mentions them.`,
      action: 'ak-docs check --json --format finding',
    })
  }
  if (connectivity.unlinkedDocuments.length) {
    issues.push({
      severity: 'info',
      code: 'documents-unlinked',
      message: `${connectivity.documentsTotal - connectivity.documentsLinked} of ${connectivity.documentsTotal} documents have no edge into code.`,
      action: 'ak-docs audit documentation',
    })
  }
  if (benchmark.status === 'not-analyzed') {
    issues.push({
      severity: 'info',
      code: 'benchmark-not-analyzed',
      message: benchmark.reason,
      action: `ak-docs bench retrieval ${benchmark.suite}`,
    })
  } else if (benchmark.hitAt3 < A_GRADE_REQUIREMENTS.benchmarkHitAt3) {
    issues.push({
      severity: 'warn',
      code: 'benchmark-below-target',
      message: `Retrieval hit@3 is ${(benchmark.hitAt3 * 100).toFixed(1)}% over ${benchmark.caseCount} case(s); an A requires ${A_GRADE_REQUIREMENTS.benchmarkHitAt3 * 100}%.`,
      action: `ak-docs bench retrieval ${benchmark.suite} --text`,
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
  let freshnessMessage: string

  // One discovery serves both the freshness rebuild and the reachability denominator.
  const snapshot = discoverRepository({ root, config })

  try {
    index = loadDocBridgeIndex(root, config)
    const next = buildDocBridgeIndex({ root, config, write: false, snapshot }).index.contentHash
    freshnessOk = index.contentHash === next
    freshnessMessage = freshnessOk ? 'Index is fresh' : 'Index is stale. Run: ak-docs index'
  } catch (error) {
    if (error instanceof IndexNotFoundError) {
      hasIndex = false
      freshnessOk = false
      freshnessMessage = error.message
      index = buildDocBridgeIndex({ root, config, write: false, snapshot }).index
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

  const corpusDocs = scanAgentCorpus(root, config).filter(
    (doc) => doc.path !== config.corpus.agent.index,
  )

  const gates = runGates(root, config)

  const coverage: DoctorCoverage = {
    reachability: measureReachability(snapshot, index),
    connectivity: measureConnectivity(index),
    benchmark: measureBenchmark(root, config, index),
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
  const { grade, grading } = gradeFor(score, coverage)
  const nextActions = buildNextActions(issues, coverage)

  const report: DoctorReport = {
    ok: issues.every((issue) => issue.severity !== 'error') && gates.ok,
    score,
    grade,
    grading,
    coverage,
    badge: { handoffPct: 0, bridgePct: 0, score, grade, packages: 0 },
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
    '',
    'Retrieval',
    `  Reachability:    ${coverage.reachability.documentsReachable}/${coverage.reachability.documentsTotal} documents in the retrieval projection (${coverage.reachability.pct}%)`,
    `  Connectivity:    ${coverage.connectivity.areasDocumented}/${coverage.connectivity.areasTotal} areas documented · ${coverage.connectivity.documentsLinked}/${coverage.connectivity.documentsTotal} documents link to code (${coverage.connectivity.pct}%)`,
    `  Benchmark:       ${
      coverage.benchmark.status === 'measured'
        ? `hit@3 ${(coverage.benchmark.hitAt3 * 100).toFixed(1)}% · hit@1 ${(coverage.benchmark.hitAt1 * 100).toFixed(1)}% over ${coverage.benchmark.caseCount} case(s) (${coverage.benchmark.suite})`
        : `not-analyzed — ${coverage.benchmark.reason}`
    }`,
  ]

  if (report.grading.unmet.length) {
    lines.push('', `Grade ${report.grade}: an A requires`, ...report.grading.unmet.map((reason) => `  • ${reason}`))
  }

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
