import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { z } from 'zod'

import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { redactSecrets } from '../safety/repository.js'
import {
  claimPattern,
  claimSurfaces,
  exceptionFor,
  renderClaim,
  type PublicClaim,
  type PublicClaimsV1,
} from './claims.js'
import { resolveClaim, type ResolveContext } from './resolve.js'

/**
 * Compare what this repository says in public with what it can prove.
 *
 * The four outcomes are kept apart on purpose, because they need different actions. `stale` means a
 * surface states a value the repository has moved past — someone edits one line. `missing` means a
 * surface that promised to carry the claim does not. `contradiction` means two public surfaces
 * disagree with each other, which is the one an agent cannot resolve on its own and the reason this
 * check exists. `not-analyzed` means the claim could not be resolved at all: reported, never
 * counted as a pass.
 *
 * The report is publication-safe by construction. It carries claim ids, repository-relative surface
 * paths, line numbers, the two values, and a bounded excerpt with secrets redacted — never a
 * document's contents, never an absolute path.
 */

export const PUBLIC_PARITY_SCHEMA_VERSION = 1 as const
export const PARITY_EXCERPT_LIMIT = 160

const hash = z.string().regex(/^[a-f0-9]{64}$/)

export const PARITY_CODES = ['PARITY_STALE', 'PARITY_MISSING', 'PARITY_CONTRADICTION', 'PARITY_NOT_ANALYZED'] as const
export type ParityCode = (typeof PARITY_CODES)[number]

const ParityFindingSchema = z
  .object({
    id: hash,
    code: z.enum(PARITY_CODES),
    claimId: z.string().min(1).max(64),
    owner: z.string().min(1).max(128),
    severity: z.enum(['error', 'warn', 'info']),
    /** False when an exception accepted it. The reason travels with the finding, not in a comment. */
    blocking: z.boolean(),
    surface: z.string().max(512).optional(),
    line: z.number().int().positive().optional(),
    stated: z.string().max(256).optional(),
    canonical: z.string().max(256).optional(),
    message: z.string().min(1).max(1_024),
    remediation: z.string().min(1).max(1_024),
    excerpt: z.string().max(PARITY_EXCERPT_LIMIT).optional(),
    acceptedReason: z.string().max(512).optional(),
  })
  .strict()

export type ParityFinding = z.infer<typeof ParityFindingSchema>

export const PublicParityReportV1Schema = z
  .object({
    type: z.literal('public-parity-report'),
    schemaVersion: z.literal(PUBLIC_PARITY_SCHEMA_VERSION),
    contentHash: hash,
    contentHashAlgo: z.literal('sha256-normalized-v1'),
    project: z.object({ name: z.string().min(1).max(128) }).strict(),
    sourceRevision: z.string().min(1).max(128),
    sourceRevisionKind: z.enum(['git', 'content']),
    registryVersion: z.string().min(1).max(64),
    registryHash: hash,
    status: z.enum(['pass', 'needs-review', 'blocked']),
    metrics: z
      .object({
        claims: z.number().int().nonnegative(),
        surfaces: z.number().int().nonnegative(),
        matched: z.number().int().nonnegative(),
        stale: z.number().int().nonnegative(),
        missing: z.number().int().nonnegative(),
        contradictions: z.number().int().nonnegative(),
        notAnalyzed: z.number().int().nonnegative(),
        accepted: z.number().int().nonnegative(),
        blocking: z.number().int().nonnegative(),
      })
      .strict(),
    findings: z.array(ParityFindingSchema).max(10_000),
    /** Surfaces the registry names that do not exist in this checkout. */
    missingSurfaces: z.array(z.string().max(512)).max(64),
    limitations: z.array(z.string().min(1).max(512)).max(32),
  })
  .strict()

export type PublicParityReportV1 = z.infer<typeof PublicParityReportV1Schema>

export type CheckParityOptions = ResolveContext & {
  readonly registry: PublicClaimsV1
  readonly project: { readonly name: string }
  readonly sourceRevision: string
  readonly sourceRevisionKind: 'git' | 'content'
  /** File contents by surface path. Defaults to reading under `root`. */
  readonly readSurface?: (path: string) => string | undefined
}

type Occurrence = { readonly surface: string; readonly line: number; readonly stated: string; readonly excerpt: string }

const findingId = (parts: Record<string, unknown>): string => sha256NormalizedV1(parts)

