import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { auditDocumentation } from '../src/audit/documentation.js'
import { runCli } from '../src/cli/program.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import { applyDocumentationDeclarations } from '../src/discovery/documentation.js'
import { parseMarkdownDocument } from '../src/discovery/markdown.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { renderLlmsTxt, llmsTxtVariables } from '../src/index-builder/llms-txt.js'
import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'
import { areaPagesView, changeDigestView, overlayReviewView, ownershipPagesView } from '../src/render/data.js'
import { renderTemplate, renderTemplateWithKnap, TemplateError } from '../src/render/engine.js'
import { generatedRegionHash, verifyGeneratedRegions, wrapGeneratedRegion } from '../src/render/generated.js'
import { REGION_VARIABLES, renderArtifact, writeRenderedPages } from '../src/render/render.js'
import { BUNDLED_TEMPLATES, RENDER_TEMPLATE_NAMES } from '../src/render/templates.js'
import { toPosix } from '../src/lib/paths.js'

vi.setConfig({ testTimeout: 30_000 })

const repositoryRoot = process.cwd()
const goldenRoot = join(repositoryRoot, 'tests', 'golden', 'render')
const updateGolden = process.env.DOC_BRIDGE_UPDATE_GOLDEN === '1'
const temporary: string[] = []

afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const write = (root: string, path: string, content: string): void => {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

const rawConfig = {
  schemaVersion: 1,
  corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
  routing: {
    options: {
      ownership: {
        'fixture-query': { path: 'src/query', purpose: 'Query layer', checks: ['pnpm test --filter query'], agentDoc: 'docs/for-agents/query.md', humanDoc: '/docs/query' },
      },
    },
  },
  // The Registry stays off: rendering must not need it.
  intelligence: { enabled: false },
}

/**
 * One package, two areas, an ownership record on one, a sidecar that covers it, a guide that
 * mentions a module in the other, and a hub linking to the guide. Fixed bytes, so every hash the
 * pages print is the same on every machine.
 */
const fixture = (overrides: Record<string, unknown> = {}): { readonly root: string; readonly config: DocBridgeConfigV1; readonly configPath: string } => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-render-'))
  temporary.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0', scripts: { test: 'vitest run' } }), 'utf8')
  write(root, 'src/query/search.ts', "import { rank } from '../ranking/bm25.js'\nexport const searchIndex = (): number => rank()\n")
  write(root, 'src/query/parse.ts', 'export const parseQuery = (): number => 1\n')
  write(root, 'src/ranking/bm25.ts', 'export const rank = (): number => 2\n')
  write(root, 'docs/for-agents/INDEX.md', '# Agent index\n\nStart with [query](./query.md) and the [ranking guide](../ranking.md).\n')
  write(root, 'docs/for-agents/query.md', '---\nid: fixture-query\neditRoot: src/query\n---\n# Query\n\nDeterministic search over the index. Exports `searchIndex` and `parseQuery`.\n')
  write(root, 'docs/ranking.md', '# Ranking\n\nScores come from `src/ranking/bm25.ts`, which exports `rank`.\n')
  write(root, 'docs/mention.md', '# Mention\n\nA passing mention of `src/query` and nothing more.\n')
  write(root, 'AGENTS.md', '# Agents\n\nRead the agent index first.\n')
  const configPath = join(root, 'doc-bridge.config.json')
  const merged = { ...rawConfig, ...overrides }
  writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8')
  const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse(merged))
  return { root, config, configPath }
}

const overlay = {
  pending: [
    { proposalId: 'p-2', kind: 'summarize', entity: 'document:docs/ranking.md', reason: 'The page has no summary.', confidence: 0.7, evidence: [{ path: 'docs/ranking.md', lineStart: 1, lineEnd: 3 }] },
    { proposalId: 'p-1', kind: 'add-alias', entity: 'module:src/query/search.ts', reason: 'Documents call it "the searcher".', confidence: 0.9, evidence: [{ path: 'docs/for-agents/query.md', lineStart: 7 }, { path: 'docs/mention.md' }] },
  ],
}

const expectGolden = (name: string, content: string): void => {
  const path = join(goldenRoot, name)
  if (updateGolden) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
    return
  }
  expect(existsSync(path), `golden file ${name} is missing; run with DOC_BRIDGE_UPDATE_GOLDEN=1`).toBe(true)
  expect(content).toBe(readFileSync(path, 'utf8'))
}

