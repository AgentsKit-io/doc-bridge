import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyFixProposal, createArtifactNormalizationProposal, createMarkdownLinkFixProposal, approveFixProposal } from '../src/fixes/proposals.js'
import { applyRemediation, approveRemediation, createRemediation, mergeRemediation, regionHash, revalidateRemediation, type RemediationValidation } from '../src/fixes/regions.js'
import { unifiedDiff } from '../src/fixes/diff.js'
import type { RegionEdit } from '../src/schemas/findings.js'

vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>() }))

const projects: string[] = []
const root = () => { const path = fs.mkdtempSync(join(tmpdir(), 'doc-bridge-regions-')); projects.push(path); return path }
afterEach(() => { vi.restoreAllMocks(); for (const path of projects.splice(0)) fs.rmSync(path, { recursive: true, force: true }) })
const hash = 'a'.repeat(64)
const validation = (): RemediationValidation => ({ currentRevision: 'r1', configurationHash: hash, evidenceHash: hash, allowedRoots: ['.'], validateEvidence: () => true })
const edit = (path = 'guide.md', original = 'old', start = 7, replacement = 'new'): RegionEdit => ({ path, range: { start, end: start + Buffer.byteLength(original) }, expectedRegionHash: regionHash(original), original, replacement, lineStart: 2, lineEnd: 2, anchors: { before: 'before\n', after: '\nafter', search: { start: 0, end: 100 } } })
const prepare = (edits = [edit()], text = 'before\nold\nafter\n') => {
  const project = root()
  for (const item of edits) fs.writeFileSync(join(project, item.path), text)
  const options = validation()
  const proposal = createRemediation(project, { findingId: 'finding-1', evidenceHash: hash, baseRevision: 'r1', configurationHash: hash, edits }, options)
  return { project, proposal, options }
}
const approve = (input: unknown) => approveRemediation(input, 'maintainer', () => true)
const applyOptions = () => ({ ...validation(), verify: () => {} })

