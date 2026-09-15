import { describe, expect, it } from 'vitest'

import { createControlledStudyObservation, createControlledStudyRunPlan } from '../src/study/runner.js'
import { calculateStudyMetrics, formatStudyMetricsText, parseStudyMetrics } from '../src/study/metrics.js'

const plan = createControlledStudyRunPlan({
  type: 'controlled-study-run-plan', schemaVersion: 1, planVersion: 'v1', protocolVersion: 'v1', protocolHash: 'a'.repeat(64), taskSuiteHash: 'b'.repeat(64), sourceRevisionHash: 'c'.repeat(64), configurationHash: 'd'.repeat(64), docBridgeVersion: '1.0.0',
  models: [
    { id: 'low-cost-model', role: 'low-cost', provider: 'provider-a', model: 'low-cost-model', version: '2026-01', parametersHash: 'e'.repeat(64), contextLimit: 32768, toolConfigurationHash: 'f'.repeat(64), promptContractHash: '1'.repeat(64) },
    { id: 'reference-model', role: 'reference', provider: 'provider-b', model: 'reference-model', version: '2026-01', parametersHash: '2'.repeat(64), contextLimit: 131072, toolConfigurationHash: '3'.repeat(64), promptContractHash: '4'.repeat(64) },
  ],
  scenarios: [
    { id: 'repository-only', network: false },
    { id: 'deterministic-doc-bridge', network: false },
    { id: 'registry-assisted', agentId: 'reviewer', agentVersion: 'v1', network: false },
  ],
  taskIds: Array.from({ length: 24 }, (_, index) => `task-${String(index + 1).padStart(2, '0')}`), sampling: { strategy: 'balanced-task-strata', sampleSize: 24 }, budget: { maxTokens: 1000, maxRuntimeMs: 1000, maxOutputBytes: 1000, maxAttempts: 1 }, runId: 'metrics-run',
})

const observation = (round: string, outcome: 'success' | 'partial', tokens: number, runId = `${round}-${outcome}-${tokens}`) => createControlledStudyObservation({
  type: 'controlled-study-observation', schemaVersion: 1, observationVersion: 'v1', observedAt: '2026-08-30T00:00:00.000Z', runId, planHash: plan.contentHash,
  task: { taskId: 'task-01', repositoryId: 'consumer-01', category: 'documentation', scenarioId: 'deterministic-doc-bridge', modelId: 'low-cost-model', replicate: 0, variantId: 'variant-a', difficulty: 'hard' },
  model: plan.models[0]!, scenario: plan.scenarios[1]!, round, taskOutcome: outcome, evidenceQuality: outcome === 'success' ? 'high' : 'low', clarificationRequests: outcome === 'success' ? 0 : 1, reworkCount: outcome === 'success' ? 0 : 1,
  safetyOutcome: outcome === 'success' ? 'safe' : 'unsafe', measurements: { searchHitRate: outcome === 'success' ? 1 : 0, acceptanceChecksPassed: outcome === 'success' ? 2 : 1, acceptanceChecksTotal: 2, errorRate: outcome === 'success' ? 0 : 1, documentationFindingCount: outcome === 'success' ? 1 : 3, documentationExampleRate: outcome === 'success' ? 1 : 0, documentationFreshnessRate: outcome === 'success' ? 1 : 0, documentationCorrectnessRate: outcome === 'success' ? 1 : 0, documentationCompletenessRate: outcome === 'success' ? 1 : 0, documentationClarityRate: outcome === 'success' ? 1 : 0, documentationMaintainabilityRate: outcome === 'success' ? 1 : 0, analysisCostUsd: 0.01, agentCostUsd: 0.02 },
  execution: { status: 'completed', exitCode: 0, signal: null, durationMs: tokens, responseBytes: tokens, stderrBytes: 0, inputTokens: tokens, outputTokens: 10, tokenMethod: 'provider', toolCalls: 1 }, contextBytes: tokens * 2, evidenceIds: ['evidence-1'], adjudication: { status: 'human-approved', actor: 'reviewer' },
})

/** An observation with its seal removed, so a variant of it can be re-sealed. */
const unsealed = (value: Record<string, unknown>): Record<string, unknown> => {
  const { contentHash: _hash, contentHashAlgo: _algo, ...payload } = value
  return payload
}

