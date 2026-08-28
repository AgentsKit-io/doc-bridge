import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { applyDocumentationDeclarations, parseDocumentationDeclarations } from '../src/discovery/documentation.js'
import { discoverRepository } from '../src/discovery/repository.js'

const project = (): ReturnType<typeof discoverRepository> => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-documentation-'))
  mkdirSync(join(root, 'docs'), { recursive: true })
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }))
  writeFileSync(join(root, 'src', 'index.ts'), 'export const value = 1\n')
  writeFileSync(join(root, 'docs', 'guide.md'), '# Guide\n')
  return discoverRepository({ root })
}

describe('documentation declarations', () => {
  it('resolves covers, aliases and relations into the canonical model', () => {
    const snapshot = project()
    const entities = snapshot.entities.map((entity) =>
      entity.id === 'module:src/index.ts' ? { ...entity, aliases: ['entrypoint'] } : entity,
    )
    const content = [
      '---',
      'title: Preserve this field',
      'docbridge:',
      '  covers:',
      '    - package:fixture',
      '    - entrypoint',
      '  relations:',
      '    - from: package:fixture',
      '      to: entrypoint',
      '      kind: exposes',
      '      detection: static',
      '---',
      '',
      '# Guide',
      '',
      'The body is not owned by the declaration parser.',
    ].join('\n')

    const result = parseDocumentationDeclarations(
      { path: 'docs/guide.md', content },
      { snapshot: { entities } },
    )

    expect(result.diagnostics).toEqual([])
    expect(result.entities).toEqual([])
    expect(result.relations).toHaveLength(3)
    expect(result.relations).toContainEqual(expect.objectContaining({ kind: 'covers', from: 'document:docs/guide.md', to: 'package:fixture', provenance: 'declared' }))
    expect(result.relations).toContainEqual(expect.objectContaining({ kind: 'exposes', from: 'package:fixture', to: 'module:src/index.ts', metadata: { detection: 'static' } }))

    const applied = applyDocumentationDeclarations(snapshot, [{ path: 'docs/guide.md', content }])
    expect(applied.diagnostics).toEqual([])
    expect(applied.snapshot.contentHash).not.toBe(snapshot.contentHash)
    expect(applied.snapshot.relations.filter((relation) => relation.provenance === 'declared')).toHaveLength(3)
  })

  it('keeps documents without declarations and unknown references available for reconciliation', () => {
    const snapshot = project()
    const packageFrontmatter = parseDocumentationDeclarations(
      { path: 'docs/package.md', content: ['---', 'type: package', 'package: fixture', 'humanDoc: /docs/guide', '---', '# Package'].join('\n') },
      { snapshot },
    )
    expect(packageFrontmatter.hasDocbridge).toBe(true)
    expect(packageFrontmatter.diagnostics).toEqual([])
    expect(packageFrontmatter.relations).toContainEqual(expect.objectContaining({ kind: 'covers', to: 'package:fixture' }))

    const conventionalPackageDoc = parseDocumentationDeclarations(
      { path: 'docs/for-agents/packages/fixture.md', content: ['---', 'humanDoc: /docs/guide', '---', '# Package'].join('\n') },
      { snapshot },
    )
    expect(conventionalPackageDoc.relations).toContainEqual(expect.objectContaining({ kind: 'covers', to: 'package:fixture' }))

    const conventionalAgentDoc = parseDocumentationDeclarations(
      { path: 'docs/for-agents/packages/fixture.md', content: '# Package without a human bridge\n' },
      { snapshot },
    )
    expect(conventionalAgentDoc.relations).toContainEqual(expect.objectContaining({ kind: 'covers', to: 'package:fixture' }))

    const plain = '# Plain document\n\nNo structured declaration.\n'
    const empty = parseDocumentationDeclarations(
      { path: 'docs/plain.md', content: plain },
      { snapshot },
    )
    expect(empty).toEqual({ hasDocbridge: false, entities: [], relations: [], diagnostics: [] })
    expect(plain).toBe('# Plain document\n\nNo structured declaration.\n')

    const unknown = parseDocumentationDeclarations(
      { path: 'docs/guide.md', content: ['---', 'docbridge:', '  covers: [missing-system]', '---', '# Guide'].join('\n') },
      { snapshot },
    )
    expect(unknown.entities).toContainEqual(expect.objectContaining({ id: 'unresolved:missing-system', kind: 'unresolved-reference', provenance: 'declared' }))
    expect(unknown.relations).toContainEqual(expect.objectContaining({ to: 'unresolved:missing-system' }))
  })

  it('reports malformed, missing and invalid declarations with stable evidence', () => {
    const snapshot = project()
    const malformed = parseDocumentationDeclarations(
      {
        path: 'docs/bad.md',
        content: [
          '---',
          'docbridge:',
          '  relations:',
          '    - from: package:fixture',
          '      to: module:src/index.ts',
          '      kind: calls',
          '      detection: static',
          '    - from: package:fixture',
          '      to: module:src/index.ts',
          '      kind: calls',
          '      detection: static',
          '    - from: package:fixture',
          '      to: module:src/index.ts',
          '      kind: calls',
          '      detection: dynamic',
          '    - from: package:fixture',
          '      detection: impossible',
          '---',
          '# Bad',
        ].join('\n'),
      },
      { snapshot },
    )

    expect(malformed.diagnostics.map((item) => item.code)).toEqual([
      'DOCBRIDGE_DECLARATION_DUPLICATE',
      'DOCBRIDGE_DECLARATION_CONFLICT',
      'DOCBRIDGE_RELATION_FIELD_MISSING',
    ])
    expect(malformed.diagnostics.every((item) => item.evidence.path === 'docs/bad.md' && item.evidence.lineStart && item.evidence.lineEnd)).toBe(true)

    const invalid = parseDocumentationDeclarations(
      { path: 'docs/invalid.md', content: ['---', 'docbridge:', '  covers:', '    -', '---'].join('\n') },
      { snapshot },
    )
    expect(invalid.diagnostics.map((item) => item.code)).toContain('DOCBRIDGE_REFERENCE_MISSING')
    expect(invalid.diagnostics.map((item) => item.code)).toContain('DOCBRIDGE_CONTENT_MISSING')

    const unclosed = parseDocumentationDeclarations({ path: 'docs/unclosed.md', content: '---\ndocbridge:\n  covers: [x]\n' }, { snapshot })
    expect(unclosed.diagnostics[0]).toMatchObject({ code: 'DOCBRIDGE_FRONTMATTER_MALFORMED', evidence: { path: 'docs/unclosed.md', lineStart: 1 } })
  })
})