describe('region remediation real filesystem acceptance', () => {
  it('applies unchanged regions through the shared atomic mutation path and requires exact approval', () => {
    const { project, proposal } = prepare()
    expect(() => applyRemediation(project, proposal, applyOptions())).toThrow('approval')
    const approved = approve(proposal)
    expect(() => applyRemediation(project, { ...approved, edits: [{ ...approved.edits[0]!, replacement: 'tampered' }] }, applyOptions())).toThrow('artifact')
    const applied = applyRemediation(project, approved, applyOptions())
    expect(applied.status).toBe('in-review')
    expect(fs.readFileSync(join(project, 'guide.md'), 'utf8')).toBe('before\nnew\nafter\n')
    expect(() => applyRemediation(project, approved, applyOptions())).toThrow('Stale')
  })
  it('rejects changed/ambiguous regions, permits one bounded shift with fresh rebinding, and preserves outside edits', () => {
    const { project, proposal } = prepare()
    fs.writeFileSync(join(project, 'guide.md'), 'before\nchanged\nafter\n')
    expect(() => revalidateRemediation(project, proposal, validation())).toThrow('zero or multiple')
    fs.writeFileSync(join(project, 'guide.md'), 'prefix\nbefore\nold\nafter\nbefore\nold\nafter\n')
    expect(() => revalidateRemediation(project, proposal, validation())).toThrow('multiple')
    fs.writeFileSync(join(project, 'guide.md'), 'prefix\nbefore\nold\nafter\n')
    const bound = revalidateRemediation(project, approve(proposal), { ...validation(), currentRevision: 'r2' })
    expect(bound.approval).toBeUndefined()
    expect(bound.revalidation?.toRevision).toBe('r2')
    expect(() => applyRemediation(project, approve(proposal), { ...applyOptions(), currentRevision: 'r2' })).toThrow('Revision')
    applyRemediation(project, approve(bound), { ...applyOptions(), currentRevision: 'r2' })
    expect(fs.readFileSync(join(project, 'guide.md'), 'utf8')).toBe('prefix\nbefore\nnew\nafter\n')
  })
  it('requires evidence, configuration and artifact bindings before writes', () => {
    const { project, proposal } = prepare()
    for (const override of [{ evidenceHash: 'b'.repeat(64) }, { configurationHash: 'b'.repeat(64) }, { validateEvidence: () => false }]) expect(() => applyRemediation(project, approve(proposal), { ...applyOptions(), ...override })).toThrow('validation')
    fs.writeFileSync(join(project, 'guide.md'), 'before\nold\nafter\nextra\n')
    expect(() => applyRemediation(project, approve(proposal), applyOptions())).toThrow('artifact')
    const bound = revalidateRemediation(project, approve(proposal), validation())
    expect(bound.approval).toBeUndefined()
    applyRemediation(project, approve(bound), applyOptions())
    expect(fs.readFileSync(join(project, 'guide.md'), 'utf8')).toContain('extra')
  })
  it('rejects overlap, nesting, duplicates and same-offset insertions; applies disjoint edits from the end', () => {
    const { project, proposal } = prepare()
    for (const edits of [[edit(), edit()], [edit(), edit('guide.md', 'ol', 7)], [edit(), edit('guide.md', '', 8)], [edit('guide.md', '', 3), edit('guide.md', '', 3)]]) expect(() => createRemediation(project, { ...proposal, edits }, validation())).toThrow('Overlapping')
    const two = createRemediation(project, { ...proposal, edits: [edit(), { ...edit('guide.md', 'after', 11, 'tail'), anchors: undefined }] }, validation())
    applyRemediation(project, approve(two), applyOptions())
    expect(fs.readFileSync(join(project, 'guide.md'), 'utf8')).toBe('before\nnew\ntail\n')
  })
  it('protects generated markers and declared protected regions, including empty insertions', () => {
    const { project, proposal } = prepare()
    expect(() => revalidateRemediation(project, proposal, { ...validation(), protectedRegions: [{ path: 'guide.md', range: { start: 7, end: 10 } }] })).toThrow('Protected')
    const content = '<!-- doc-bridge:generated -->\nold\n<!-- /doc-bridge:generated -->\n'
    fs.writeFileSync(join(project, 'guide.md'), content)
    for (const original of ['old', '']) expect(() => createRemediation(project, { ...proposal, edits: [edit('guide.md', original, Buffer.byteLength(content.slice(0, content.indexOf('old'))))] }, validation())).toThrow('generated')
  })
  it('rejects traversal, symlink escape, alias overlaps, root restrictions and cross-file relocation', () => {
    const { project, proposal } = prepare(), outside = root()
    fs.writeFileSync(join(outside, 'outside.md'), 'before\nold\nafter\n')
    fs.symlinkSync(join(outside, 'outside.md'), join(project, 'escape.md'))
    for (const path of ['../outside.md', 'escape.md']) expect(() => createRemediation(project, { ...proposal, edits: [edit(path)] }, validation())).toThrow(/containment|path/)
    fs.symlinkSync(join(project, 'guide.md'), join(project, 'alias.md'))
    expect(() => createRemediation(project, { ...proposal, edits: [edit(), edit('alias.md')] }, validation())).toThrow('Overlapping')
    fs.mkdirSync(join(project, 'allowed'))
    expect(() => revalidateRemediation(project, proposal, { ...validation(), allowedRoots: ['allowed'] })).toThrow('allowed roots')
    fs.renameSync(join(project, 'guide.md'), join(project, 'moved.md'))
    expect(() => revalidateRemediation(project, proposal, validation())).toThrow()
  })
  it('uses exact UTF-8 bytes and rejects ranges inside codepoints', () => {
    const { project, proposal } = prepare([edit('guide.md', 'é', 0, 'ê')], 'é\n')
    applyRemediation(project, approve(proposal), applyOptions())
    expect(fs.readFileSync(join(project, 'guide.md'), 'utf8')).toBe('ê\n')
    expect(() => createRemediation(project, { ...proposal, edits: [{ ...edit('guide.md', '', 1), anchors: undefined }] }, validation())).toThrow('Stale')
  })
  it('displayed unified patches reproduce replacements including no-final-newline, empty files and CRLF', () => {
    const project = root()
    const changes = [{ before: '', after: 'new\n' }, { before: 'old\n', after: '' }, { before: 'before\nold\nafter', after: 'before\nnew\nafter' }, { before: 'a\r\nb\r\n', after: 'a\r\nc\r\n' }, { before: 'a\n', after: 'a' }, { before: 'a', after: 'a\n' }, { before: 'a\nb', after: 'a\nb\nc' }, { before: 'a\nb\nc', after: 'a\nb' }]
    for (const [i, change] of changes.entries()) {
      fs.writeFileSync(join(project, `file${i}.md`), change.before)
      const patch = unifiedDiff([{ path: `file${i}.md`, ...change }])
      execFileSync('git', ['apply', '--unsafe-paths', '-'], { cwd: project, input: patch })
      expect(fs.readFileSync(join(project, `file${i}.md`), 'utf8')).toBe(change.after)
    }
  })
  it('rolls back actual files on post-apply failure and preserves originals when restore fails', () => {
    const { project, proposal } = prepare([edit(), edit('other.md')])
    const original = fs.readFileSync(join(project, 'guide.md'), 'utf8')
    expect(() => applyRemediation(project, approve(proposal), { ...applyOptions(), verify: () => { throw new Error('gate failed') } })).toThrow('gate failed')
    for (const path of ['guide.md', 'other.md']) expect(fs.readFileSync(join(project, path), 'utf8')).toBe(original)
    expect(fs.readdirSync(project).sort()).toEqual(['guide.md', 'other.md'])
    // A real filesystem obstruction makes restoring one original impossible.
    expect(() => applyRemediation(project, approve(proposal), { ...applyOptions(), verify: () => { fs.unlinkSync(join(project, 'guide.md')); fs.mkdirSync(join(project, 'guide.md')); throw new Error('gate failed') } })).toThrow('Rollback failed; recoverable originals')
    const backup = fs.readdirSync(project).find(path => path.startsWith('guide.md.docbridge-') && path.endsWith('.original'))!
    expect(fs.readFileSync(join(project, backup), 'utf8')).toBe(original)
    expect(fs.readFileSync(join(project, 'other.md'), 'utf8')).toBe(original)
  })
  it('rolls back a multi-file replacement failure before verification', () => {
    const { project, proposal } = prepare([edit(), edit('other.md')])
    const actualRename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => { if (String(from).endsWith('.tmp') && String(to).endsWith('other.md')) throw new Error('write failure'); return actualRename(from, to) })
    expect(() => applyRemediation(project, approve(proposal), applyOptions())).toThrow('write failure')
    expect(fs.readFileSync(join(project, 'guide.md'), 'utf8')).toBe('before\nold\nafter\n')
    expect(fs.readdirSync(project).sort()).toEqual(['guide.md', 'other.md'])
  })
  it('isolated presentation is never acceptance; default-branch and unattested writes fail closed', () => {
    const { project, proposal } = prepare()
    const review = { ...applyOptions(), mode: 'review-presentation' as const, reviewBoundary: { root: project, revision: 'r1', defaultBranch: 'main', reviewBranch: 'review', humanApprovalOnly: true as const }, attestIsolation: () => true }
    for (const override of [{ attestIsolation: () => false }, { attestIsolation: undefined }, { reviewBoundary: { ...review.reviewBoundary, reviewBranch: 'main' } }, { reviewBoundary: { ...review.reviewBoundary, root: root() } }]) expect(() => applyRemediation(project, proposal, { ...review, ...override })).toThrow('isolation')
    const presented = applyRemediation(project, proposal, review)
    expect(presented.status).toBe('in-review')
    expect(presented.approval).toBeUndefined()
    expect(() => mergeRemediation(presented, { by: 'maintainer', authenticateHuman: () => true, revision: 'r2', verifyMerged: () => true })).toThrow('approval')
    const reviewed = approve(presented)
    expect(() => mergeRemediation(reviewed, { by: 'maintainer', authenticateHuman: () => true, revision: 'r2', verifyMerged: () => false })).toThrow('verification')
    const merged = mergeRemediation(reviewed, { by: 'maintainer', authenticateHuman: () => true, revision: 'r2', verifyMerged: () => fs.readFileSync(join(project, 'guide.md'), 'utf8') === 'before\nnew\nafter\n' })
    expect(merged.status).toBe('merged')
  })
  it('legacy whole-file fixes cannot change generated content ', () => {
    const project = root()
    fs.writeFileSync(join(project, 'guide.md'), '<!-- doc-bridge:generated -->\n[API](./api)\n<!-- /doc-bridge:generated -->\n')
    fs.writeFileSync(join(project, 'api.md'), '# API\n')
    const proposal = createMarkdownLinkFixProposal(project, { baseRevision: 'r1', configurationHash: hash })!
    expect(() => applyFixProposal(project, approveFixProposal(proposal, 'maintainer'))).toThrow('generated')
  })
  it('legacy ordinary fixes still require approval and use the shared rollback path', () => {
    const project = root(); fs.writeFileSync(join(project, 'file.json'), '{"b":1,"a":2}')
    const proposal = createArtifactNormalizationProposal(project, 'file.json', { baseRevision: 'r1', configurationHash: hash })!
    expect(() => applyFixProposal(project, proposal)).toThrow('approved')
    expect(() => applyFixProposal(project, approveFixProposal(proposal, 'maintainer'), { verify: () => { throw new Error('failed gate') } })).toThrow('failed gate')
    expect(fs.readFileSync(join(project, 'file.json'), 'utf8')).toBe('{"b":1,"a":2}')
  })
})
