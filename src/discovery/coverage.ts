import { canonicalJsonV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import type { Coverage } from '../schemas/knowledge.js'

const MAX_COVERAGE = 1_000
const SAMPLE_SIZE = 8
export const hasAggregatedCoverage = (coverage: readonly Coverage[]): boolean => coverage.some(entry => entry.reason?.startsWith('{"aggregation":"coverage-v1",'))
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
const ordered = (entries: readonly Coverage[]): Coverage[] => [...entries].sort((a, b) => compare(canonicalJsonV1(a), canonicalJsonV1(b)))

/** Keep legacy bytes below the bound and summarize details using existing strict v1 fields. */
export const boundCoverage = (coverage: Coverage[]): Coverage[] => {
  if (coverage.length <= MAX_COVERAGE) return coverage
  const retained: Coverage[] = []
  const counts = new Map<Coverage, number>()
  const groups = new Map<string, Coverage[]>()
  for (const entry of coverage) {
    if (hasAggregatedCoverage([entry])) {
      retained.push(entry)
      try {
        const count: unknown = JSON.parse(entry.reason!).count
        if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0) counts.set(entry, count)
      } catch { /* A caller-provided reason is still valid coverage text. */ }
      continue
    }
    // Limit scopes are read by downstream gates; reuse is run provenance.
    if (entry.scope === 'reused-entities' || entry.scope.startsWith('limits:')) { retained.push(entry); continue }
    const kind = entry.scope.split(':')[0]!
    const path = entry.evidence?.[0]?.path ?? entry.scope.split(':')[1] ?? '.'
    const prefix = path.includes('/') ? path.split('/')[0]! : '.'
    const key = canonicalJsonV1([entry.analyzer, entry.analyzerVersion, kind, entry.status, entry.reason, prefix])
    const group = groups.get(key) ?? []
    group.push(entry)
    groups.set(key, group)
  }
  const summaries: Coverage[] = [...groups.entries()].sort(([a], [b]) => compare(a, b)).map(([, entries]) => {
    const sorted = ordered(entries)
    const first = sorted[0]!
    const path = first.evidence?.[0]?.path ?? first.scope.split(':')[1] ?? '.'
    const prefix = path.includes('/') ? path.split('/')[0]! : '.'
    const evidence = [...new Map(sorted.flatMap(entry => entry.evidence ?? []).map(item => [canonicalJsonV1(item), item])).entries()]
      .sort(([a], [b]) => compare(a, b)).map(([, item]) => item)
    const summary = { aggregation: 'coverage-v1', count: entries.length, evidenceOmitted: Math.max(0, evidence.length - SAMPLE_SIZE), detailHash: sha256NormalizedV1(sorted), ...(first.reason === undefined ? {} : { reason: first.reason }) }
    let reason = JSON.stringify(summary)
    if (reason.length > 1_024) reason = JSON.stringify({ ...summary, reason: undefined, reasonTruncated: true })
    const scope = first.scope.includes(':') ? `${first.scope.split(':')[0]}:${prefix}`.slice(0, 512) : first.scope
    const value: Coverage = { analyzer: first.analyzer, ...(first.analyzerVersion ? { analyzerVersion: first.analyzerVersion } : {}), scope, status: first.status, reason, ...(evidence.length ? { evidence: evidence.slice(0, SAMPLE_SIZE) } : {}) }
    counts.set(value, entries.length)
    return value
  })
  const result = [...ordered(retained), ...summaries]
  if (result.length <= MAX_COVERAGE) return result
  // Keep operational failures ahead of sampled groups so aggregation cannot hide a failed scan.
  const priority = (entry: Coverage): number => entry.scope === 'reused-entities' ? 2 : entry.scope.startsWith('limits:') ? 1 : 0
  result.sort((a, b) => priority(b) - priority(a) || compare(canonicalJsonV1(a), canonicalJsonV1(b)))
  const omitted = result.slice(MAX_COVERAGE - 1)
  return [...result.slice(0, MAX_COVERAGE - 1), {
    analyzer: 'repository', scope: 'coverage-aggregation', status: 'partial',
    reason: JSON.stringify({ aggregation: 'coverage-v1', count: omitted.reduce((total, entry) => total + (counts.get(entry) ?? 1), 0), omittedGroups: omitted.length, detailHash: sha256NormalizedV1(omitted), reason: 'Coverage groups truncated; omitted details are not evidence of complete analysis.' }),
  }]
}
