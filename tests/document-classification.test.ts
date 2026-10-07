import { describe, expect, it } from 'vitest'
import { classifyDocument } from '../src/findings/classification.js'
import { documentClassification } from '../src/discovery/inputs.js'
import { routeFinding, createFinding } from '../src/findings/contracts.js'

const hash = 'a'.repeat(64)
describe('shared document classification', () => {
  it('retains established discovery/audit audience projections and frontmatter overrides', () => {
    const rows = [
      ['docs/for-agents/api.md', 'agent', 'agent', 'agent-guidance', 'active'],
      ['docs-archive/api.md', 'archive', 'human', 'guide', 'active'],
      ['README.md', 'project', 'human-and-agent', 'guide', 'active'],
      ['AGENTS.md', 'unclassified', 'agent', 'agent-guidance', 'active'],
      ['docs/adr/decision.md', 'human', 'human', 'architecture-decision', 'active'],
      ['historical/api.md', 'unclassified', 'human', 'guide', 'archived'],
      ['notes.md', 'unclassified', 'human', 'guide', 'active'],
    ]
    for (const [path, discoveryAudience, audience, type, lifecycle] of rows) {
      expect(documentClassification(path!)).toBe(discoveryAudience)
      expect(classifyDocument(path!)).toEqual({ discoveryAudience, audience, type, lifecycle })
    }
    expect(classifyDocument('historical/api.md', { lifecycle: 'active', type: 'reference', audience: 'agent' })).toMatchObject({ lifecycle: 'active', type: 'reference', audience: 'agent' })
    expect(classifyDocument('notes.md', { audience: true, lifecycle: 1, type: null })).toMatchObject({ lifecycle: 'active', type: 'guide', audience: 'human' })
  })
  it('routes through the same classification while recording visible exclusion coverage', () => {
    const finding = createFinding({ category: 'broken-reference', assertion: { document: 'docs-archive/api.md', key: 'old' }, status: 'conflict', layer: 'L0', confidence: 1, severity: 'warn', entities: [], evidence: [{ source: 'documentation', path: 'docs-archive/api.md', lineStart: 1 }], routing: 'proposed', coverage: [], provenance: { repository: 'fixture', revision: 'r1', configurationHash: hash } }, { old: 'removed' })
    expect(routeFinding(finding, { content: '# API' }).routing).toBe('excluded')
    expect(routeFinding(finding, { content: '---\naudience: human\nlifecycle: active\n---\n# API' }).routing).toBe('proposed')
  })
})
