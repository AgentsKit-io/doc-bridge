import { identifierNames } from './signature-compatibility.js'
import * as ts from 'typescript'
import { posix } from 'node:path'
import { z } from 'zod'
import type { KnowledgeEntity } from '../../schemas/knowledge.js'
import type { SurfaceFact } from '../../storage/facts.js'

const MAX_BYTES = 65_536
const ContextSchema = z.string().refine(text => Buffer.byteLength(text) <= MAX_BYTES)

/** Syntax only: retain each module once, without bodies or a checker. */
export const signatureContext = (source: ts.SourceFile): string | undefined => {
  if (source.statements.some(ts.isModuleDeclaration)) return undefined
  if ((source as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length) return undefined
  const printer = ts.createPrinter({ removeComments: true })
  const text = source.statements.filter(node => ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) || ts.isImportEqualsDeclaration(node))
    .map(node => ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) || ts.isImportEqualsDeclaration(node) ? `class ${node.name?.text ?? '__default'} {}` : printer.printNode(ts.EmitHint.Unspecified, node, source)).join('\n')
  return Buffer.byteLength(text) <= MAX_BYTES ? text : undefined
}

/** Only explicit source entry points are retained; built distributions stay unresolved. */
export const signatureEntryPoints = (manifest: Record<string, unknown>): Record<string, string> | undefined => {
  const entries: Record<string, string> = {}
  const target = (value: unknown, depth = 0): string | undefined => depth > 8 ? undefined : typeof value === 'string' ? value : value && typeof value === 'object' && !Array.isArray(value)
    ? target((value as Record<string, unknown>)[Object.hasOwn(value, 'types') ? 'types' : Object.hasOwn(value, 'import') ? 'import' : 'default'], depth + 1) : undefined
  const exports = manifest.exports
  if (exports && typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some(key => key.startsWith('.'))) {
    for (const [key, value] of Object.entries(exports)) { const path = target(value); if (path) entries[key] = path }
  } else {
    const path = exports !== undefined ? target(exports) : target(manifest.types ?? manifest.typings ?? manifest.main)
    if (path) entries['.'] = path
  }
  return Object.keys(entries).length && Buffer.byteLength(JSON.stringify(entries)) <= MAX_BYTES ? entries : undefined
}

