import { z } from 'zod'

import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { searchIndex, type SearchMatch } from '../query/search.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'

export const RETRIEVAL_BENCH_SCHEMA_VERSION = 1 as const

/**
 * Open Eval Format version this suite conforms to (`@agentskit/core/eval-format`).
 *
 * The format is mirrored here with Zod rather than imported so `ak-docs bench retrieval`
 * stays in the deterministic layer: `@agentskit/core` is an optional peer, and the
 * benchmark must run with no peer installed, no network and no API key. A test
 * cross-validates every committed suite against the real `validateEvalSuite`, so the
 * two definitions cannot drift apart silently.
 */
export const EVAL_FORMAT_VERSION = '2026-04' as const

const DEFAULT_LIMIT = 20
/** Payload depth an agent is assumed to read; also the k in hit@k. */
const CONTEXT_DEPTH = 3
/** Matches the existing agent-search estimate in src/query/query.ts. */
const BYTES_PER_TOKEN = 4

const EvalCaseExpectationSchema = z
  .object({
    contains: z.string().min(1).max(2_048).optional(),
    regex: z.object({ body: z.string().min(1).max(2_048), flags: z.string().max(8).optional() }).strict().optional(),
    equalsNormalized: z.string().min(1).max(2_048).optional(),
    semanticSimilarity: z.number().min(0).max(1).optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    'An expectation must declare at least one rule.',
  )

/**
 * A target matches a ranked result whose `id` **or** `path` equals it, so a case stays
 * valid while entity identity evolves: `docs/mcp.md` keeps working when the index starts
 * carrying `document:docs/mcp.md`, and a module target keeps working once modules are
 * projected into the index.
 */
const RetrievalCaseMetadataSchema = z
  .object({
    expectedTargets: z.array(z.string().min(1).max(512)).min(1).max(32),
    lang: z.enum(['en', 'pt']).optional(),
    kind: z.enum(['symbol', 'path', 'question', 'ownership']).optional(),
    agent: z.boolean().optional(),
  })
  // The Open Eval Format allows arbitrary case metadata; keep unknown keys rather than
  // rejecting a suite a generic runner wrote.
  .passthrough()

export const RetrievalSuiteCaseSchema = z
  .object({
    id: z.string().min(1).max(128),
    input: z.string().min(1).max(2_048),
    expected: z.union([EvalCaseExpectationSchema, z.string().min(1).max(2_048)]).optional(),
    metadata: RetrievalCaseMetadataSchema,
  })
  .strict()

export const RetrievalSuiteSchema = z
  .object({
    evalFormatVersion: z.literal(EVAL_FORMAT_VERSION),
    name: z.string().min(1).max(128),
    description: z.string().max(1_024).optional(),
    tags: z.array(z.string().min(1).max(64)).max(32).optional(),
    cases: z.array(RetrievalSuiteCaseSchema).min(1).max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>()
    for (const [index, entry] of value.cases.entries()) {
      if (seen.has(entry.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['cases', index, 'id'], message: `Duplicate case id: ${entry.id}` })
      }
      seen.add(entry.id)
    }
  })

export type RetrievalSuite = z.infer<typeof RetrievalSuiteSchema>
export type RetrievalSuiteCase = z.infer<typeof RetrievalSuiteCaseSchema>

const MetricsSchema = z
  .object({
    caseCount: z.number().int().nonnegative(),
    hitAt1: z.number().min(0).max(1),
    hitAt3: z.number().min(0).max(1),
    meanReciprocalRank: z.number().min(0).max(1),
    meanContextBytes: z.number().int().nonnegative(),
    meanApproxTokens: z.number().int().nonnegative(),
    zeroResultRate: z.number().min(0).max(1),
    tokenMethod: z.literal('approximate'),
  })
  .strict()

export type RetrievalMetrics = z.infer<typeof MetricsSchema>

const CaseOutcomeSchema = z
  .object({
    id: z.string().min(1).max(128),
    input: z.string().min(1).max(2_048),
    lang: z.enum(['en', 'pt']).optional(),
    kind: z.enum(['symbol', 'path', 'question', 'ownership']).optional(),
    expectedTargets: z.array(z.string().min(1).max(512)).min(1),
    rankedTargets: z.array(z.string().min(1).max(512)).max(64),
    /** 1-based rank of the first expected target, or null when it is absent from the ranking. */
    rank: z.number().int().positive().nullable(),
    hitAt1: z.boolean(),
    hitAt3: z.boolean(),
    reciprocalRank: z.number().min(0).max(1),
    resultCount: z.number().int().nonnegative(),
    contextBytes: z.number().int().nonnegative(),
    approxTokens: z.number().int().nonnegative(),
    /** Result of the portable Open Eval Format expectation, when the case declares one. */
    expectationMatched: z.boolean().nullable(),
  })
  .strict()

