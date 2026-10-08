import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { diffSnapshots, parseChangeSet } from '../src/diff/change-set.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { changeDigestView } from '../src/render/data.js'
import { ChangeSetV1Schema } from '../src/schemas/change-set.js'
import { DocBridgeJsonSchemas } from '../src/schemas/json-schemas.js'
import { contentHashForVersionedArtifact } from '../src/index-builder/content-hash.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const write = (root: string, path: string, text: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-diff-'))
  roots.push(root)
  write(root, 'package.json', '{"name":"fixture","version":"1.0.0","packageManager":"pnpm@10.0.0"}')
  write(root, 'src/api.ts', 'export const first = 1\nexport const second = 2\n')
  write(root, 'docs/api.md', '# API\n\nUse `first` and `second` in `src/api.ts`.\n')
  return { root, base: discoverRepository({ root }) }
}
const scanDiff = (root: string, base: ReturnType<typeof discoverRepository>) => diffSnapshots(base, discoverRepository({ root }), { headRoot: root })

describe('ChangeSetV1 real snapshot acceptance', () => {
  it.each(['declaration removed', 'export removed'])('revalidates a declaring owner through two re-exports when %s', (change) => {
    const { root } = fixture()
    write(root, 'src/index.ts', "export { first } from './api.js'\n")
    write(root, 'src/public.ts', "export { first } from './index.js'\n")
    write(root, 'docs/api.md', '# API\n\nUse `first`.\n')
    const base = discoverRepository({ root })
    expect(base.relations.filter(relation => relation.metadata?.symbol === 'first')).toMatchObject([
      { to: 'module:src/api.ts' },
    ])
    write(root, 'src/api.ts', (change === 'export removed' ? 'const first = 1\n' : '') + 'export const second = 2\n')
    const result = scanDiff(root, base)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ code: 'BROKEN_REFERENCE', status: 'conflict', entityIds: ['document:docs/api.md', 'module:src/api.ts'] })
    expect(result.findings[0]?.evidence).toContainEqual(expect.objectContaining({ path: 'docs/api.md', lineStart: 3, context: 'Head citation' }))
    write(root, 'docs/api.md', '# API\n\nUse `second`.\n')
    expect(scanDiff(root, base).findings).toEqual([])
  })

  it('retains the forwarding-owner fallback and detects removal from that public surface', () => {
    const { root } = fixture()
    write(root, 'src/api.ts', "export { first, second } from 'doc-bridge-external'\n")
    write(root, 'docs/api.md', '# API\n\nUse `first`.\n')
    const base = discoverRepository({ root })
    expect(base.relations.filter(relation => relation.metadata?.symbol === 'first')).toMatchObject([{ to: 'module:src/api.ts' }])
    write(root, 'src/api.ts', "export { second } from 'doc-bridge-external'\n")
    expect(scanDiff(root, base).findings).toMatchObject([{ code: 'BROKEN_REFERENCE', status: 'conflict' }])
  })

  it('T2-A1 / A10 finds prior citations to removed modules and feeds the digest', () => {
    const { root, base } = fixture()
    // A module citation on its own proves the file removal independently of exported symbols.
    write(root, 'docs/api.md', '# API\n\nUse `src/api.ts`.\n')
    const previous = discoverRepository({ root })
    rmSync(join(root, 'src/api.ts'))
    const head = discoverRepository({ root })
    const result = diffSnapshots(previous, head, { headRoot: root })
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ code: 'BROKEN_REFERENCE', status: 'conflict', entityIds: ['document:docs/api.md', 'module:src/api.ts'] })
    expect(result.findings[0]?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'docs/api.md', lineStart: 3, context: 'Head citation' }),
      expect.objectContaining({ path: 'src/api.ts', contentHash: expect.any(String) }),
    ]))
    expect(result.impact.documentsToReview.map((doc) => doc.path)).toEqual(['docs/api.md'])
    expect(changeDigestView(previous, head).documentsToReview).toEqual(result.impact.documentsToReview)
    expect(base.entities.length).toBeGreaterThan(0)
  })

  it('T2-A2 reports exactly the one removed symbol among two cited exports', () => {
    const { root, base } = fixture()
    write(root, 'src/api.ts', 'export const second = 2\n')
    const result = scanDiff(root, base)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ code: 'BROKEN_REFERENCE', status: 'conflict' })
    expect(result.findings[0]?.relationIds).toEqual([base.relations.find((relation) => relation.metadata?.symbol === 'first')?.id])
    expect(result.changeSet.changes.filter((change) => change.kind === 'symbol')).toMatchObject([{ op: 'removed', before: { name: 'first', ownerId: 'module:src/api.ts' } }])
  })

  it('T2-A3 resolution failure without proven removal is not broken', () => {
    const { root, base } = fixture()
    const head = discoverRepository({ root })
    head.relations = head.relations.filter((relation) => relation.metadata?.symbol !== 'first')
    expect(diffSnapshots(base, head, { headRoot: root }).findings).toEqual([])
  })

  it('T2-A4 unique to ambiguous is unresolved without remediation', () => {
    const { root, base } = fixture()
    write(root, 'src/other.ts', 'export const first = 3\n')
    const result = scanDiff(root, base)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ code: 'AMBIGUOUS_REFERENCE', status: 'unresolved' })
    expect(result.findings[0]).not.toHaveProperty('remediation')
  })

  it('T2-A5 re-reads edited docs: dropped citations vanish, residual citations remain', () => {
    const { root, base } = fixture()
    write(root, 'src/api.ts', 'export const second = 2\n')
    write(root, 'docs/api.md', '# API\n\nUse `second`.\n')
    const result = scanDiff(root, base)
    expect(result.findings).toEqual([])
    expect(result.impact.documentsToReview).toEqual([])
    expect(result.impact.changedDocumentation.map((doc) => doc.path)).toEqual(['docs/api.md'])
    write(root, 'docs/api.md', '# API\n\nStill use `first`.\n')
    const residual = scanDiff(root, base)
    expect(residual.findings).toHaveLength(1)
    expect(residual.findings[0]?.status).toBe('conflict')
    expect(residual.impact.changedDocumentation.map((doc) => doc.path)).toEqual(['docs/api.md'])
  })

  it('T2b preserves finding identity across unrelated edits and moved citations', () => {
    const { root, base } = fixture()
    write(root, 'src/api.ts', 'export const second = 2\n')
    const original = scanDiff(root, base).findings[0]!
    write(root, 'docs/api.md', '# API\n\nUse `first` and `second` in `src/api.ts`.\n\nUnrelated explanation.\n')
    const edited = scanDiff(root, base).findings[0]!
    expect(edited.id).toBe(original.id)
    expect(edited.evidence).not.toEqual(original.evidence)
    write(root, 'docs/api.md', '# API\n\nIntroduction.\n\nUse `first` and `second` in `src/api.ts`.\n')
    const moved = scanDiff(root, base).findings[0]!
    expect(moved.id).toBe(original.id)
    expect(moved.evidence).toContainEqual(expect.objectContaining({ context: 'Head citation', lineStart: 5 }))
    const reordered = structuredClone(base)
    for (const relation of reordered.relations) relation.evidence.reverse()
    expect(scanDiff(root, reordered).findings[0]?.id).toBe(original.id)
  })

  it('T2b distinguishes removed symbols and their module owners', () => {
    const { root, base } = fixture()
    write(root, 'src/api.ts', 'export const second = 2\n')
    const first = scanDiff(root, base).findings[0]!.id
    write(root, 'src/api.ts', 'export const first = 1\n')
    expect(scanDiff(root, base).findings[0]?.id).not.toBe(first)
    rmSync(join(root, 'src/api.ts'))
    write(root, 'src/other.ts', 'export const first = 1\nexport const second = 2\n')
    write(root, 'docs/api.md', '# API\n\nUse `first` and `second` in `src/other.ts`.\n')
    const otherBase = discoverRepository({ root })
    write(root, 'src/other.ts', 'export const second = 2\n')
    expect(scanDiff(root, otherBase).findings[0]?.id).not.toBe(first)
  })

  it('T2b binds ambiguity identity to the candidate set, not evidence positions or order', () => {
    const { root, base } = fixture()
    write(root, 'src/other.ts', 'export const first = 3\n')
    const original = scanDiff(root, base).findings[0]!
    write(root, 'docs/api.md', '# API\n\nIntroduction.\n\nUse `first` and `second` in `src/api.ts`.\n')
    expect(scanDiff(root, base).findings[0]?.id).toBe(original.id)
    const head = discoverRepository({ root })
    const doc = head.entities.find((entity) => entity.id === 'document:docs/api.md')!
    const ambiguities = doc.metadata!.ambiguousSymbolReferences as { candidateModuleIds: string[] }[]
    ambiguities[0]!.candidateModuleIds.reverse()
    expect(diffSnapshots(base, head, { headRoot: root }).findings[0]?.id).toBe(original.id)
    rmSync(join(root, 'src/other.ts'))
    write(root, 'src/third.ts', 'export const first = 3\n')
    expect(scanDiff(root, base).findings[0]?.id).not.toBe(original.id)
  })

  it('T2-A6 unsupported kinds and renames remain explicit coverage', () => {
    const { root, base } = fixture()
    const result = scanDiff(root, base)
    expect(base.coverage).toContainEqual(expect.objectContaining({ scope: 'cli-commands', status: 'not-applicable' }))
    for (const scope of ['cli-command', 'cli-flag', 'config-key']) expect(result.changeSet.coverage).not.toContainEqual(expect.objectContaining({ analyzer: 'diff', scope }))
    // Inferred constants do not establish syntactic signatures. Registration is not completeness.
    expect(base.coverage).toContainEqual(expect.objectContaining({ scope: 'signatures', status: 'partial' }))
    expect(result.changeSet.coverage).toContainEqual(expect.objectContaining({ analyzer: 'diff', scope: 'signature', status: 'partial', reason: expect.any(String) }))
    for (const scope of ['rename-detection']) expect(result.changeSet.coverage).toContainEqual(expect.objectContaining({ analyzer: 'diff', scope, status: 'not-analyzed' }))
    expect(result.changeSet.packages).toEqual([{ id: 'package:fixture', purl: 'pkg:npm/fixture', version: '1.0.0' }])
    expect(result.changeSet.changes).toEqual([])
    expect(DocBridgeJsonSchemas.changeSetV1).toMatchObject({ type: 'object', additionalProperties: false })
    expect(ChangeSetV1Schema.safeParse({ ...result.changeSet, changes: [{ kind: 'module', op: 'added' }] }).success).toBe(false)
  })

  it('T2-A7 / A8 deterministic bytes and revision-only semantic equality', () => {
    const { root, base } = fixture()
    write(root, 'src/api.ts', 'export const second = 2\n')
    const head = discoverRepository({ root })
    const first = diffSnapshots(base, head, { headRoot: root })
    expect(JSON.stringify(diffSnapshots(base, head, { headRoot: root }))).toBe(JSON.stringify(first))
    expect(diffSnapshots({ ...base, sourceRevision: 'base-new' }, { ...head, sourceRevision: 'head-new' }, { headRoot: root }).changeSet.contentHash).toBe(first.changeSet.contentHash)
    expect(diffSnapshots(base, { ...head, configurationHash: 'f'.repeat(64) }).changeSet.contentHash).not.toBe(first.changeSet.contentHash)
    expect(diffSnapshots(base, { ...head, pipelineVersion: 'next' }).changeSet.contentHash).not.toBe(first.changeSet.contentHash)
    expect(parseChangeSet(first.changeSet)).toEqual(first.changeSet)
    expect(() => parseChangeSet({ ...first.changeSet, contentHash: 'f'.repeat(64) })).toThrow(/hash/)
    expect(diffSnapshots(base, { ...head, coverage: [...head.coverage, { analyzer: 'fixture', scope: 'new', status: 'not-analyzed' }] }).changeSet.contentHash).not.toBe(first.changeSet.contentHash)
  })

  it('snapshot-only, mismatched text and partial discovery cannot claim conflict', () => {
    const { root, base } = fixture()
    write(root, 'src/api.ts', 'export const second = 2\n')
    const head = discoverRepository({ root })
    expect(diffSnapshots(base, head).findings[0]?.status).toBe('stale-or-unverified')
    const partial = { ...head, coverage: [...head.coverage, { analyzer: 'repository', scope: 'limits:source', status: 'partial' as const }] }
    expect(diffSnapshots(base, partial, { headRoot: root }).findings[0]?.status).toBe('stale-or-unverified')
    write(root, 'docs/api.md', '# Changed after scan\n')
    expect(diffSnapshots(base, head, { headRoot: root }).findings[0]?.status).toBe('stale-or-unverified')
    expect(() => diffSnapshots(base, { ...head, project: { name: 'other' } })).toThrow(/different project identities/)
  })

  it('records moved files as removal and addition without claiming a rename', () => {
    const { root, base } = fixture()
    write(root, 'src/moved.ts', readFileSync(join(root, 'src/api.ts'), 'utf8'))
    rmSync(join(root, 'src/api.ts'))
    const result = scanDiff(root, base)
    expect(result.changeSet.changes.some((change) => change.op === 'renamed')).toBe(false)
    expect(result.changeSet.changes.filter((change) => change.kind === 'module').map((change) => change.op).sort()).toEqual(['added', 'removed'])
  })

  it('relative document links remain detectable after the target is removed', () => {
    const { root } = fixture()
    write(root, 'docs/target.md', '# Target\n')
    write(root, 'docs/api.md', '# API\n\nRead [target](./target.md).\n')
    const base = discoverRepository({ root })
    rmSync(join(root, 'docs/target.md'))
    expect(scanDiff(root, base).findings).toMatchObject([{ code: 'BROKEN_REFERENCE', status: 'conflict' }])
  })

  it('T2-A9 executes the built CLI with snapshot files, default head, output and errors', () => {
    const { root, base } = fixture()
    const artifacts = mkdtempSync(join(tmpdir(), 'doc-bridge-diff-artifacts-'))
    roots.push(artifacts)
    const basePath = join(artifacts, 'base.json')
    const headPath = join(artifacts, 'head.json')
    const output = join(artifacts, 'diff.json')
    writeFileSync(basePath, JSON.stringify(base))
    write(root, 'src/api.ts', 'export const second = 2\n')
    const head = discoverRepository({ root })
    writeFileSync(headPath, JSON.stringify(head))
    const cli = (...args: string[]) => spawnSync(process.execPath, [resolve('bin/ak-docs.js'), 'diff', ...args], { encoding: 'utf8', cwd: root })
    const args = ['--base', basePath, '--root', root, '--output', output, '--json']
    const run = cli(...args)
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    expect(run.stdout).toBe(readFileSync(output, 'utf8'))
    expect(cli(...args).stdout).toBe(run.stdout)
    expect(JSON.parse(run.stdout).findings[0].status).toBe('conflict')
    const snapshot = cli('--base', basePath, '--head', headPath, '--json')
    expect(snapshot.status).toBe(0)
    expect(JSON.parse(snapshot.stdout).findings[0].status).toBe('stale-or-unverified')
    expect(JSON.parse(cli('--base', basePath, '--head', headPath, '--root', root).stdout).findings[0].status).toBe('conflict')
    expect(cli().status).toBe(2)
    write(root, 'docs/api.md', '# Changed citation bytes\n')
    const stale = cli('--base', basePath, '--head', headPath, '--root', root)
    expect(stale.status).toBe(0)
    expect(JSON.parse(stale.stdout).findings[0].status).toBe('stale-or-unverified')
    head.contentHash = '0'.repeat(64)
    writeFileSync(headPath, JSON.stringify(head))
    expect(cli('--base', basePath, '--head', headPath).status).toBe(2)
    expect(contentHashForVersionedArtifact(base)).toBe(base.contentHash)
  }, 30_000)
})

