import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { createDocBridgeRetriever, retrieveDocBridgeChunks } from '../src/retriever/doc-bridge-retriever.js'
import { loadFederatedChunks, parseLlmsTxtLinks, retrieveHybridChunks } from '../src/federation/llms.js'

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample-project')

const loadFixtureConfig = () =>
  applyConfigDefaults(
    DocBridgeConfigV1Schema.parse(
      JSON.parse(readFileSync(join(fixtureRoot, 'doc-bridge.config.json'), 'utf8')) as unknown,
    ),
  )

describe('doc-bridge retriever', () => {
  it('returns stable local chunks from deterministic index search', () => {
    const config = loadFixtureConfig()
    const { index } = buildDocBridgeIndex({ root: fixtureRoot, config, write: false })

    const chunks = retrieveDocBridgeChunks(index, 'os-core ownership', { property: 'sample' })
    expect(chunks[0]).toMatchObject({
      chunkKey: 'sample:ownership:os-core',
      property: 'sample',
      type: 'ownership',
      id: 'os-core',
      path: 'docs/for-agents/packages/os-core.md',
    })
  })

  it('creates an injectable retriever object for future RAG runtimes', () => {
    const config = loadFixtureConfig()
    const { index } = buildDocBridgeIndex({ root: fixtureRoot, config, write: false })
    const retriever = createDocBridgeRetriever(index, { property: 'sample' })

    expect(retriever.retrieve('schema', { limit: 1 })).toHaveLength(1)
  })

  it('retrieves federated chunks from llms.txt links', async () => {
    const config = {
      ...loadFixtureConfig(),
      federation: {
        enabled: true,
        sources: [{ id: 'playbook', llmsTxt: 'https://example.com/llms.txt' }],
      },
    }
    const { index } = buildDocBridgeIndex({ root: fixtureRoot, config, write: false })
    const chunks = await retrieveHybridChunks(fixtureRoot, config, index, 'self describe pattern', {
      fetchText: async (url) =>
        url.endsWith('llms.txt')
          ? '- [Full bundle](https://example.com/llms-full.txt)\n'
          : '# Playbook\n\n## Self Describe Pattern\n\nExpose llms.txt and capabilities.',
    })

    expect(chunks.some((chunk) => chunk.chunkKey === 'playbook:federated:self-describe-pattern')).toBe(true)
    expect(chunks.map((chunk) => chunk.chunkKey)).toEqual([...new Set(chunks.map((chunk) => chunk.chunkKey))])
  })

  it('does not crawl other origins unless they are configured as sources', async () => {
    const config = {
      ...loadFixtureConfig(),
      federation: {
        enabled: true,
        sources: [{ id: 'playbook', llmsTxt: 'https://example.com/llms.txt' }],
      },
    }
    const { index } = buildDocBridgeIndex({ root: fixtureRoot, config, write: false })
    const fetched: string[] = []
    await retrieveHybridChunks(fixtureRoot, config, index, 'private system', {
      fetchText: async (url) => {
        fetched.push(url)
        return url.endsWith('llms.txt')
          ? 'Raw: https://other.example/private.md\nRaw: https://example.com/public.md\n'
          : '# Public\n\npublic system docs'
      },
    })

    expect(fetched).toEqual(['https://example.com/llms.txt', 'https://example.com/public.md'])
  })

  it('parses markdown links from llms.txt', () => {
    expect(parseLlmsTxtLinks('- [Registry](https://registry.example/llms.txt): agents\nRaw: https://example.com/raw/doc.md\n')).toEqual([
      { title: 'Registry', url: 'https://registry.example/llms.txt', description: 'agents' },
      { title: 'doc', url: 'https://example.com/raw/doc.md' },
    ])
  })

  it('skips disabled and missing federated sources without throwing', async () => {
    const config = {
      ...loadFixtureConfig(),
      federation: {
        enabled: true,
        sources: [
          { id: 'disabled', llmsTxt: 'missing.txt', includeInRetriever: false },
          { id: 'missing', llmsTxt: 'missing.txt' },
        ],
      },
    }

    await expect(loadFederatedChunks(fixtureRoot, config)).resolves.toEqual([])
  })
})
