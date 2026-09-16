import { extname } from 'node:path'
import * as ts from 'typescript'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { DEFAULT_SAFETY_EXCLUDES, type SafeWalkOptions } from '../safety/repository.js'

/**
 * What counts as a repository input, in one place.
 *
 * The discovery snapshot and the retrieval projection must walk the same files under the same
 * safety limits, or the index would claim to cover entities the snapshot does not have (or miss
 * ones it does). Sharing these definitions makes that agreement structural instead of a comment.
 */

export const SOURCE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'] as const
export const DOCUMENT_EXTENSIONS = ['.md', '.mdx'] as const
export const CONFIG_EXTENSIONS = ['.json', '.yaml', '.yml', '.js', '.ts'] as const
export const DEFAULT_MAX_FILES = 10_000

export const safeWalkOptions = (config: DocBridgeConfigV1 | undefined, overrides: { readonly maxFiles?: number; readonly maxBytes?: number } = {}): SafeWalkOptions => {
  const safety = config?.safety
  const maxBytes = overrides.maxBytes ?? safety?.maxBytes
  return {
    exclude: [...DEFAULT_SAFETY_EXCLUDES, ...(safety?.exclude ?? [])],
    maxFiles: overrides.maxFiles ?? safety?.maxFiles ?? DEFAULT_MAX_FILES,
    ...(maxBytes !== undefined ? { maxBytes } : {}),
    ...(safety?.maxTimeMs !== undefined ? { maxTimeMs: safety.maxTimeMs } : {}),
    ...(safety?.maxMemoryMb !== undefined ? { maxMemoryMb: safety.maxMemoryMb } : {}),
  }
}

/** Which audience a documentation file is written for, from its location. */
export const documentClassification = (path: string): string => {
  if (/(^|\/)docs\/for-agents(?:\/|$)/.test(path)) return 'agent'
  if (/(^|\/)docs-archive(?:\/|$)/.test(path)) return 'archive'
  if (/(^|\/)docs(?:\/|$)/.test(path)) return 'human'
  if (/(^|\/)(README|CONTRIBUTING|SECURITY|CHANGELOG)(?:\.|$)/i.test(path)) return 'project'
  return 'unclassified'
}

export const scriptKind = (path: string): ts.ScriptKind => {
  switch (extname(path)) {
    case '.js': return ts.ScriptKind.JS
    case '.jsx': return ts.ScriptKind.JSX
    case '.mjs': return ts.ScriptKind.JS
    case '.cjs': return ts.ScriptKind.JS
    case '.ts': return ts.ScriptKind.TS
    case '.tsx': return ts.ScriptKind.TSX
    case '.mts': return ts.ScriptKind.TS
    case '.cts': return ts.ScriptKind.TS
    default: return ts.ScriptKind.Unknown
  }
}

export const isExported = (node: ts.Node): boolean => {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

export type ExportedNamesOptions = {
  /**
   * Skip names the module only forwards (`export { x } from './y'`).
   *
   * A barrel file re-exports hundreds of names it does not define. Treating those as definitions
   * makes almost every symbol look like it has two owners, which turns an unambiguous reference
   * into an ambiguous one — so the callers that need "the module that defines this" ask for
   * declarations only.
   */
  readonly declaredOnly?: boolean
}

/** Every name a module exports, sorted. `*` stands for a star re-export. */
export const exportedNames = (sourceFile: ts.SourceFile, options: ExportedNamesOptions = {}): string[] => {
  const declaredOnly = options.declaredOnly ?? false
  const names = new Set<string>()
  const addDeclarationName = (node: ts.Declaration): void => {
    if (!isExported(node)) return
    const name = ts.getNameOfDeclaration(node)
    if (name && ts.isIdentifier(name)) names.add(name.text)
  }

  const visit = (node: ts.Node): void => {
    if (ts.isExportDeclaration(node)) {
      if (declaredOnly && node.moduleSpecifier) {
        // Forwarded from elsewhere: the other module is the one that defines it.
      } else if (!node.exportClause) names.add('*')
      else if (ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) names.add(element.name.text)
      }
    } else if (ts.isExportAssignment(node)) {
      names.add('default')
    } else if (
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node)
    ) {
      addDeclarationName(node)
    } else if (ts.isVariableStatement(node) && isExported(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return [...names].sort()
}
