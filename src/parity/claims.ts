import { z } from 'zod'

import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'

/**
 * What this repository says in public, and where the truth lives.
 *
 * Documentation drifts silently. The four study figures in `README.md` also appear in
 * `docs/study/README.md`, and both are only as current as the artifacts under `docs/study/`: an
 * edit to one of the three would leave the other two stating a number the repository has moved
 * past, and nothing compared them, because nothing said which repository fact each public
 * sentence was standing in for. (A sample that declares itself illustrative — the doctor block in
 * `README.md` says so in as many words — is not a claim, and the registry does not name it.)
 *
 * A claim names that fact. It declares where the canonical value comes from (`evidence`), how the
 * claim appears in prose (`template`), and which public surfaces are expected to carry it. The
 * checker resolves the value, finds the occurrences, and reports the difference — so a stale
 * sentence is a finding with a file, a line and a remediation rather than something a reader
 * happens to notice.
 */

export const PUBLIC_CLAIMS_SCHEMA_VERSION = 1 as const
export const PUBLIC_CLAIMS_CONTENT_HASH_ALGO = 'sha256-normalized-v1' as const

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
const surfacePath = z
  .string()
  .min(1)
  .max(512)
  /*
   * A surface is a file in this repository, addressed the way every other artifact addresses one:
   * repository-relative, forward slashes, no escape upwards. An absolute path in the registry
   * would put an operator's home directory in a report that is meant to be publication-safe.
   */
  .regex(/^[A-Za-z0-9._][A-Za-z0-9._/-]*$/, 'A surface is a repository-relative path.')
  .refine((value) => !value.includes('..'), 'A surface may not climb out of the repository.')

/** How the stated value is read out of prose. Exactly one `{value}`; everything else is literal. */
const template = z
  .string()
  .min(1)
  .max(240)
  .refine((value) => value.split('{value}').length === 2, 'A template must contain exactly one {value}.')
  .refine((value) => !value.includes('\n'), 'A template matches within one line.')

export const CLAIM_VALUE_TYPES = ['number', 'percent', 'semver', 'text'] as const
export type ClaimValueType = (typeof CLAIM_VALUE_TYPES)[number]

/*
 * A transform renders a repository number the way prose states it. Two of them are signed on
 * purpose: prose says "18.46% fewer" and "39.75 seconds lower", carrying the direction in a word
 * the checker cannot read, so the magnitude is rendered only while the measurement is still
 * negative. A sign that flips stops resolving instead of matching the same digits for the opposite
 * result.
 */
export const CLAIM_TRANSFORMS = ['identity', 'round', 'percent-1dp', 'percent-0dp', 'negative-percent-2dp', 'negative-seconds-2dp'] as const
export type ClaimTransform = (typeof CLAIM_TRANSFORMS)[number]

/**
 * Where a canonical value comes from. Every kind is deterministic and local: a field in a committed
 * file, a count over the snapshot this run produced, a figure the doctor measured, or the existence
 * of a CLI command. Nothing here reaches the network, and nothing asks a model.
 */
const EvidenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('package-field'), field: z.string().min(1).max(128) }).strict(),
  z
    .object({
      kind: z.literal('artifact-field'),
      path: surfacePath,
      /** A dotted path into the JSON artifact: `metrics.hitAt3`. */
      field: z.string().min(1).max(256),
      transform: z.enum(CLAIM_TRANSFORMS).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('artifact-sum'),
      path: surfacePath,
      /** The array to sum over: `arms`. */
      arrayField: z.string().min(1).max(256),
      /** The numeric field to sum inside each element: `observationCount`. */
      field: z.string().min(1).max(256),
      transform: z.enum(CLAIM_TRANSFORMS).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('snapshot-count'),
      entityKind: z.enum(['document', 'module', 'area', 'package']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('doctor-metric'),
      metric: z.enum([
        'agent-docs-indexed',
        'agent-docs-total',
        'grade',
        'score',
        'reachability-pct',
        'connectivity-pct',
        'benchmark-hit-at-3-pct',
      ]),
    })
    .strict(),
  z.object({ kind: z.literal('cli-command'), command: z.string().min(1).max(128) }).strict(),
])

export type ClaimEvidence = z.infer<typeof EvidenceSchema>

const ClaimSchema = z
  .object({
    claimId: identifier,
    /** What the claim asserts, for a reader of the report. Never a path or a URL. */
    statement: z.string().min(1).max(512),
    /** Who answers for it. An ownership id, a team, or a person's handle. */
    owner: z.string().min(1).max(128),
    valueType: z.enum(CLAIM_VALUE_TYPES),
    /** How the value appears in prose. A `cli-command` claim has no value to read, so it has none. */
    template: template.optional(),
    evidence: EvidenceSchema,
    /**
     * Per-surface wording, when one fact is stated differently in different places: a README bullet
     * and a study page carry the same number in different sentences, and a claim that could only
     * hold one template would have to be split into two claims about one fact.
     */
    templates: z.record(surfacePath, template).optional(),
    /** Surfaces that must state the claim. A surface that omits it is a `missing` finding. */
    required: z.array(surfacePath).min(1).max(32),
    /** Surfaces that may state it. Checked when the claim appears, never required to. */
    optional: z.array(surfacePath).max(32).optional(),
    severity: z.enum(['error', 'warn']),
    remediation: z.string().min(1).max(512),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.evidence.kind === 'cli-command') {
      if (value.template !== undefined || value.templates !== undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['template'], message: 'A cli-command claim is a presence check and carries no template.' })
      }
      return
    }
    if (value.template === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['template'], message: 'A claim that states a value needs a template.' })
    }
  })

