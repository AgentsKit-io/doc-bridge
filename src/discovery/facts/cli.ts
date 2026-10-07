import { relative, resolve } from 'node:path'
import * as ts from 'typescript'
import type { PackageInfo, ModuleInfo } from '../plugins/js-ts.js'
import type { ScanIO } from '../scan-io.js'
import type { DiscoverySnapshotV1, Evidence } from '../../schemas/knowledge.js'
import { surfaceFactEntityId, type SurfaceFact } from '../../storage/facts.js'
import { sha256NormalizedV1 } from '../../index-builder/content-hash.js'
import type { FactExtractor, FactExtractorInput } from './index.js'

export const CLI_ANALYZER_VERSION = '1.1.0'
const MAX_FACTS = 4096
const literal = (node: ts.Node | undefined): string | undefined => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
type Binding = { command: SurfaceFact; library: string }

/** Static declarations only: imported CLI bindings, never similarly named arbitrary methods. */
export const extractCliFacts = (root: string, packages: readonly PackageInfo[], modules: ReadonlyMap<string, ModuleInfo>, io: ScanIO, sourceFiles: FactExtractorInput['sourceFiles']) => {
  const facts = new Map<string, SurfaceFact>()
  const coverage: DiscoverySnapshotV1['coverage'] = []
  for (const pkg of packages) {
    const bin = pkg.manifest.bin
    const bins: [string, string][] = typeof bin === 'string' ? [[pkg.name?.split('/').pop() ?? '', bin]] : record(bin) ? Object.entries(bin).filter((entry): entry is [string, string] => typeof entry[1] === 'string') : []
    if (!bins.length) {
      if (bin !== undefined) coverage.push(...['cli-commands', 'cli-flags'].map(scope => ({ analyzer: 'js-ts:cli', analyzerVersion: CLI_ANALYZER_VERSION, scope, status: 'not-analyzed' as const, reason: 'Package bin declaration has no statically recognized command roots.' })))
      continue
    }
    const configPath = ts.findConfigFile(pkg.absPath, io.exists)
    const compilerOptions = configPath ? ts.readConfigFile(configPath, io.readText).config?.compilerOptions : undefined
    const sourceTarget = (path: string): string | undefined => {
      if (typeof compilerOptions?.outDir !== 'string' || typeof compilerOptions?.rootDir !== 'string') return undefined
      const outputRoot = resolve(pkg.absPath, compilerOptions.outDir)
      const tail = relative(outputRoot, path)
      if (tail.startsWith('..')) return undefined
      const source = resolve(pkg.absPath, compilerOptions.rootDir, tail.replace(/\.[cm]?js$/, '.ts'))
      return modules.has(source) ? source : undefined
    }
    let partial = record(bin) && bins.length !== Object.keys(bin).length
    const manifestText = io.readText(pkg.manifestPath)
    const manifestEvidence: Evidence = { source: 'configuration', path: relative(root, pkg.manifestPath).split('\\').join('/'), contentHash: sha256NormalizedV1(manifestText) }
    const add = (kind: 'cli-command' | 'cli-flag', ownerId: string, name: string, value: unknown, evidence: Evidence): SurfaceFact => {
      const fact: SurfaceFact = { kind, id: surfaceFactEntityId(kind, ownerId, name), ownerId, name, valueHash: sha256NormalizedV1(value), evidence: [evidence] }
      if (name.length > 256 || facts.size >= MAX_FACTS) { partial = true; return fact }
      const prior = facts.get(fact.id)
      if (prior && prior.valueHash !== fact.valueHash) partial = true
      else facts.set(fact.id, fact)
      return fact
    }
    for (const [binName, entry] of bins.sort(([a], [b]) => a.localeCompare(b))) {
      if (!/^[\w][\w.-]*$/.test(binName)) { partial = true; continue }
      const rootCommand = add('cli-command', pkg.id, binName, { name: binName, entry }, manifestEvidence)
      if (!facts.has(rootCommand.id)) continue
      const reachable = new Set<string>()
      const pending = [resolve(pkg.absPath, entry)]
      while (pending.length) {
        const path = pending.pop()!
        if (reachable.has(path)) continue
        const module = modules.get(path)
        if (!module) { partial = true; continue }
        reachable.add(path)
        for (const statement of sourceFiles.get(module.path)!.statements) {
          if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
          const specifier = literal(statement.moduleSpecifier)
          if (!specifier?.startsWith('.')) continue
          const target = ts.resolveModuleName(specifier, module.absPath, { allowJs: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext }, io.host).resolvedModule?.resolvedFileName
          if (target && modules.has(resolve(target))) pending.push(resolve(target))
          else {
            const mapped = sourceTarget(resolve(module.absPath, '..', specifier))
            if (mapped) pending.push(mapped)
            else partial = true
          }
        }
      }
      const implementation = new Set<string>()
      const usageFacts = new Map<string, SurfaceFact>()
      let recognized = false
      for (const module of [...modules.values()].filter(module => module.packageId === pkg.id).sort((a, b) => a.path.localeCompare(b.path))) {
        if (/(?:^|\/)(?:tests?|__tests__|fixtures)(?:\/|$)|\.(?:test|spec)\./.test(module.path)) continue
        const text = io.readText(module.absPath)
        if (!reachable.has(resolve(module.absPath)) && !text.includes('@')) continue
        const source = sourceFiles.get(module.path)!
        const evidence = (node: ts.Node): Evidence => ({ source: 'code', path: module.path, lineStart: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, lineEnd: source.getLineAndCharacterOfPosition(node.getEnd()).line + 1, contentHash: sha256NormalizedV1(text) })
        const staticBuilders = new Set<ts.Node>()
        const evaluated = new Set<ts.Node>()
        const imports = new Map<string, { library: string; member: string }>()
        const bindings = new Map<string, Binding>()
        for (const statement of source.statements) {
          if (!ts.isImportDeclaration(statement)) continue
          const library = literal(statement.moduleSpecifier)
          if (!library || !['commander', 'yargs', 'yargs/yargs', 'cac', 'node:util', 'util'].includes(library)) continue
          const clause = statement.importClause
          if (clause?.name) imports.set(clause.name.text, { library, member: 'default' })
          const names = clause?.namedBindings
          if (names && ts.isNamedImports(names)) for (const element of names.elements) imports.set(element.name.text, { library, member: element.propertyName?.text ?? element.name.text })
          if (names && ts.isNamespaceImport(names)) imports.set(names.name.text, { library, member: '*' })
        }
        const imported = (node: ts.Expression): { library: string; member: string } | undefined => {
          if (ts.isIdentifier(node)) return imports.get(node.text)
          if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
            const value = imports.get(node.expression.text)
            if (value?.member === '*') return { library: value.library, member: node.name.text }
          }
          return undefined
        }
        const staticValue = (node: ts.Expression | undefined): unknown => {
          if (!node) return undefined
          const string = literal(node)
          if (string !== undefined) return string
          if (ts.isNumericLiteral(node)) return Number(node.text)
          if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand) && node.operator === ts.SyntaxKind.MinusToken) return -Number(node.operand.text)
          if (ts.isArrayLiteralExpression(node) && node.elements.length <= 256) return node.elements.map(staticValue)
          if (node.kind === ts.SyntaxKind.TrueKeyword) return true
          if (node.kind === ts.SyntaxKind.FalseKeyword) return false
          if (node.kind === ts.SyntaxKind.NullKeyword) return null
          partial = true
          return undefined
        }
        const properties = (node: ts.Expression | undefined): Map<string, ts.Expression> => {
          const values = new Map<string, ts.Expression>()
          if (!node || !ts.isObjectLiteralExpression(node)) { partial = true; return values }
          for (const item of node.properties) {
            if (!ts.isPropertyAssignment(item)) { partial = true; continue }
            const name = ts.isIdentifier(item.name) || ts.isStringLiteral(item.name) ? item.name.text : undefined
            if (name === undefined) partial = true
            else values.set(name, item.initializer)
          }
          return values
        }
        const flag = (binding: Binding, declaration: string, node: ts.Node, options: Record<string, unknown> = {}) => {
          if (!facts.has(binding.command.id)) { partial = true; return }
          const aliases = [...new Set(declaration.match(/--?[A-Za-z][\w.-]*/g) ?? [])].sort()
          if (!aliases.length) { partial = true; return }
          for (const name of aliases) add('cli-flag', binding.command.id, name, { name, aliases, takesValue: /[<[]/.test(declaration), ...options }, evidence(node))
        }
        const command = (binding: Binding, declaration: string, node: ts.Node): Binding => {
          if (!facts.has(binding.command.id)) { partial = true; return binding }
          const name = declaration.split(/\s/)[0]!
          if (!/^[\w][\w.-]*$/.test(name)) { partial = true; return binding }
          const qualified = `${binding.command.name} ${name}`
          return { ...binding, command: add('cli-command', binding.command.id, qualified, { name: qualified, declaration }, evidence(node)) }
        }
        const beforeUsage = new Map(facts)
        facts.clear()
        facts.set(rootCommand.id, rootCommand)
        for (const statement of source.statements) {
          if (!ts.isVariableStatement(statement) || !statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) || !ts.getJSDocTags(statement).some(tag => tag.tagName.text === 'docbridgeCliUsage')) continue
          for (const declaration of statement.declarationList.declarations) {
            const usage = literal(declaration.initializer)
            if (usage === undefined) { partial = true; continue }
            const lines = usage.split(/\r?\n/)
            if (!lines.some(line => line.trim().startsWith(`${binName} `))) continue
            let globalFlags = false
            for (const line of lines) {
              if (line.trim() === 'Global flags:') { globalFlags = true; continue }
              if (globalFlags && line.trim().startsWith('-')) {
                recognized = true; partial = true
                for (const token of line.match(/(?<![\w-])(?:-[A-Za-z],\s*)?--?[A-Za-z][\w.-]*(?:[ =]+<[^>]+>)?/g) ?? []) flag({ command: rootCommand, library: 'usage' }, token, declaration)
                continue
              }
              if (line.trim() && !line.trim().startsWith('-')) globalFlags = false
              const tokens = line.trim().split(/\s+/)
              if (tokens[0] !== binName) continue
              recognized = true; partial = true // Help declares examples, never runtime completeness.
              if (tokens.slice(1).some(token => token === '|' || /^[A-Za-z][\w.-]*\|/.test(token))) continue
              const words: string[] = []
              for (const token of tokens.slice(1)) {
                if (!/^[A-Za-z][\w.-]*$/.test(token)) break
                words.push(token)
              }
              if (!words.length) continue
              let binding: Binding = { command: rootCommand, library: 'usage' }
              for (const word of words) binding = command(binding, word, declaration)
              for (const token of line.match(/(?<![\w-])(?:-[A-Za-z],\s*)?--?[A-Za-z][\w.-]*(?:[ =]+<[^>]+>)?/g) ?? []) flag(binding, token, declaration)
            }
          }
        }
        for (const [id, fact] of facts) if (id !== rootCommand.id) usageFacts.set(id, fact)
        facts.clear()
        for (const [id, fact] of beforeUsage) facts.set(id, fact)
        // Help explicitly names its bin; library declarations require literal entrypoint reachability.
        if (!reachable.has(resolve(module.absPath))) continue
        const beforeImplementation = new Map(facts)
        const rootBinding: Binding = { command: rootCommand, library: 'static' }
        const flagName = (value: string | undefined): boolean => !!value && /^--?[A-Za-z][\w.-]*$/.test(value)
        const argument = (node: ts.Node): boolean => /^(?:process\.)?argv(?:\b|\[)|^(?:arg|command|positional|positionals|flags)(?:\b|\[)/.test(node.getText(source))
        const commandInput = (node: ts.Node): boolean => {
          if (/^(?:positionals?|argv)\[0\]$/.test(node.getText(source))) return true
          if (!ts.isIdentifier(node) || node.text !== 'command') return false
          let scope: ts.Node = node
          while (scope.parent && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent
          // ponytail: rescan the enclosing scope; cache bindings if large CLI files need it.
          let proven = false
          const inspect = (child: ts.Node): void => {
            if (child !== scope && ts.isFunctionLike(child)) return
            if (ts.isVariableDeclaration(child) && child.initializer && /^(?:parseArgs\(|(?:process\.)?argv\[)/.test(child.initializer.getText(source))) {
              const names = ts.isIdentifier(child.name) ? [child.name.text] : ts.isObjectBindingPattern(child.name) ? child.name.elements.map(item => item.name.getText(source)) : []
              if (names.includes('command')) proven = true
            }
            ts.forEachChild(child, inspect)
          }
          inspect(scope)
          return proven
        }
        const observe = (node: ts.Node): void => {
          if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(node.operatorToken.kind)) {
            const value = literal(node.right), reverse = literal(node.left)
            const name = value ?? reverse
            const target = value === undefined ? node.right : node.left
            if (name && argument(target)) {
              if (flagName(name)) { flag(rootBinding, name!, node); recognized = true }
              else if (/^[A-Za-z][\w.-]*$/.test(name) && commandInput(target)) { command(rootBinding, name, node); recognized = true }
            }
          }
          if (ts.isSwitchStatement(node) && argument(node.expression) && (/^(?:process\.)?argv|^arg\b/.test(node.expression.getText(source)) || commandInput(node.expression))) for (const clause of node.caseBlock.clauses) {
            if (!ts.isCaseClause(clause)) continue
            const name = literal(clause.expression)
            if (flagName(name)) { flag(rootBinding, name!, clause); recognized = true }
            else if (name && /^[A-Za-z][\w.-]*$/.test(name)) { command(rootBinding, name, clause); recognized = true }
          }
          if (ts.isCallExpression(node)) {
            if (ts.isPropertyAccessExpression(node.expression) && argument(node.expression.expression) && ['includes', 'has'].includes(node.expression.name.text)) {
              const name = literal(node.arguments[0])
              if (flagName(name)) { flag(rootBinding, name!, node); recognized = true }
            }
            if (ts.isIdentifier(node.expression) && node.expression.text === 'optionValues' && node.arguments[0] && argument(node.arguments[0])) {
              const name = literal(node.arguments[1])
              if (flagName(name)) { flag(rootBinding, `${name} <value>`, node); recognized = true }
            }
          }
          if (ts.isVariableDeclaration(node) && /option|flag/i.test(node.name.getText(source)) && node.initializer) {
            const table = (value: ts.Node): void => {
              if (ts.isObjectLiteralExpression(value)) {
                const props = properties(value)
                const name = literal(props.get('flag')) ?? literal(props.get('name'))
                if (name && /^(?:--?)?[A-Za-z][\w.-]*$/.test(name)) {
                  const alias = literal(props.get('alias'))
                  const declaration = flagName(name) ? name : `--${name}`
                  flag(rootBinding, `${alias ? (flagName(alias) ? alias : `${alias.length === 1 ? '-' : '--'}${alias}`) + ', ' : ''}${declaration}`, value)
                  recognized = true
                } else for (const item of value.properties) if (ts.isPropertyAssignment(item)) table(item.initializer)
              } else if (ts.isArrayLiteralExpression(value)) for (const item of value.elements) table(item)
            }
            table(node.initializer)
          }
          ts.forEachChild(node, observe)
        }
        observe(source)
        const uncertainContext = (node: ts.Node): void => {
          for (let parent = node.parent; parent; parent = parent.parent) {
            if (ts.isIfStatement(parent) || ts.isConditionalExpression(parent) || ts.isSwitchStatement(parent) || ts.isIterationStatement(parent, false) || (ts.isFunctionLike(parent) && !staticBuilders.has(parent))) partial = true
          }
        }
        const evaluate = (node: ts.Expression): Binding | undefined => {
          if (ts.isParenthesizedExpression(node)) return evaluate(node.expression)
          if (ts.isIdentifier(node)) {
            const binding = bindings.get(node.text)
            if (binding) return binding
            const imp = imported(node)
            if (imp && (imp.library === 'commander' && imp.member === 'program' || imp.library.startsWith('yargs') && imp.member === 'default')) { recognized = true; uncertainContext(node); return { command: rootCommand, library: imp.library } }
            return undefined
          }
          if (ts.isPropertyAccessExpression(node)) {
            const imp = imported(node)
            if (imp?.library === 'commander' && imp.member === 'program') { recognized = true; uncertainContext(node); return { command: rootCommand, library: imp.library } }
            const parent = evaluate(node.expression)
            if (parent && node.name.text !== 'argv') partial = true
            return parent
          }
          if (ts.isNewExpression(node) || ts.isCallExpression(node)) {
            evaluated.add(node)
            const imp = imported(node.expression)
            if (imp) {
              if ((imp.library === 'commander' && imp.member === 'Command') || imp.library.startsWith('yargs') || imp.library === 'cac') { recognized = true; uncertainContext(node); return { command: rootCommand, library: imp.library } }
              if (['node:util', 'util'].includes(imp.library) && imp.member === 'parseArgs') {
                recognized = true; uncertainContext(node)
                const options = properties(node.arguments?.[0]).get('options')
                for (const [name, expression] of properties(options)) {
                  const values = properties(expression)
                  const type = literal(values.get('type'))
                  if (!['string', 'boolean'].includes(type ?? '')) partial = true
                  const short = literal(values.get('short'))
                  if (values.has('short') && short === undefined) partial = true
                  const aliases = [`--${name}`, ...(short ? [`-${short}`] : [])].sort()
                  const options = { aliases, takesValue: type === 'string', default: staticValue(values.get('default')), multiple: staticValue(values.get('multiple')) }
                  for (const spelling of aliases) add('cli-flag', rootCommand.id, spelling, { name: spelling, ...options }, evidence(expression))
                }
              }
              return undefined
            }
            if (ts.isPropertyAccessExpression(node.expression)) {
              const parent = evaluate(node.expression.expression)
              if (!parent) {
                if (['command', 'option', 'options', 'requiredOption'].includes(node.expression.name.text)) partial = true
                return undefined
              }
              uncertainContext(node)
              if (!facts.has(parent.command.id)) { partial = true; return parent }
              const method = node.expression.name.text
              const args = node.arguments ?? []
              if (method === 'command') {
                const name = literal(args[0])
                if (name === undefined) { partial = true; return parent }
                const child = command(parent, name, node)
                if (parent.library.startsWith('yargs') && args[2]) {
                  const builder = args[2]
                  if (ts.isArrowFunction(builder) || ts.isFunctionExpression(builder)) {
                    const parameter = builder.parameters[0]?.name
                    if (parameter && ts.isIdentifier(parameter)) {
                      staticBuilders.add(builder)
                      const old = bindings.get(parameter.text); bindings.set(parameter.text, child)
                      if (ts.isBlock(builder.body)) ts.forEachChild(builder.body, visit)
                      else evaluate(builder.body)
                      if (old) bindings.set(parameter.text, old); else bindings.delete(parameter.text)
                    } else partial = true
                  } else partial = true
                }
                return parent.library.startsWith('yargs') ? parent : child
              }
              if (['option', 'requiredOption'].includes(method)) {
                const declaration = literal(args[0])
                if (declaration === undefined) partial = true
                else if (parent.library.startsWith('yargs')) {
                  const values = properties(args[1])
                  const alias = staticValue(values.get('alias'))
                  const type = literal(values.get('type'))
                  if (type !== 'string' && type !== 'boolean') partial = true
                  const name = `--${declaration}`
                  const spellings = typeof alias === 'string' ? [alias] : Array.isArray(alias) && alias.every(value => typeof value === 'string') ? alias as string[] : []
                  if (alias !== undefined && !spellings.length) partial = true
                  const aliases = [...new Set([name, ...spellings.map(value => `${value.length === 1 ? '-' : '--'}${value}`)])].sort()
                  const options = { aliases, takesValue: type === 'string', required: staticValue(values.get('demandOption')), default: staticValue(values.get('default')) }
                  for (const spelling of aliases) add('cli-flag', parent.command.id, spelling, { name: spelling, ...options }, evidence(node))
                } else if (parent.library === 'cac') {
                  const options = args[2] ? properties(args[2]) : new Map<string, ts.Expression>()
                  flag(parent, declaration, node, { default: staticValue(options.get('default')) })
                } else flag(parent, declaration, node, { required: method === 'requiredOption', default: staticValue(args[2]) })
              } else if (!['name', 'description', 'action', 'parse', 'parseAsync', 'demandCommand', 'strict', 'argv', 'example', 'epilog'].includes(method)) partial = true
              return parent
            }
          }
          return undefined
        }
        const visit = (node: ts.Node): void => {
          if (ts.isVariableDeclaration(node) && node.initializer) {
            const value = evaluate(node.initializer)
            if (value && ts.isIdentifier(node.name)) bindings.set(node.name.text, value)
            return
          } else if (ts.isExpressionStatement(node)) { evaluate(node.expression); return }
          ts.forEachChild(node, visit)
        }
        visit(source)
        const inspectUnvisited = (node: ts.Node): void => {
          if (ts.isCallExpression(node) && !evaluated.has(node) && (imported(node.expression) || ts.isPropertyAccessExpression(node.expression) && ['command', 'option', 'options', 'requiredOption'].includes(node.expression.name.text))) partial = true
          ts.forEachChild(node, inspectUnvisited)
        }
        inspectUnvisited(source)
        for (const [id, fact] of facts) if (beforeImplementation.get(id) !== fact) implementation.add(id)
        // An entrypoint we cannot associate with static declarations is explicitly incomplete.
        if (resolve(pkg.absPath, entry) === resolve(module.absPath) && !imports.size) partial = true
      }
      if (implementation.size) {
        const usageNames = new Set([...usageFacts.values()].map(fact => `${fact.kind}:${fact.name}`))
        const implementationNames = new Set([...implementation].map(id => facts.get(id)!).filter(Boolean).map(fact => `${fact.kind}:${fact.name}`))
        const divergent = [...new Set([...usageNames, ...implementationNames])].filter(name => usageNames.has(name) !== implementationNames.has(name)).sort()
        if (usageFacts.size && divergent.length) coverage.push({ analyzer: 'js-ts:cli', analyzerVersion: CLI_ANALYZER_VERSION, scope: 'cli-usage-drift', status: 'partial', reason: `Usage text drift: ${divergent.slice(0, 64).join(', ')}`.slice(0, 1024), evidence: [manifestEvidence] })
      } else for (const [id, fact] of usageFacts) {
        if (facts.size >= MAX_FACTS) { partial = true; break }
        facts.set(id, fact)
      }
      if (!recognized) partial = true
    }
    coverage.push(...(['cli-commands', 'cli-flags'] as const).map(scope => ({ analyzer: 'js-ts:cli', analyzerVersion: CLI_ANALYZER_VERSION, scope, status: partial ? 'partial' as const : 'complete' as const, ...(partial ? { reason: 'CLI declarations contain dynamic, unsupported, conflicting or unrecognized registration; absence does not prove removal.' } : {}), evidence: [manifestEvidence] })))
  }
  if (!coverage.length) coverage.push(...['cli-commands', 'cli-flags'].map(scope => ({ analyzer: 'js-ts:cli', analyzerVersion: CLI_ANALYZER_VERSION, scope, status: packages.length ? 'not-applicable' as const : 'not-analyzed' as const, reason: packages.length ? 'No package declares CLI bin entries.' : 'No package manifest establishes CLI command roots.' })))
  return { facts: [...facts.values()].sort((a, b) => a.id.localeCompare(b.id)), coverage }
}

export const cliFactExtractor: FactExtractor = { id: 'js-ts:cli', version: CLI_ANALYZER_VERSION, kinds: ['cli-command', 'cli-flag'], inputScope: 'global', inputExtensions: ['.json'], extract: ({ root, packages, modules, io, sourceFiles }) => extractCliFacts(root, packages, modules, io, sourceFiles) }
