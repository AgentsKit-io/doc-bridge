import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeLocalKnowledgeArtifactContentHash, LocalKnowledgeArtifactSchema } from '@agentskit/chat-protocol'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const docsRoot = join(root, 'docs')
const publicRoot = join(root, 'apps/docs/public')
const origin = 'https://agentskit-io.github.io/doc-bridge'
const generatedAt = process.env.SOURCE_DATE_EPOCH
  ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : '2026-07-14T00:00:00.000Z'

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  }))
  return files.flat().filter((path) => extname(path) === '.md').sort()
}

function unix(path) { return path.split(sep).join('/') }
function entryId(slug) { return `doc:${slug.replace(/[^A-Za-z0-9._:-]+/g, ':')}` }
function aliases(values) {
  const seen = new Set()
  return values.filter((value) => {
    const key = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
function titleOf(markdown, fallback) { return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fallback }
function descriptionOf(markdown) {
  return markdown.split(/\n\s*\n/).map((block) => block.replace(/^#+\s+.*$/gm, '').trim())
    .find((block) => block && !block.startsWith('```') && !block.startsWith('>'))?.replace(/\s+/g, ' ').slice(0, 240)
    ?? 'Canonical Doc Bridge documentation.'
}

await rm(publicRoot, { recursive: true, force: true })
await mkdir(join(publicRoot, 'raw'), { recursive: true })
await mkdir(join(publicRoot, 'deterministic'), { recursive: true })

const files = await walk(docsRoot)
const documents = await Promise.all(files.map(async (path) => {
  const markdown = await readFile(path, 'utf8')
  const file = unix(relative(docsRoot, path))
  const slug = file.replace(/\.md$/, '')
  return { path, file, slug, markdown, title: titleOf(markdown, slug), description: descriptionOf(markdown) }
}))

for (const doc of documents) {
  const target = join(publicRoot, 'raw', doc.file)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, doc.markdown)
}

await cp(join(root, 'docs/landing/assets'), join(publicRoot, 'assets'), { recursive: true })

const llms = [
  '# AgentsKit Doc Bridge',
  '',
  '> Deterministic human↔agent documentation handoffs, generated from the repository itself.',
  '',
  '## Start here',
  '',
  `- [Getting started](${origin}/docs/getting-started/): Install, index, query, and gate in 60 seconds.`,
  `- [Positioning](${origin}/docs/POSITIONING/): Product purpose, maturity, and ecosystem role.`,
  `- [MCP](${origin}/docs/mcp/): Expose repository knowledge to compatible agents.`,
  `- [CLI reference](${origin}/docs/spec/cli/): Complete deterministic command surface.`,
  '',
  '## Canonical documentation',
  '',
  ...documents.map((doc) => `- [${doc.title}](${origin}/raw/${doc.file}): ${doc.description}`),
  '',
  '## Machine surfaces',
  '',
  `- [Full corpus](${origin}/llms-full.txt)`,
  `- [Deterministic knowledge artifact](${origin}/deterministic/knowledge.json)`,
  `- [Doc Bridge index schema](${origin}/raw/schemas/doc-bridge-index-v1.md)`,
  '',
].join('\n')

const llmsFull = [llms, ...documents.flatMap((doc) => [`\n---\n\n# Source: ${doc.file}\n`, doc.markdown])].join('\n')
await writeFile(join(publicRoot, 'llms.txt'), llms)
await writeFile(join(publicRoot, 'llms-full.txt'), llmsFull)

const docEntries = documents.map((doc) => ({
  id: entryId(doc.slug),
  kind: 'document',
  label: doc.title,
  match: { type: 'exact', values: aliases([doc.slug, doc.file, doc.title, `doc bridge ${doc.title}`]).slice(0, 16) },
  answer: {
    markdown: `## ${doc.title}\n\n${doc.description}\n\n[Open the canonical guide](${origin}/docs/${doc.slug}/) · [Read raw Markdown](${origin}/raw/${doc.file})`,
    citations: [{ id: entryId(doc.slug), title: doc.title, href: `${origin}/docs/${doc.slug}/` }],
  },
}))

const commandEntries = [
  ['index', 'Build the documentation index', 'npx @agentskit/doc-bridge index', 'Scan configured human and agent docs and write `.doc-bridge/index.json`.'],
  ['handoff', 'Resolve a package handoff', 'npx ak-docs query package doc-bridge --agent', 'Return the exact start document, edit roots, checks, and human documentation link.'],
  ['gate', 'Run documentation gates', 'npx ak-docs gate run', 'Validate coverage and freshness locally or in CI.'],
  ['mcp', 'Start the MCP server', 'npx ak-docs mcp', 'Expose deterministic query and handoff tools over MCP stdio.'],
].map(([id, label, command, description]) => ({
  id: `command:${id}`,
  kind: 'command',
  label,
  match: { type: 'exact', values: aliases([id, command, label, `how do i ${id}`, `doc bridge ${id}`]) },
  answer: { markdown: `## ${label}\n\n\`\`\`bash\n${command}\n\`\`\`\n\n${description}`, citations: [{ id: 'doc:spec:cli', title: 'CLI reference', href: `${origin}/docs/spec/cli/` }] },
}))

const handoffIndex = JSON.parse(await readFile(join(root, '.doc-bridge/index.json'), 'utf8'))
const handoff = handoffIndex.handoffs?.['doc-bridge']
const handoffEntry = {
  id: 'package:doc-bridge', kind: 'package', label: 'Doc Bridge ownership handoff',
  match: { type: 'exact', values: ['doc-bridge', '@agentskit/doc-bridge', 'who owns doc bridge', 'doc bridge handoff'] },
  answer: {
    markdown: `## Doc Bridge handoff\n\nStart at **${handoff?.startHere ?? 'docs/POSITIONING.md'}**. Edit roots: **${(handoff?.editRoots ?? ['src']).join(', ')}**. Checks: **${(handoff?.checks ?? ['pnpm test', 'pnpm typecheck']).join('**, **')}**.\n\nThis answer was generated from the repository's own Doc Bridge index.`,
    citations: [{ id: 'doc:POSITIONING', title: 'Doc Bridge positioning', href: `${origin}/docs/POSITIONING/` }],
  },
}

const withoutHash = {
  protocol: 'agentskit.chat.knowledge', version: 1, artifactId: 'agentskit-doc-bridge', siteId: 'doc-bridge',
  generatedAt, entries: [...commandEntries, handoffEntry, ...docEntries],
}
const validation = LocalKnowledgeArtifactSchema.safeParse({ ...withoutHash, contentHash: `sha256:${'0'.repeat(64)}` })
if (!validation.success) throw new TypeError(`Invalid deterministic artifact:\n${validation.error.message}`)
const contentHash = await computeLocalKnowledgeArtifactContentHash(withoutHash)
const artifact = LocalKnowledgeArtifactSchema.parse({ ...withoutHash, contentHash })
await writeFile(join(publicRoot, 'deterministic/knowledge.json'), `${JSON.stringify(artifact, null, 2)}\n`)
await writeFile(join(publicRoot, 'deterministic/site-config.json'), `${JSON.stringify({
  protocol: 'agentskit.chat.site', version: 1, siteId: 'doc-bridge',
  artifact: { href: '/doc-bridge/deterministic/knowledge.json', contentHash }, fallback: { mode: 'backend' },
}, null, 2)}\n`)

console.log(`docs artifacts: ${documents.length} sources, ${artifact.entries.length} deterministic entries, ${contentHash}`)
