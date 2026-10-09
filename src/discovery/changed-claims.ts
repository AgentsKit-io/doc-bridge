import * as ts from 'typescript'
import { posix } from 'node:path'
import type { KnowledgeEntity } from '../schemas/knowledge.js'
import type { SurfaceFact } from '../storage/facts.js'
import { canonicalJsonV1 } from '../index-builder/content-hash.js'
import type { MarkdownDocumentV1 } from './markdown.js'
import { compatibleSignature } from './facts/signature-compatibility.js'
import { importedSignatureTypes } from './facts/signature-context.js'
import { configFactsFromSource } from './facts/config.js'

type Input = { before: SurfaceFact; after: SurfaceFact; base: readonly KnowledgeEntity[]; head: readonly KnowledgeEntity[];
  document: MarkdownDocumentV1; text: string; lines: readonly number[]; texts: ReadonlyMap<string, string> }
const same = (a: unknown, b: unknown) => canonicalJsonV1(a) === canonicalJsonV1(b)
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const symbolToken = (name: string): RegExp => new RegExp(`(?<![\\w$])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`)
const citingSentences = (text: string, name: string): string => {
  const token = symbolToken(name)
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z`])/)
  const selected: string[] = []
  for (let i = 0; i < sentences.length; i++) if (token.test(sentences[i]!)) {
    selected.push(sentences[i]!)
    for (let next = i + 1; next < sentences.length && /^(?:It|Its|This|They|Their|These|That|Those|The\s+(?:signature|parameters?|return|default|operation|function|method|API|fields?|properties|members|value|type))\b/.test(sentences[next]!); next++) selected.push(sentences[next]!)
  }
  return selected.length ? selected.join(' ') : text
}

const changedMembers = (input: Input): { changed: Set<string>; required: Set<string> } | undefined => {
  const members = (fact: SurfaceFact, entities: readonly KnowledgeEntity[]) => {
    const text = entities.find(entity => entity.id === fact.ownerId)?.metadata?.signatureContext
    if (typeof text !== 'string' || text.length > 65_536) return undefined
    const source = ts.createSourceFile('context.ts', text, ts.ScriptTarget.Latest, true)
    const declarations = source.statements.filter(node => (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name.text === fact.name)
    if (declarations.length !== 1) return undefined
    const node = declarations[0] as ts.InterfaceDeclaration | ts.TypeAliasDeclaration
    if (node.typeParameters?.length || ts.isInterfaceDeclaration(node) && node.heritageClauses?.length) return undefined
    const values = ts.isInterfaceDeclaration(node) ? node.members : ts.isTypeLiteralNode(node.type) ? node.type.members : undefined
    if (!values || values.some(value => !value.name || !ts.isIdentifier(value.name))) return undefined
    const printer = ts.createPrinter({ removeComments: true })
    return new Map(values.map(value => [value.name!.getText(source), { text: printer.printNode(ts.EmitHint.Unspecified, value, source), optional: !!('questionToken' in value && value.questionToken) }]))
  }
  const before = members(input.before, input.base), after = members(input.after, input.head)
  if (!before || !after) return undefined
  return { changed: new Set([...new Set([...before.keys(), ...after.keys()])].filter(name => before.get(name)?.text !== after.get(name)?.text)),
    required: new Set([...after].filter(([name, value]) => !value.optional && (!before.has(name) || before.get(name)!.optional)).map(([name]) => name)) }
}

const claimContext = (fact: SurfaceFact, entities: readonly KnowledgeEntity[]) => {
  const modules = new Map(entities.filter(entity => entity.kind === 'module' && entity.path).map(entity => [entity.path!, entity]))
  const owner = entities.find(entity => entity.id === fact.ownerId)
  if (!owner?.path) throw new Error('OWNER')
  const cache = new Map<string, ts.SourceFile>()
  let bytes = 0
  const sourceAt = (path: string) => {
    if (cache.has(path)) return cache.get(path)
    const text = modules.get(path)?.metadata?.signatureContext
    if (typeof text !== 'string' || text.length > 65_536 || cache.size >= 32 || (bytes += Buffer.byteLength(text)) > 262_144) return undefined
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
    if ((source as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length || source.statements.some(ts.isModuleDeclaration)) return undefined
    cache.set(path, source)
    return source
  }
  const binding = (path: string, name: string): { path: string; name: string } | undefined => {
    const source = sourceAt(path)
    if (!source || source.statements.some(node => ts.isImportEqualsDeclaration(node) && node.name?.text === name)) throw new Error('CONTEXT')
    const declarations = source.statements.filter(node => (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) && node.name?.text === name)
    const imports = source.statements.filter(ts.isImportDeclaration).filter(node => node.importClause?.name?.text === name || node.importClause?.namedBindings && (ts.isNamespaceImport(node.importClause.namedBindings) ? node.importClause.namedBindings.name.text === name : node.importClause.namedBindings.elements.some(item => item.name.text === name)))
    if (declarations.length + imports.length > 1) throw new Error('AMBIGUOUS')
    if (declarations.length) return { path, name }
    const imported = imports[0]
    if (!imported) return undefined
    if (!imported.moduleSpecifier || !ts.isStringLiteral(imported.moduleSpecifier) || !imported.moduleSpecifier.text.startsWith('.') || !imported.importClause?.namedBindings || !ts.isNamedImports(imported.importClause.namedBindings)) throw new Error('IMPORT')
    const item = imported.importClause.namedBindings.elements.find(item => item.name.text === name)!
    const target = posix.normalize(posix.join(posix.dirname(path), imported.moduleSpecifier.text))
    const stem = /\.[cm]?js$/.test(target) ? target.replace(/\.[cm]?js$/, '') : target
    const candidates = [...new Set([target, stem + '.ts', stem + '.tsx', stem + '.d.ts'].filter(path => modules.has(path)))]
    if (candidates.length !== 1) throw new Error('MODULE')
    const resolved = sourceAt(candidates[0]!)
    const declaration = resolved?.statements.find(node => (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) && node.name.text === (item.propertyName ?? item.name).text && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
    if (!declaration) throw new Error('EXPORT')
    return { path: candidates[0]!, name: (item.propertyName ?? item.name).text }
  }
  return { modules, path: owner.path, sourceAt, binding }
}

/** Shallow owned option shapes: optional additions do not change an existing call. */
const optionalObjectAddition = (input: Input, before: readonly string[] | null | undefined, after: readonly string[] | null | undefined): boolean => {
  if (!before || !after) return false
  const printer = ts.createPrinter({ removeComments: true })
  const shape = (tokens: readonly string[], fact: SurfaceFact, entities: readonly KnowledgeEntity[]) => {
    let context: ReturnType<typeof claimContext>
    try { context = claimContext(fact, entities) } catch { return undefined }
    const { modules, sourceAt, binding, path: ownerPath } = context
    const seen = new Set<string>()
    const fingerprint = (node: ts.TypeNode, path: string): string => {
      const signature = { codec: 'typescript-callable-v1' as const, overloads: [{ parameters: [], typeParameters: [], returnType: [printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile())] }], types: {} }
      const types = importedSignatureTypes({ ...fact, ownerId: modules.get(path)!.id, signature }, entities)
      if (!types) throw new Error('DEPENDENCY')
      return canonicalJsonV1([signature.overloads[0]!.returnType, types])
    }
    const collect = (node: ts.TypeNode, path: string, depth = 0): Map<string, { text: () => string; optional: boolean }> => {
      if (depth > 8) throw new Error('BOUND')
      if (ts.isParenthesizedTypeNode(node)) return collect(node.type, path, depth + 1)
      if (ts.isIntersectionTypeNode(node)) {
        const result = new Map<string, { text: () => string; optional: boolean }>()
        for (const type of node.types) for (const [key, value] of collect(type, path, depth + 1)) { if (result.has(key)) throw new Error('DUPLICATE'); result.set(key, value) }
        return result
      }
      if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
        const target = binding(path, node.typeName.text)
        if (!target && node.typeName.text === 'Readonly' && node.typeArguments?.length === 1) return collect(node.typeArguments[0]!, path, depth + 1)
        if (!target || node.typeArguments?.length) throw new Error('OPAQUE')
        const key = target.path + ':' + target.name
        if (seen.has(key)) throw new Error('CYCLE')
        seen.add(key)
        const declarations = sourceAt(target.path)!.statements.filter(item => (ts.isTypeAliasDeclaration(item) || ts.isInterfaceDeclaration(item)) && item.name.text === target.name)
        if (declarations.length !== 1) throw new Error('DECLARATION')
        const declaration = declarations[0] as ts.TypeAliasDeclaration | ts.InterfaceDeclaration
        if (declaration.typeParameters?.length || ts.isInterfaceDeclaration(declaration) && declaration.heritageClauses?.length) throw new Error('OPAQUE')
        const result = ts.isTypeAliasDeclaration(declaration) ? collect(declaration.type, target.path, depth + 1) : members(declaration.members, target.path)
        seen.delete(key)
        return result
      }
      if (!ts.isTypeLiteralNode(node)) throw new Error('SHAPE')
      return members(node.members, path)
    }
    const members = (nodes: readonly ts.TypeElement[], path: string) => {
      const result = new Map<string, { text: () => string; optional: boolean }>()
      for (const node of nodes) {
        if (!ts.isPropertySignature(node) || !node.type || !node.name || !ts.isIdentifier(node.name) || result.has(node.name.text)) throw new Error('MEMBER')
        result.set(node.name.text, { text: () => fingerprint(node.type!, path), optional: !!node.questionToken })
      }
      return result
    }
    try {
      const source = ts.createSourceFile('type.ts', 'type T = ' + tokens.join(' '), ts.ScriptTarget.Latest, true)
      if ((source as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length) return undefined
      const declaration = source.statements[0]
      return declaration && ts.isTypeAliasDeclaration(declaration) ? collect(declaration.type, ownerPath) : undefined
    } catch { return undefined }
  }
  const a = shape(before, input.before, input.base), b = shape(after, input.after, input.head)
  try { return !!a && !!b && [...a].every(([key, value]) => !!b.get(key) && b.get(key)!.text() === value.text() && (!value.optional || b.get(key)!.optional)) && [...b].every(([key, value]) => a.has(key) || value.optional) } catch { return false }
}

/** Only optional fields added beneath positively covariant, unchanged wrappers. */
const optionalReturnMembers = (input: Input): Set<string> | undefined => {
  const before = input.before.signature, after = input.after.signature
  if (!before || !after || before.overloads.length !== 1 || after.overloads.length !== 1) return undefined
  const printer = ts.createPrinter({ removeComments: true })
  const print = (node: ts.Node) => printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile())
  const parse = (tokens: readonly string[] | null | undefined) => {
    if (!tokens) throw new Error('TYPE')
    const source = ts.createSourceFile('return.ts', 'type T = ' + tokens.join(' '), ts.ScriptTarget.Latest, true)
    if ((source as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length || !source.statements[0] || !ts.isTypeAliasDeclaration(source.statements[0])) throw new Error('TYPE')
    return source.statements[0].type
  }
  try {
    const a = claimContext(input.before, input.base), b = claimContext(input.after, input.head)
    const covariant = (name: string): boolean => {
      const old = a.binding(a.path, name), next = b.binding(b.path, name)
      if (!old && !next) return name === 'Promise' || name === 'Readonly'
      if (!old || !next || old.path !== next.path || old.name !== next.name) return false
      const declaration = (context: typeof a, target: typeof old) => context.sourceAt(target.path)!.statements.filter(node => ts.isTypeAliasDeclaration(node) && node.name.text === target.name)
      const x = declaration(a, old), y = declaration(b, next)
      if (x.length !== 1 || y.length !== 1 || print(x[0]!) !== print(y[0]!)) return false
      const node = x[0] as ts.TypeAliasDeclaration, parameter = node.typeParameters?.[0]
      if (node.typeParameters?.length !== 1 || !parameter || parameter.constraint || parameter.default) return false
      const uses = (type: ts.Node): boolean => { let found = false; const visit = (child: ts.Node): void => { if (ts.isIdentifier(child) && child.text === parameter.name.text) found = true; ts.forEachChild(child, visit) }; visit(type); return found }
      const positive = (type: ts.TypeNode): boolean => {
        if (!uses(type)) return true
        if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
          if (type.typeName.text === parameter.name.text) return !type.typeArguments?.length
          if (type.typeName.text === 'Readonly' && type.typeArguments?.length === 1 && !a.binding(old.path, 'Readonly') && !b.binding(next.path, 'Readonly')) return positive(type.typeArguments[0]!)
          return false
        }
        if (ts.isParenthesizedTypeNode(type)) return positive(type.type)
        if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) return type.types.every(positive)
        if (ts.isTypeLiteralNode(type)) return type.members.every(member => ts.isPropertySignature(member) && !!member.type && positive(member.type))
        return false
      }
      return positive(node.type)
    }
    const added = new Set<string>()
    const compare = (old: ts.TypeNode, next: ts.TypeNode, depth = 0): boolean => {
      if (depth > 8) return false
      if (print(old) === print(next)) return true
      if (ts.isParenthesizedTypeNode(old) && ts.isParenthesizedTypeNode(next)) return compare(old.type, next.type, depth + 1)
      if ((ts.isUnionTypeNode(old) && ts.isUnionTypeNode(next) || ts.isIntersectionTypeNode(old) && ts.isIntersectionTypeNode(next))) return old.types.length === next.types.length && old.types.every((type, i) => compare(type, next.types[i]!, depth + 1))
      if (ts.isTypeReferenceNode(old) && ts.isTypeReferenceNode(next) && ts.isIdentifier(old.typeName) && ts.isIdentifier(next.typeName) && old.typeName.text === next.typeName.text && old.typeArguments?.length === 1 && next.typeArguments?.length === 1 && covariant(old.typeName.text)) return compare(old.typeArguments[0]!, next.typeArguments[0]!, depth + 1)
      if (!ts.isTypeLiteralNode(old) || !ts.isTypeLiteralNode(next)) return false
      const members = (node: ts.TypeLiteralNode) => {
        const result = new Map<string, ts.PropertySignature>()
        for (const member of node.members) { if (!ts.isPropertySignature(member) || !ts.isIdentifier(member.name) || result.has(member.name.text)) throw new Error('MEMBER'); result.set(member.name.text, member) }
        return result
      }
      const x = members(old), y = members(next)
      if (![...x].every(([name, member]) => !!y.get(name) && print(member) === print(y.get(name)!))) return false
      for (const [name, member] of y) if (!x.has(name)) { if (!member.questionToken) return false; added.add(name) }
      return true
    }
    return compare(parse(before.overloads[0]!.returnType), parse(after.overloads[0]!.returnType)) && added.size ? added : undefined
  } catch { return undefined }
}

/** Prove only the changed input parameter; unrelated opaque return types are not needed. */
const changedParameters = (input: Input, suppliedArguments?: number): boolean => {
  const old = input.before.signature, next = input.after.signature
  if (!old || !next || old.overloads.length !== 1 || next.overloads.length !== 1) return true
  const a = old.overloads[0]!, b = next.overloads[0]!
  if (!same(a.typeParameters, b.typeParameters) || a.typeParameters.length || a.parameters.some(p => p.rest) || b.parameters.some(p => p.rest)) return true
  if (b.parameters.length < a.parameters.length || b.parameters.slice(a.parameters.length).some(p => !p.optional && !p.default)) return true
  return a.parameters.some((p, i) => {
    const q = b.parameters[i]!
    if ((p.optional || p.default) && !q.optional && !q.default || p.default && (suppliedArguments === undefined || i >= suppliedArguments)) return true
    if (same(p.type, q.type) && same(old.types, next.types) || optionalObjectAddition(input, p.type, q.type)) return false
    const proof = (fact: SurfaceFact, parameter: typeof p, entities: readonly KnowledgeEntity[]) => {
      const signature = { codec: 'typescript-callable-v1' as const, overloads: [{ parameters: [parameter], typeParameters: [], returnType: ['void'] }], types: fact.signature!.types }
      const types = importedSignatureTypes({ ...fact, signature }, entities)
      return types && { ...fact, signature: { ...signature, types } }
    }
    const before = proof(input.before, p, input.base), after = proof(input.after, q, input.head)
    return !before || !after || !compatibleSignature(before, after)
  })
}

const literalUnion = (node: ts.TypeNode, aliases: Map<string, ts.TypeNode>, seen = new Set<string>()): string[] | undefined => {
  if (seen.size > 8) return undefined
  if (ts.isArrayTypeNode(node) || ts.isParenthesizedTypeNode(node)) return literalUnion(ts.isArrayTypeNode(node) ? node.elementType : node.type, aliases, seen)
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const name = node.typeName.text, target = aliases.get(name)
    return target && !seen.has(name) ? literalUnion(target, aliases, new Set([...seen, name])) : undefined
  }
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return [node.literal.text]
  if (!ts.isUnionTypeNode(node)) return undefined
  const values = node.types.map(type => literalUnion(type, aliases, seen))
  return values.every((value): value is string[] => !!value) ? values.flat() : undefined
}

/** Reuse the schema extractor on snapshot-verified source, without persisting new fact fields. */
const currentEnum = (input: Input): string[] | undefined => {
  const owner = input.head.find(entity => entity.id === input.after.ownerId), text = input.texts.get(input.after.ownerId)
  if (!owner?.path || text === undefined || !/\.[cm]?[jt]sx?$/.test(owner.path)) return undefined
  let result: string[] | undefined
  const defaults = new Map(input.head.filter(entity => entity.kind === 'module' && entity.path && input.texts.has(entity.id) && /\.[cm]?[jt]sx?$/.test(entity.path))
    .map(entity => [entity.path!, ts.createSourceFile(entity.path!, input.texts.get(entity.id)!, ts.ScriptTarget.Latest, true)]))
  configFactsFromSource(ts.createSourceFile(owner.path, text, ts.ScriptTarget.Latest, true), owner.path, owner.id, defaults, (fact, value) => {
    if (fact.id !== input.after.id || fact.valueHash !== input.after.valueHash) return
    let shape = value
    for (let depth = 0; depth < 8 && record(shape); depth++) {
      if (Array.isArray(shape.enum) && shape.enum.every(item => typeof item === 'string')) { result = shape.enum; break }
      shape = shape.items
    }
  })
  return result
}

/** False means an unambiguous mention or a positively verified current enum claim. */
export const changedCitationClaims = (input: Input): boolean => {
  const sourceLines = input.text.split(/\r?\n/)
  const regions = [...new Set(input.lines.map(line => input.document.citationRegions?.find(region => region.lineStart <= line && region.lineEnd >= line)))]
  if (!regions.length || regions.some(region => !region)) return true
  const name = input.before.name, leaf = name.split('.').at(-1)!
  const parameterChange = input.before.kind === 'signature' && input.before.signature ? changedParameters(input) : true
  const returnChange = input.before.signature && input.after.signature && !same(input.before.signature.overloads.map(item => item.returnType), input.after.signature.overloads.map(item => item.returnType))
  const optionalReturns = returnChange ? optionalReturnMembers(input) : undefined
  const enumValues = input.before.kind === 'config-key' ? currentEnum(input) : undefined
  const aliases = new Map<string, ts.TypeNode>()
  for (const block of input.text.matchAll(/^```(?:ts|typescript)\b[^\n]*\n([\s\S]*?)^```/gm)) {
    if (block[1]!.length > 65_536) continue
    const source = ts.createSourceFile('claim.ts', block[1]!, ts.ScriptTarget.Latest, true)
    for (const node of source.statements) if (ts.isTypeAliasDeclaration(node) && !node.typeParameters?.length) {
      if (aliases.has(node.name.text)) return true
      aliases.set(node.name.text, node.type)
    }
  }
  for (const region of regions) {
    let text = sourceLines.slice(region!.lineStart - 1, region!.lineEnd).join('\n')
    const following = input.document.citationRegions?.find(next => next.lineStart > region!.lineEnd && next.lineStart <= region!.lineEnd + 3 &&
      sourceLines.slice(region!.lineEnd, next.lineStart - 1).every(line => !line.trim()) && /^\s*```/.test(sourceLines[next.lineStart - 1]!))
    if (following && !/\bdefault\b/i.test(text)) {
      const code = sourceLines.slice(following.lineStart - 1, following.lineEnd).join('\n')
      if (symbolToken(name).test(code) || input.before.kind === 'config-key' && symbolToken(leaf).test(code)) text = code
    }
    if (text.length > 65_536) return true
    if (/^\s*```/.test(text)) {
      if (!/^\s*```(?:ts|tsx|typescript|js|jsx|javascript)\b[^\n]*\n/.test(text)) return true
      const code = text.replace(/^\s*```[^\n]*\n/, '').replace(/\n\s*```\s*$/, '')
      const source = ts.createSourceFile('claim.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      if ((source as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length) return true
      let claim = false
      const members = input.before.kind === 'signature' && !input.before.signature ? changedMembers(input) : undefined
      const typedNames = new Set<string>()
      const referencesType = (type: ts.TypeNode): boolean => {
        let found = false
        const walk = (node: ts.Node): void => { if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === name) found = true; ts.forEachChild(node, walk) }
        walk(type); return found
      }
      const findTypedNames = (node: ts.Node): void => {
        if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name) && node.type && referencesType(node.type)) {
          typedNames.add(node.name.text)
          if (node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
            const keys = node.initializer.properties.map(property => property.name?.getText(source).replace(/['"]/g, ''))
            if (!members || [...members.required].some(key => !keys.includes(key)) || keys.some(key => key && members.changed.has(key))) claim = true
          }
        }
        ts.forEachChild(node, findTypedNames)
      }
      findTypedNames(source)
      const visit = (node: ts.Node): void => {
        if ((ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.text === name) claim = true
        if (ts.isCallExpression(node) && (ts.isIdentifier(node.expression) && node.expression.text === name || ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === name)) {
          if (changedParameters(input, node.arguments.some(ts.isSpreadElement) ? undefined : node.arguments.length) || returnChange && (!optionalReturns || [...optionalReturns].some(member => symbolToken(member).test(code)))) claim = true
        }
        if (ts.isPropertyAccessExpression(node)) {
          let root = node.expression
          while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root)) root = root.expression
          if (ts.isIdentifier(root) && (root.text === name || typedNames.has(root.text)) && (!members || members.changed.has(node.name.text))) claim = true
        }
        if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) {
          if (referencesType(node.type)) claim = true
        }
        if (ts.isTypeQueryNode(node) && ts.isIdentifier(node.exprName) && node.exprName.text === name) claim = true
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) claim = true
        if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && ts.isIdentifier(node.tagName) && node.tagName.text === name && parameterChange) claim = true
        if (input.before.kind === 'config-key' && ts.isPropertySignature(node) && node.name && node.type && node.name.getText(source).replace(/['"]/g, '') === leaf) {
          const values = literalUnion(node.type, aliases)
          if (!values || !enumValues || !same([...new Set(values)].sort(), [...new Set(enumValues)].sort()) || /(?:@default|default\s*:)/i.test(node.getFullText(source))) claim = true
        }
        // A configured literal is a value claim, not an enum declaration.
        if (input.before.kind === 'config-key' && ts.isPropertyAssignment(node) && node.name.getText(source).replace(/['"]/g, '') === leaf) claim = true
        ts.forEachChild(node, visit)
      }
      visit(source)
      if (claim) return true
      continue
    }
    text = citingSentences(text, name)
    // Literal alternatives and explicit call/default/signature descriptions are claims.
    if (/["'][^"'\n]+["']\s*\|/.test(text) || /\b(?:default|defaults|parameter|parameters|argument|arguments|signature|enum|union|field|fields|property|properties|member|members|required|optional|string|number|boolean|integer)\b/i.test(text)) return true
    if (returnChange && /\b(?:return|returns|result|results|outputs?)\b/i.test(text)) return true
    if (parameterChange && !/\breturns?\b/i.test(text) && /\binputs?\b/i.test(text)) return true
    if (input.before.signature && parameterChange && /\b(?:requires|needs|takes|accepts|expects)\b|\bcall\b[\s\S]*\bwith\b/i.test(text)) return true
    if (input.before.kind === 'config-key' && /(?:=|:\s*["'\d{[])|\b(?:is|set|value|configured)\b[\s\S]*(?:`[^`]+`|\b(?:true|false|\d+)\b)/i.test(text)) return true
    // Unknown markup cannot establish a bare mention.
    if (/<[A-Za-z]|\{[^}]*\}/.test(text)) return true
  }
  return false
}
