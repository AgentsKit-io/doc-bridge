import * as ts from 'typescript'
import { dirname, posix, relative } from 'node:path'
import { toPosix } from '../../lib/paths.js'
import type { FactExtractor } from './index.js'
import { canonicalJsonV1, sha256NormalizedV1 } from '../../index-builder/content-hash.js'
import { surfaceFactEntityId, type SurfaceFact } from '../../storage/facts.js'
import type { DiscoverySnapshotV1, Evidence } from '../../schemas/knowledge.js'

export const CONFIG_FACT_ANALYZER_ID = 'js-ts:config-key' as const
export const CONFIG_FACT_ANALYZER_VERSION = '1.2.0'
const MAX_KEYS = 4096
const MAX_DEPTH = 32
const JSON_SCHEMA_KEYS = new Set(['$schema', '$id', '$anchor', '$comment', '$defs', 'definitions', 'title', 'description', 'examples', 'deprecated', 'readOnly', 'writeOnly', 'type', 'properties', 'required', 'items', 'additionalProperties', 'enum', 'const', 'default', 'format', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties'])
const JSON_SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
const configFile = (path: string) => /config[^/]*schema|schema[^/]*config|(?:^|\/)config\/schema\.[cm]?[jt]s$/i.test(path)
type Shape = { type: string; optional: boolean; default?: unknown; enum?: unknown[]; properties?: Map<string, Shape>; items?: Shape; variants?: Shape[]; lines?: { lineStart: number; lineEnd: number } }
type Result = { facts: SurfaceFact[]; coverage: DiscoverySnapshotV1['coverage'] }
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const boundedLiteral = (value: unknown, depth = 0): boolean => depth <= MAX_DEPTH && (
  value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ||
  (Array.isArray(value) ? value.every(item => boundedLiteral(item, depth + 1)) : record(value) && Object.values(value).every(item => boundedLiteral(item, depth + 1)))
)

/** A scan-local syntax tree only: never import or execute a repository schema. */
export const configFactsFromSource = (source: ts.SourceFile, path: string, ownerId: string, defaults: ReadonlyMap<string, ts.SourceFile> = new Map()): Result => {
  if ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) return emit([], ownerId, true, path)
  const bindings = new Map<string, ts.Expression>()
  const declarations = new Map<string, ts.VariableDeclaration>()
  const candidates = new Set<string>()
  const zodNames = new Set<string>()
  let incomplete = false
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === 'zod') {
      if (statement.importClause?.name) zodNames.add(statement.importClause.name.text)
      const imported = statement.importClause?.namedBindings
      if (imported && ts.isNamedImports(imported)) for (const item of imported.elements) if ((item.propertyName ?? item.name).text === 'z') zodNames.add(item.name.text)
      if (imported && ts.isNamespaceImport(imported)) zodNames.add(imported.name.text)
    }
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const name = declaration.name.text
      declarations.set(name, declaration)
      bindings.set(name, declaration.initializer)
      const exported = statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      const declared = ts.getJSDocTags(statement).some(tag => tag.tagName.text === 'docbridgeConfig')
      if (declared || (exported && (/config/i.test(name) || configFile(path)) && (ts.isCallExpression(declaration.initializer) || ts.isIdentifier(declaration.initializer)))) candidates.add(name)
    }
  }
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue
    if (statement.moduleSpecifier) { if (statement.exportClause.elements.some(item => !item.isTypeOnly && /config/i.test(item.name.text) && /schema/i.test(item.name.text))) incomplete = true; continue }
    for (const item of statement.exportClause.elements) if (!item.isTypeOnly && (/config/i.test(item.name.text) || configFile(path))) candidates.add((item.propertyName ?? item.name).text)
  }
  for (const name of candidates) if (!bindings.has(name)) { candidates.delete(name); incomplete = true }
  // Helper schemas belong under the referencing root, rather than also becoming bare keys.
  const referenced = new Set<string>()
  for (const name of candidates) {
    const visit = (node: ts.Node): void => { if (ts.isIdentifier(node) && node.text !== name && bindings.has(node.text)) referenced.add(node.text); ts.forEachChild(node, visit) }
    visit(bindings.get(name)!)
  }
  const unknown = (): undefined => { incomplete = true; return undefined }
  const unwrap = (node: ts.Expression): ts.Expression => ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) ? unwrap(node.expression) : node
  const literal = (input: ts.Expression | undefined, seen = new Set<string>(), depth = 0, values = bindings): { value: unknown } | undefined => {
    if (!input || depth > MAX_DEPTH) return undefined
    const node = unwrap(input)
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { value: node.text }
    if (ts.isNumericLiteral(node)) return Number.isFinite(Number(node.text)) ? { value: Number(node.text) } : undefined
    if (node.kind === ts.SyntaxKind.TrueKeyword) return { value: true }
    if (node.kind === ts.SyntaxKind.FalseKeyword) return { value: false }
    if (node.kind === ts.SyntaxKind.NullKeyword) return { value: null }
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return Number.isFinite(Number(node.operand.text)) ? { value: -Number(node.operand.text) } : undefined
    if (ts.isIdentifier(node) && values.has(node.text) && !seen.has(node.text)) return literal(values.get(node.text), new Set([...seen, node.text]), depth + 1, values)
    if (ts.isArrayLiteralExpression(node)) {
      const elements = node.elements.map(item => literal(item as ts.Expression, seen, depth + 1, values))
      return elements.every(Boolean) ? { value: elements.map(item => item!.value) } : undefined
    }
    if (ts.isObjectLiteralExpression(node)) {
      const entries: [string, unknown][] = []
      for (const item of node.properties) {
        if (!ts.isPropertyAssignment(item) || !(ts.isIdentifier(item.name) || ts.isStringLiteral(item.name))) return undefined
        const value = literal(item.initializer, seen, depth + 1, values)
        if (!value) return undefined
        entries.push([item.name.text, value.value])
      }
      return { value: Object.fromEntries(entries) }
    }
    return undefined
  }
  const parse = (input: ts.Expression, seen = new Set<string>(), depth = 0): Shape | undefined => {
    if (depth > MAX_DEPTH) return unknown()
    const node = unwrap(input)
    if (ts.isIdentifier(node)) {
      if (!bindings.has(node.text) || seen.has(node.text)) return unknown()
      return parse(bindings.get(node.text)!, new Set([...seen, node.text]), depth + 1)
    }
    if (!ts.isCallExpression(node)) return unknown()
    if (ts.isIdentifier(node.expression) && node.expression.text === 'defineConfig' && node.arguments[0]) return parse(node.arguments[0], seen, depth + 1)
    if (!ts.isPropertyAccessExpression(node.expression)) return unknown()
    const method = node.expression.name.text
    const receiver = node.expression.expression
    const argument = node.arguments[0]
    if (ts.isIdentifier(receiver) && zodNames.has(receiver.text)) {
      if (method === 'object' && argument && ts.isObjectLiteralExpression(argument)) {
        const properties = new Map<string, Shape>()
        for (const item of argument.properties) {
          if (!ts.isPropertyAssignment(item) || !(ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) || item.name.text.includes('.')) { unknown(); continue }
          const value = parse(item.initializer, seen, depth + 1)
          if (value) properties.set(item.name.text, { ...value, lines: { lineStart: source.getLineAndCharacterOfPosition(item.getStart(source)).line + 1, lineEnd: source.getLineAndCharacterOfPosition(item.getEnd()).line + 1 } })
        }
        return { type: 'object', optional: false, properties }
      }
      if (method === 'enum' || method === 'literal') {
        const value = literal(argument)
        if (!value || (method === 'enum' && !Array.isArray(value.value))) return unknown()
        return { type: method, optional: false, enum: method === 'enum' ? value.value as unknown[] : [value.value] }
      }
      if (method === 'array' && argument) {
        const items = parse(argument, seen, depth + 1)
        return items ? { type: method, optional: false, items } : undefined
      }
      if (method === 'union' && argument && ts.isArrayLiteralExpression(argument)) {
        const variants = argument.elements.map(item => parse(item as ts.Expression, seen, depth + 1))
        return variants.every(Boolean) ? { type: method, optional: false, variants: variants as Shape[] } : undefined
      }
      if (method === 'record' || method === 'partialRecord') {
        incomplete = true
        const variants = node.arguments.map(item => parse(item, seen, depth + 1))
        return variants.every(Boolean) ? { type: method, optional: false, variants: variants as Shape[] } : undefined
      }
      if (['string', 'number', 'boolean', 'unknown', 'any', 'null', 'undefined', 'never', 'date', 'bigint'].includes(method)) return { type: method, optional: method === 'undefined' }
      return unknown()
    }
    const shape = parse(receiver, seen, depth + 1)
    if (!shape) return undefined
    if (method === 'optional' || method === 'nullish') return { ...shape, optional: true, ...(method === 'nullish' ? { type: `${shape.type}|null` } : {}) }
    if (method === 'nullable') return { ...shape, type: `${shape.type}|null` }
    if (method === 'default') {
      const value = literal(argument)
      return value ? { ...shape, optional: true, default: value.value } : unknown()
    }
    if (method === 'partial' || method === 'required') return shape.properties ? { ...shape, properties: new Map([...shape.properties].map(([key, value]) => [key, { ...value, optional: method === 'partial' }])) } : unknown()
    // These methods constrain values but preserve the requested type/key/default contract.
    if (['passthrough', 'refine', 'superRefine'].includes(method)) { incomplete = true; return shape }
    if (['strict', 'strip', 'min', 'max', 'length', 'int', 'positive', 'nonnegative', 'negative', 'nonpositive', 'finite', 'url', 'email', 'regex', 'describe'].includes(method)) return shape
    return unknown()
  }
  const roots: { shape: Shape; evidence: Evidence }[] = []
  if (candidates.size && [...candidates].every(name => referenced.has(name))) incomplete = true
  for (const name of [...candidates].filter(name => !referenced.has(name)).sort()) {
    const declaration = declarations.get(name)!
    const shape = parse(declaration.initializer!)
    if (shape?.properties) roots.push({ shape, evidence: { source: 'code', path, lineStart: source.getLineAndCharacterOfPosition(declaration.getStart(source)).line + 1, lineEnd: source.getLineAndCharacterOfPosition(declaration.getEnd()).line + 1, contentHash: sha256NormalizedV1(source.text) } })
    else if (shape) unknown()
  }
  if (configFile(path)) for (const statement of source.statements) {
    if (!ts.isExportAssignment(statement)) continue
    const shape = parse(statement.expression)
    if (shape?.properties) roots.push({ shape, evidence: { source: 'code', path, lineStart: source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1, lineEnd: source.getLineAndCharacterOfPosition(statement.getEnd()).line + 1, contentHash: sha256NormalizedV1(source.text) } })
    else unknown()
  }
  if (!roots.length) return emit(roots, ownerId, incomplete, path)
  const linkedDefaults = new Map<string, ts.SourceFile>()
  const rootNames = new Set([...candidates].filter(name => !referenced.has(name)))
  const rootTypes = new Set(source.statements.filter(ts.isTypeAliasDeclaration).filter(declaration => {
    const type = declaration.type
    if (!ts.isTypeReferenceNode(type) || !ts.isQualifiedName(type.typeName) || !ts.isIdentifier(type.typeName.left) || !zodNames.has(type.typeName.left.text) || !['infer', 'input', 'output'].includes(type.typeName.right.text) || type.typeArguments?.length !== 1) return false
    const target = type.typeArguments[0]!
    return ts.isTypeQueryNode(target) && ts.isIdentifier(target.exprName) && rootNames.has(target.exprName.text)
  }).map(declaration => declaration.name.text))
  const assigned = new Map<string, { value: unknown; shape: Shape; evidence: Evidence }>()
  const conflicting = new Set<string>()
  // Only schema-linked defaults functions contribute operational values; never execute them.
  for (const [defaultPath, defaultSource] of new Map([[path, source], ...defaults])) {
    const imported = new Set<string>(defaultPath === path ? rootTypes : [])
    for (const statement of defaultSource.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      const target = posix.normalize(posix.join(toPosix(dirname(defaultPath)), statement.moduleSpecifier.text)).replace(/\.[cm]?[jt]s$/, '')
      if (target !== path.replace(/\.[cm]?[jt]s$/, '')) continue
      const names = statement.importClause?.namedBindings
      if (names && ts.isNamedImports(names)) for (const name of names.elements) { if (rootTypes.has((name.propertyName ?? name.name).text)) imported.add(name.name.text) }
    }
    if (!imported.size) continue
    if ((defaultSource as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) { incomplete = true; linkedDefaults.set(defaultPath, defaultSource); continue }
    const values = new Map<string, ts.Expression>()
    for (const statement of defaultSource.statements) if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)) for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) values.set(declaration.name.text, declaration.initializer)
    }
    const functions: (ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression)[] = []
    for (const statement of defaultSource.statements) {
      if (ts.isFunctionDeclaration(statement) && /default/i.test(statement.name?.text ?? '')) functions.push(statement)
      if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && /default/i.test(declaration.name.text) && declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) functions.push(declaration.initializer)
      }
    }
    for (const fn of functions) {
      if (!fn.parameters.some(parameter => parameter.type && ts.isTypeReferenceNode(parameter.type) && ts.isIdentifier(parameter.type.typeName) && imported.has(parameter.type.typeName.text))) continue
      linkedDefaults.set(defaultPath, defaultSource)
      if (roots.length !== 1 || !fn.body) { incomplete = true; continue }
      const localValues = new Map(values)
      if (ts.isBlock(fn.body)) for (const statement of fn.body.statements) {
        if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)) for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.initializer) localValues.set(declaration.name.text, declaration.initializer)
        }
      }
      const apply = (input: ts.Expression, shape: Shape, prefix = '', depth = 0): void => {
        if (depth > MAX_DEPTH) { incomplete = true; return }
        const node = unwrap(input)
        if (!ts.isObjectLiteralExpression(node)) { incomplete = true; return }
        if (node.properties.some(property => ts.isSpreadAssignment(property) && !fn.parameters.some(parameter => ts.isIdentifier(parameter.name) && property.expression.getText(defaultSource).replace(/\?\./g, '.') === (prefix ? `${parameter.name.text}.${prefix}` : parameter.name.text)))) { incomplete = true; return }
        for (const property of node.properties) {
          if (ts.isSpreadAssignment(property)) continue
          if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) { incomplete = true; continue }
          const child = shape.properties?.get(property.name.text)
          if (!child) continue
          const key = prefix ? `${prefix}.${property.name.text}` : property.name.text
          let expression = unwrap(property.initializer)
          if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
            const left = expression.left.getText(defaultSource).replace(/\?\./g, '.')
            if (!fn.parameters.some(parameter => ts.isIdentifier(parameter.name) && left === `${parameter.name.text}.${key}`)) { incomplete = true; continue }
            expression = unwrap(expression.right)
          }
          if (ts.isObjectLiteralExpression(expression) && child.properties) { apply(expression, child, key, depth + 1); continue }
          const value = literal(expression, new Set(), 0, localValues)
          if (!value) { incomplete = true; continue }
          const prior = assigned.get(key)
          if (conflicting.has(key)) continue
          if (prior && canonicalJsonV1(prior.value) !== canonicalJsonV1(value.value)) { incomplete = true; assigned.delete(key); conflicting.add(key); continue }
          assigned.set(key, { value: value.value, shape: child, evidence: { source: 'code', path: defaultPath, lineStart: defaultSource.getLineAndCharacterOfPosition(property.getStart(defaultSource)).line + 1, lineEnd: defaultSource.getLineAndCharacterOfPosition(property.getEnd()).line + 1, contentHash: sha256NormalizedV1(defaultSource.text) } })
        }
      }
      if (ts.isBlock(fn.body)) {
        const returns = fn.body.statements.filter(ts.isReturnStatement)
        if (returns.length !== 1 || !returns[0]!.expression || fn.body.statements.some(statement => !ts.isReturnStatement(statement) && !ts.isVariableStatement(statement))) { incomplete = true; continue }
        apply(returns[0]!.expression, roots[0]!.shape)
      } else apply(fn.body, roots[0]!.shape)
    }
  }
  for (const { value, shape } of assigned.values()) shape.default = value
  const result = emit(roots, ownerId, incomplete, path)
  result.facts = result.facts.map(fact => assigned.has(fact.name) ? { ...fact, evidence: [assigned.get(fact.name)!.evidence, ...fact.evidence] } : fact)
  for (const [defaultPath, defaultSource] of linkedDefaults) {
    if (defaultPath === path) continue
    const evidence: Evidence = { source: 'code', path: defaultPath, lineStart: 1, lineEnd: defaultSource.getLineAndCharacterOfPosition(defaultSource.end).line + 1, contentHash: sha256NormalizedV1(defaultSource.text) }
    result.facts = result.facts.map(fact => ({ ...fact, evidence: [...fact.evidence, evidence].slice(0, 64) }))
    result.coverage = result.coverage.map(coverage => ({ ...coverage, evidence: [...(coverage.evidence ?? []), evidence].slice(0, 32) }))
  }
  return result
}