export type PublicClaim = z.infer<typeof ClaimSchema>

/** A finding a maintainer decided to accept. The reason is mandatory: silence is what drift needs. */
const ExceptionSchema = z
  .object({
    claimId: identifier,
    surface: surfacePath,
    reason: z.string().min(8).max(512),
    /** Who accepted it, so the decision has an owner like every other approval here. */
    acceptedBy: z.string().min(1).max(128),
  })
  .strict()

export type PublicClaimException = z.infer<typeof ExceptionSchema>

const ClaimsPayloadSchema = z
  .object({
    type: z.literal('public-claims'),
    schemaVersion: z.literal(PUBLIC_CLAIMS_SCHEMA_VERSION),
    registryVersion: identifier,
    claims: z.array(ClaimSchema).min(1).max(512),
    exceptions: z.array(ExceptionSchema).max(128),
  })
  .strict()

export const PublicClaimsV1Schema = ClaimsPayloadSchema.extend({
  contentHash: hash,
  contentHashAlgo: z.literal(PUBLIC_CLAIMS_CONTENT_HASH_ALGO),
}).strict()

export type PublicClaimsV1 = z.infer<typeof PublicClaimsV1Schema>

const assertConsistent = (registry: PublicClaimsV1): void => {
  const ids = registry.claims.map((claim) => claim.claimId)
  if (new Set(ids).size !== ids.length) throw new Error('The claim registry contains duplicate claim ids.')
  const known = new Set(ids)
  for (const exception of registry.exceptions) {
    if (!known.has(exception.claimId)) {
      throw new Error(`Exception references unknown claim "${exception.claimId}".`)
    }
    const claim = registry.claims.find((entry) => entry.claimId === exception.claimId)
    const surfaces = new Set([...(claim?.required ?? []), ...(claim?.optional ?? [])])
    if (!surfaces.has(exception.surface)) {
      throw new Error(`Exception for "${exception.claimId}" names surface "${exception.surface}", which the claim does not declare.`)
    }
  }
  for (const claim of registry.claims) {
    const overlap = (claim.optional ?? []).filter((surface) => claim.required.includes(surface))
    if (overlap.length) throw new Error(`Claim "${claim.claimId}" lists ${overlap[0]} as both required and optional.`)
    const declared = new Set([...claim.required, ...(claim.optional ?? [])])
    for (const surface of Object.keys(claim.templates ?? {})) {
      if (!declared.has(surface)) throw new Error(`Claim "${claim.claimId}" has a template for "${surface}", which it does not declare as a surface.`)
    }
  }
}

export const createPublicClaims = (input: unknown): PublicClaimsV1 => {
  const payload = ClaimsPayloadSchema.parse(input)
  const hashable = { ...payload, contentHashAlgo: PUBLIC_CLAIMS_CONTENT_HASH_ALGO }
  const registry = PublicClaimsV1Schema.parse({ ...hashable, contentHash: sha256NormalizedV1(hashable) })
  assertConsistent(registry)
  return registry
}

export const parsePublicClaims = (input: unknown): PublicClaimsV1 => {
  const registry = PublicClaimsV1Schema.parse(input)
  if (contentHashForArtifactV1(registry) !== registry.contentHash) throw new Error('Invalid public-claims content hash.')
  assertConsistent(registry)
  return registry
}

/** Every surface the registry addresses, in a stable order. */
export const claimSurfaces = (registry: PublicClaimsV1): readonly string[] =>
  [...new Set(registry.claims.flatMap((claim) => [...claim.required, ...(claim.optional ?? [])]))].sort()

export const exceptionFor = (
  registry: PublicClaimsV1,
  claimId: string,
  surface: string,
): PublicClaimException | undefined =>
  registry.exceptions.find((entry) => entry.claimId === claimId && entry.surface === surface)

const ESCAPE = /[.*+?^${}()|[\]\\]/g

/**
 * The pattern a template becomes.
 *
 * The literal halves are escaped, so a registry cannot smuggle a regex into the checker, and
 * `{value}` becomes one bounded character class per value type. One capture, no nesting and no
 * ambiguity: this runs over every public surface, and a pattern that backtracks on a long line is
 * a denial of service with a documentation excuse.
 */
const CAPTURE: Readonly<Record<ClaimValueType, string>> = {
  number: '(\\d{1,12}(?:\\.\\d{1,4})?)',
  percent: '(\\d{1,3}(?:\\.\\d{1,2})?)',
  semver: '(\\d{1,6}\\.\\d{1,6}\\.\\d{1,6}(?:-[0-9A-Za-z.-]{1,32})?)',
  text: '([0-9A-Za-z][0-9A-Za-z .,\\-/@]{0,96})',
}

/** The wording a surface is expected to use: its own, or the claim's default. */
export const templateFor = (claim: PublicClaim, surface: string): string => claim.templates?.[surface] ?? claim.template ?? '{value}'

export const claimPattern = (claim: PublicClaim, surface?: string): RegExp => {
  const [before = '', after = ''] = (surface === undefined ? claim.template ?? '{value}' : templateFor(claim, surface)).split('{value}')
  const escape = (value: string): string => value.replace(ESCAPE, '\\$&')
  return new RegExp(`${escape(before)}${CAPTURE[claim.valueType]}${escape(after)}`, 'g')
}

/** What the claim reads like once the canonical value is in it: the sentence a surface should carry. */
export const renderClaim = (claim: PublicClaim, value: string, surface?: string): string =>
  (surface === undefined ? claim.template ?? '{value}' : templateFor(claim, surface)).replace('{value}', value)
