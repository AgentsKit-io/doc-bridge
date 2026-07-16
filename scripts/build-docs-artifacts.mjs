import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeLocalKnowledgeArtifactContentHash, LocalKnowledgeArtifactSchema } from '@agentskit/chat/protocol'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const docsRoot = join(root, 'docs')
const publicRoot = join(root, 'apps/docs/public')
const ecosystemManifestPath = join(root, 'ecosystem.json')
const ecosystemOverridesPath = join(root, 'apps/docs/ecosystem-presentation-overrides.json')
const publicDocsPath = join(root, 'apps/docs/public-docs.json')
const publicAgentDocsPath = join(root, 'apps/docs/public-agent-docs.json')
const origin = 'https://doc-bridge.agentskit.io'
const basePath = process.env.DOCS_BASE_PATH ?? ''
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
function canonicalDocUrl(slug) { return slug === 'index' ? `${origin}/docs/` : `${origin}/docs/${slug}/` }
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
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/u)?.[1]
  const declared = frontmatter?.match(/^description:\s*(.+)$/mu)?.[1]?.trim()
  if (declared) return declared.replace(/^['"]|['"]$/g, '').slice(0, 240)
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
  return body.split(/\n\s*\n/).map((block) => block.replace(/^#+\s+.*$/gm, '').trim())
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
const manifest = JSON.parse(await readFile(ecosystemManifestPath, 'utf8'))
const ecosystemOverrides = JSON.parse(await readFile(ecosystemOverridesPath, 'utf8'))
const ecosystem = manifest.products
  .map((product) => ({ ...product, ...ecosystemOverrides[product.id] }))
const publicFiles = JSON.parse(await readFile(publicDocsPath, 'utf8'))
const publicFileSet = new Set(publicFiles)
const publicDocuments = documents.filter((doc) => publicFileSet.has(doc.file))
const publicAgentFiles = JSON.parse(await readFile(publicAgentDocsPath, 'utf8'))
const publicAgentFileSet = new Set(publicAgentFiles)
const publicAgentDocuments = documents.filter((doc) => publicAgentFileSet.has(doc.file))
const rawDocuments = [...publicDocuments, ...publicAgentDocuments].sort((left, right) => left.file.localeCompare(right.file))

for (const doc of rawDocuments) {
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
  `- [For agents](${origin}/for-agents/): Resolve ownership, edit boundaries, and repository checks.`,
  `- [GitHub Marketplace](${origin}/docs/MARKETPLACE/): Enforce committed documentation freshness on pull requests.`,
  `- [Positioning](${origin}/docs/POSITIONING/): Product purpose, maturity, and ecosystem role.`,
  `- [MCP](${origin}/docs/mcp/): Expose repository knowledge to compatible agents.`,
  `- [CLI reference](${origin}/docs/spec/cli/): Complete deterministic command surface.`,
  '',
  '## Canonical documentation',
  '',
  ...publicDocuments.map((doc) => `- [${doc.title}](${origin}/raw/${doc.file}): ${doc.description}`),
  '',
  '## AgentsKit ecosystem',
  '',
  ...ecosystem.map((product) => `- [${product.name}](${product.home}): ${product.role}`),
  '',
  '## Machine surfaces',
  '',
  `- [Full corpus](${origin}/llms-full.txt)`,
  `- [Deterministic knowledge artifact](${origin}/deterministic/knowledge.json)`,
  `- [Doc Bridge index schema](${origin}/raw/schemas/doc-bridge-index-v1.md)`,
  '',
].join('\n')

const llmsFull = [llms, ...rawDocuments.flatMap((doc) => [`\n---\n\n# Source: ${doc.file}\n`, doc.markdown])].join('\n')
await writeFile(join(publicRoot, 'llms.txt'), llms)
await writeFile(join(publicRoot, 'llms-full.txt'), llmsFull)

const docEntries = publicDocuments.map((doc) => ({
  id: entryId(doc.slug),
  kind: 'document',
  label: doc.title,
  match: { type: 'exact', values: aliases([doc.slug, doc.file, doc.title, `doc bridge ${doc.title}`]).slice(0, 16) },
  answer: {
    markdown: `## ${doc.title}\n\n${doc.description}\n\n[Open the canonical guide](${canonicalDocUrl(doc.slug)}) · [Read raw Markdown](${origin}/raw/${doc.file})`,
    citations: [{ id: entryId(doc.slug), title: doc.title, href: canonicalDocUrl(doc.slug) }],
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

const ecosystemEntries = ecosystem.filter((product) => product.id !== 'doc-bridge').map((product) => ({
  id: `ecosystem:${product.id}`,
  kind: 'document',
  label: product.name,
  match: { type: 'exact', values: aliases([product.id, product.name, product.role, product.hook]) },
  answer: {
    markdown: `## ${product.name}\n\n${product.hook}\n\n[Continue to ${product.name}](${product.home})`,
    citations: [{ id: `ecosystem:${product.id}`, title: product.name, href: product.home }],
  },
}))

const handoffIndex = JSON.parse(await readFile(join(root, '.doc-bridge/index.json'), 'utf8'))
const handoffEntries = Object.entries(handoffIndex.handoffs ?? {}).map(([id, handoff]) => {
  const startHere = handoff.startHere ?? 'docs/POSITIONING.md'
  const rawPath = startHere.replace(/^docs\//u, '')
  const rawUrl = `${origin}/raw/${rawPath}`
  const humanUrl = /^https?:\/\//u.test(handoff.humanDoc ?? '')
    ? handoff.humanDoc
    : `${origin}${handoff.humanDoc ?? '/docs/getting-started'}/`
  const purpose = handoff.notes?.[0] ?? `${id} ownership and checks`
  return {
    id: `package:${id}`,
    kind: 'package',
    label: id === 'doc-bridge' ? 'Doc Bridge ownership handoff' : `${id} ownership handoff`,
    match: {
      type: 'exact',
      values: aliases([
        id,
        ...(id === 'doc-bridge' ? ['@agentskit/doc-bridge', 'who owns doc bridge', 'doc bridge handoff'] : []),
        `who owns ${id}`,
        `${id} handoff`,
        purpose,
      ]),
    },
    answer: {
      markdown: `## ${id} handoff\n\n${purpose}.\n\nStart at [**${startHere}**](${rawUrl}). Edit roots: **${(handoff.editRoots ?? [handoff.target?.path ?? 'src']).join(', ')}**. Checks: **${(handoff.checks ?? ['pnpm test', 'pnpm typecheck']).join('**, **')}**.\n\nThis answer was generated from the repository's own Doc Bridge index.`,
      citations: [
        { id: `human:${id}`, title: `${id} human guide`, href: humanUrl },
        { id: entryId(rawPath), title: startHere, href: rawUrl },
      ],
    },
  }
})

const withoutHash = {
  protocol: 'agentskit.chat.knowledge', version: 1, artifactId: 'agentskit-doc-bridge', siteId: 'doc-bridge',
  generatedAt, entries: [...commandEntries, ...ecosystemEntries, ...handoffEntries, ...docEntries],
}
const validation = LocalKnowledgeArtifactSchema.safeParse({ ...withoutHash, contentHash: `sha256:${'0'.repeat(64)}` })
if (!validation.success) throw new TypeError(`Invalid deterministic artifact:\n${validation.error.message}`)
const contentHash = await computeLocalKnowledgeArtifactContentHash(withoutHash)
const artifact = LocalKnowledgeArtifactSchema.parse({ ...withoutHash, contentHash })
await writeFile(join(publicRoot, 'deterministic/knowledge.json'), `${JSON.stringify(artifact, null, 2)}\n`)
await writeFile(join(publicRoot, 'deterministic/site-config.json'), `${JSON.stringify({
  protocol: 'agentskit.chat.site', version: 1, siteId: 'doc-bridge',
  artifact: { href: `${basePath}/deterministic/knowledge.json`, contentHash }, fallback: { mode: 'backend' },
}, null, 2)}\n`)

console.log(`docs artifacts: ${documents.length} sources, ${artifact.entries.length} deterministic entries, ${contentHash}`)

await writeFile(join(publicRoot, 'CNAME'), 'doc-bridge.agentskit.io\n')