const projection = (shape: Shape, includeProperties = true): unknown => ({
  type: shape.type, optional: shape.optional,
  ...('default' in shape ? { default: shape.default } : {}),
  ...(shape.enum ? { enum: [...shape.enum].sort((a, b) => canonicalJsonV1(a).localeCompare(canonicalJsonV1(b))) } : {}),
  ...(shape.items ? { items: projection(shape.items) } : {}),
  ...(shape.variants ? { variants: shape.variants.map(value => projection(value)) } : {}),
  ...(includeProperties && shape.properties ? { properties: Object.fromEntries([...shape.properties].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, projection(value)])) } : {}),
})
const emit = (roots: readonly { shape: Shape; evidence: Evidence }[], ownerId: string, incomplete: boolean, path: string): Result => {
  const facts = new Map<string, SurfaceFact>()
  const conflicting = new Set<string>()
  const visit = (shape: Shape, prefix: string, evidence: Evidence, depth: number): void => {
    if (depth > MAX_DEPTH) { incomplete = true; return }
    for (const [key, value] of [...(shape.properties ?? [])].sort(([a], [b]) => a.localeCompare(b))) {
      const name = prefix ? `${prefix}.${key}` : key
      if (!name.length || name.length > 256 || facts.size >= MAX_KEYS) { incomplete = true; continue }
      const fact: SurfaceFact = { kind: 'config-key', id: surfaceFactEntityId('config-key', ownerId, name), ownerId, name, valueHash: sha256NormalizedV1(projection(value)), ownValueHash: sha256NormalizedV1(projection(value, false)), evidence: [{ ...evidence, ...value.lines }] }
      const previous = facts.get(name)
      if (conflicting.has(name)) continue
      if (previous && previous.valueHash !== fact.valueHash) { facts.delete(name); conflicting.add(name); incomplete = true; continue }
      facts.set(name, fact)
      visit(value, name, evidence, depth + 1)
    }
  }
  for (const root of roots) visit(root.shape, '', root.evidence, 0)
  return { facts: [...facts.values()].sort((a, b) => a.id.localeCompare(b.id)), coverage: [{ analyzer: CONFIG_FACT_ANALYZER_ID, analyzerVersion: CONFIG_FACT_ANALYZER_VERSION, scope: 'config-keys', status: incomplete ? 'partial' : 'complete', ...(incomplete ? { reason: 'Dynamic, unsupported, conflicting or bounded configuration schema/default extraction.' } : {}), evidence: roots.length ? roots.map(root => root.evidence).slice(0, 32) : [{ source: path.endsWith('.json') ? 'configuration' : 'code', path }] }] }
}

