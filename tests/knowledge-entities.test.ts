import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { extractKnowledgeEntities } from '../src/entities/extract.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { buildDocBridgeIndex, buildStoredDocBridgeIndex } from '../src/index-builder/build-index.js'
import { loadDocBridgeIndex, loadFreshDocBridgeIndex } from '../src/query/load-index.js'
import { createLocalRepositoryRead, contentRef } from '../src/storage/local.js'
import { createLocalArtifactIO } from '../src/storage/artifacts.js'
import { serviceConfig } from '../src/execution/config.js'
import { withExecutionProfile } from '../src/execution/profile.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { DocBridgeIndexV1Schema } from '../src/schemas/doc-bridge-index.js'
import { KnowledgeEntitiesV1Schema } from '../src/schemas/knowledge-entity.js'
import { contentHashForIndex } from '../src/index-builder/content-hash.js'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-entities-'))
  roots.push(root)
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true })
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'doc-bridge-fixture', type: 'module' }))
  writeFileSync(join(root, 'src', 'store.ts'), 'export function Store() { return 1 }\n')
  const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } }, index: { llmsTxt: { enabled: false }, capabilities: { enabled: false } } }))
  return { root, config }
}
const gitAt = (root: string) => (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

describe('knowledge entity extraction', () => {
  it('hashes complete source lines with CRLF and legacy CR endings', () => {
    const { root, config } = fixture()
    const snapshot = discoverRepository({ root, config })
    for (const eol of ['\r\n', '\r']) {
      const content = ['# Glossary', '', '**Store**: Holds values.', '**Queue**: Ordered work.', '', '<!-- doc-bridge:generated -->', '**Hidden**: Generated.', ''].join(eol)
      const result = extractKnowledgeEntities({ snapshot, documents: new Map([['docs/glossary.md', content]]) })
      expect(result.entities.map(entity => entity.name)).toEqual(expect.arrayContaining(['Store', 'Queue']))
      expect(result.entities.some(entity => entity.name === 'Hidden')).toBe(false)
      expect(result.entities.find(entity => entity.name === 'Store')!.evidence).toContainEqual({ kind: 'document-region', path: 'docs/glossary.md', lineStart: 3, lineEnd: 3, regionHash: createHash('sha256').update('**Store**: Holds values.' + eol).digest('hex') })
    }
  })

  it('retains exact region evidence, ADR metadata/supersession and precise alias links', () => {
    const { root, config } = fixture()
    const adr = '---\nstatus: accepted\ndate: "2026-01-01"\nsupersedes: 0000-old.md\n---\n# Use Store\n\n## Decision\nUse `Store` in `src/store.ts`.\n'
    const glossary = '# Glossary\n\n## Storage\nStores values.\n\n**Cache**: Temporary values.\n**Buffer**: Temporary bytes.\n\nRecord\n: A stored value.\n\nQueue — Ordered work.\n\n```md\n**Fake**: Not a definition.\n```\n\n<!-- doc-bridge:generated -->\n## Generated\n<!-- /doc-bridge:generated -->\n'
    const documents = new Map([['docs/adr/0001-store.md', adr], ['docs/adr/0000-old.md', '# Previous\n\nStatus: superseded\n\nDate: 2025-01-01\n\n## Decision\nOld behavior.\n'], ['docs/glossary.md', glossary], ['docs/design.md', '# Design\n\n## Decision: Storage\nUse `Store`.\n\n## Alternatives\nNothing.\n'], ['CHANGELOG.md', '# Changelog\n\n## Unreleased\n\n- Use `src/store.ts`.\n']])
    documents.forEach((content, path) => writeFileSync(join(root, path), content))
    const concept = '---\ntype: concept\naliases:\n  - Store\n---\n# Storage\n\nStores values.\n'
    documents.set('docs/storage.md', concept)
    writeFileSync(join(root, 'docs', 'storage.md'), concept)
    const snapshot = discoverRepository({ root, config })
    const result = extractKnowledgeEntities({ snapshot, documents })
    expect(result).toEqual(extractKnowledgeEntities({ snapshot, documents: new Map([...documents].reverse()) }))
    const decision = result.entities.find(entity => entity.name === 'Use Store')!
    expect(decision).toMatchObject({ kind: 'decision', status: 'accepted', date: '2026-01-01' })
    expect(result.entities.find(entity => entity.name === 'Previous')).toMatchObject({ status: 'superseded', date: '2025-01-01' })
    expect(decision.evidence).toContainEqual({ kind: 'document-region', path: 'docs/adr/0001-store.md', lineStart: 1, lineEnd: adr.split('\n').length, regionHash: createHash('sha256').update(adr).digest('hex') })
    expect(decision.links).toContainEqual({ kind: 'affected-path', target: 'src/store.ts' })
    expect(decision.links.some(link => link.kind === 'affected-fact')).toBe(true)
    expect(new Set(decision.evidence.map(item => JSON.stringify(item))).size).toBe(decision.evidence.length)
    expect(decision.links).toContainEqual({ kind: 'supersedes', target: result.entities.find(entity => entity.name === 'Previous')!.id })
    const store = snapshot.entities.find(entity => entity.kind === 'module' && entity.path === 'src/store.ts')!
    expect(result.entities.find(entity => entity.name === 'Storage')!.links).toContainEqual({ kind: 'defines-symbol', target: store.id, symbol: 'Store' })
    expect(result.entities.map(entity => entity.name)).toEqual(expect.arrayContaining(['Cache', 'Buffer', 'Record', 'Queue', 'Decision: Storage', 'Use src/store.ts.']))
    expect(result.entities.some(entity => ['Fake', 'Generated'].includes(entity.name))).toBe(false)
    expect(KnowledgeEntitiesV1Schema.safeParse(result).success).toBe(true)
    for (const entity of result.entities) for (const evidence of entity.evidence) {
      if (evidence.kind !== 'document-region') continue
      const source = documents.get(evidence.path)!
      const lines = source.split(/(?<=\n)/)
      expect(evidence.regionHash).toBe(createHash('sha256').update(lines.slice(evidence.lineStart - 1, evidence.lineEnd).join('')).digest('hex'))
    }
    const changed = extractKnowledgeEntities({ snapshot, documents: new Map([['docs/adr/0001-store.md', adr.replace('Use `Store`', 'Prefer `Store`')]]) }).entities[0]!
    expect(changed.id).toBe(decision.id)
    expect(changed.evidence).not.toEqual(decision.evidence)
  })

  it('does not choose ambiguous symbol owners or near names, and exposes bounds', () => {
    const { root, config } = fixture()
    writeFileSync(join(root, 'src', 'other.ts'), 'export function Store() { return 2 }\n')
    const snapshot = discoverRepository({ root, config })
    const result = extractKnowledgeEntities({ snapshot, documents: new Map([['docs/glossary.md', '# Glossary\n\n**Store**: Values.\n\n**Stores**: More values.\n'], ['docs/adr/huge.md', '# Huge\n\n## Decision\n' + 'x'.repeat(20_000)]]) })
    expect(result.entities.every(entity => !entity.links.some(link => link.kind === 'defines-symbol'))).toBe(true)
    expect(result.coverage[0]).toMatchObject({ status: 'partial' })
    expect(result.coverage[0]!.reason).toContain('ambiguous-symbol')
    expect(result.coverage[0]!.reason).toContain('region-limit')
  })

  it('walks real first-parent history, tags and merge paths, parses conventional commits and limits work', () => {
    const { root, config } = fixture()
    const git = gitAt(root)
    git('init', '-b', 'main')
    git('config', 'user.email', 'fixture@example.invalid')
    git('config', 'user.name', 'Fixture')
    git('add', '.')
    git('commit', '-m', 'feat(core): initial')
    git('tag', 'v1')
    git('switch', '-c', 'topic')
    writeFileSync(join(root, 'src', 'topic.ts'), 'export const Topic = 1\n')
    git('add', '.')
    git('commit', '-m', 'feat: topic-only')
    const topic = git('rev-parse', 'HEAD')
    git('switch', 'main')
    writeFileSync(join(root, 'src', 'store.ts'), 'export function Store() { return 2 }\n')
    git('add', '.')
    git('commit', '-m', 'fix(store)!: update storage')
    git('merge', '--no-ff', 'topic', '-m', 'feat: merge topic', '-m', 'BREAKING CHANGE: storage updated')
    const snapshot = discoverRepository({ root, config })
    const options = { snapshot, documents: new Map<string, string>(), gitRoot: root, window: { maxCommits: 10, sinceTag: 'v1' } }
    const result = extractKnowledgeEntities(options)
    expect(result.entities).toHaveLength(2)
    expect(result.entities.some(entity => entity.id.endsWith(topic))).toBe(false)
    const merge = result.entities.find(entity => entity.name === 'feat: merge topic')!
    expect(merge.conventional).toMatchObject({ type: 'feat', breaking: true })
    expect(merge.links).toContainEqual({ kind: 'affected-path', target: 'src/topic.ts' })
    const update = result.entities.find(entity => entity.name.includes('update storage'))!
    expect(update.conventional).toEqual({ type: 'fix', scope: 'store', breaking: true })
    expect(update.links).toContainEqual({ kind: 'affected-path', target: 'src/store.ts' })
    expect(result).toEqual(extractKnowledgeEntities(options))
    const enabledConfig = { ...config, index: { ...config.index, knowledgeEntities: { enabled: true } } }
    buildDocBridgeIndex({ root, config: enabledConfig })
    expect(() => loadFreshDocBridgeIndex(root, enabledConfig)).not.toThrow()
    git('commit', '--allow-empty', '-m', 'chore: history-only change')
    expect(() => loadFreshDocBridgeIndex(root, enabledConfig)).toThrow('stale')
    const limited = extractKnowledgeEntities({ ...options, window: { maxCommits: 1 } })
    expect(limited.entities).toHaveLength(1)
    expect(limited.coverage.find(item => item.scope === 'git:first-parent')!.status).toBe('partial')
    const missing = extractKnowledgeEntities({ ...options, window: { sinceTag: 'missing' } })
    expect(missing.coverage.find(item => item.scope === 'git:first-parent')!.status).toBe('not-analyzed')
  })

  it('keeps disabled indexes byte identical and seals only opt-in entities', () => {
    const { root, config } = fixture()
    writeFileSync(join(root, 'docs', 'glossary.md'), '# Glossary\n\n**Store**: Holds values.\n')
    const first = buildDocBridgeIndex({ root, config }).index
    const disabled = buildDocBridgeIndex({ root, config: { ...config, index: { ...config.index, knowledgeEntities: { enabled: false, maxCommits: 1 } } } }).index
    expect(JSON.stringify(disabled)).toBe(JSON.stringify(first))
    expect(() => loadFreshDocBridgeIndex(root, { ...config, index: { ...config.index, knowledgeEntities: { enabled: false } } })).not.toThrow()
    expect(first).not.toHaveProperty('knowledgeEntities')
    const legacyReader = z.object(DocBridgeIndexV1Schema.shape).omit({ knowledgeEntities: true }).strict()
    expect(legacyReader.safeParse(first).success).toBe(true)
    const enabledConfig = { ...config, index: { ...config.index, knowledgeEntities: { enabled: true } } }
    const enabled = buildDocBridgeIndex({ root, config: enabledConfig }).index
    expect(DocBridgeIndexV1Schema.safeParse(enabled).success).toBe(true)
    expect(legacyReader.safeParse(enabled).success).toBe(false)
    expect(enabled.knowledgeEntities!.entities).toHaveLength(1)
    expect(enabled.contentHash).not.toBe(first.contentHash)
    const legacy = buildDocBridgeIndex({ root, config, hashAlgorithm: 'sha256-normalized-v1', write: false }).index
    const unsealed = { ...legacy, knowledgeEntities: enabled.knowledgeEntities }
    expect(DocBridgeIndexV1Schema.safeParse(unsealed).success).toBe(false)
    expect(() => contentHashForIndex(unsealed)).toThrow('require sha256-semantic-v1')
    writeFileSync(join(root, '.doc-bridge', 'index.json'), JSON.stringify(unsealed))
    expect(() => loadDocBridgeIndex(root, config)).toThrow('require sha256-semantic-v1')
    writeFileSync(join(root, '.doc-bridge', 'index.json'), JSON.stringify(enabled))
    const modified = structuredClone(enabled)
    modified.knowledgeEntities!.entities[0]!.name = 'Changed'
    expect(contentHashForIndex(modified)).not.toBe(enabled.contentHash)
    expect(() => buildDocBridgeIndex({ root, config: enabledConfig, hashAlgorithm: 'sha256-normalized-v1', write: false })).toThrow('require sha256-semantic-v1')
    const withoutRetrieval = buildDocBridgeIndex({ root, config: { ...enabledConfig, retrieval: { corpus: { enabled: false } } }, write: false }).index
    expect(withoutRetrieval.knowledgeEntities!.entities).toHaveLength(1)
    expect(withoutRetrieval.projection).toBeUndefined()
  })

  it('extracts captured documents without accessing local history and keeps service opt-in denied', async () => {
    const { root, config } = fixture()
    writeFileSync(join(root, 'docs', 'glossary.md'), '# Glossary\n\n**Store**: Holds values.\n')
    const enabledConfig = { ...config, index: { ...config.index, knowledgeEntities: { enabled: true } } }
    expect(serviceConfig(enabledConfig).config.index).not.toHaveProperty('knowledgeEntities')
    const snapshot = discoverRepository({ root, config: enabledConfig })
    const isolated = withExecutionProfile('service', () => extractKnowledgeEntities({ snapshot, documents: new Map(), gitRoot: root }))
    expect(isolated.coverage.find(item => item.scope === 'git:first-parent')).toMatchObject({ status: 'not-analyzed' })
    const partition = { repositoryId: 'fixture', revision: snapshot.sourceRevision }
    const inventory = Object.fromEntries(['package.json', 'src/store.ts', 'docs/glossary.md'].map(path => [path, contentRef(readFileSync(join(root, path)))]))
    const limits = { maxFiles: 100, maxBytes: 1024 * 1024, maxFileBytes: 1024 * 1024, maxTimeMs: 10_000, maxMemoryMb: 1024 }
    const repository = await createLocalRepositoryRead({ root, partition, inventory, limits })
    const artifactRoot = mkdtempSync(join(tmpdir(), 'doc-bridge-entity-artifacts-'))
    roots.push(artifactRoot)
    const artifacts = await createLocalArtifactIO({ root: artifactRoot, partition, limits })
    const built = await buildStoredDocBridgeIndex({ partition, signal: new AbortController().signal, config: enabledConfig, snapshot, repository, artifacts, write: false, overlay: 'ignore' })
    expect(built.status).toBe('ok')
    if (built.status !== 'ok') return
    expect(built.value.index.knowledgeEntities!.entities[0]!.name).toBe('Store')
    expect(built.value.index.knowledgeEntities!.coverage.find(item => item.scope === 'git:first-parent')).toMatchObject({ status: 'not-analyzed' })
  })
})
