import * as ts from 'typescript'
import { sha256NormalizedV1 } from '../../index-builder/content-hash.js'
import { surfaceFactEntityId, SignatureProofSchema, type SurfaceFact } from '../../storage/facts.js'
import type { DiscoverySnapshotV1, Evidence } from '../../schemas/knowledge.js'
import { isExported } from '../inputs.js'
import { fileContentHash } from '../incremental.js'
import type { FactExtractor } from './index.js'

export const SIGNATURE_ANALYZER_ID = 'js-ts:signature' as const
export const SIGNATURE_ANALYZER_VERSION = '1.1.0'
const MAX_FACTS = 4096
const MAX_SIGNATURE_BYTES = 16_384

/** Traverse real syntax nodes; scan punctuation gaps without materializing getChildren caches. */
const signatureTokens = (source: ts.SourceFile) => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, source.languageVariant)
  return (node: ts.Node): string[] => {
    const result: string[] = []
    const gap = (start: number, end: number): void => {
      scanner.setText(source.text, start, end - start)
      while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) result.push(scanner.getTokenText())
    }
    const visit = (item: ts.Node): void => {
      if (ts.isJSDoc(item)) return
      if (item.kind <= ts.SyntaxKind.LastToken) {
        const text = item.getText(source)
        if (text) result.push(text)
        return
      }
      let position = item.getStart(source)
      ts.forEachChild(item, child => {
        gap(position, child.getStart(source))
        visit(child)
        position = child.end
      })
      gap(position, item.end)
    }
    visit(node)
    return result
  }
}
const modifiers = (node: ts.Node) => ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : []
const has = (node: ts.Node, kind: ts.SyntaxKind) => modifiers(node).some(item => item.kind === kind)
const memberName = (node: ts.NamedDeclaration): string | undefined => node.name &&
  (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name) || ts.isNumericLiteral(node.name)) ? node.name.text : undefined

