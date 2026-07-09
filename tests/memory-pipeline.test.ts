import { describe, expect, it } from 'vitest'

import { classifyMemoryCandidates, draftMemoryPromotion } from '../src/memory/pipeline.js'
import type { MemoryCandidateV1 } from '../src/schemas/memory-candidate.js'
import type { DocBridgeIndexV1 } from '../src/schemas/doc-bridge-index.js'

const candidate = (id: string, fact: string): MemoryCandidateV1 => ({
  schemaVersion: 1,
  id,
  source: 'manual',
  fact,
  suggestedType: 'project',
  confidence: 0.8,
  references: [],
})

const index: DocBridgeIndexV1 = {
  schemaVersion: 1,
  contentHash: 'a'.repeat(64),
  contentHashAlgo: 'sha256-normalized-v1',
  knowledge: [
    {
      id: 'sidecar',
      type: 'package',
      title: 'Sidecar',
      path: 'docs/for-agents/packages/sidecar.md',
      description: 'Package sidecar owns transport.',
    },
  ],
}

describe('memory pipeline', () => {
  it('classifies memory candidates into doc routes', () => {
    const result = classifyMemoryCandidates(
      [
        candidate('agent', 'package sidecar owns transport boundaries'),
        candidate('human', 'Add a user-facing guide for setup'),
        candidate('playbook', 'This is a reusable playbook pattern'),
        candidate('discard', 'scratch noise discard'),
      ],
      index,
    )

    expect(result.map((item) => item.route)).toEqual(['agent', 'human', 'playbook', 'discard'])
    expect(result[0]?.target).toBe('sidecar')
    expect(result[0]?.duplicateOf).toBe('docs/for-agents/packages/sidecar.md')
  })

  it('blocks promotion drafts when safety scan finds secrets', () => {
    const classifications = classifyMemoryCandidates(
      [candidate('secret', 'api_key=12345 should never be documented')],
      index,
    )
    const draft = draftMemoryPromotion(classifications)

    expect(draft.ok).toBe(false)
    expect(draft.findings[0]).toMatchObject({ kind: 'secret', candidateId: 'secret' })
    expect(draft.body).toContain('blocked')
  })
})