const captureStdout = (fn: () => number | undefined | Promise<number>): { code: number | undefined | Promise<number>; out: string } => {
  const original = process.stdout.write
  let out = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk)
    return true
  }) as typeof process.stdout.write
  try {
    return { code: fn(), out }
  } finally {
    process.stdout.write = original
  }
}

const captureStderr = (fn: () => number | undefined | Promise<number>): { code: number | undefined | Promise<number>; err: string } => {
  const original = process.stderr.write
  let err = ''
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err += String(chunk)
    return true
  }) as typeof process.stderr.write
  try {
    return { code: fn(), err }
  } finally {
    process.stderr.write = original
  }
}

describe('the template engine', () => {
  it('parses with knap and renders what knap renders', async () => {
    const cases: readonly [string, Record<string, unknown>][] = [
      ['A\n\n{% if x %}\nBODY\n{% endif %}\n\nB\n', { x: true }],
      ['A\n\n{% if x %}\nBODY\n{% endif %}\n\nB\n', { x: false }],
      ['{% if a %}A{% elseif b %}B{% else %}C{% endif %}', { b: 1 }],
      ['## D\n\n{% for d in items %}\n- {{ d }}\n{% endfor %}\n{% if not items %}\nNone\n{% endif %}\n\n## R\n', { items: ['a', 'b'] }],
      ['## D\n\n{% for d in items %}\n- {{ d }}\n{% endfor %}\n{% if not items %}\nNone\n{% endif %}\n\n## R\n', { items: [] }],
      ['{% for d in items %}\n## {{ d.n }}\n\n{% for m in d.ms %}\n- {{ m }}\n{% endfor %}\n\n{% endfor %}\nEND\n', { items: [{ n: 'a', ms: ['1', '2'] }, { n: 'b', ms: [] }] }],
      ['{% for d in items %}{{ d }}{% if not loop.last %}, {% endif %}{% endfor %} {{ loop }}', { items: ['a', 'b', 'c'] }],
      ['{{ items | length }} {{ items.length }} {{ items | join:", " }} {{ items | first | upper }}', { items: ['a', 'b'] }],
      ['{{ a ?? "fallback" }} {{ o }} {{ one }} {{ n }} {{ z }} {{ missing.deep }}', { a: '', o: { k: 1 }, one: ['only'], n: 3, z: 0 }],
      ['{% set greeting = "hi " %}{{ greeting }}{{ name | trim }} {{ x == 1 and y != 2 }} {{ "b" contains "B" }} {{ list contains "A" }}', { name: ' Ada ', x: 1, y: 3, list: ['a'] }],
      ['```json\n{{ j }}\n```\n', { j: '{"a":1}' }],
      ['{{ o.k }} {{ o["k"] }} {{ arr[1] }} {{ arr.1 }}', { o: { k: 'v' }, arr: ['x', 'y'] }],
    ]
    for (const [source, variables] of cases) {
      expect(renderTemplate(source, variables)).toBe(await renderTemplateWithKnap(source, variables))
    }
  })

  it('rejects an unknown filter or a malformed tag before rendering anything', () => {
    expect(() => renderTemplate('{{ x | nosuchfilter }}', { x: 1 })).toThrow(TemplateError)
    expect(() => renderTemplate('{% if x %}open', { x: 1 })).toThrow(TemplateError)
    expect(() => renderTemplate('{% for x in items %}{{ x }}{% endfor %}', { items: 'not a list' })).toThrow(/not an array/)
  })

  it('does not leak {% set %} into the caller and never mutates the variables', () => {
    const variables = { name: 'x' }
    expect(renderTemplate('{% set name = "y" %}{{ name }}', variables)).toBe('y')
    expect(variables).toEqual({ name: 'x' })
  })
})