type Result = { facts: SurfaceFact[]; coverage: DiscoverySnapshotV1['coverage'] }
/** No type checker: missing declarations are reported, never inferred from bodies. */
export const extractSignatures = (source: ts.SourceFile, ownerId: string, path: string, contentHash: string): Result => {
  const tokens = signatureTokens(source)
  const groups = new Map<string, { value: unknown; node: ts.Node }[]>()
  const functions = new Map<string, ts.FunctionDeclaration[]>()
  for (const statement of source.statements) if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name) {
    const siblings = functions.get(statement.name.text) ?? []
    siblings.push(statement); functions.set(statement.name.text, siblings)
  }
  const limitations = new Set<string>()
  const evidence = (node: ts.Node): Evidence => ({ source: 'code', path, contentHash,
    lineStart: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    lineEnd: source.getLineAndCharacterOfPosition(node.getEnd()).line + 1 })
  const add = (name: string, value: unknown, node: ts.Node): void => {
    if (name.length > 256 || Buffer.byteLength(JSON.stringify(value)) > MAX_SIGNATURE_BYTES || (!groups.has(name) && groups.size >= MAX_FACTS)) {
      limitations.add('Signature name, value or fact count exceeds the extraction bound.'); return
    }
    const entries = groups.get(name) ?? []
    entries.push({ value, node }); groups.set(name, entries)
  }
  const callable = (node: ts.SignatureDeclarationBase, constructor = false): unknown => {
    for (const parameter of node.parameters) if (!parameter.type) limitations.add('Parameter types are inferred or undeclared.')
    if (!constructor && !node.type) limitations.add('Return types are inferred or undeclared.')
    return { parameters: node.parameters.map(parameter => ({ name: tokens(parameter.name),
      optional: Boolean(parameter.questionToken), rest: Boolean(parameter.dotDotDotToken), default: Boolean(parameter.initializer),
      type: parameter.type ? tokens(parameter.type) : null })),
      typeParameters: node.typeParameters?.map(parameter => tokens(parameter)) ?? [],
      returnType: node.type ? tokens(node.type) : null }
  }
  const callableGroup = (nodes: readonly ts.SignatureDeclarationBase[], constructor = false): unknown[] => {
    const overloads = nodes.filter(node => !('body' in node) || !node.body)
    return (overloads.length ? overloads : nodes).map(node => callable(node, constructor))
  }
  const declaration = (name: string, node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node)) {
      const siblings = functions.get(name) ?? []
      if (node !== siblings[0]) return
      add(name, { kind: 'function', signatures: callableGroup(siblings) }, node)
    } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      add(name, { kind: 'function', signatures: [callable(node)] }, node)
    } else if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      const members = ts.isTypeAliasDeclaration(node) ? ts.isTypeLiteralNode(node.type) ? node.type.members : undefined : node.members
      if (!members) { add(name, { kind: 'type', typeParameters: node.typeParameters?.map(parameter => tokens(parameter)) ?? [], type: tokens((node as ts.TypeAliasDeclaration).type) }, node); return }
      const values = new Map<string, ts.Node[]>()
      for (const member of members) {
        if (has(member, ts.SyntaxKind.PrivateKeyword) || has(member, ts.SyntaxKind.ProtectedKeyword) || (member.name && ts.isPrivateIdentifier(member.name))) continue
        const key = ts.isConstructorDeclaration(member) ? 'constructor' : memberName(member)
        if (!key || /[.:]/.test(key)) { limitations.add('Computed, call, index or punctuated member names are not analyzed.'); continue }
        const memberKey = `${has(member, ts.SyntaxKind.StaticKeyword) ? 'static:' : ''}${key}`
        const siblings = values.get(memberKey) ?? []
        siblings.push(member); values.set(memberKey, siblings)
      }
      const signatures: { name: string; value: unknown }[] = []
      for (const [key, nodes] of [...values].sort(([a], [b]) => a.localeCompare(b))) {
        const first = nodes[0]!
        let value: unknown
        if (ts.isConstructorDeclaration(first) || ts.isMethodDeclaration(first) || ts.isMethodSignature(first)) {
          value = { optional: Boolean('questionToken' in first && first.questionToken), signatures: callableGroup(nodes as ts.SignatureDeclarationBase[], ts.isConstructorDeclaration(first)) }
        } else if (ts.isPropertySignature(first) || ts.isPropertyDeclaration(first)) {
          if (!first.type) limitations.add('Member types are inferred or undeclared.')
          value = { optional: Boolean(first.questionToken), readonly: has(first, ts.SyntaxKind.ReadonlyKeyword), type: first.type ? tokens(first.type) : null }
        } else { limitations.add('Accessor members are not analyzed.'); continue }
        signatures.push({ name: key, value })
        add(`${name}.${key}`, value, first)
      }
      add(name, { kind: ts.isClassDeclaration(node) ? 'class' : 'type', typeParameters: node.typeParameters?.map(parameter => tokens(parameter)) ?? [],
        heritage: !ts.isTypeAliasDeclaration(node) ? node.heritageClauses?.map(clause => tokens(clause)) ?? [] : [], members: signatures }, node)
      if (ts.isClassDeclaration(node) && node.heritageClauses?.length) limitations.add('Inherited class members are not inferred.')
    } else limitations.add('An exported declaration has no supported syntactic signature.')
  }
  if ((source as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length) limitations.add('Source syntax has parse diagnostics.')
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
      limitations.add('Re-exports and export aliases or assignments are not analyzed.'); continue
    }
    if (!isExported(statement)) continue
    if (has(statement, ts.SyntaxKind.DefaultKeyword)) { limitations.add('Default exports are not analyzed.'); continue }
    if (ts.isVariableStatement(statement)) {
      if (!(statement.declarationList.flags & ts.NodeFlags.Const)) { limitations.add('Mutable exported bindings are not analyzed.'); continue }
      for (const item of statement.declarationList.declarations) {
        if (ts.isIdentifier(item.name) && item.initializer && (ts.isArrowFunction(item.initializer) || ts.isFunctionExpression(item.initializer))) declaration(item.name.text, item.initializer)
        else limitations.add('Exported non-callable bindings or dynamic initializers are not analyzed.')
      }
    } else {
      const name = ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) ? memberName(statement) : undefined
      if (name) declaration(name, statement)
      else limitations.add('An exported declaration has no static name.')
    }
  }
  const localTypes = new Map(source.statements.filter(statement => ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement))
    .map(statement => [statement.name.text, statement] as const))
  const proof = (entries: { value: unknown; node: ts.Node }[]): SurfaceFact['signature'] => {
    if (entries.length !== 1) return undefined
    const value = entries[0]!.value as { kind?: string; signatures?: unknown[] }
    if (value.kind !== 'function' || !value.signatures) return undefined
    const types: Record<string, string> = {}
    const visit = (node: ts.Node): void => {
      if ((ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) || (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression))) {
        const name = ts.isTypeReferenceNode(node) ? node.typeName.getText(source) : node.expression.getText(source), declaration = localTypes.get(name)
        if (declaration && !(name in types)) {
          types[name] = tokens(declaration).filter(token => token !== 'export' && token !== 'declare').join(' ')
          ts.forEachChild(declaration, visit)
        }
      }
      ts.forEachChild(node, visit)
    }
    const node = entries[0]!.node
    // Bodies are never retained; only declared types form the proof context.
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      for (const parameter of node.parameters) if (parameter.type) visit(parameter.type)
      if (node.type) visit(node.type)
      for (const sibling of functions.get(memberName(node) ?? '') ?? []) {
        for (const parameter of sibling.parameters) if (parameter.type) visit(parameter.type)
        if (sibling.type) visit(sibling.type)
      }
    }
    const parsed = SignatureProofSchema.safeParse({ codec: 'typescript-callable-v1', overloads: value.signatures, types })
    return parsed.success ? parsed.data : undefined
  }
  const facts = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, entries]) => ({ kind: 'signature' as const,
    id: surfaceFactEntityId('signature', ownerId, name), ownerId, name,
    valueHash: sha256NormalizedV1(entries.map(entry => entry.value)), ...((signature => signature ? { signature } : {})(proof(entries))), evidence: entries.slice(0, 8).map(entry => evidence(entry.node)) }))
  return { facts, coverage: [{ analyzer: SIGNATURE_ANALYZER_ID, analyzerVersion: SIGNATURE_ANALYZER_VERSION, scope: 'signatures',
    status: limitations.size ? 'partial' : 'complete', ...(limitations.size ? { reason: [...limitations].sort().join(' ') } : {}), evidence: [evidence(source)] }] }
}

export const signatureExtractor: FactExtractor = {
  id: SIGNATURE_ANALYZER_ID, version: SIGNATURE_ANALYZER_VERSION, kinds: ['signature'],
  extract(input) {
    const facts: SurfaceFact[] = []
    const coverage: DiscoverySnapshotV1['coverage'] = []
    for (const module of [...input.modules.values()].sort((a, b) => a.path.localeCompare(b.path))) {
      const source = input.sourceFiles.get(module.path)!
      const result = extractSignatures(source, module.entityId, module.path, fileContentHash(source.text))
      facts.push(...result.facts); coverage.push(...result.coverage)
    }
    if (!input.modules.size) coverage.push({ analyzer: SIGNATURE_ANALYZER_ID, analyzerVersion: SIGNATURE_ANALYZER_VERSION, scope: 'signatures', status: 'complete' })
    return { facts, coverage }
  },
}