const excerptOf = (line: string): string => {
  const collapsed = redactSecrets(line.trim()).replace(/\s+/g, ' ')
  return collapsed.length <= PARITY_EXCERPT_LIMIT ? collapsed : `${collapsed.slice(0, PARITY_EXCERPT_LIMIT - 1)}…`
}

/**
 * Every occurrence of a claim in one surface, with the line it sits on.
 *
 * A `cli-command` claim has no value to extract: the command either appears or it does not, and
 * the canonical value is the command itself. Everything else is read through the claim's template
 * for that surface, so one fact stated two ways is still one claim.
 */
const occurrences = (claim: PublicClaim, surface: string, content: string): readonly Occurrence[] => {
  const found: Occurrence[] = []
  const lines = content.split('\n')
  for (const [index, line] of lines.entries()) {
    if (claim.evidence.kind === 'cli-command') {
      if (line.includes(claim.evidence.command)) {
        found.push({ surface, line: index + 1, stated: claim.evidence.command, excerpt: excerptOf(line) })
      }
      continue
    }
    // A fresh pattern per line: a global regex carries lastIndex between calls.
    for (const match of line.matchAll(claimPattern(claim, surface))) {
      const stated = match[1]
      if (stated === undefined) continue
      found.push({ surface, line: index + 1, stated, excerpt: excerptOf(line) })
    }
  }
  return found
}

export const checkPublicParity = (options: CheckParityOptions): PublicParityReportV1 => {
  const { registry } = options
  const read = options.readSurface ?? ((path: string): string | undefined => {
    const absolute = resolve(options.root, path)
    return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined
  })

  const surfaces = claimSurfaces(registry)
  const contents = new Map<string, string | undefined>(surfaces.map((surface) => [surface, read(surface)]))
  const missingSurfaces = surfaces.filter((surface) => contents.get(surface) === undefined)

  const findings: ParityFinding[] = []
  const limitations: string[] = []
  let matched = 0

  for (const claim of [...registry.claims].sort((a, b) => a.claimId.localeCompare(b.claimId))) {
    const resolved = resolveClaim(claim, options)
    const declared = [...claim.required, ...(claim.optional ?? [])]

    if (resolved.status === 'not-analyzed') {
      findings.push({
        id: findingId({ code: 'PARITY_NOT_ANALYZED', claimId: claim.claimId }),
        code: 'PARITY_NOT_ANALYZED',
        claimId: claim.claimId,
        owner: claim.owner,
        severity: 'warn',
        blocking: false,
        message: `${claim.statement} could not be resolved: ${resolved.reason}`,
        remediation: claim.remediation,
      })
      limitations.push(`${claim.claimId}: ${resolved.reason}`)
      continue
    }

    const stated = new Map<string, readonly Occurrence[]>()
    for (const surface of declared) {
      const content = contents.get(surface)
      if (content === undefined) continue
      stated.set(surface, occurrences(claim, surface, content))
    }

    /*
     * A contradiction is about the surfaces agreeing with each other, so it is decided over the
     * whole claim rather than per surface: two public pages stating different numbers is a finding
     * even when neither of them matches the repository.
     */
    const distinct = [...new Set([...stated.values()].flat().map((entry) => entry.stated))].sort()
    if (distinct.length > 1) {
      findings.push({
        id: findingId({ code: 'PARITY_CONTRADICTION', claimId: claim.claimId, distinct }),
        code: 'PARITY_CONTRADICTION',
        claimId: claim.claimId,
        owner: claim.owner,
        severity: 'error',
        blocking: true,
        canonical: resolved.value,
        message: `Public surfaces state ${distinct.join(' and ')} for ${claim.statement.toLowerCase()}; the repository says ${resolved.value}.`,
        remediation: claim.remediation,
      })
    }

    for (const surface of declared) {
      const content = contents.get(surface)
      if (content === undefined) continue
      const here = stated.get(surface) ?? []
      const exception = exceptionFor(registry, claim.claimId, surface)
      const accepted = exception !== undefined

      if (!here.length) {
        if (!claim.required.includes(surface)) continue
        findings.push({
          id: findingId({ code: 'PARITY_MISSING', claimId: claim.claimId, surface }),
          code: 'PARITY_MISSING',
          claimId: claim.claimId,
          owner: claim.owner,
          severity: accepted ? 'info' : claim.severity,
          blocking: !accepted && claim.severity === 'error',
          surface,
          canonical: resolved.value,
          message: `${surface} does not state ${claim.statement.toLowerCase()}`,
          remediation: `Add "${renderClaim(claim, resolved.value, surface)}" to ${surface}, or record an exception with a reason.`,
          ...(accepted ? { acceptedReason: exception.reason } : {}),
        })
        continue
      }

      for (const occurrence of here) {
        if (occurrence.stated === resolved.value) {
          matched += 1
          continue
        }
        findings.push({
          id: findingId({ code: 'PARITY_STALE', claimId: claim.claimId, surface, line: occurrence.line }),
          code: 'PARITY_STALE',
          claimId: claim.claimId,
          owner: claim.owner,
          severity: accepted ? 'info' : claim.severity,
          blocking: !accepted && claim.severity === 'error',
          surface,
          line: occurrence.line,
          stated: occurrence.stated,
          canonical: resolved.value,
          message: `${surface}:${occurrence.line} states ${occurrence.stated} where the repository says ${resolved.value}.`,
          remediation: claim.remediation,
          excerpt: occurrence.excerpt,
          ...(accepted ? { acceptedReason: exception.reason } : {}),
        })
      }
    }
  }

  for (const surface of missingSurfaces) {
    limitations.push(`${surface} is named by the registry but absent from this checkout.`)
  }

  findings.sort((a, b) => a.claimId.localeCompare(b.claimId) || a.code.localeCompare(b.code) || (a.surface ?? '').localeCompare(b.surface ?? '') || (a.line ?? 0) - (b.line ?? 0))

  const count = (code: ParityCode): number => findings.filter((finding) => finding.code === code).length
  const blocking = findings.filter((finding) => finding.blocking).length
  const payload = {
    type: 'public-parity-report' as const,
    schemaVersion: PUBLIC_PARITY_SCHEMA_VERSION,
    contentHashAlgo: 'sha256-normalized-v1' as const,
    project: { name: options.project.name },
    sourceRevision: options.sourceRevision,
    sourceRevisionKind: options.sourceRevisionKind,
    registryVersion: registry.registryVersion,
    registryHash: registry.contentHash,
    status: blocking ? ('blocked' as const) : findings.length ? ('needs-review' as const) : ('pass' as const),
    metrics: {
      claims: registry.claims.length,
      surfaces: surfaces.length - missingSurfaces.length,
      matched,
      stale: count('PARITY_STALE'),
      missing: count('PARITY_MISSING'),
      contradictions: count('PARITY_CONTRADICTION'),
      notAnalyzed: count('PARITY_NOT_ANALYZED'),
      accepted: findings.filter((finding) => finding.acceptedReason !== undefined).length,
      blocking,
    },
    findings,
    missingSurfaces,
    limitations: [...limitations].sort(),
  }
  return PublicParityReportV1Schema.parse({ ...payload, contentHash: sha256NormalizedV1(payload) })
}

