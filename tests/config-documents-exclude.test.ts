import { describe, expect, it } from 'vitest'

import { DocBridgeConfigV1Schema } from '../src/config/schema.js'

const parse = (exclude: unknown) =>
  DocBridgeConfigV1Schema.safeParse({
    schemaVersion: 1,
    corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
    analysis: { documents: { exclude } },
  })

const messages = (exclude: unknown): string => {
  const result = parse(exclude)
  return result.success ? '' : result.error.issues.map((issue) => issue.message).join('\n')
}

describe('analysis.documents.exclude', () => {
  it('accepts a glob with a reason of 1 to 200 characters, up to 32 entries', () => {
    expect(parse([{ pattern: 'content/**', reason: 'published guides for readers' }]).success).toBe(true)
    expect(parse([{ pattern: 'a/**', reason: 'x' }]).success).toBe(true)
    expect(parse([{ pattern: 'a/**', reason: 'x'.repeat(200) }]).success).toBe(true)
    expect(parse(Array.from({ length: 32 }, (_, i) => ({ pattern: `d${i}/**`, reason: 'r' }))).success).toBe(true)
  })

  it('rejects a missing reason with a clear message', () => {
    expect(messages([{ pattern: 'content/**' }])).toContain('documents.exclude reason is required')
  })

  it('rejects an empty reason, an empty pattern, a long reason and too many entries', () => {
    expect(messages([{ pattern: 'content/**', reason: '' }])).toContain('reason must not be empty')
    expect(messages([{ pattern: '', reason: 'r' }])).toContain('pattern must not be empty')
    expect(messages([{ pattern: 'content/**', reason: 'x'.repeat(201) }])).toContain('at most 200 characters')
    expect(messages(Array.from({ length: 33 }, (_, i) => ({ pattern: `d${i}/**`, reason: 'r' })))).toContain('at most 32 entries')
  })
})
