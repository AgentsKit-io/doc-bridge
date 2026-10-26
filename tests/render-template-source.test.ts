import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import { TemplateError } from '../src/render/engine.js'
import { renderNamedTemplate, resolveTemplateSource } from '../src/render/template-source.js'
import { BUNDLED_TEMPLATES, type RenderTemplateName } from '../src/render/templates.js'

const temporary: string[] = []

afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const project = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-template-source-'))
  temporary.push(root)
  return root
}

const write = (root: string, path: string, content: string): string => {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
  return target
}

const configWith = (templates?: Partial<Record<RenderTemplateName, string>>): DocBridgeConfigV1 =>
  DocBridgeConfigV1Schema.parse({
    schemaVersion: 1,
    corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
    ...(templates ? { render: { templates } } : {}),
  })

describe('resolveTemplateSource', () => {
  it('falls back to the bundled template when the config has no render section', () => {
    expect(resolveTemplateSource('area', configWith())).toEqual({ name: 'area', source: BUNDLED_TEMPLATES.area, origin: 'bundled' })
  })

  it('falls back to the bundled template when only another template is overridden', () => {
    const root = project()
    write(root, 'tpl/ownership.liquid', 'custom')
    const resolved = resolveTemplateSource('area', configWith({ ownership: 'tpl/ownership.liquid' }), root)
    expect(resolved.origin).toBe('bundled')
    expect(resolved.source).toBe(BUNDLED_TEMPLATES.area)
  })

  it('reads an override relative to the project root and reports the configured path', () => {
    const root = project()
    write(root, 'tpl/area.liquid', 'custom {{ name }}')
    expect(resolveTemplateSource('area', configWith({ area: 'tpl/area.liquid' }), root)).toEqual({
      name: 'area',
      source: 'custom {{ name }}',
      origin: 'tpl/area.liquid',
    })
  })

  it('reads an absolute override path regardless of root', () => {
    const root = project()
    const absolute = write(root, 'abs.liquid', 'absolute')
    const resolved = resolveTemplateSource('ownership', configWith({ ownership: absolute }), project())
    expect(resolved.source).toBe('absolute')
  })

  it('treats an empty override file as an override, not as a missing one', () => {
    const root = project()
    write(root, 'empty.liquid', '')
    const resolved = resolveTemplateSource('area', configWith({ area: 'empty.liquid' }), root)
    expect(resolved).toEqual({ name: 'area', source: '', origin: 'empty.liquid' })
  })

  it('throws naming the template and the configured path when the file is missing', () => {
    const root = project()
    expect(() => resolveTemplateSource('area', configWith({ area: 'nope/area.liquid' }), root)).toThrow(
      /render\.templates\["area"\] points at nope\/area\.liquid, which could not be read: .*ENOENT/,
    )
  })

  it('throws the same error when the override path is a directory', () => {
    const root = project()
    mkdirSync(join(root, 'dir'))
    expect(() => resolveTemplateSource('area', configWith({ area: 'dir' }), root)).toThrow(/points at dir, which could not be read/)
  })
})

describe('renderNamedTemplate', () => {
  it('renders an override with the supplied variables', () => {
    const root = project()
    write(root, 'greeting.liquid', 'Hello {{ who }}!')
    expect(renderNamedTemplate('area', { who: 'world' }, configWith({ area: 'greeting.liquid' }), root)).toBe('Hello world!')
  })

  it('renders the same override repeatedly with different variables', () => {
    const root = project()
    write(root, 'greeting.liquid', 'Hello {{ who }}!')
    const config = configWith({ area: 'greeting.liquid' })
    expect(renderNamedTemplate('area', { who: 'a' }, config, root)).toBe('Hello a!')
    expect(renderNamedTemplate('area', { who: 'b' }, config, root)).toBe('Hello b!')
  })

  it('picks up a changed override file instead of serving a stale compile', () => {
    const root = project()
    write(root, 'greeting.liquid', 'one')
    const config = configWith({ area: 'greeting.liquid' })
    expect(renderNamedTemplate('area', {}, config, root)).toBe('one')
    write(root, 'greeting.liquid', 'two')
    expect(renderNamedTemplate('area', {}, config, root)).toBe('two')
  })

  it('renders an empty override as an empty string rather than the bundled template', () => {
    const root = project()
    write(root, 'empty.liquid', '')
    expect(renderNamedTemplate('area', {}, configWith({ area: 'empty.liquid' }), root)).toBe('')
  })

  it('renders a bundled template with no override', () => {
    const output = renderNamedTemplate('llms.txt', {}, configWith())
    expect(typeof output).toBe('string')
  })

  it('throws a TemplateError naming the override path when it does not parse', () => {
    const root = project()
    write(root, 'broken.liquid', '{% if x %}never closed')
    const render = () => renderNamedTemplate('area', {}, configWith({ area: 'broken.liquid' }), root)
    expect(render).toThrow(TemplateError)
    expect(render).toThrow(/broken\.liquid/)
  })

  it('propagates the unreadable-override error', () => {
    const root = project()
    expect(() => renderNamedTemplate('area', {}, configWith({ area: 'missing.liquid' }), root)).toThrow(/could not be read/)
  })
})
