import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { expandWorkspaceGlobs } from '../src/lib/glob-expand.js'
import {
  extractSearchBody,
  firstHeading,
  firstParagraph,
  frontmatterString,
  frontmatterStringList,
  parseFrontmatter,
  slugFromPath,
} from '../src/lib/markdown.js'

describe('markdown helpers', () => {
  it('parses BOM/frontmatter scalars, arrays, booleans, headings, and search bodies', () => {
    const markdown = [
      '\uFEFF---',
      'title: "Auth"',
      'draft: false',
      'checks: [pnpm test, "pnpm lint"]',
      'empty: []',
      '---',
      '# Auth',
      '',
      '| table | skip |',
      '',
      'First useful paragraph has a sentence. Second sentence stays.',
      '',
      '```ts',
      'const secret = true',
      '```',
      '',
      'See [guide](/docs/auth) and ![image](/x.png).',
    ].join('\n')

    const parsed = parseFrontmatter(markdown)
    expect(frontmatterString(parsed.data, 'title')).toBe('Auth')
    expect(frontmatterString(parsed.data, 'draft')).toBeUndefined()
    expect(frontmatterStringList(parsed.data, 'checks')).toEqual(['pnpm test', 'pnpm lint'])
    expect(frontmatterStringList(parsed.data, 'missing')).toBeUndefined()
    expect(firstHeading(markdown)).toBe('Auth')
    expect(firstParagraph(markdown)).toBe('First useful paragraph has a sentence. Second sentence stays.')
    expect(extractSearchBody(markdown)).not.toContain('const secret')
    expect(extractSearchBody(markdown)).toContain('See and')
    expect(slugFromPath('docs/for-agents/packages/auth.mdx')).toBe('auth')
  })

  it('handles malformed frontmatter and truncates paragraphs on sentence or word boundaries', () => {
    expect(parseFrontmatter('---\ntitle: no close\n# Body').data).toEqual({})
    expect(firstHeading('No heading')).toBeUndefined()
    expect(firstParagraph('# Title\n\n- [x] todo')).toBeUndefined()
    expect(firstParagraph('Short sentence. Another sentence that is long.', 18)).toBe('Short sentence.')
    expect(firstParagraph('averyverylongword without sentence', 8)).toBe('averyver')
  })
})

describe('workspace glob expansion', () => {
  it('expands literal and wildcard workspace paths and skips missing/stat failures', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-glob-'))
    mkdirSync(join(root, 'packages/a'), { recursive: true })
    mkdirSync(join(root, 'packages/b'), { recursive: true })
    writeFileSync(join(root, 'packages/file.txt'), 'not a dir')
    mkdirSync(join(root, 'apps/web'), { recursive: true })

    expect(expandWorkspaceGlobs(root, ['packages/*', 'apps/web', 'missing/*'])).toEqual([
      join(root, 'apps/web'),
      join(root, 'packages/a'),
      join(root, 'packages/b'),
    ])
  })
})