export const parsePublicParityReport = (input: unknown): PublicParityReportV1 => {
  const report = PublicParityReportV1Schema.parse(input)
  if (contentHashForArtifactV1(report) !== report.contentHash) throw new Error('Invalid public-parity report content hash.')
  return report
}

export const formatPublicParityText = (report: PublicParityReportV1): readonly string[] => [
  `Public parity: ${report.status} (registry ${report.registryVersion}, ${report.metrics.claims} claim(s) over ${report.metrics.surfaces} surface(s))`,
  `Matched: ${report.metrics.matched}  Stale: ${report.metrics.stale}  Missing: ${report.metrics.missing}  Contradictions: ${report.metrics.contradictions}  Not analyzed: ${report.metrics.notAnalyzed}  Accepted: ${report.metrics.accepted}`,
  ...report.findings.flatMap((finding) => {
    const at = finding.surface ? ` ${finding.surface}${finding.line ? `:${finding.line}` : ''}` : ''
    const mark = finding.blocking ? 'BLOCKING' : finding.acceptedReason ? 'accepted' : finding.severity
    return [
      `  [${mark}] ${finding.code}${at} (${finding.claimId}, owner ${finding.owner}): ${finding.message}`,
      `    → ${finding.remediation}`,
      ...(finding.acceptedReason ? [`    accepted: ${finding.acceptedReason}`] : []),
    ]
  }),
  ...report.limitations.map((limitation) => `  limitation: ${limitation}`),
  `Content hash: ${report.contentHash}`,
]