describe('bundled templates', () => {
  it('render byte-identically through the synchronous evaluator and through knap', async () => {
    const { root, config } = fixture()
    const index = buildDocBridgeIndex({ root, config, write: false }).index
    const previous = discoverRepository({ root, config })
    write(root, 'src/query/parse.ts', 'export const parseQuery = (): number => 2\n')
    const current = discoverRepository({ root, config })
    const variables: Record<string, Record<string, unknown>[]> = {
      'llms.txt': [llmsTxtVariables(config, index.knowledge, 'fixture')],
      area: areaPagesView(index, config, { root }).map((area) => ({ area, region: REGION_VARIABLES })),
      ownership: ownershipPagesView(index, config, { root }).map((owner) => ({ owner, region: REGION_VARIABLES })),
      'change-digest': [{ digest: changeDigestView(previous, current), region: REGION_VARIABLES }],
      'overlay-review': [
        { overlay: overlayReviewView(overlay, 'overlay.json'), region: REGION_VARIABLES },
        { overlay: overlayReviewView({ pending: [] }), region: REGION_VARIABLES },
        { overlay: overlayReviewView(undefined), region: REGION_VARIABLES },
      ],
    }
    for (const name of RENDER_TEMPLATE_NAMES) {
      const sets = variables[name] as Record<string, unknown>[]
      expect(sets.length).toBeGreaterThan(0)
      for (const set of sets) {
        const ours = renderTemplate(BUNDLED_TEMPLATES[name], set, name)
        expect(ours, name).toBe(await renderTemplateWithKnap(BUNDLED_TEMPLATES[name], set))
      }
    }
  })

  it('each has a golden file, and rendering the same data twice produces byte-identical output', () => {
    const { root, config } = fixture()
    write(root, '.doc-bridge/enrich/overlay.json', JSON.stringify(overlay))
    const runCliQuietly = (args: string[]): number => captureStdout(() => runCli(args)).code as number
    // scan → reconcile records the previous snapshot and the reconciliation report the pages read.
    expect(runCliQuietly(['reconcile', '--config', join(root, 'doc-bridge.config.json')])).toBe(0)
    write(root, 'src/query/parse.ts', 'export const parseQuery = (): number => 2\n')

    for (const template of RENDER_TEMPLATE_NAMES) {
      const first = renderArtifact({ root, config, template })
      const second = renderArtifact({ root, config, template })
      expect(second).toEqual(first)
      expect(first.origin).toBe('bundled')
      expect(first.pages.length).toBeGreaterThan(0)
      for (const page of first.pages) expectGolden(`${template}/${page.path}`, page.content)
    }
  })

  it('carry a stable generated-region marker with the hash of the region body', () => {
    const { root, config } = fixture()
    for (const template of ['area', 'ownership', 'overlay-review'] as const) {
      for (const page of renderArtifact({ root, config, template }).pages) {
        const marker = /<!-- doc-bridge:generated hash=([a-f0-9]{16}) -->/.exec(page.content)
        expect(marker, `${template}/${page.path}`).not.toBeNull()
        expect(page.content).toContain('<!-- /doc-bridge:generated -->')
        const regions = parseMarkdownDocument(page.path, page.content).generatedRegions
        expect(regions).toHaveLength(1)
        expect(regions[0]?.hash).toBe(marker?.[1])
        expect(verifyGeneratedRegions(page.content, regions)).toEqual([])
        // An edit inside the region is detectable; an edit outside it is not the generator's business.
        const edited = page.content.replace('<!-- /doc-bridge:generated -->', 'A note someone typed.\n<!-- /doc-bridge:generated -->')
        expect(verifyGeneratedRegions(edited, parseMarkdownDocument(page.path, edited).generatedRegions)).toHaveLength(1)
        const appended = `${page.content}\nA note after the region.\n`
        expect(verifyGeneratedRegions(appended, parseMarkdownDocument(page.path, appended).generatedRegions)).toEqual([])
      }
    }
    expect(wrapGeneratedRegion('\n\nbody\n')).toBe(`<!-- doc-bridge:generated hash=${generatedRegionHash('body')} -->\nbody\n<!-- /doc-bridge:generated -->\n`)
    expect(generatedRegionHash('a\r\nb')).toBe(generatedRegionHash('a\nb'))
  })

  it('llms.txt carries no marker and stays byte-identical to the previous concatenation', () => {
    const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } }))
    const knowledge = [
      { id: 'docs/a.md', type: 'agent-doc', title: 'A', path: 'docs/a.md', description: 'First' },
      { id: 'docs/b.md', type: 'agent-doc', title: 'B', path: 'docs/b.md' },
      { id: 'module:src/x.ts', type: 'module', title: 'x.ts', path: 'src/x.ts', description: 'projected, not curated' },
    ]
    expect(renderLlmsTxt(config, knowledge, 'proj')).toBe(
      '# proj\n\n> Agent-readable documentation index generated by ak-docs (@agentskit/doc-bridge).\n\n## Knowledge\n\n- [A](docs/a.md): First\n- [B](docs/b.md)\n',
    )
    expect(renderLlmsTxt(config, [], 'proj')).toBe('# proj\n\n> Agent-readable documentation index generated by ak-docs (@agentskit/doc-bridge).\n\n## Knowledge\n\n\n')
    const custom = { ...config, index: { ...config.index, llmsTxt: { enabled: true, outFile: 'llms.txt', preamble: '# Custom\n\nIntro.\n', urlPrefix: 'https://docs.example.com/', pathPrefix: 'docs' } } }
    expect(renderLlmsTxt(custom, knowledge, 'proj')).toBe('# Custom\n\nIntro.\n\n## Knowledge\n\n- [A](https://docs.example.com/a): First\n- [B](https://docs.example.com/b)\n')
    expect(renderLlmsTxt(config, knowledge, 'proj')).not.toContain('doc-bridge:generated')
  })
})