describe('controlled study metrics', () => {
  it('compares rounds with denominators, uncertainty, and quality hard constraints', () => {
    const report = calculateStudyMetrics([
      observation('baseline', 'success', 100), observation('baseline', 'success', 110),
      observation('cycle-1', 'partial', 50), observation('cycle-1', 'partial', 55),
    ], { currentRound: 'cycle-1' })
    const aggregate = report.comparisons.find((comparison) => comparison.scope === 'aggregate' && comparison.key === 'all')
    expect(aggregate?.status).toBe('regressed')
    expect(aggregate?.regressions).toEqual(expect.arrayContaining(['successRate', 'evidenceQualityRate']))
    expect(aggregate?.metrics.providerTokens).toMatchObject({ baseline: 230, current: 125, absoluteChange: -105 })
    expect(aggregate?.metrics.acceptanceCheckRate).toMatchObject({ baseline: 1, current: 0.5 })
    expect(aggregate?.metrics.totalCostUsd).toMatchObject({ baseline: 0.06, current: 0.06 })
    expect(aggregate?.regressions).toEqual(expect.arrayContaining(['safetyRate', 'acceptanceCheckRate']))
    expect(report.groups.find((group) => group.scope === 'task' && group.round === 'baseline')?.metrics.successConfidence95).toMatchObject({ low: expect.any(Number), high: expect.any(Number) })
    expect(report.groups[0]?.metrics.missingMetrics).toContain('estimatedTokens')
    expect(parseStudyMetrics(report)).toEqual(report)
    expect(formatStudyMetricsText(report).join('\n')).toContain(`Content hash: ${report.contentHash}`)
    expect(formatStudyMetricsText(report).join('\n')).toContain('acceptanceCheckRate')
  })

  it('marks missing baseline and small samples explicitly', () => {
    const report = calculateStudyMetrics([observation('cycle-1', 'success', 10)])
    expect(report.baselineRound).toBe('cycle-1')
    expect(report.currentRound).toBeNull()
    expect(report.comparisons.every((comparison) => comparison.status === 'not-analyzed')).toBe(true)
  })

  it('is deterministic and does not mutate the observation ledger', () => {
    const observations = [observation('baseline', 'success', 100), observation('cycle-1', 'success', 90)]
    const before = JSON.stringify(observations)
    const first = calculateStudyMetrics(observations, { currentRound: 'cycle-1' })
    const second = calculateStudyMetrics(observations, { currentRound: 'cycle-1' })
    expect(second).toEqual(first)
    expect(JSON.stringify(observations)).toBe(before)
  })

  it('keeps known token and tool totals while marking incomplete coverage', () => {
    const first = observation('cycle-1', 'success', 100)
    const second = { ...observation('cycle-1', 'success', 90), execution: { ...observation('cycle-1', 'success', 90).execution, inputTokens: undefined, outputTokens: undefined, tokenMethod: undefined, toolCalls: undefined } }
    const report = calculateStudyMetrics([first, second])
    const aggregate = report.groups.find((group) => group.scope === 'aggregate')?.metrics
    expect(aggregate?.providerTokens).toBe(110)
    expect(aggregate?.averageToolCalls).toBe(1)
    expect(aggregate?.missingMetrics).toEqual(expect.arrayContaining(['providerTokens-partial', 'toolCalls-partial']))
  })

  it('binds comparisons to exact run ids when a round has recovery attempts', () => {
    const report = calculateStudyMetrics([
      observation('baseline', 'success', 100, 'baseline-run-a'), observation('baseline', 'success', 200, 'baseline-run-b'),
      observation('cycle-1', 'success', 90, 'cycle-run-a'), observation('cycle-1', 'success', 180, 'cycle-run-b'),
    ], { baselineRound: 'baseline', baselineRunId: 'baseline-run-a', currentRound: 'cycle-1', currentRunId: 'cycle-run-a' })
    expect(report.observationCount).toBe(2)
    expect(report.baselineRunId).toBe('baseline-run-a')
    expect(report.currentRunId).toBe('cycle-run-a')
    expect(report.groups.find((group) => group.scope === 'aggregate' && group.round === 'baseline')?.metrics.providerTokens).toBe(110)
    expect(report.groups.find((group) => group.scope === 'aggregate' && group.round === 'cycle-1')?.metrics.providerTokens).toBe(100)
  })

  it('selects both run ids when recovery arms share one round', () => {
    const report = calculateStudyMetrics([
      observation('ab-baseline', 'success', 100, 'failed-run'), observation('ab-baseline', 'success', 200, 'recovery-run'),
    ], { baselineRound: 'ab-baseline', currentRound: 'ab-baseline', baselineRunId: 'failed-run', currentRunId: 'recovery-run' })
    expect(report.observationCount).toBe(2)
    expect(report.groups.find((group) => group.scope === 'aggregate')?.metrics.providerTokens).toBe(320)
  })

  it('selects only the current run when a same-round report is requested', () => {
    const report = calculateStudyMetrics([
      observation('ab-baseline', 'success', 100, 'failed-run'), observation('ab-baseline', 'success', 200, 'recovery-run'),
    ], { baselineRound: 'ab-baseline', currentRound: 'ab-baseline', currentRunId: 'recovery-run' })
    expect(report.observationCount).toBe(1)
    expect(report.groups.find((group) => group.scope === 'aggregate')?.metrics.providerTokens).toBe(210)
  })

  /*
   * Tokens to first evidence, and the enrichment agent's own bill.
   *
   * "Fewer tokens" is the claim the study exists to test, and the token count at the end of a task
   * does not test it: a run that wandered for ten thousand tokens and then found the answer looks
   * the same as one that landed on it immediately. The p95 of tokens consumed before grounded
   * evidence was in hand is the number that separates them. The assisted arm's agent cost is
   * reported apart from the model's, and still lands in the total, so the arm cannot look cheap by
   * charging its work to a line nobody adds up.
   */
  it('reports tokens to first evidence and the registry agent cost apart from the model cost', () => {
    const assisted = (round: string, toFirstEvidence: number, runId = `${round}-assisted-${toFirstEvidence}`) => {
      const base = unsealed(observation(round, 'success', 100, runId))
      return createControlledStudyObservation({
        ...base,
        task: { ...base.task, scenarioId: 'registry-assisted' },
        scenario: plan.scenarios[2]!,
        measurements: { ...base.measurements, tokensToFirstEvidence: toFirstEvidence, registryAgentInputTokens: 900, registryAgentOutputTokens: 100, registryAgentCostUsd: 0.004, registryAgentRuns: 2 },
      })
    }
    const report = calculateStudyMetrics([assisted('baseline', 800), assisted('baseline', 900), assisted('cycle-1', 120), assisted('cycle-1', 150)], { currentRound: 'cycle-1' })
    const group = (round: string) => report.groups.find((entry) => entry.scope === 'aggregate' && entry.round === round)?.metrics

    expect(group('baseline')?.tokensToFirstEvidenceP95).toBe(900)
    expect(group('cycle-1')?.tokensToFirstEvidenceP95).toBe(150)
    expect(group('cycle-1')?.missingMetrics).not.toContain('tokensToFirstEvidence')
    expect(group('cycle-1')?.registryAgentCostUsd).toBeCloseTo(0.008, 6)
    expect(group('cycle-1')?.registryAgentRuns).toBe(4)
    // The agent's cost is its own line and part of the total: 2 × (0.01 analysis + 0.02 agent) + 0.008.
    expect(group('cycle-1')?.totalCostUsd).toBeCloseTo(0.068, 6)

    const aggregate = report.comparisons.find((comparison) => comparison.scope === 'aggregate' && comparison.key === 'all')
    expect(aggregate?.metrics.tokensToFirstEvidenceP95).toMatchObject({ baseline: 900, current: 150, absoluteChange: -750 })
    // Fewer tokens before evidence, everything else equal: the comparison reads as an improvement.
    expect(aggregate?.regressions).toEqual([])
    expect(aggregate?.status).toBe('improved')
    const text = formatStudyMetricsText(report).join('\n')
    // Reported per scenario: the arm is the unit the claim is about.
    expect(text).toContain('Tokens to first evidence (p95) registry-assisted @ cycle-1: 150')
    expect(text).toContain('registry agent cost')
  })

  it('marks tokens to first evidence as missing when no observation reports it, and partial when some do', () => {
    const withValue = createControlledStudyObservation({ ...unsealed(observation('cycle-1', 'success', 100, 'with-value')), measurements: { ...observation('cycle-1', 'success', 100).measurements, tokensToFirstEvidence: 300 } })
    const none = calculateStudyMetrics([observation('cycle-1', 'success', 100)])
    expect(none.groups[0]?.metrics.missingMetrics).toContain('tokensToFirstEvidence')
    expect(none.groups[0]?.metrics.tokensToFirstEvidenceP95).toBeNull()
    const partial = calculateStudyMetrics([withValue, observation('cycle-1', 'success', 110, 'without-value')])
    expect(partial.groups.find((group) => group.scope === 'aggregate')?.metrics.missingMetrics).toContain('tokensToFirstEvidence-partial')
    expect(partial.groups.find((group) => group.scope === 'aggregate')?.metrics.tokensToFirstEvidenceP95).toBe(300)
  })
})
