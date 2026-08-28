import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { applyFixProposal, approveFixProposal, createArtifactNormalizationProposal, createMarkdownLinkFixProposal } from '../src/fixes/proposals.js'
import { sha256NormalizedV1 } from '../src/index-builder/content-hash.js'

const options = { baseRevision: 'revision-1', configurationHash: 'a'.repeat(64) }
const root = () => mkdtempSync(join(tmpdir(), 'doc-bridge-fixes-'))

describe('deterministic fix proposals', () => {
  it('proposes an unambiguous Markdown link correction without mutation', () => {
    const project = root()
    writeFileSync(join(project, 'guide.md'), '[API](./api)\n')
    writeFileSync(join(project, 'api.md'), '# API\n')

    const proposal = createMarkdownLinkFixProposal(project, options)
    expect(proposal?.diff).toContain('./api')
    expect(proposal?.diff).toContain('api.md')
    expect(readFileSync(join(project, 'guide.md'), 'utf8')).toContain('./api')
    expect(proposal?.affectedFiles[0]?.contentHash).toBe(sha256NormalizedV1('[API](./api)\n'))
  })

  it('does not fix ambiguous links and normalizes valid JSON artifacts', () => {
    const project = root()
    writeFileSync(join(project, 'guide.md'), '[API](missing.md)\n')
    mkdirSync(join(project, 'one'))
    mkdirSync(join(project, 'two'))
    writeFileSync(join(project, 'one', 'missing.md'), '# one\n')
    writeFileSync(join(project, 'two', 'missing.md'), '# two\n')
    expect(createMarkdownLinkFixProposal(project, options)).toBeUndefined()

    writeFileSync(join(project, 'artifact.json'), '{"b":2,"a":1}')
    expect(createArtifactNormalizationProposal(project, 'artifact.json', options)?.diff).toContain('"a": 1')
  })

  it('requires exact approval and applies changes atomically and idempotently', () => {
    const project = root()
    writeFileSync(join(project, 'artifact.json'), '{"b":2,"a":1}')
    const proposal = createArtifactNormalizationProposal(project, 'artifact.json', options)
    expect(proposal).toBeDefined()
    expect(readFileSync(join(project, 'artifact.json'), 'utf8')).toBe('{"b":2,"a":1}')
    expect(() => applyFixProposal(project, proposal)).toThrow('approved')

    const approved = approveFixProposal(proposal, 'human@example.com', '2026-08-27T00:00:00.000Z')
    expect(() => applyFixProposal(project, { ...approved, approval: { ...approved.approval!, proposalHash: 'b'.repeat(64) } })).toThrow('exact proposal')
    const verified: string[] = []
    const applied = applyFixProposal(project, approved, { verify: (paths) => verified.push(...paths) })
    expect(applied.status).toBe('applied')
    expect(verified).toEqual(['artifact.json'])
    expect(readFileSync(join(project, 'artifact.json'), 'utf8')).toBe('{\n  "a": 1,\n  "b": 2\n}\n')
    expect(createArtifactNormalizationProposal(project, 'artifact.json', options)).toBeUndefined()
    expect(existsSync(join(project, 'artifact.json.docbridge-999999.tmp'))).toBe(false)
  })
})
