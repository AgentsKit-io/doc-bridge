import { z } from 'zod'

import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'

export const STUDY_VERIFICATION_SCHEMA_VERSION = 1 as const
export const STUDY_VERIFICATION_CONTENT_HASH_ALGO = 'sha256-normalized-v1' as const

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const reference = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,255}$/)
const artifactId = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/)

const PrivacyBindingSchema = z.object({
  mode: z.literal('anonymized'),
  checkedArtifactCount: z.number().int().positive(),
  forbiddenMatchCount: z.literal(0),
  publicationReview: z.enum(['pending', 'approved']),
}).strict()

const BudgetBindingSchema = z.object({
  maxTokens: z.number().int().positive(),
  usedTokens: z.number().int().nonnegative(),
  maxRuntimeMs: z.number().int().positive(),
  usedRuntimeMs: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (value.usedTokens > value.maxTokens) context.addIssue({ code: z.ZodIssueCode.custom, path: ['usedTokens'], message: 'Study token budget was exceeded.' })
  if (value.usedRuntimeMs > value.maxRuntimeMs) context.addIssue({ code: z.ZodIssueCode.custom, path: ['usedRuntimeMs'], message: 'Study runtime budget was exceeded.' })
})

const BindingPayloadSchema = z.object({
  type: z.literal('controlled-study-verification'),
  schemaVersion: z.literal(STUDY_VERIFICATION_SCHEMA_VERSION),
  verificationRunId: reference,
  sourceRevisionHash: hash,
  protocolHash: hash,
  configurationHash: hash,
  baselineHash: hash,
  artifactHashes: z.record(artifactId, hash).superRefine((value, context) => {
    if (!Object.keys(value).length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one study artifact hash is required.' })
    if (Object.keys(value).length > 128) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Study artifact hash count exceeds the limit.' })
  }),
  privacy: PrivacyBindingSchema,
  budget: BudgetBindingSchema,
}).strict()

export const StudyVerificationBindingV1Schema = BindingPayloadSchema.extend({
  contentHash: hash,
  contentHashAlgo: z.literal(STUDY_VERIFICATION_CONTENT_HASH_ALGO),
}).strict()

export type StudyVerificationBindingV1 = z.infer<typeof StudyVerificationBindingV1Schema>

const VerifiedResultPayloadSchema = z.object({
  type: z.literal('controlled-study-verified-result'),
  schemaVersion: z.literal(STUDY_VERIFICATION_SCHEMA_VERSION),
  verification: StudyVerificationBindingV1Schema,
  result: z.unknown(),
}).strict()

export const ControlledStudyVerifiedResultV1Schema = VerifiedResultPayloadSchema.extend({
  contentHash: hash,
  contentHashAlgo: z.literal(STUDY_VERIFICATION_CONTENT_HASH_ALGO),
}).strict()

export type ControlledStudyVerifiedResultV1 = z.infer<typeof ControlledStudyVerifiedResultV1Schema>

export const createStudyVerificationBinding = (input: unknown): StudyVerificationBindingV1 => {
  const payload = BindingPayloadSchema.parse(input)
  const hashable = { ...payload, contentHashAlgo: STUDY_VERIFICATION_CONTENT_HASH_ALGO }
  return StudyVerificationBindingV1Schema.parse({ ...hashable, contentHash: sha256NormalizedV1(hashable) })
}

export const parseStudyVerificationBinding = (input: unknown): StudyVerificationBindingV1 => {
  const binding = StudyVerificationBindingV1Schema.parse(input)
  if (contentHashForArtifactV1(binding) !== binding.contentHash) throw new Error('Invalid study verification binding content hash.')
  return binding
}

export const createControlledStudyVerifiedResult = (result: unknown, binding: StudyVerificationBindingV1): ControlledStudyVerifiedResultV1 => {
  const verification = parseStudyVerificationBinding(binding)
  const payload = VerifiedResultPayloadSchema.parse({ type: 'controlled-study-verified-result', schemaVersion: STUDY_VERIFICATION_SCHEMA_VERSION, verification, result })
  const hashable = { ...payload, contentHashAlgo: STUDY_VERIFICATION_CONTENT_HASH_ALGO }
  return ControlledStudyVerifiedResultV1Schema.parse({ ...hashable, contentHash: sha256NormalizedV1(hashable) })
}

export const parseControlledStudyVerifiedResult = (input: unknown): ControlledStudyVerifiedResultV1 => {
  const result = ControlledStudyVerifiedResultV1Schema.parse(input)
  if (contentHashForArtifactV1(result) !== result.contentHash) throw new Error('Invalid controlled study result content hash.')
  parseStudyVerificationBinding(result.verification)
  return result
}

const unsafeKey = /^(?:prompt|raw(?:[-_ ]agent)?[-_ ]?(?:response|output)|agent[-_ ]?(?:response|output)|credential|secret|password|repository[-_ ]?(?:content|path)|private[-_ ]identifier|snippet|stdout|stderr)$/i
const unsafeValue = /(?:^|[\\/])(?:Users|private|tmp|home)(?:[\\/])|(?:api[_-]?key|token|password|secret)\s*[:=]|-----BEGIN|https?:\/\//i

export type StudyPrivacyScan = {
  readonly ok: boolean
  readonly checkedStrings: number
  readonly forbiddenMatches: readonly string[]
}

export const scanStudyPublicationArtifact = (input: unknown): StudyPrivacyScan => {
  const forbiddenMatches: string[] = []
  let checkedStrings = 0
  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      checkedStrings += 1
      if (unsafeValue.test(value)) forbiddenMatches.push(path)
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`))
      return
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        const childPath = path ? `${path}.${key}` : key
        if (unsafeKey.test(key)) forbiddenMatches.push(childPath)
        visit(child, childPath)
      }
    }
  }
  visit(input, '$')
  return { ok: forbiddenMatches.length === 0, checkedStrings, forbiddenMatches }
}

export const formatStudyVerificationText = (binding: StudyVerificationBindingV1): readonly string[] => [
  `Study verification: ${binding.verificationRunId}`,
  `Source: ${binding.sourceRevisionHash}`,
  `Protocol: ${binding.protocolHash} | Configuration: ${binding.configurationHash}`,
  `Baseline: ${binding.baselineHash} | Artifacts: ${Object.keys(binding.artifactHashes).length}`,
  `Privacy: ${binding.privacy.mode}, matches=${binding.privacy.forbiddenMatchCount}, review=${binding.privacy.publicationReview}`,
  `Budget: ${binding.budget.usedTokens}/${binding.budget.maxTokens} tokens, ${binding.budget.usedRuntimeMs}/${binding.budget.maxRuntimeMs} ms`,
  `Content hash: ${binding.contentHash}`,
]
