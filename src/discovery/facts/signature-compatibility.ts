import * as ts from 'typescript'
import { basename, dirname, resolve } from 'node:path'
import { canonicalJsonV1 } from '../../index-builder/content-hash.js'
import type { SurfaceFact } from '../../storage/facts.js'

/** A proof uses retained declarations and compiler libraries, never repository imports. */
export const compatibleSignature = (before: SurfaceFact, after: SurfaceFact): boolean => {
  const old = before.signature, next = after.signature
  if (!old || !next) return false
  const same = (a: unknown, b: unknown) => canonicalJsonV1(a) === canonicalJsonV1(b)
  if (old.overloads.length > 1 || next.overloads.length > 1) {
    if (next.overloads.length < old.overloads.length || !same(old.types, next.types) || !old.overloads.every((signature, i) => same(signature, next.overloads[i]))) return false
    // TypeScript prefers literal overloads even when appended after existing ones.
    return next.overloads.slice(old.overloads.length).every(extra => {
      if (extra.typeParameters.length || extra.parameters.some(p => p.rest || !p.type) || !extra.returnType) return false
      const specialized = extra.parameters.some(parameter => {
        const source = ts.createSourceFile('type.ts', `type T = ${parameter.type!.join(' ')}`, ts.ScriptTarget.Latest, true)
        const declaration = source.statements[0]
        return declaration && ts.isTypeAliasDeclaration(declaration) && ts.isLiteralTypeNode(declaration.type)
      })
      return !specialized || old.overloads.every(previous => previous.returnType && (same(extra.returnType, previous.returnType) || prove([[extra.returnType!, previous.returnType, false]], old.types, next.types)))
    })
  }
  const checks: [string[], string[], boolean][] = []
  const assignable = (from: string[] | null, to: string[] | null, parameter: boolean): boolean => {
    if (!from || !to) return false
    if (same(from, to) && same(old.types, next.types)) return true
    checks.push([from, to, parameter]); return true
  }
  // Every old overload must retain an accepting signature; new overloads can coexist.
  for (const previous of old.overloads) {
    let matched = false
    for (const current of next.overloads) {
      const start = checks.length
      if (previous.typeParameters.length || current.typeParameters.length || previous.parameters.some(p => p.rest) || current.parameters.some(p => p.rest)) {
        if (same(previous, current) && same(old.types, next.types)) { matched = true; break }
        continue
      }
      if (current.parameters.length < previous.parameters.length || current.parameters.slice(previous.parameters.length).some(p => !p.optional && !p.default)) continue
      const valid = previous.parameters.every((p, i) => {
        const q = current.parameters[i]!
        return (!(p.optional || p.default) || q.optional || q.default) && assignable(p.type, q.type, true)
      }) && assignable(current.returnType, previous.returnType, false)
      if (valid && prove(checks.slice(start), old.types, next.types)) { matched = true; break }
      checks.length = start
    }
    if (!matched) return false
  }
  return true
}

const prove = (checks: [string[], string[], boolean][], oldTypes: Record<string, string>, newTypes: Record<string, string>): boolean => {
  if (!checks.length) return true
  const aliases = checks.map(([, , parameter], i) => ({ from: `${parameter ? 'Before' : 'After'}.T${i}`, to: `${parameter ? 'After' : 'Before'}.T${i}`, parameter }))
  const text = ['Before', 'After'].map((name, side) => `namespace ${name} { ${Object.values(side ? newTypes : oldTypes).map(value => `export ${value}`).join('\n')} ${checks.map(([from, to], i) => `export type T${i} = ${(side === (aliases[i]!.parameter ? 0 : 1) ? from : to).join(' ')};`).join('\n')} }`).join('\n') + '\n' + aliases.map((pair, i) => `type From${i} = ${pair.from}; type To${i} = ${pair.to};`).join('\n')
  const options: ts.CompilerOptions = { strict: true, noEmit: true, target: ts.ScriptTarget.ESNext, types: [] }
  const host = ts.createCompilerHost(options)
  const readSource = host.getSourceFile.bind(host)
  const libraryRoot = dirname(resolve(ts.getDefaultLibFilePath(options)))
  const library = (path: string) => dirname(resolve(path)) === libraryRoot && /^lib\..*\.d\.ts$/.test(basename(path))
  const readFile = host.readFile.bind(host)
  host.readFile = path => library(path) ? readFile(path) : undefined
  const source = ts.createSourceFile('compatibility.ts', text, ts.ScriptTarget.Latest, true)
  host.getSourceFile = (path, language, onError) => path === source.fileName ? source : library(path) ? readSource(path, language, onError) : undefined
  host.fileExists = path => path === source.fileName || library(path)
  let unsafe = false
  const visit = (node: ts.Node): void => { if (node.kind === ts.SyntaxKind.AnyKeyword) unsafe = true; ts.forEachChild(node, visit) }
  visit(source)
  if (unsafe) return false
  const program = ts.createProgram([source.fileName], options, host)
  if (program.getSyntacticDiagnostics(source).length || program.getSemanticDiagnostics(source).length) return false
  const checker = program.getTypeChecker()
  const types = source.statements.filter(ts.isTypeAliasDeclaration).map(node => checker.getTypeFromTypeNode(node.type))
  return aliases.every((_, i) => !(types[2 * i]!.flags & ts.TypeFlags.Any) && !(types[2 * i + 1]!.flags & ts.TypeFlags.Any) && checker.isTypeAssignableTo(types[2 * i]!, types[2 * i + 1]!))
}