/** Reachable declarations only; a missing/ambiguous/bounded-out dependency fails closed. */
export const importedSignatureTypes = (fact: SurfaceFact, entities: readonly KnowledgeEntity[]): Record<string, string> | undefined => {
  if (!fact.signature) return undefined
  const modules = new Map(entities.filter(entity => entity.kind === 'module' && entity.path).map(entity => [entity.path!, entity]))
  const owner = entities.find(entity => entity.id === fact.ownerId)
  if (!owner?.path) return undefined
  const packages = entities.filter(entity => entity.kind === 'package' && entity.path)
  const contexts = new Map<string, { name: string; source: ts.SourceFile; declarations: Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>; selected: Map<string, string> }>()
  let bytes = 0
  let namespacePrefix = '__DocBridgeModule'
  const rootText = ContextSchema.safeParse(modules.get(owner.path)?.metadata?.signatureContext)
  if (!rootText.success) return undefined
  const tokens = fact.signature.overloads.flatMap(signature => [...signature.parameters.flatMap(parameter => parameter.type ?? []), ...(signature.returnType ?? [])])
  const identifiers = identifierNames(rootText.data + '\n' + tokens.join(' '))
  while (Array.from({ length: 32 }, (_, i) => identifiers.has(`${namespacePrefix}${i}`)).some(Boolean)) namespacePrefix += '_'
  const namespaceNames = new Set(Array.from({ length: 32 }, (_, i) => `${namespacePrefix}${i}`))
  const resolveModule = (from: string, specifier: string): string | undefined => {
    let path: string
    if (specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')) path = posix.normalize(posix.join(posix.dirname(from), specifier))
    else {
      const matches = packages.filter(pkg => specifier === pkg.name || specifier.startsWith(`${pkg.name}/`)).sort((a,b) => b.name.length - a.name.length)
      const pkg = matches[0]
      if (!pkg?.path || matches.filter(match => match.name === pkg.name).length !== 1) return undefined
      const key = specifier === pkg.name ? '.' : `.${specifier.slice(pkg.name.length)}`
      const entry = (pkg.metadata?.signatureEntryPoints as Record<string, unknown> | undefined)?.[key]
      if (typeof entry !== 'string' || !entry.startsWith('./') || entry.split('/').includes('..') || entry.includes('*')) return undefined
      path = posix.normalize(posix.join(pkg.path, entry))
    }
    if (path.startsWith('../') || path.startsWith('/') || path.includes('\\') || path.includes(':')) return undefined
    const extension = posix.extname(path)
    const replacements: Record<string, string[]> = { '.js': ['.ts', '.tsx', '.d.ts'], '.jsx': ['.tsx', '.d.ts'], '.mjs': ['.mts', '.d.mts'], '.cjs': ['.cts', '.d.cts'] }
    const stem = extension ? path.slice(0, -extension.length) : path
    const candidates = [path, ...(replacements[extension] ?? (extension ? [] : ['.ts', '.tsx', '.d.ts'])).map(ext => stem + ext), ...(extension ? [] : ['.ts', '.tsx', '.d.ts'].map(ext => posix.join(path, `index${ext}`)))]
    const found = [...new Set(candidates.filter(path => modules.has(path)))]
    return found.length === 1 ? found[0] : undefined
  }
  const load = (path: string, depth: number) => {
    const cached = contexts.get(path)
    if (cached) return cached
    if (depth > 8 || contexts.size >= 32) throw new Error('BOUND')
    const parsed = ContextSchema.safeParse(modules.get(path)?.metadata?.signatureContext)
    if (!parsed.success || Array.from(identifierNames(parsed.data)).some(name => namespaceNames.has(name)) || (bytes += Buffer.byteLength(parsed.data)) > 262_144) throw new Error('CONTEXT')
    const source = ts.createSourceFile(path, parsed.data, ts.ScriptTarget.Latest, true)
    if ((source as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length) throw new Error('SYNTAX')
    const declarations = new Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>()
    for (const node of source.statements) if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      if (declarations.has(node.name.text)) throw new Error('MERGED_DECLARATION')
      declarations.set(node.name.text, node)
    }
    const name = `${namespacePrefix}${contexts.size}`
    const context = { name, source, declarations, selected: new Map<string, string>() }
    contexts.set(path, context); return context
  }
  const exported = (path: string, name: string, depth: number, seen = new Set<string>()): string => {
    const key = `${path}:${name}`
    if (seen.has(key) || depth > 8) throw new Error('EXPORT_CYCLE')
    seen.add(key)
    const context = load(path, depth)
    const node = context.declarations.get(name)
    if (node && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) && !ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      select(path, name, depth); return `${context.name}.${name}`
    }
    const targets: string[] = []
    for (const statement of context.source.statements) if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const binding = statement.exportClause && ts.isNamedExports(statement.exportClause) ? statement.exportClause.elements.find(item => item.name.text === name) : undefined
      if (statement.exportClause && !binding) continue
      const target = resolveModule(path, statement.moduleSpecifier.text)
      if (!target) throw new Error('UNRESOLVED_EXPORT')
      targets.push(exported(target, binding?.propertyName?.text ?? name, depth + 1, new Set(seen)))
    }
    if (targets.length !== 1) throw new Error('AMBIGUOUS_EXPORT')
    return targets[0]!
  }
  const select = (path: string, name: string, depth: number): void => {
    const context = load(path, depth)
    if (context.selected.has(name)) return
    if (context.source.statements.some(node => ts.isClassDeclaration(node) && node.name?.text === name)) throw new Error('CLASS')
    for (const node of context.source.statements) if (ts.isImportDeclaration(node) && (node.importClause?.name?.text === name || (node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings) && node.importClause.namedBindings.name.text === name))) throw new Error('UNSUPPORTED_IMPORT')
    const bindings = context.source.statements.filter(ts.isImportDeclaration).flatMap(node => node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) ? node.importClause.namedBindings.elements.filter(binding => binding.name.text === name) : [])
    if (bindings.length > 1 || (bindings.length && context.declarations.has(name))) throw new Error('AMBIGUOUS_BINDING')
    const declaration = context.declarations.get(name)
    if (declaration) {
      context.selected.set(name, declaration.getText(context.source).replace(/^(?:export\s+)?(?:declare\s+)?/, ''))
      visit(path, declaration, depth); return
    }
    for (const node of context.source.statements) if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      const binding = node.importClause.namedBindings.elements.find(item => item.name.text === name)
      if (!binding) continue
      const target = resolveModule(path, node.moduleSpecifier.text)
      if (!target) throw new Error('UNRESOLVED_IMPORT')
      context.selected.set(name, '')
      context.selected.set(name, `import ${name} = ${exported(target, binding.propertyName?.text ?? name, depth + 1)};`)
      return
    }
    // Unknown names are left to compiler diagnostics; external types are never supplied.
  }
  const visit = (path: string, node: ts.Node, depth: number): void => {
    if (ts.isTypeQueryNode(node) || ts.isImportTypeNode(node)) throw new Error('UNSUPPORTED_TYPE')
    if (ts.isTypeReferenceNode(node)) {
      let name = node.typeName
      while (ts.isQualifiedName(name)) name = name.left
      select(path, name.text, depth)
    }
    if (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression)) select(path, node.expression.text, depth)
    ts.forEachChild(node, child => visit(path, child, depth))
  }
  try {
    const root = load(owner.path, 0)
    for (const signature of fact.signature.overloads) for (const tokens of [...signature.parameters.map(parameter => parameter.type), signature.returnType]) {
      if (tokens) visit(owner.path, ts.createSourceFile('type.ts', `type T = ${tokens.join(' ')}`, ts.ScriptTarget.Latest, true), 0)
    }
    const types: Record<string, string> = {}
    for (const context of contexts.values()) {
      const text = [...context.selected.values()].map(text => `export ${text}`).join('\n')
      types[context.name] = `namespace ${context.name} { ${text} }`
      if (context === root) for (const name of context.selected.keys()) types[name] = `import ${name} = ${context.name}.${name};`
    }
    return Buffer.byteLength(JSON.stringify(types)) <= 262_144 ? types : undefined
  } catch { return undefined }
}