export const configFactsFromJsonSchema = (text: string, path: string, ownerId: string): Result => {
  let document: unknown
  try { document = JSON.parse(text) } catch { return configFile(path) ? emit([], ownerId, true, path) : { facts: [], coverage: [] } }
  if (!record(document)) return configFile(path) ? emit([], ownerId, true, path) : { facts: [], coverage: [] }
  if (!(configFile(path) || (typeof document.title === 'string' && /config/i.test(document.title)))) return { facts: [], coverage: [] }
  let incomplete = false
  const parse = (value: unknown, depth = 0, references = new Set<string>()): Shape | undefined => {
    if (!record(value) || depth > MAX_DEPTH) { incomplete = true; return undefined }
    if (typeof value.$ref === 'string') {
      if (!value.$ref.startsWith('#/') || references.has(value.$ref) || Object.keys(value).some(key => !['$ref', '$schema', '$id', '$anchor', '$defs', 'definitions', 'description', 'title', '$comment'].includes(key))) { incomplete = true; return undefined }
      let target: unknown = document
      for (const key of value.$ref.slice(2).split('/').map(key => key.replace(/~1/g, '/').replace(/~0/g, '~'))) target = record(target) && Object.hasOwn(target, key) ? target[key] : undefined
      return parse(target, depth + 1, new Set([...references, value.$ref]))
    }
    if (['allOf', 'anyOf', 'oneOf', 'if', 'then', 'else', 'patternProperties', 'dependentSchemas', 'not'].some(key => key in value)) { incomplete = true; return undefined }
    if (Object.keys(value).some(key => !JSON_SCHEMA_KEYS.has(key))) { incomplete = true; return undefined }
    if (value.type !== undefined && !(typeof value.type === 'string' ? JSON_SCHEMA_TYPES.has(value.type) : Array.isArray(value.type) && value.type.length > 0 && value.type.every(item => typeof item === 'string' && JSON_SCHEMA_TYPES.has(item)))) { incomplete = true; return undefined }
    if ((value.properties !== undefined && !record(value.properties)) || (value.required !== undefined && (!Array.isArray(value.required) || !value.required.every(item => typeof item === 'string')))) { incomplete = true; return undefined }
    if (value.enum !== undefined && (!Array.isArray(value.enum) || !value.enum.length)) { incomplete = true; return undefined }
    if (['default', 'enum', 'const'].some(key => key in value && !boundedLiteral(value[key]))) { incomplete = true; return undefined }
    if (value.additionalProperties !== undefined && value.additionalProperties !== false) incomplete = true
    const type = typeof value.type === 'string' ? value.type : Array.isArray(value.type) && value.type.every(item => typeof item === 'string') ? [...value.type].sort().join('|') : record(value.properties) ? 'object' : Array.isArray(value.enum) ? 'enum' : 'unknown'
    const shape: Shape = { type, optional: false, ...('default' in value ? { default: value.default } : {}), ...(Array.isArray(value.enum) ? { enum: value.enum } : {}), ...('const' in value ? { enum: [value.const] } : {}) }
    if (record(value.properties)) {
      shape.properties = new Map()
      for (const [key, item] of Object.entries(value.properties)) {
        if (key.includes('.')) { incomplete = true; continue }
        const child = parse(item, depth + 1, references)
        if (child) shape.properties.set(key, { ...child, optional: !(Array.isArray(value.required) && value.required.includes(key)) })
      }
    }
    if (value.items !== undefined) { const items = parse(value.items, depth + 1, references); if (items) shape.items = items }
    return shape
  }
  const shape = parse(document)
  if (!shape?.properties) incomplete = true
  const evidence: Evidence = { source: 'configuration', path, contentHash: sha256NormalizedV1(text) }
  return emit(shape ? [{ shape, evidence }] : [], ownerId, incomplete, path)
}

