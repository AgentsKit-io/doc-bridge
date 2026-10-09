import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { runCli } from '../src/cli/program.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { readEnrichmentOverlay } from '../src/enrich/overlay.js'
import { decideEnrichment } from '../src/enrich/review.js'
import { diffVault } from '../src/vault/diff.js'
import { exportVault } from '../src/vault/export.js'

const roots: string[] = []
afterEach(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); roots.length = 0 })
const fixture = async () => {
  const root = mkdtempSync(join(tmpdir(), 'vault-diff-')); roots.push(root)
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, '.gitignore'), '.doc-bridge/\n')
  writeFileSync(join(root, 'package.json'), '{"name":"example"}')
  writeFileSync(join(root, 'docs/guide.md'), '# Guide\n\nOriginal source.\n')
  const config = DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs/agent' }, human: { plugin: 'plain-markdown', options: { root: 'docs' } } } })
  await exportVault(root, config)
  const output = join(root, '.doc-bridge/vault')
  const entity = discoverRepository({ root, config }).entities.find(entity => entity.path === 'docs/guide.md')!
  const note = join(output, `${createHash('sha256').update(entity.id).digest('hex')}.md`)
  return { root, config, output, note }
}
it('persists deterministic pending proposals with exact edits and source regions, preserves decisions and never changes source', async () => {
  const { root, config, note } = await fixture()
  expect((await diffVault(root, config)).proposals).toEqual([])
  const original = readFileSync(note, 'utf8')
  writeFileSync(note, `${original}\nA suggested explanation.\n`)
  const result = await diffVault(root, config)
  expect(result.proposals).toHaveLength(1)
  const proposal = result.proposals[0]!
  expect(proposal.payload.original).toBe(original)
  expect(proposal.payload.edited).toContain('suggested explanation')
  expect(proposal.payload.sourceRegions[0]).toMatchObject({ path: 'docs/guide.md', lineStart: 1 })
  expect(readEnrichmentOverlay(root)!.pending[0]!.proposal).toEqual(proposal)
  const overlay = readFileSync(join(root, '.doc-bridge/enrich/overlay.json'), 'utf8')
  expect(await diffVault(root, config)).toEqual(result)
  expect(readFileSync(join(root, '.doc-bridge/enrich/overlay.json'), 'utf8')).toBe(overlay)
  await decideEnrichment({ root, proposalId: proposal.proposalId, decision: 'rejected', by: 'reviewer', snapshot: discoverRepository({ root, config }) })
  await diffVault(root, config)
  expect(readEnrichmentOverlay(root)!.pending).toHaveLength(0)
  expect(readFileSync(join(root, 'docs/guide.md'), 'utf8')).toBe('# Guide\n\nOriginal source.\n')
  expect(readFileSync(note, 'utf8')).toBe(proposal.payload.edited)
})
it('reports added/deleted and unbound notes, excludes human notes, and fails closed on stale source bindings', async () => {
  const { root, config, output, note } = await fixture()
  unlinkSync(join(output, 'graph-signals.md'))
  writeFileSync(join(output, 'personal.md'), '# Added\n')
  writeFileSync(join(output, 'index.md'), '# Edited navigation\n')
  writeFileSync(note, '# Edited bound note\n')
  writeFileSync(join(root, 'docs/guide.md'), '# Guide\n\nChanged source.\n')
  const result = await diffVault(root, config)
  expect(result.added).toEqual(['personal.md'])
  expect(result.deleted).toEqual(['graph-signals.md'])
  expect(result.proposals).toEqual([])
  expect(result.unproposed).toHaveLength(2)
  expect(readdirSync(output)).toContain('personal.md')
  writeFileSync(join(output, '.doc-bridge-vault.json'), '{"schemaVersion":1,"files":{"../escape.md":"' + 'a'.repeat(64) + '"}}')
  await expect(diffVault(root, config)).rejects.toThrow()
})

it('refuses unsafe generated-note paths and corrupt overlays without losing edits', async () => {
  const { root, config, note } = await fixture()
  writeFileSync(note, `${readFileSync(note, 'utf8')}\nReview.\n`)
  mkdirSync(join(root, '.doc-bridge/enrich'), { recursive: true })
  writeFileSync(join(root, '.doc-bridge/enrich/overlay.json'), '{invalid')
  await expect(diffVault(root, config)).rejects.toThrow('invalid')
  expect(readFileSync(join(root, '.doc-bridge/enrich/overlay.json'), 'utf8')).toBe('{invalid')
  expect(readFileSync(note, 'utf8')).toContain('Review.')
  await expect(diffVault(root, { ...config, vault: { output: '../escape' } })).rejects.toThrow('escapes')
  await expect(diffVault(root, { ...config, vault: { output: 'docs/notes' } })).rejects.toThrow('disjoint')
})

it('runs the CLI export/diff and local PR preview without changing source or opening a PR', async () => {
  const { root, config, note } = await fixture()
  writeFileSync(join(root, 'doc-bridge.config.json'), JSON.stringify(config))
  const cwd = process.cwd()
  const write = process.stdout.write
  let out = ''
  process.chdir(root)
  process.stdout.write = ((chunk: string | Uint8Array) => { out += String(chunk); return true }) as typeof process.stdout.write
  try {
    expect(await runCli(['vault', 'export', '--json'])).toBe(0)
    out = ''
    writeFileSync(note, `${readFileSync(note, 'utf8')}\nCLI review.\n`)
    expect(await runCli(['vault', 'diff', '--pr', '--json'])).toBe(0)
    const result = JSON.parse(out)
    expect(result.proposals).toHaveLength(1)
    expect(result.pr.dryRun).toBe(true)
    expect(result.pr.prUrl).toBeUndefined()
    expect(readFileSync(result.pr.draftPath, 'utf8')).toContain('CLI review.')
    expect(readFileSync(join(root, 'docs/guide.md'), 'utf8')).toBe('# Guide\n\nOriginal source.\n')
  } finally { process.stdout.write = write; process.chdir(cwd) }
})

it('binds a merged concept edit independently to every source document', async () => {
  const { root, config, output } = await fixture()
  writeFileSync(join(root, 'docs/glossary.md'), '# Glossary\n\n**Store**: Stores values.\n')
  writeFileSync(join(root, 'docs/other-glossary.md'), '# Glossary\n\n**Store**: Another definition.\n')
  const enabled = { ...config, index: { ...config.index, knowledgeEntities: { enabled: true } } }
  await exportVault(root, enabled)
  const name = readdirSync(output).find(name => name.endsWith('.md') && readFileSync(join(output, name), 'utf8').includes('type: concept\n'))!
  writeFileSync(join(output, name), `${readFileSync(join(output, name), 'utf8')}\nShared edit.\n`)
  const result = await diffVault(root, enabled)
  expect(result.proposals).toHaveLength(2)
  expect(result.proposals.map(proposal => proposal.entity).sort()).toEqual(['document:docs/glossary.md', 'document:docs/other-glossary.md'])
  for (const proposal of result.proposals) expect(proposal.payload.sourceRegions.every(region => proposal.entity === `document:${region.path}`)).toBe(true)
})