it('verifies a removed fenced config key against real head bytes and recovers after doc correction', () => {
  const { root } = fixture()
  write(root, 'src/api.ts', `import { z } from 'zod'; export const ConfigSchema = z.object({output: z.object({format: z.string()})});`)
  write(root, 'docs/api.md', '# API\n```ts\noutput.format;\n```\n')
  const base = discoverRepository({ root })
  expect(base.relations.some(relation => relation.metadata?.factName === 'output.format' && relation.metadata?.citationContext === 'code-fence')).toBe(true)
  write(root, 'src/api.ts', `import { z } from 'zod'; export const ConfigSchema = z.object({output: z.object({style: z.string()})});`)
  const result = scanDiff(root, base)
  expect(result.changeSet.changes.some(change => change.kind === 'config-key' && change.op === 'removed' && change.before?.name === 'output.format')).toBe(true)
  expect(result.findings).toMatchObject([{code: 'BROKEN_REFERENCE', status: 'conflict'}])
  expect(result.findings[0]?.evidence).toContainEqual(expect.objectContaining({path: 'docs/api.md', lineStart: 3, context: 'Head citation', contentHash: expect.any(String)}))
  write(root, 'docs/api.md', '# API\n```ts\noutput.style;\n```\n')
  expect(scanDiff(root, base).findings).toEqual([])
})