export const configFactExtractor: FactExtractor = {
  id: CONFIG_FACT_ANALYZER_ID, version: CONFIG_FACT_ANALYZER_VERSION, kinds: ['config-key'], inputExtensions: ['.json'],
  extract({ root, io, sourceFiles, modules, packages, walkOptions }) {
    const results: Result[] = []
    const defaults = new Map<string, ts.SourceFile>()
    for (const path of sourceFiles.keys()) {
      if (/(?:^|\/)(?:tests?|__tests__)\//.test(path)) continue
      const source = sourceFiles.get(path)!
      if (/default/i.test(path) || /(?:function\s+\w*default\w*|(?:const|let)\s+\w*default\w*\s*=)/i.test(source.text)) defaults.set(path, source)
    }
    const owners = new Map([...modules.values()].map(module => [module.path, module.entityId]))
    for (const path of [...sourceFiles.keys()].sort((a, b) => a.localeCompare(b))) {
      if (/(?:^|\/)(?:tests?|__tests__)\/fixtures\//.test(path)) continue
      const source = sourceFiles.get(path)!
      const owner = owners.get(path)
      if (owner) {
        results.push(configFactsFromSource(source, path, owner, defaults))
      }
    }
    const walk = io.walk(['.json'], walkOptions ?? {})
    for (const absPath of [...walk.files].sort()) {
      const path = toPosix(relative(root, absPath))
      if (/(?:^|\/)(?:tests?|__tests__)\/fixtures\//.test(path)) continue
      const owner = owners.get(path) ?? [...packages].sort((a, b) => b.path.length - a.path.length).find(pkg => pkg.path === '.' || path.startsWith(`${pkg.path}/`))?.id
      const result = configFactsFromJsonSchema(io.readText(absPath), path, owner ?? 'unowned')
      if (!owner && result.coverage.length) { result.facts = []; result.coverage = [{ analyzer: CONFIG_FACT_ANALYZER_ID, scope: 'config-keys', status: 'partial', reason: 'Configuration schema has no discovered file or package owner.', evidence: [{ source: 'configuration', path }] }] }
      results.push(result)
    }
    const facts = new Map<string, SurfaceFact>()
    const conflicts = new Set<string>()
    let limited = false
    for (const fact of results.flatMap(result => result.facts)) {
      const prior = facts.get(fact.id)
      if (conflicts.has(fact.id)) continue
      if (prior && prior.valueHash !== fact.valueHash) { facts.delete(fact.id); conflicts.add(fact.id); continue }
      if (!prior && facts.size >= MAX_KEYS) { limited = true; continue }
      facts.set(fact.id, prior ? { ...prior, evidence: [...prior.evidence, ...fact.evidence].slice(0, 64) } : fact)
    }
    const details = results.filter(result => result.facts.length || result.coverage.some(entry => entry.status !== 'complete' || entry.evidence?.some(item => item.source === 'configuration'))).flatMap(result => result.coverage.map(entry => ({ ...entry, scope: `config-keys:${entry.evidence?.[0]?.path ?? '.'}` })))
    const partial = walk.incomplete || limited || details.length > 128 || conflicts.size > 0 || details.some(entry => entry.status !== 'complete')
    return { facts: [...facts.values()].sort((a, b) => a.id.localeCompare(b.id)), coverage: [...details.slice(0, 128), { analyzer: CONFIG_FACT_ANALYZER_ID, scope: 'config-keys', status: partial ? 'partial' : 'complete', ...(partial ? { reason: 'Configuration extraction has unsupported schemas, conflicting owners or scan limits.' } : {}), evidence: details.flatMap(entry => entry.evidence ?? []).slice(0, 32) }] }
  },
}