describe('project templates', () => {
  it('replace the bundled one under render.templates without a code change', () => {
    const { root, config } = fixture({ render: { templates: { area: 'templates/area.md', 'llms.txt': 'templates/llms.md' } } })
    write(root, 'templates/area.md', '{{ region.open }}\n# {{ area.path }} ({{ area.modules | length }} modules)\n{{ region.close }}\n')
    write(root, 'templates/llms.md', '# {{ project }}\n{% for entry in entries %}\n* {{ entry.title }}\n{% endfor %}\n')
    const areas = renderArtifact({ root, config, template: 'area' })
    expect(areas.origin).toBe('templates/area.md')
    expect(areas.pages.map((page) => page.content)).toEqual([
      expect.stringMatching(/^<!-- doc-bridge:generated hash=[a-f0-9]{16} -->\n# src\/query \(2 modules\)\n<!-- \/doc-bridge:generated -->\n$/),
      expect.stringMatching(/^<!-- doc-bridge:generated hash=[a-f0-9]{16} -->\n# src\/ranking \(1 modules\)\n<!-- \/doc-bridge:generated -->\n$/),
    ])
    // The builder and the conformance profile render llms.txt through the same override.
    const built = buildDocBridgeIndex({ root, config })
    expect(readFileSync(built.llmsTxtPath as string, 'utf8')).toBe('# fixture\n* Agent index\n* Query\n')
    expect(renderArtifact({ root, config, template: 'llms.txt' }).pages[0]?.content).toBe('# fixture\n* Agent index\n* Query\n')
  })

  it('report a missing or broken override by name', () => {
    const { root, config } = fixture({ render: { templates: { ownership: 'templates/missing.md' } } })
    expect(() => renderArtifact({ root, config, template: 'ownership' })).toThrow(/render\.templates\["ownership"\]/)
    write(root, 'templates/missing.md', '{% for x in %}')
    expect(() => renderArtifact({ root, config, template: 'ownership' })).toThrow(TemplateError)
  })
})

describe('the change digest', () => {
  it('lists exactly the entities whose content hash moved between two snapshots, and the documents that should follow', () => {
    const { root, config } = fixture()
    const previous = discoverRepository({ root, config })
    write(root, 'previous.json', JSON.stringify(previous))
    write(root, 'src/query/parse.ts', 'export const parseQuery = (): number => 2\n')
    const digest = changeDigestView(previous, discoverRepository({ root, config }))
    expect(digest.changed.map((entity) => entity.id)).toEqual(['module:src/query/parse.ts'])
    expect(digest.added).toEqual([])
    expect(digest.removed).toEqual([])
    expect(digest.documentsToReview).toEqual([{ path: 'docs/for-agents/query.md', because: 'mentions-symbol `src/query/parse.ts`' }])

    const page = renderArtifact({ root, config, template: 'change-digest', dataPath: 'previous.json' }).pages[0]?.content ?? ''
    expect(page).toContain('- `src/query/parse.ts` (module):')
    expect(page).not.toContain('search.ts')
    expect(page).toContain('- `docs/for-agents/query.md`: mentions-symbol `src/query/parse.ts`')
    expect(page).toContain('Nothing was added.')
  })

  it('takes the previous snapshot from the last scan and reports when there is none', () => {
    const { root, config } = fixture()
    expect(() => renderArtifact({ root, config, template: 'change-digest' })).toThrow(/ak-docs scan/)
    expect(captureStdout(() => runCli(['scan', '--config', join(root, 'doc-bridge.config.json')])).code).toBe(0)
    expect(renderArtifact({ root, config, template: 'change-digest' }).pages[0]?.content).toContain('No file-backed entity changed.')
    write(root, 'docs/new.md', '# New\n')
    const page = renderArtifact({ root, config, template: 'change-digest' }).pages[0]?.content ?? ''
    expect(page).toContain('## Added\n\n- `docs/new.md` (document):')
    // Rendering does not move the baseline: the digest is the same until the next scan.
    expect(renderArtifact({ root, config, template: 'change-digest' }).pages[0]?.content).toBe(page)
  })
})

describe('the audit and the analyzer on generated regions', () => {
  const auditFor = (root: string, config: DocBridgeConfigV1) => {
    const snapshot = discoverRepository({ root, config })
    const documents = snapshot.entities
      .filter((entity) => entity.kind === 'document' && entity.path)
      .map((entity) => ({ path: entity.path as string, content: readFileSync(join(root, entity.path as string), 'utf8') }))
    const declared = applyDocumentationDeclarations(snapshot, documents, { agentRoot: config.corpus.agent.root }).snapshot
    const reconciliation = reconcileKnowledge(snapshot, declared, {})
    return auditDocumentation({ root, snapshot, declared, reconciliation })
  }

  it('reports a manual edit inside a generated region under generated-freshness rather than overwriting it', () => {
    const { root, config } = fixture()
    const page = renderArtifact({ root, config, template: 'area' }).pages.find((item) => item.path === 'src-query.md')?.content ?? ''
    write(root, 'docs/areas/src-query.md', page)
    expect(auditFor(root, config).findings.filter((finding) => finding.code === 'GENERATED_REGION_EDITED')).toEqual([])

    write(root, 'docs/areas/src-query.md', page.replace('## Modules', '## Modules\n\nSomeone typed this into the generated region.'))
    const findings = auditFor(root, config).findings.filter((finding) => finding.code === 'GENERATED_REGION_EDITED')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ category: 'generated-freshness', status: 'stale-or-unverified', severity: 'warn', confidence: 'high' })
    expect(findings[0]?.evidence[0]).toMatchObject({ path: 'docs/areas/src-query.md', lineStart: 1 })
    expect(findings[0]?.message).toMatch(/hash=[a-f0-9]{16}/)
  })

  it('does not collect mentions from inside a generated region', () => {
    const { root, config } = fixture()
    const page = renderArtifact({ root, config, template: 'area' }).pages.find((item) => item.path === 'src-query.md')?.content ?? ''
    expect(page).toContain('`src/query/search.ts`')
    write(root, 'docs/areas/src-query.md', `${page}\nOutside the region, \`src/ranking/bm25.ts\` is a mention.\n`)
    const snapshot = discoverRepository({ root, config })
    const fromPage = snapshot.relations.filter((relation) => relation.from === 'document:docs/areas/src-query.md')
    expect(fromPage.map((relation) => `${relation.kind} ${relation.to}`)).toEqual(['mentions module:src/ranking/bm25.ts'])
  })
})

