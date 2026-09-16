import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import type { DoctorReport } from '../doctor/run-doctor.js'
import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'
import { CLI_COMMAND_USAGE } from '../cli/usage.js'
import type { ClaimEvidence, ClaimTransform, PublicClaim } from './claims.js'

/**
 * Resolving the canonical value, and what to do when it cannot be resolved.
 *
 * A resolver reads one repository fact: a field in a committed file, a count over the snapshot this
 * run produced, a figure the doctor measured, or whether a CLI command exists. When a resolver
 * cannot answer — the artifact is absent, the field is missing, the doctor was not run — the claim
 * is reported `not-analyzed`. It is never reported as a match: a claim nobody could check is not a
 * claim anybody verified, and quietly passing it is how a parity report becomes decoration.
 */

export type ResolvedClaim =
  | { readonly status: 'resolved'; readonly value: string }
  | { readonly status: 'not-analyzed'; readonly reason: string }

export type ResolveContext = {
  readonly root: string
  readonly config: DocBridgeConfigV1
  /** The snapshot this run produced. Absent when the caller could not build one. */
  readonly snapshot?: DiscoverySnapshotV1
  /** The doctor's report. Absent unless the caller measured it; a doctor claim is then unchecked. */
  readonly doctor?: DoctorReport
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown

const dotted = (value: unknown, field: string): unknown =>
  field.split('.').reduce<unknown>((current, key) => {
    if (current === null || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[key]
  }, value)

const applyTransform = (value: number, transform: ClaimTransform | undefined): string => {
  switch (transform) {
    case 'round':
      return String(Math.round(value))
    case 'percent-1dp':
      return (value * 100).toFixed(1)
    case 'percent-0dp':
      return String(Math.round(value * 100))
    case 'negative-percent-2dp':
      return value < 0 ? (Math.abs(value) * 100).toFixed(2) : ''
    case 'negative-seconds-2dp':
      return value < 0 ? (Math.abs(value) / 1_000).toFixed(2) : ''
    default:
      return String(value)
  }
}

const scalar = (value: unknown, transform: ClaimTransform | undefined): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return applyTransform(value, transform) || undefined
  if (typeof value === 'string' && value.length > 0 && value.length <= 128) return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return undefined
}

const doctorMetric = (report: DoctorReport, metric: Extract<ClaimEvidence, { kind: 'doctor-metric' }>['metric']): string | undefined => {
  const { coverage } = report
  switch (metric) {
    case 'agent-docs-indexed':
      return String(coverage.agentDocs.indexed)
    case 'agent-docs-total':
      return String(coverage.agentDocs.total)
    case 'grade':
      return report.grade
    case 'score':
      return String(report.score)
    case 'reachability-pct':
      return String(coverage.reachability.pct)
    case 'connectivity-pct':
      return String(coverage.connectivity.pct)
    case 'benchmark-hit-at-3-pct':
      return coverage.benchmark.status === 'measured' ? (coverage.benchmark.hitAt3 * 100).toFixed(1) : undefined
    default:
      return undefined
  }
}

export const resolveClaim = (claim: PublicClaim, context: ResolveContext): ResolvedClaim => {
  const evidence = claim.evidence
  switch (evidence.kind) {
    case 'package-field': {
      const path = resolve(context.root, 'package.json')
      if (!existsSync(path)) return { status: 'not-analyzed', reason: 'package.json is not present.' }
      const value = scalar(dotted(readJson(path), evidence.field), undefined)
      return value === undefined
        ? { status: 'not-analyzed', reason: `package.json has no scalar field "${evidence.field}".` }
        : { status: 'resolved', value }
    }
    case 'artifact-field': {
      const path = resolve(context.root, evidence.path)
      if (!existsSync(path)) return { status: 'not-analyzed', reason: `${evidence.path} is not present.` }
      const value = scalar(dotted(readJson(path), evidence.field), evidence.transform)
      /*
       * An empty rendering is a signed transform refusing: the field is there, but the measurement
       * no longer points the way the prose claims. That is a finding about the claim, not a match.
       */
      return value === undefined
        ? { status: 'not-analyzed', reason: `${evidence.path} has no scalar field "${evidence.field}" that renders under ${evidence.transform ?? 'identity'}.` }
        : { status: 'resolved', value }
    }
    case 'artifact-sum': {
      /*
       * Prose states a total where the artifact stores the parts: "96 executions" is both arms of a
       * round that records 48 per arm. Summing here keeps the claim bound to the measurement rather
       * than to a number somebody added up once.
       */
      const path = resolve(context.root, evidence.path)
      if (!existsSync(path)) return { status: 'not-analyzed', reason: `${evidence.path} is not present.` }
      const array = dotted(readJson(path), evidence.arrayField)
      if (!Array.isArray(array) || array.length === 0) {
        return { status: 'not-analyzed', reason: `${evidence.path} has no non-empty array at "${evidence.arrayField}".` }
      }
      let total = 0
      for (const element of array) {
        const part = dotted(element, evidence.field)
        if (typeof part !== 'number' || !Number.isFinite(part)) {
          return { status: 'not-analyzed', reason: `${evidence.path} has a non-numeric "${evidence.field}" in "${evidence.arrayField}".` }
        }
        total += part
      }
      const value = scalar(total, evidence.transform)
      return value === undefined
        ? { status: 'not-analyzed', reason: `The sum of "${evidence.field}" does not render under ${evidence.transform ?? 'identity'}.` }
        : { status: 'resolved', value }
    }
    case 'snapshot-count': {
      if (!context.snapshot) return { status: 'not-analyzed', reason: 'No snapshot was available to count.' }
      const count = context.snapshot.entities.filter((entity) => entity.kind === evidence.entityKind).length
      return { status: 'resolved', value: String(count) }
    }
    case 'doctor-metric': {
      if (!context.doctor) return { status: 'not-analyzed', reason: 'The doctor was not measured for this run.' }
      const value = doctorMetric(context.doctor, evidence.metric)
      return value === undefined
        ? { status: 'not-analyzed', reason: `The doctor reported no ${evidence.metric}.` }
        : { status: 'resolved', value }
    }
    case 'cli-command': {
      /*
       * A presence claim: the canonical value is the command itself, and the CLI's own usage text is
       * the authority. A command documented in public that the CLI does not offer is the same kind
       * of drift as a stale number, and it fails the same way.
       */
      return CLI_COMMAND_USAGE.includes(evidence.command)
        ? { status: 'resolved', value: evidence.command }
        : { status: 'not-analyzed', reason: `The CLI usage does not offer "${evidence.command}".` }
    }
    default:
      return { status: 'not-analyzed', reason: 'Unknown evidence kind.' }
  }
}