it('verifies changed fenced signatures as review-required uncertainty', () => {
  const { root } = fixture()
  write(root, 'src/api.ts', 'export const first = (): number => 1;')
  write(root, 'docs/api.md', '# API\n```ts\nfirst();\n```\n')
  const base = discoverRepository({ root })
  write(root, 'src/api.ts', 'export const first = (value: string): number => value.length;')
  const result = scanDiff(root, base)
  expect(result.findings).toMatchObject([{code: 'CHANGED_REFERENCE', status: 'stale-or-unverified'}])
  expect(result.findings[0]?.evidence).toContainEqual(expect.objectContaining({path: 'docs/api.md', lineStart: 3, context: 'Head citation'}))
  expect(result.policy.findings[0]?.routing).toBe('routed-to-L2')
})

it('retains fenced generic head citations for generated-region policy exclusions', () => {
  const { root } = fixture()
  write(root, 'src/api.ts', `import { z } from 'zod'; export const ConfigSchema = z.object({output: z.object({format: z.string()})});`)
  write(root, 'docs/api.md', '# API\n```ts\noutput.format;\n```\n')
  const base = discoverRepository({ root })
  write(root, 'src/api.ts', `import { z } from 'zod'; export const ConfigSchema = z.object({output: z.object({style: z.string()})});`)
  write(root, 'docs/api.md', '# API\n<!-- doc-bridge:generated hash=abc -->\n```ts\noutput.format;\n```\n<!-- /doc-bridge:generated -->\n')
  const result = scanDiff(root, base)
  expect(result.findings).toEqual([])
  expect(result.policy.findings).toMatchObject([{status: 'conflict', routing: 'excluded'}])
  expect(result.policy.counts.generator).toBe(1)
})


it('does not retain removed fence references when head code uses only keys or text', () => {
  const { root } = fixture()
  write(root, 'src/api.ts', 'export const metadata = () => 1;')
  write(root, 'docs/api.md', '# API\n```ts\nmetadata();\n```\n')
  const base = discoverRepository({ root })
  write(root, 'src/api.ts', 'export const replacement = () => 1;')
  expect(scanDiff(root, base).findings.some(f => f.code === 'BROKEN_REFERENCE')).toBe(true)
  for (const code of ['const value = { metadata: true, metadata };', 'ctx.metadata();', 'const value = "metadata";', '// metadata()']) {
    write(root, 'docs/api.md', '# API\n```ts\n' + code + '\n```\n')
    expect(scanDiff(root, base).findings).toEqual([])
  }
})
