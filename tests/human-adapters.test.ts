import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scanHumanDocRecords } from '../src/index-builder/human-adapters/index.js'
import type { DocBridgeConfigV1 } from '../src/config/schema.js'

describe('human doc adapters', () => {
  it('does not treat an overlapping agent corpus as human documentation', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-overlapping-human-'))
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'docs/INDEX.md'), '# Agent docs')
    const config: DocBridgeConfigV1 = {
      schemaVersion: 1,
      corpus: {
        agent: { root: 'docs' },
        human: { plugin: 'plain-markdown', options: { root: '.' } },
      },
    }

    expect(scanHumanDocRecords(root, config)).toEqual([])
  })

  it('does not treat a symlink alias of the agent corpus as human documentation', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-symlink-human-'))
    mkdirSync(join(root, 'agent-docs'), { recursive: true })
    writeFileSync(join(root, 'agent-docs/INDEX.md'), '# Agent docs')
    symlinkSync(join(root, 'agent-docs'), join(root, 'human-docs'), 'dir')
    const config: DocBridgeConfigV1 = {
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: { plugin: 'plain-markdown', options: { root: 'human-docs' } },
      },
    }

    expect(scanHumanDocRecords(root, config)).toEqual([])
  })

  it('honors Docusaurus slug and id frontmatter', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-docusaurus-'))
    mkdirSync(join(root, 'website/docs/guide'), { recursive: true })
    writeFileSync(
      join(root, 'website/docs/guide/hello.md'),
      ['---', 'id: part1', 'slug: /bonjour', '---', '', '# Hello'].join('\n'),
    )

    const config: DocBridgeConfigV1 = {
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: {
          plugin: 'docusaurus',
          options: { docsDir: 'website/docs', urlPrefix: '/docs' },
        },
      },
    }

    expect(scanHumanDocRecords(root, config)).toMatchObject([
      {
        id: 'guide/part1',
        url: '/docs/bonjour',
      },
    ])
  })

  it('uses Docusaurus package frontmatter as the join id without breaking sidebar ids', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-docusaurus-'))
    mkdirSync(join(root, 'website/docs/guide'), { recursive: true })
    writeFileSync(
      join(root, 'website/docs/guide/hello.md'),
      ['---', 'id: part1', 'package: auth', 'slug: /bonjour', '---', '', '# Hello'].join('\n'),
    )
    writeFileSync(
      join(root, 'website/sidebars.js'),
      'export default { tutorialSidebar: [{ type: "doc", id: "guide/part1" }] }',
    )

    const config: DocBridgeConfigV1 = {
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: {
          plugin: 'docusaurus',
          options: {
            docsDir: 'website/docs',
            sidebarsFile: 'website/sidebars.js',
            urlPrefix: '/docs',
          },
        },
      },
    }

    expect(scanHumanDocRecords(root, config)).toMatchObject([
      {
        id: 'auth',
        url: '/docs/bonjour',
      },
    ])
  })

  it('filters Docusaurus docs through static sidebars', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-docusaurus-'))
    mkdirSync(join(root, 'website/docs/guide'), { recursive: true })
    writeFileSync(join(root, 'website/docs/guide/hello.md'), '# Hello')
    writeFileSync(join(root, 'website/docs/guide/hidden.md'), '# Hidden')
    writeFileSync(
      join(root, 'website/sidebars.js'),
      'module.exports = { tutorialSidebar: [{ type: "doc", id: "guide/hello" }] }',
    )

    const config: DocBridgeConfigV1 = {
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: {
          plugin: 'docusaurus',
          options: {
            docsDir: 'website/docs',
            sidebarsFile: 'website/sidebars.js',
            urlPrefix: '/docs',
          },
        },
      },
    }

    const docs = scanHumanDocRecords(root, config)
    expect(docs.map((doc) => doc.id)).toEqual(['guide/hello'])
  })

  it('loads static Docusaurus TypeScript sidebars', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-docusaurus-'))
    mkdirSync(join(root, 'website/docs/guide'), { recursive: true })
    writeFileSync(join(root, 'website/docs/guide/hello.md'), '# Hello')
    writeFileSync(join(root, 'website/docs/guide/hidden.md'), '# Hidden')
    writeFileSync(
      join(root, 'website/sidebars.ts'),
      [
        "import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'",
        '',
        'const sidebars: SidebarsConfig = {',
        "  tutorialSidebar: [{ type: 'doc', id: 'guide/hello' }],",
        '}',
        '',
        'export default sidebars',
        '',
      ].join('\n'),
    )

    const config: DocBridgeConfigV1 = {
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: {
          plugin: 'docusaurus',
          options: {
            docsDir: 'website/docs',
            sidebarsFile: 'website/sidebars.ts',
            urlPrefix: '/docs',
          },
        },
      },
    }

    expect(scanHumanDocRecords(root, config).map((doc) => doc.id)).toEqual(['guide/hello'])
  })

  it('skips Fumadocs dot files used as private MDX partials', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-fumadocs-'))
    mkdirSync(join(root, 'content/docs/headless/search'), { recursive: true })
    writeFileSync(join(root, 'content/docs/headless/search/index.mdx'), '# Search')
    writeFileSync(join(root, 'content/docs/headless/search/.shared.mdx'), '# Shared partial')
    writeFileSync(
      join(root, 'content/docs/headless/search/meta.json'),
      JSON.stringify({ pages: ['index', '...'] }),
    )

    const config: DocBridgeConfigV1 = {
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: {
          plugin: 'fumadocs',
          options: { contentDir: 'content/docs', urlPrefix: '/docs' },
        },
      },
    }

    expect(scanHumanDocRecords(root, config).map((doc) => doc.id)).toEqual(['index'])
  })
})
