import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const publicRoot = resolve(root, 'apps/docs/public')
const llms = readFileSync(resolve(publicRoot, 'llms.txt'), 'utf8')
const full = readFileSync(resolve(publicRoot, 'llms-full.txt'), 'utf8')
const manifest = JSON.parse(readFileSync(resolve(root, 'ecosystem.json'), 'utf8'))
const overrides = JSON.parse(readFileSync(resolve(root, 'apps/docs/ecosystem-presentation-overrides.json'), 'utf8'))
const publicDocs = JSON.parse(readFileSync(resolve(root, 'apps/docs/public-docs.json'), 'utf8'))
const publicAgentDocs = JSON.parse(readFileSync(resolve(root, 'apps/docs/public-agent-docs.json'), 'utf8'))
const ecosystem = manifest.products.map((product) => ({ ...product, ...overrides[product.id] }))
const knowledge = JSON.parse(readFileSync(resolve(publicRoot, 'deterministic/knowledge.json'), 'utf8'))

test('concise and full LLM surfaces have distinct progressive-disclosure roles', () => {
  assert.ok(llms.length < 8_000, `llms.txt should stay concise, received ${llms.length} bytes`)
  assert.ok(full.length > llms.length)
  const allDocs = readFileSync(resolve(root, 'apps/docs/public/llms-full.txt'), 'utf8').matchAll(/^# Source: (.+)$/gmu)
  const allFiles = [...allDocs].map((match) => match[1])
  assert.deepEqual(allFiles, [...publicDocs, ...publicAgentDocs].sort((left, right) => left.localeCompare(right)))
  assert.ok(!full.includes('# Source: DOGFOOD-ROUND2.md'))
  for (const file of allFiles) {
    const raw = readFileSync(resolve(publicRoot, 'raw', file), 'utf8')
    assert.equal(full.split(`# Source: ${file}\n`).length, 2)
    assert.ok(full.includes(`# Source: ${file}\n\n${raw}`), `${file} must be preserved byte-for-byte`)
  }
})

test('all seven products are discoverable and the six peers resolve locally', () => {
  assert.equal(ecosystem.length, 7)
  assert.deepEqual(new Set(ecosystem.map(({ id }) => id)).size, 7)
  assert.deepEqual(new Set(Object.keys(overrides)), new Set(manifest.products.map(({ id }) => id)))
  for (const product of ecosystem) {
    assert.ok(llms.includes(`[${product.name}](${product.home})`))
  }
  const peerEntries = knowledge.entries.filter(({ id }) => id.startsWith('ecosystem:'))
  assert.equal(peerEntries.length, 6)
  assert.ok(peerEntries.every(({ answer }) => answer.citations[0]?.href.startsWith('https://')))
})

test('every public document and local deterministic citation resolves in the export', () => {
  for (const file of [...publicDocs, ...publicAgentDocs]) {
    assert.ok(existsSync(resolve(publicRoot, 'raw', file)), `missing raw export for ${file}`)
  }
  for (const file of publicDocs) {
    const slug = file.replace(/\.md$/u, '')
    const route = slug === 'index'
      ? resolve(root, 'apps/docs/out/docs/index.html')
      : resolve(root, 'apps/docs/out/docs', slug, 'index.html')
    assert.ok(existsSync(route), `missing public route for ${file}`)
  }
  assert.ok(!existsSync(resolve(publicRoot, 'raw', 'DOGFOOD-ROUND2.md')))
  const origin = 'https://doc-bridge.agentskit.io'
  for (const entry of knowledge.entries) {
    for (const citation of entry.answer.citations) {
      if (!citation.href.startsWith(origin)) continue
      const relative = citation.href.slice(origin.length).replace(/^\//u, '')
      const target = relative === 'docs/'
        ? resolve(root, 'apps/docs/out/docs/index.html')
        : relative.startsWith('docs/')
          ? resolve(root, 'apps/docs/out', relative, 'index.html')
        : resolve(publicRoot, relative)
      assert.ok(existsSync(target), `${entry.id} citation does not resolve: ${citation.href}`)
    }
  }
})

test('machine entry points cross-reference the agent-first route', () => {
  assert.ok(llms.includes('https://doc-bridge.agentskit.io/for-agents/'))
  assert.ok(llms.includes('https://doc-bridge.agentskit.io/llms-full.txt'))
  assert.ok(llms.includes('https://doc-bridge.agentskit.io/deterministic/knowledge.json'))
})
