import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { toPosix } from '../lib/paths.js'
import { compileTemplate, renderCompiledTemplate, type CompiledTemplate, type TemplateVariables } from './engine.js'
import { BUNDLED_TEMPLATES, type RenderTemplateName } from './templates.js'

/**
 * Which template renders a name: the project's, when `render.templates` names one, otherwise
 * the bundled one. An override is a file the project owns; it replaces the bundled template
 * entirely and is compiled against the same engine, so a project changes its house style without
 * a code change and a template that does not parse fails before anything is written.
 */
export type TemplateSource = {
  readonly name: RenderTemplateName
  readonly source: string
  /** `bundled`, or the override path as configured. */
  readonly origin: string
}

export const resolveTemplateSource = (name: RenderTemplateName, config: DocBridgeConfigV1, root?: string): TemplateSource => {
  const override = config.render?.templates?.[name]
  if (!override) return { name, source: BUNDLED_TEMPLATES[name], origin: 'bundled' }
  const path = root ? resolve(root, override) : resolve(override)
  let source: string
  try {
    source = readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`render.templates["${name}"] points at ${toPosix(override)}, which could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
  return { name, source, origin: toPosix(override) }
}

/*
 * Compiled once per distinct source. The index builder and the conformance profile render
 * `llms.txt` on every run, and parsing the same bundled template twice per run buys nothing.
 */
const compiled = new Map<string, CompiledTemplate>()

const compile = (template: TemplateSource): CompiledTemplate => {
  const key = JSON.stringify([template.name, template.origin, template.source])
  let result = compiled.get(key)
  if (!result) {
    result = compileTemplate(template.source, template.origin === 'bundled' ? `template "${template.name}"` : template.origin)
    compiled.set(key, result)
  }
  return result
}

export const renderNamedTemplate = (name: RenderTemplateName, variables: TemplateVariables, config: DocBridgeConfigV1, root?: string): string =>
  renderCompiledTemplate(compile(resolveTemplateSource(name, config, root)), variables)