describe('the overlay review page', () => {
  it('renders an explicit empty state when no overlay exists, and the proposals with evidence links when one does', () => {
    const { root, config } = fixture()
    const empty = renderArtifact({ root, config, template: 'overlay-review' }).pages[0]?.content ?? ''
    expect(empty).toContain('No enrichment overlay exists for this repository.')
    expect(empty).toMatch(/^<!-- doc-bridge:generated hash=[a-f0-9]{16} -->\n# Overlay review\n/)

    write(root, 'overlay.json', JSON.stringify(overlay))
    const page = renderArtifact({ root, config, template: 'overlay-review', dataPath: 'overlay.json' }).pages[0]?.content ?? ''
    expect(page).toContain('2 proposal(s) pending review in `overlay.json`')
    expect(page.indexOf('## add-alias: `module:src/query/search.ts`')).toBeLessThan(page.indexOf('## summarize: `document:docs/ranking.md`'))
    expect(page).toContain('- [docs/for-agents/query.md:7](docs/for-agents/query.md#L7)')
    expect(page).toContain('- [docs/mention.md](docs/mention.md)')
    expect(page).toContain('- [docs/ranking.md:1-3](docs/ranking.md#L1-L3)')

    write(root, '.doc-bridge/enrich/overlay.json', JSON.stringify({ pending: [] }))
    expect(renderArtifact({ root, config, template: 'overlay-review' }).pages[0]?.content).toContain('No proposal is pending review.')
    write(root, 'bad.json', JSON.stringify({ pending: 'nope' }))
    expect(() => renderArtifact({ root, config, template: 'overlay-review', dataPath: 'bad.json' })).toThrow(/"pending" must be an array/)
  })
})

describe('boundaries', () => {
  it('reaches nothing under src/agents from src/render', () => {
    const roots = ['src/render/render.ts', 'src/render/engine.ts', 'src/render/data.ts', 'src/render/template-source.ts', 'src/index-builder/llms-txt.ts']
    const seen = new Set<string>()
    const queue = roots.map((path) => resolve(repositoryRoot, path))
    while (queue.length) {
      const file = queue.pop() as string
      if (seen.has(file)) continue
      seen.add(file)
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/^(?:import|export)[^\n]*?\sfrom\s+'(\.{1,2}\/[^']+)'/gm)) {
        queue.push(resolve(dirname(file), (match[1] as string).replace(/\.js$/, '.ts')))
      }
    }
    const reached = [...seen].map((file) => toPosix(file.slice(repositoryRoot.length + 1)))
    expect(reached.filter((file) => file.startsWith('src/agents/'))).toEqual([])
    expect(reached).toContain('src/query/handoff.ts')
  })
})