export type RetrievalCaseOutcome = z.infer<typeof CaseOutcomeSchema>

export const RetrievalBenchResultV1Schema = z
  .object({
    type: z.literal('retrieval-benchmark-result'),
    schemaVersion: z.literal(RETRIEVAL_BENCH_SCHEMA_VERSION),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    contentHashAlgo: z.literal('sha256-normalized-v1'),
    suite: z
      .object({
        name: z.string().min(1).max(128),
        caseCount: z.number().int().positive(),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    index: z
      .object({
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        entryCount: z.number().int().nonnegative(),
      })
      .strict(),
    limit: z.number().int().positive().max(1_000),
    metrics: MetricsSchema,
    byLang: z.record(z.string().min(1).max(16), MetricsSchema),
    byKind: z.record(z.string().min(1).max(32), MetricsSchema),
    cases: z.array(CaseOutcomeSchema).max(10_000),
  })
  .strict()

export type RetrievalBenchResultV1 = z.infer<typeof RetrievalBenchResultV1Schema>

export const parseRetrievalSuite = (raw: unknown): RetrievalSuite => RetrievalSuiteSchema.parse(raw)

export const parseRetrievalBenchResult = (raw: unknown): RetrievalBenchResultV1 => {
  const result = RetrievalBenchResultV1Schema.parse(raw)
  if (contentHashForArtifactV1(result) !== result.contentHash) {
    throw new Error('Invalid retrieval benchmark result content hash.')
  }
  return result
}

/** Normalize a target or result value so `./docs/a.md`, `docs/a.md` and a Windows path compare equal. */
const normalizeTarget = (value: string): string => value.replaceAll('\\', '/').replace(/^\.\//, '').trim()

/**
 * The identities a ranked result can be addressed by. Both are compared so a suite written
 * against repository paths keeps working once the index carries snapshot entity ids.
 */
const matchTargets = (match: SearchMatch): string[] =>
  [...new Set([normalizeTarget(match.id), normalizeTarget(match.path)])].filter(Boolean)

/**
 * The bytes an agent would receive for the top results. Mirrors the `matches` entries of
 * the agent-search payload in src/query/query.ts, so the figure tracks a real payload
 * rather than an internal representation.
 */
const contextPayload = (matches: readonly SearchMatch[]): unknown =>
  matches.map((match) => ({
    type: match.type,
    id: match.id,
    path: match.path,
    ...(match.summary ? { summary: match.summary } : {}),
  }))

/**
 * Portable Open Eval Format expectation, evaluated against the newline-joined ranking the
 * deterministic agent function returns. Kept behaviour-compatible with
 * `matchesExpectation` from `@agentskit/core/eval-format`.
 */
export const matchesRetrievalExpectation = (output: string, expected: RetrievalSuiteCase['expected']): boolean => {
  if (expected === undefined) return true
  if (typeof expected === 'string') return output.includes(expected)
  if (expected.contains !== undefined && !output.includes(expected.contains)) return false
  if (expected.equalsNormalized !== undefined && output.trim().toLowerCase() !== expected.equalsNormalized.trim().toLowerCase()) return false
  if (expected.regex !== undefined && !new RegExp(expected.regex.body, expected.regex.flags).test(output)) return false
  // semanticSimilarity needs an embedder; the deterministic benchmark never evaluates it.
  return true
}

/** The deterministic agent function: a query in, the ranked identities out, one per line. */
export const rankedOutput = (matches: readonly SearchMatch[]): string =>
  matches.map((match) => matchTargets(match).join(' ')).join('\n')

const mean = (values: readonly number[]): number => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0)
const rate = (count: number, total: number): number => (total ? count / total : 0)
/** Six decimals keep the artifact hash stable across platforms without losing useful precision. */
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000

const aggregate = (outcomes: readonly RetrievalCaseOutcome[]): RetrievalMetrics => ({
  caseCount: outcomes.length,
  hitAt1: round(rate(outcomes.filter((outcome) => outcome.hitAt1).length, outcomes.length)),
  hitAt3: round(rate(outcomes.filter((outcome) => outcome.hitAt3).length, outcomes.length)),
  meanReciprocalRank: round(mean(outcomes.map((outcome) => outcome.reciprocalRank))),
  meanContextBytes: Math.round(mean(outcomes.map((outcome) => outcome.contextBytes))),
  meanApproxTokens: Math.round(mean(outcomes.map((outcome) => outcome.approxTokens))),
  zeroResultRate: round(rate(outcomes.filter((outcome) => outcome.resultCount === 0).length, outcomes.length)),
  tokenMethod: 'approximate',
})

const groupBy = (
  outcomes: readonly RetrievalCaseOutcome[],
  key: (outcome: RetrievalCaseOutcome) => string | undefined,
): Record<string, RetrievalMetrics> => {
  const groups = new Map<string, RetrievalCaseOutcome[]>()
  for (const outcome of outcomes) {
    const value = key(outcome)
    if (value === undefined) continue
    const group = groups.get(value) ?? []
    group.push(outcome)
    groups.set(value, group)
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([value, group]) => [value, aggregate(group)]))
}

export type RunRetrievalBenchOptions = {
  readonly index: DocBridgeIndexV1
  readonly suite: RetrievalSuite
  readonly limit?: number
}

/**
 * Measure the deterministic retrieval path against a golden suite.
 *
 * The result carries no timestamp and no latency, so two runs over the same index and
 * suite are byte-identical and their content hashes match. Wall time belongs in the
 * caller's output, never in a comparable artifact.
 */
export const runRetrievalBench = (options: RunRetrievalBenchOptions): RetrievalBenchResultV1 => {
  const limit = options.limit ?? DEFAULT_LIMIT
  const outcomes: RetrievalCaseOutcome[] = options.suite.cases.map((entry) => {
    const matches = searchIndex(options.index, entry.input, limit)
    const expectedTargets = entry.metadata.expectedTargets.map(normalizeTarget)
    const expected = new Set(expectedTargets)
    const rankedTargets = matches.map((match) => matchTargets(match).join(' '))
    const position = matches.findIndex((match) => matchTargets(match).some((target) => expected.has(target)))
    const rank = position >= 0 ? position + 1 : null
    const contextBytes = Buffer.byteLength(JSON.stringify(contextPayload(matches.slice(0, CONTEXT_DEPTH))), 'utf8')
    return CaseOutcomeSchema.parse({
      id: entry.id,
      input: entry.input,
      ...(entry.metadata.lang ? { lang: entry.metadata.lang } : {}),
      ...(entry.metadata.kind ? { kind: entry.metadata.kind } : {}),
      expectedTargets,
      rankedTargets: rankedTargets.slice(0, CONTEXT_DEPTH),
      rank,
      hitAt1: rank === 1,
      hitAt3: rank !== null && rank <= CONTEXT_DEPTH,
      reciprocalRank: round(rank === null ? 0 : 1 / rank),
      resultCount: matches.length,
      contextBytes,
      approxTokens: Math.ceil(contextBytes / BYTES_PER_TOKEN),
      // Evaluated over the same top-three window hit@3 uses, so the portable verdict a
      // generic Open Eval Format runner computes agrees with the metric this repository gates.
      expectationMatched:
        entry.expected === undefined ? null : matchesRetrievalExpectation(rankedOutput(matches.slice(0, CONTEXT_DEPTH)), entry.expected),
    })
  })

  const base = {
    type: 'retrieval-benchmark-result' as const,
    schemaVersion: RETRIEVAL_BENCH_SCHEMA_VERSION,
    contentHash: '0'.repeat(64),
    contentHashAlgo: 'sha256-normalized-v1' as const,
    suite: {
      name: options.suite.name,
      caseCount: options.suite.cases.length,
      contentHash: sha256NormalizedV1(options.suite),
    },
    index: {
      contentHash: options.index.contentHash,
      entryCount: options.index.knowledge.length,
    },
    limit,
    metrics: aggregate(outcomes),
    byLang: groupBy(outcomes, (outcome) => outcome.lang),
    byKind: groupBy(outcomes, (outcome) => outcome.kind),
    cases: outcomes,
  }
  return RetrievalBenchResultV1Schema.parse({ ...base, contentHash: contentHashForArtifactV1(base) })
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`

export const formatRetrievalBenchText = (result: RetrievalBenchResultV1): readonly string[] => {
  const misses = result.cases.filter((outcome) => !outcome.hitAt3)
  return [
    `Retrieval benchmark: ${result.suite.name}`,
    `Cases: ${result.metrics.caseCount} | Index entries: ${result.index.entryCount}`,
    `hit@1: ${percent(result.metrics.hitAt1)} | hit@3: ${percent(result.metrics.hitAt3)} | MRR: ${result.metrics.meanReciprocalRank.toFixed(3)}`,
    `Zero results: ${percent(result.metrics.zeroResultRate)} | Mean context: ${result.metrics.meanContextBytes} bytes (~${result.metrics.meanApproxTokens} tokens, approximate)`,
    ...Object.entries(result.byLang).map(([lang, metrics]) => `  ${lang}: hit@3 ${percent(metrics.hitAt3)} over ${metrics.caseCount} case(s)`),
    ...Object.entries(result.byKind).map(([kind, metrics]) => `  ${kind}: hit@3 ${percent(metrics.hitAt3)} over ${metrics.caseCount} case(s)`),
    ...(misses.length
      ? [`Missed (${misses.length}):`, ...misses.slice(0, 10).map((outcome) => `  ${outcome.id}: "${outcome.input}" → ${outcome.rankedTargets[0] ?? '(no result)'}`)]
      : ['Missed: none']),
  ]
}
