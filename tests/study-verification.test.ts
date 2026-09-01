import { describe, expect, it } from 'vitest'

import {
  createControlledStudyVerifiedResult,
  createStudyVerificationBinding,
  formatStudyVerificationText,
  parseControlledStudyVerifiedResult,
  parseStudyVerificationBinding,
  scanStudyPublicationArtifact,
} from '../src/study/verification.js'

const bindingInput = () => ({
  type: 'controlled-study-verification' as const,
  schemaVersion: 1 as const,
  verificationRunId: 'run-01',
  sourceRevisionHash: 'a'.repeat(64),
  protocolHash: 'b'.repeat(64),
  configurationHash: 'c'.repeat(64),
  baselineHash: 'd'.repeat(64),
  artifactHashes: { metrics: 'e'.repeat(64), ledger: 'f'.repeat(64) },
  privacy: { mode: 'anonymized' as const, checkedArtifactCount: 2, forbiddenMatchCount: 0 as const, publicationReview: 'approved' as const },
  budget: { maxTokens: 1000, usedTokens: 800, maxRuntimeMs: 2000, usedRuntimeMs: 1500 },
})

describe('study verification binding', () => {
  it('binds provenance, privacy, budget, and result hashes', () => {
    const binding = createStudyVerificationBinding(bindingInput())
    expect(parseStudyVerificationBinding(binding)).toEqual(binding)
    const result = createControlledStudyVerifiedResult({ type: 'controlled-study-metrics', observationCount: 2 }, binding)
    expect(parseControlledStudyVerifiedResult(result)).toEqual(result)
    expect(formatStudyVerificationText(binding)).toContain(`Content hash: ${binding.contentHash}`)
  })

  it('fails closed for tampering, budget exhaustion, and unsafe publication data', () => {
    const binding = createStudyVerificationBinding(bindingInput())
    expect(() => parseStudyVerificationBinding({ ...binding, contentHash: '0'.repeat(64) })).toThrow('Invalid study verification binding')
    expect(() => createStudyVerificationBinding({ ...bindingInput(), budget: { maxTokens: 10, usedTokens: 11, maxRuntimeMs: 2, usedRuntimeMs: 1 } })).toThrow('token budget')
    expect(scanStudyPublicationArtifact({ prompt: 'do this', path: '/private/project' }).ok).toBe(false)
    expect(scanStudyPublicationArtifact({ metrics: { providerTokens: 10 }, report: 'aggregate only' }).ok).toBe(true)
  })
})