/** Declared direct inheritance only; this proof explicitly assumes the head compiles. */
export const declaredImportedHeritage = (before: SurfaceFact, after: SurfaceFact, oldEntities: readonly KnowledgeEntity[], newEntities: readonly KnowledgeEntity[]): boolean => {
  const old = before.signature, next = after.signature
  if (!old || !next || old.overloads.length !== 1 || next.overloads.length !== 1) return false
  const previous = old.overloads[0]!, current = next.overloads[0]!
  if (previous.typeParameters.length || current.typeParameters.length || previous.parameters.some(parameter => parameter.rest || !parameter.type?.length) || current.parameters.some(parameter => parameter.rest || !parameter.type?.length) || JSON.stringify(previous.parameters) !== JSON.stringify(current.parameters)) return false
  if (previous.returnType?.length !== 1 || current.returnType?.length !== 1) return false
  const baseName = previous.returnType[0]!, nextName = current.returnType[0]!
  if (baseName === nextName || !/^[A-Za-z_$][\w$]*$/.test(baseName) || !/^[A-Za-z_$][\w$]*$/.test(nextName)) return false
  const read = (entities: readonly KnowledgeEntity[], owner: string) => {
    const parsed = ContextSchema.safeParse(entities.find(entity => entity.id === owner)?.metadata?.signatureContext)
    return parsed.success ? ts.createSourceFile('context.ts', parsed.data, ts.ScriptTarget.Latest, true) : undefined
  }
  const oldSource = read(oldEntities, before.ownerId), newSource = read(newEntities, after.ownerId)
  if (!oldSource || !newSource) return false
  const imports = (source: ts.SourceFile) => {
    const bindings = source.statements.filter(ts.isImportDeclaration).flatMap(node => {
      if (!ts.isStringLiteral(node.moduleSpecifier)) return []
      const specifier = node.moduleSpecifier.text
      const entries: [string, string][] = []
      const add = (local: string, exported: string) => entries.push([local, JSON.stringify([specifier, exported])])
      if (node.importClause?.name) add(node.importClause.name.text, 'default')
      const named = node.importClause?.namedBindings
      if (named && ts.isNamespaceImport(named)) add(named.name.text, '*')
      if (named && ts.isNamedImports(named)) for (const binding of named.elements) add(binding.name.text, binding.propertyName?.text ?? binding.name.text)
      return entries
    })
    const result = new Map(bindings)
    return result.size === bindings.length ? result : undefined
  }
  const oldImports = imports(oldSource), newImports = imports(newSource)
  if (!oldImports || !newImports || !oldImports.has(baseName) || [...oldImports].some(([name, binding]) => newImports.get(name) !== binding)) return false
  const [specifier, exportedName] = JSON.parse(oldImports.get(baseName)!) as [string, string]
  if (exportedName === 'default' || exportedName === '*' || old.types[baseName] || next.types[baseName] || specifier.startsWith('.') || specifier.startsWith('/') || oldEntities.some(entity => entity.kind === 'package' && (specifier === entity.name || specifier.startsWith(`${entity.name}/`)))) return false
  if ([oldSource, newSource].some(source => source.statements.some(node => ts.isClassDeclaration(node) && node.name?.text === baseName))) return false
  const declarations = newSource.statements.filter(node => ts.isInterfaceDeclaration(node) && node.name.text === nextName)
  const declaration = declarations[0]
  if (declarations.length !== 1 || !declaration || !ts.isInterfaceDeclaration(declaration) || declaration.typeParameters?.length || declaration.heritageClauses?.length !== 1) return false
  const heritage = declaration.heritageClauses[0]!
  if (heritage.token !== ts.SyntaxKind.ExtendsKeyword || heritage.types.length !== 1 || heritage.types[0]!.typeArguments?.length || !ts.isIdentifier(heritage.types[0]!.expression) || heritage.types[0]!.expression.text !== baseName) return false
  const { [nextName]: added, ...types } = next.types
  return !!added && JSON.stringify(old.types) === JSON.stringify(types)
}
