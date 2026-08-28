import { z } from 'zod'

export const BENCHMARK_SCHEMA_VERSION = 1 as const

const stringList = z.array(z.string().min(1).max(512)).max(100_000)
const benchmarkSets = z.object({
  entities: stringList.default([]),
  relations: stringList.default([]),
  findings: stringList.default([]),
}).strict()

export const BenchmarkFixtureV1Schema = z.object({
  schemaVersion: z.literal(BENCHMARK_SCHEMA_VERSION),
  supported: benchmarkSets,
  excluded: benchmarkSets.optional(),
}).strict()

export type BenchmarkFixtureV1 = z.infer<typeof BenchmarkFixtureV1Schema>

export type BenchmarkObservation = {
  readonly entities: readonly string[]
  readonly relations: readonly string[]
  readonly findings: readonly string[]
  readonly evidenced?: readonly string[]
  readonly findingCategories?: Readonly<Record<string, number>>
}

export type BenchmarkSetMetrics = {
  readonly truePositives: number
  readonly falsePositives: number
  readonly falseNegatives: number
  readonly precision: number
  readonly recall: number
  readonly duplicateCount: number
}

export type BenchmarkResult = {
  readonly schemaVersion: typeof BENCHMARK_SCHEMA_VERSION
  readonly quality: {
    readonly entities: BenchmarkSetMetrics
    readonly relations: BenchmarkSetMetrics
    readonly findings: BenchmarkSetMetrics
  }
  readonly evidenceRatio: number
  readonly findingDensity: number
  readonly findingCategoryDistribution: Readonly<Record<string, number>>
  readonly excludedCaseCount: number
  readonly excludedCaseIds: Readonly<{ entities: number; relations: number; findings: number }>
  readonly thresholds: { readonly precision: number; readonly recall: number }
  readonly regressions: readonly string[]
}

const unique = (values: readonly string[]): Set<string> => new Set(values)
const ratio = (numerator: number, denominator: number): number => denominator === 0 ? 1 : numerator / denominator

const setMetrics = (
  actualValues: readonly string[],
  expectedValues: readonly string[],
  excludedValues: readonly string[],
): BenchmarkSetMetrics => {
  const excluded = unique(excludedValues)
  const activeActualValues = actualValues.filter((value) => !excluded.has(value))
  const actual = unique(activeActualValues)
  const expected = unique(expectedValues.filter((value) => !excluded.has(value)))
  const truePositives = [...actual].filter((value) => expected.has(value)).length
  const falsePositives = actual.size - truePositives
  const falseNegatives = expected.size - truePositives
  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision: ratio(truePositives, actual.size),
    recall: ratio(truePositives, expected.size),
    duplicateCount: activeActualValues.length - actual.size,
  }
}

export const benchmarkFixture = (fixture: unknown): BenchmarkFixtureV1 => BenchmarkFixtureV1Schema.parse(fixture)

export const measureBenchmark = (
  observation: BenchmarkObservation,
  fixture: BenchmarkFixtureV1,
  thresholds: { readonly precision?: number; readonly recall?: number } = {},
): BenchmarkResult => {
  const excluded = fixture.excluded ?? { entities: [], relations: [], findings: [] }
  const quality = {
    entities: setMetrics(observation.entities, fixture.supported.entities, excluded.entities),
    relations: setMetrics(observation.relations, fixture.supported.relations, excluded.relations),
    findings: setMetrics(observation.findings, fixture.supported.findings, excluded.findings),
  }
  const actualEntities = unique(observation.entities)
  const evidenced = unique(observation.evidenced ?? [])
  const evidenceRatio = ratio([...actualEntities].filter((id) => evidenced.has(id)).length, actualEntities.size)
  const findingDensity = ratio(unique(observation.findings).size, actualEntities.size)
  const precisionThreshold = thresholds.precision ?? 0.95
  const recallThreshold = thresholds.recall ?? 1
  const regressions: string[] = []
  for (const [name, metrics] of Object.entries(quality)) {
    if (metrics.precision < precisionThreshold) regressions.push(`${name}.precision below ${precisionThreshold}`)
    if (metrics.recall < recallThreshold) regressions.push(`${name}.recall below ${recallThreshold}`)
  }
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    quality,
    evidenceRatio,
    findingDensity,
    findingCategoryDistribution: Object.fromEntries(Object.entries(observation.findingCategories ?? {}).sort(([a], [b]) => a.localeCompare(b))),
    excludedCaseCount: excluded.entities.length + excluded.relations.length + excluded.findings.length,
    excludedCaseIds: { entities: excluded.entities.length, relations: excluded.relations.length, findings: excluded.findings.length },
    thresholds: { precision: precisionThreshold, recall: recallThreshold },
    regressions,
  }
}

export type BenchmarkSnapshot = Readonly<Record<string, string>>

export type BenchmarkSnapshotDiff = {
  readonly added: number
  readonly removed: number
  readonly unchanged: number
  readonly reclassified: number
  readonly unchangedEvidence: number
}

export const compareBenchmarkSnapshots = (
  previous: BenchmarkSnapshot,
  current: BenchmarkSnapshot,
): BenchmarkSnapshotDiff => {
  const ids = new Set([...Object.keys(previous), ...Object.keys(current)])
  let added = 0
  let removed = 0
  let unchanged = 0
  let reclassified = 0
  let unchangedEvidence = 0
  for (const id of ids) {
    if (!(id in previous)) { added += 1; continue }
    if (!(id in current)) { removed += 1; continue }
    if (previous[id] === current[id]) unchanged += 1
    else reclassified += 1
    if (previous[id] === current[id]) unchangedEvidence += 1
  }
  return { added, removed, unchanged, reclassified, unchangedEvidence }
}

export type AgentEfficiencyObservation = {
  readonly hits: number
  readonly queries: number
  readonly latencyMs: readonly number[]
  readonly responseBytes: readonly number[]
  readonly estimatedTokens: readonly number[]
  readonly corpusBytes: number
}

const percentile95 = (values: readonly number[]): number => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
}

export const measureAgentEfficiency = (observation: AgentEfficiencyObservation) => ({
  hitRate: ratio(observation.hits, observation.queries),
  latencyP95Ms: percentile95(observation.latencyMs),
  responseBytesP95: percentile95(observation.responseBytes),
  estimatedTokensP95: percentile95(observation.estimatedTokens),
  corpusBytes: observation.corpusBytes,
  contextReduction: observation.corpusBytes > 0 ? 1 - (percentile95(observation.responseBytes) / observation.corpusBytes) : 0,
})

export const formatBenchmarkText = (result: BenchmarkResult): string => [
  `Precision: entities ${result.quality.entities.precision.toFixed(3)}, relations ${result.quality.relations.precision.toFixed(3)}, findings ${result.quality.findings.precision.toFixed(3)}`,
  `Recall: entities ${result.quality.entities.recall.toFixed(3)}, relations ${result.quality.relations.recall.toFixed(3)}, findings ${result.quality.findings.recall.toFixed(3)}`,
  `Evidence ratio: ${result.evidenceRatio.toFixed(3)}`,
  `Finding density: ${result.findingDensity.toFixed(3)}`,
  `Excluded cases: ${result.excludedCaseCount}`,
  `Regressions: ${result.regressions.length ? result.regressions.join('; ') : 'none'}`,
].join('\n')