describe('ak-docs render', () => {
  it('prints a template to stdout, writes pages under --output, and prints the bundled template', () => {
    const { root, config, configPath } = fixture()
    const expected = renderArtifact({ root, config, template: 'llms.txt' }).pages[0]?.content
    const stdout = captureStdout(() => runCli(['render', 'llms.txt', '--config', configPath]))
    expect(stdout.code).toBe(0)
    expect(stdout.out).toBe(expected)

    const written = captureStdout(() => runCli(['render', 'area', '--output', 'docs/areas', '--config', configPath]))
    expect(written.code).toBe(0)
    expect(JSON.parse(written.out)).toEqual({ ok: true, template: 'area', source: 'bundled', written: ['docs/areas/src-query.md', 'docs/areas/src-ranking.md'] })
    expect(readFileSync(join(root, 'docs/areas/src-query.md'), 'utf8')).toBe(renderArtifact({ root, config, template: 'area' }).pages[0]?.content)

    const single = captureStdout(() => runCli(['render', 'overlay-review', '--output', 'review.md', '--config', configPath]))
    expect(JSON.parse(single.out).written).toEqual(['review.md'])
    expect(existsSync(join(root, 'review.md'))).toBe(true)

    const json = captureStdout(() => runCli(['render', 'ownership', '--json', '--config', configPath]))
    const payload = JSON.parse(json.out) as { ok: boolean; template: string; pages: { path: string }[] }
    expect(payload).toMatchObject({ ok: true, template: 'ownership' })
    expect(payload.pages.map((page) => page.path)).toContain('fixture-query.md')

    const printed = captureStdout(() => runCli(['render', 'change-digest', '--print-template', '--config', configPath]))
    expect(printed.out).toBe(BUNDLED_TEMPLATES['change-digest'])

    const bad = captureStderr(() => runCli(['render', 'nope', '--config', configPath]))
    expect(bad.code).toBe(1)
    expect(bad.err).toContain('Unknown template "nope"')
    expect(captureStderr(() => runCli(['render'])).code).toBe(1)
  })

  it('writeRenderedPages treats an existing directory as one even for a single page', () => {
    const { root, config } = fixture()
    mkdirSync(join(root, 'out'))
    const result = renderArtifact({ root, config, template: 'overlay-review' })
    expect(writeRenderedPages(result, join(root, 'out'), root)).toEqual(['out/overlay-review.md'])
  })
})
