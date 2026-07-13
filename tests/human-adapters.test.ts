import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

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

  it('does not scan a human corpus outside the project root', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-contained-human-'))
    const outside = mkdtempSync(join(tmpdir(), 'ak-docs-outside-human-'))
    writeFileSync(join(outside, 'secret.md'), '# Outside documentation')
    const config: DocBridgeConfigV1 = {
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: { plugin: 'plain-markdown', options: { root: relative(root, outside) } },
      },
    }

    expect(scanHumanDocRecords(root, config)).toEqual([])
  })

  it('does not follow nested directory symlinks outside the project root', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-nested-symlink-human-'))
    const outside = mkdtempSync(join(tmpdir(), 'ak-docs-nested-outside-human-'))
    mkdirSync(join(root, 'human-docs'), { recursive: true })
    writeFileSync(join(root, 'human-docs/inside.md'), '# Inside')
    writeFileSync(join(outside, 'outside.md'), '# Outside')
    symlinkSync(outside, join(root, 'human-docs/external'), 'dir')
    const config: DocBridgeConfigV1 = {
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: { plugin: 'plain-markdown', options: { root: 'human-docs' } },
      },
    }

    expect(scanHumanDocRecords(root, config).map((doc) => doc.id)).toEqual(['inside'])
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

  it('extracts Docusaurus sidebars without executing JavaScript', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-docusaurus-static-'))
    mkdirSync(join(root, 'website/docs/guide'), { recursive: true })
    writeFileSync(join(root, 'website/docs/guide/hello.md'), '# Hello')
    writeFileSync(
      join(root, 'website/sidebars.js'),
      [
        'this.constructor.constructor("return process")().env.AK_DOCS_SIDEBAR_EXECUTED = "yes"',
        'module.exports = { tutorialSidebar: [{ type: "doc", id: "guide/hello" }] }',
      ].join('\n'),
    )
    delete process.env.AK_DOCS_SIDEBAR_EXECUTED
    const config: DocBridgeConfigV1 = {
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: { plugin: 'docusaurus', options: {
          docsDir: 'website/docs', sidebarsFile: 'website/sidebars.js',
        } },
      },
    }

    expect(scanHumanDocRecords(root, config).map((doc) => doc.id)).toEqual(['guide/hello'])
    expect(process.env.AK_DOCS_SIDEBAR_EXECUTED).toBeUndefined()
  })

  it('ignores commented sidebar entries and rejects dynamic composition', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-docusaurus-comments-'))
    mkdirSync(join(root, 'website/docs/guide'), { recursive: true })
    writeFileSync(join(root, 'website/docs/guide/hello.md'), '# Hello')
    writeFileSync(join(root, 'website/docs/guide/private.md'), '# Private')
    const sidebar = join(root, 'website/sidebars.js')
    writeFileSync(sidebar, [
      '// id: "guide/private"',
      'module.exports = { tutorialSidebar: [{ type: "doc", id: "guide/hello" }] }',
    ].join('\n'))
    const config: DocBridgeConfigV1 = {
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: { plugin: 'docusaurus', options: {
          docsDir: 'website/docs', sidebarsFile: 'website/sidebars.js',
        } },
      },
    }
    expect(scanHumanDocRecords(root, config).map((doc) => doc.id)).toEqual(['guide/hello'])

    writeFileSync(sidebar, [
      'const helper = { items: ["guide/private"] }',
      'const sidebars = { tutorialSidebar: [{ type: "doc", id: "guide/hello" }] }',
      'export default sidebars',
    ].join('\n'))
    expect(scanHumanDocRecords(root, config).map((doc) => doc.id)).toEqual(['guide/hello'])

    writeFileSync(sidebar, [
      'const fake = `module.exports = { items: ["guide/private"] }`',
      'const marker = /export default \\{ items: \\["guide\\/private"\\] \\}/',
      'function ignored() { return /module.exports = \\{ items: \\["guide\\/private"\\] \\}/ }',
      'function alsoIgnored() { throw /export default \\{ items: \\["guide\\/private"\\] \\}/ }',
      'const sidebars = { tutorialSidebar: [{ type: "doc", id: "guide/hello" }] }',
      'module.exports = sidebars',
    ].join('\n'))
    expect(scanHumanDocRecords(root, config).map((doc) => doc.id)).toEqual(['guide/hello'])

    writeFileSync(sidebar, 'module.exports = buildSidebar()')
    expect(() => scanHumanDocRecords(root, config)).toThrow('static object')
  })

  it('rejects a human documentation file above the per-file budget', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-large-human-'))
    mkdirSync(join(root, 'human-docs'), { recursive: true })
    writeFileSync(join(root, 'human-docs/huge.md'), Buffer.alloc(4 * 1_024 * 1_024 + 1, 65))
    const config: DocBridgeConfigV1 = {
      schemaVersion: 1,
      corpus: {
        agent: { root: 'agent-docs' },
        human: { plugin: 'plain-markdown', options: { root: 'human-docs' } },
      },
    }

    expect(() => scanHumanDocRecords(root, config)).toThrow('exceeds')
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
