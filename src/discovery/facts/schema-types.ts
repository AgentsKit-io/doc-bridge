import * as ts from 'typescript'

/** Bounded schema syntax to declared output types; never evaluate an initializer. */
export const schemaOutputTypes = (node: ts.TypeAliasDeclaration | ts.InterfaceDeclaration, source: ts.SourceFile, resolve?: (source: ts.SourceFile, name: string) => ts.Expression | undefined, schemaOutputs = false): string | undefined => {
  const zNames = new Set(source.statements.filter(ts.isImportDeclaration).flatMap(item => ts.isStringLiteral(item.moduleSpecifier) && item.moduleSpecifier.text === 'zod' && !item.importClause?.isTypeOnly && item.importClause?.namedBindings && ts.isNamedImports(item.importClause.namedBindings)
    ? item.importClause.namedBindings.elements.filter(binding => !binding.isTypeOnly && (binding.propertyName ?? binding.name).text === 'z').map(binding => binding.name.text) : []))
  const importedNames = source.statements.filter(ts.isImportDeclaration).flatMap(item => item.importClause?.namedBindings && ts.isNamedImports(item.importClause.namedBindings) ? item.importClause.namedBindings.elements.map(binding => binding.name.text) : item.importClause?.name ? [item.importClause.name.text] : [])
  if ([...zNames].some(name => importedNames.filter(value => value === name).length !== 1 || source.statements.some(item => (ts.isTypeAliasDeclaration(item) || ts.isInterfaceDeclaration(item) || ts.isClassDeclaration(item)) && item.name?.text === name))) return undefined
  const constants = new Map<string, ts.Expression>()
  for (const statement of source.statements) if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const) for (const item of statement.declarationList.declarations) {
    if (!ts.isIdentifier(item.name) || !item.initializer || item.type) continue
    if (constants.has(item.name.text) || zNames.has(item.name.text)) return undefined
    constants.set(item.name.text, item.initializer)
  }
  let steps = 0
  type Shape = { text: string; optional: boolean; properties?: Map<string, Shape> }
  const parse = (node: ts.Expression, seen = new Set<string>(), depth = 0, argumentsByName = new Map<string, ts.Expression>()): Shape => {
    if (++steps > 4096 || depth > 32) throw new Error('BOUND')
    if (ts.isParenthesizedExpression(node)) return parse(node.expression, seen, depth + 1, argumentsByName)
    const owner = node.getSourceFile()
    const local = owner === source ? constants : new Map(owner.statements.filter(ts.isVariableStatement).filter(item => item.declarationList.flags & ts.NodeFlags.Const).flatMap(item => item.declarationList.declarations.filter(value => ts.isIdentifier(value.name) && value.initializer && !value.type).map(value => [value.name.getText(owner), value.initializer!] as const)))
    const ownerZNames = new Set(owner.statements.filter(ts.isImportDeclaration).flatMap(item => ts.isStringLiteral(item.moduleSpecifier) && item.moduleSpecifier.text === 'zod' && !item.importClause?.isTypeOnly && item.importClause?.namedBindings && ts.isNamedImports(item.importClause.namedBindings) ? item.importClause.namedBindings.elements.filter(binding => !binding.isTypeOnly && (binding.propertyName ?? binding.name).text === 'z').map(binding => binding.name.text) : []))
    if ([...ownerZNames].some(name => local.has(name))) throw new Error('BINDING')
    if (ts.isIdentifier(node)) {
      const key = owner.fileName + ':' + node.text
      const value = argumentsByName.get(node.text) ?? local.get(node.text) ?? resolve?.(owner, node.text)
      if (seen.has(key) || !value) throw new Error('BINDING')
      return parse(value, new Set([...seen, key]), depth + 1, argumentsByName.has(node.text) ? argumentsByName : new Map())
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const value = local.get(node.expression.text)
      if (!value || !ts.isArrowFunction(value) || ts.isBlock(value.body) || value.type || value.typeParameters?.some(parameter => parameter.default) || node.typeArguments?.length || value.parameters.length !== node.arguments.length || value.parameters.some(parameter => !ts.isIdentifier(parameter.name) || parameter.dotDotDotToken || parameter.initializer || local.has(parameter.name.text) || ownerZNames.has(parameter.name.text) || ['AbortSignal', 'Uint8Array'].includes(parameter.name.text))) throw new Error('HELPER')
      const bindings = new Map(argumentsByName)
      value.parameters.forEach((parameter, i) => bindings.set((parameter.name as ts.Identifier).text, node.arguments[i]!))
      return parse(value.body, seen, depth + 1, bindings)
    }
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.argumentExpression) {
      let value = local.get(node.expression.text)
      if (value && ts.isAsExpression(value) && value.type.getText() === 'const') value = value.expression
      let key = node.argumentExpression
      if (ts.isIdentifier(key)) key = argumentsByName.get(key.text) ?? local.get(key.text) ?? key
      if (!value || !ts.isObjectLiteralExpression(value) || !ts.isStringLiteral(key)) throw new Error('LOOKUP')
      const properties = value.properties.filter(property => ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === key.text)
      if (properties.length !== 1 || value.properties.some(ts.isSpreadAssignment)) throw new Error('LOOKUP')
      return parse((properties[0] as ts.PropertyAssignment).initializer, seen, depth + 1, new Map())
    }
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) || node.typeArguments?.length) throw new Error('SCHEMA')
    const receiver = node.expression.expression, method = node.expression.name.text, args = node.arguments
    const child = (expression: ts.Expression) => parse(expression, seen, depth + 1, argumentsByName)
    const object = (node: ts.ObjectLiteralExpression, inherited = new Map<string, Shape>(), level = depth, bindings = argumentsByName): Shape => {
      if (++steps > 4096 || level > 32) throw new Error('BOUND')
      const properties = new Map(inherited), names = new Set<string>()
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          let value = property.expression
          const visited = new Set<string>()
          while (ts.isIdentifier(value)) {
            if (visited.size >= 8 || visited.has(value.text)) throw new Error('SPREAD')
            visited.add(value.text)
            const next = local.get(value.text) ?? resolve?.(value.getSourceFile(), value.text)
            if (!next) throw new Error('SPREAD')
            value = next
          }
          if (!ts.isObjectLiteralExpression(value)) throw new Error('SPREAD')
          const spread = object(value, new Map(), level + 1, new Map()).properties!
          for (const [name, shape] of spread) properties.set(name, shape)
          continue
        }
        if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) || names.has(property.name.text)) throw new Error('PROPERTY')
        names.add(property.name.text)
        properties.set(property.name.text, parse(property.initializer, seen, depth + 1, bindings))
      }
      return { text: `{ ${[...properties].map(([name, shape]) => `${JSON.stringify(name)}${shape.optional ? '?' : ''}: ${shape.text}`).join('; ')} }`, optional: false, properties }
    }
    if (ts.isIdentifier(receiver) && ownerZNames.has(receiver.text)) {
      if (['string', 'number', 'boolean', 'unknown', 'never'].includes(method) && !args.length) return { text: method, optional: false }
      if (method === 'object' && args.length === 1 && ts.isObjectLiteralExpression(args[0]!)) return object(args[0]!)
      if (method === 'array' && args.length === 1) return { text: `(${child(args[0]!).text})[]`, optional: false }
      if ((method === 'union' && args.length === 1 || method === 'discriminatedUnion' && args.length === 2 && ts.isStringLiteral(args[0]!)) && ts.isArrayLiteralExpression(args[method === 'union' ? 0 : 1]!)) {
        const values = (args[method === 'union' ? 0 : 1] as ts.ArrayLiteralExpression).elements.map(item => child(item as ts.Expression))
        return { text: values.map(value => `(${value.text})`).join(' | '), optional: values.some(value => value.optional) }
      }
      const literal = (value: ts.Expression, depth = 0, bindings = argumentsByName): ts.Expression => {
        if (depth > 8) throw new Error('LITERAL')
        if (ts.isAsExpression(value) && ts.isTypeReferenceNode(value.type) && value.type.typeName.getText() === 'const') return literal(value.expression, depth + 1, bindings)
        if (ts.isIdentifier(value) && bindings.has(value.text)) return literal(bindings.get(value.text)!, depth + 1, bindings)
        if (ts.isIdentifier(value) && local.has(value.text)) return literal(local.get(value.text)!, depth + 1, new Map())
        return value
      }
      const first = args[0] && literal(args[0])
      if (method === 'literal' && (args.length === 1 || args.length === 2) && first && (ts.isStringLiteral(first) || ts.isNumericLiteral(first) || first.kind === ts.SyntaxKind.TrueKeyword || first.kind === ts.SyntaxKind.FalseKeyword || first.kind === ts.SyntaxKind.NullKeyword)) return { text: first.getText(), optional: false }
      if (method === 'enum' && (args.length === 1 || args.length === 2) && first && ts.isArrayLiteralExpression(first) && first.elements.length && first.elements.every(item => ts.isStringLiteral(literal(item as ts.Expression)))) return { text: first.elements.map(item => literal(item as ts.Expression).getText()).join(' | '), optional: false }
      if (method === 'instanceof' && args.length === 1 && ts.isIdentifier(args[0]!) && ['AbortSignal', 'Uint8Array'].includes(args[0]!.text)) {
        const name = args[0]!.text
        const shadowed = owner.statements.some(item =>
          ts.isImportDeclaration(item) && (item.importClause?.name?.text === name || item.importClause?.namedBindings && (ts.isNamespaceImport(item.importClause.namedBindings) ? item.importClause.namedBindings.name.text === name : item.importClause.namedBindings.elements.some(binding => binding.name.text === name))) ||
          ts.isVariableStatement(item) && item.declarationList.declarations.some(value => ts.isIdentifier(value.name) && value.name.text === name) ||
          (ts.isClassDeclaration(item) || ts.isTypeAliasDeclaration(item) || ts.isInterfaceDeclaration(item)) && item.name?.text === name)
        if (!shadowed) return { text: `globalThis.${name}`, optional: false }
      }
      if ((method === 'record' || method === 'partialRecord') && args.length === 2) return { text: `{ [key in ${child(args[0]!).text}]${method === 'partialRecord' ? '?' : ''}: ${child(args[1]!).text} }`, optional: false }
      throw new Error('SCHEMA')
    }
    const shape = child(receiver)
    if (method === 'optional' && !args.length) return { text: `(${shape.text}) | undefined`, optional: true }
    if (method === 'nullable' && !args.length) return { text: `(${shape.text}) | null`, optional: shape.optional }
    if (method === 'strict' && !args.length && shape.properties) return shape
    if (method === 'extend' && args.length === 1 && ts.isObjectLiteralExpression(args[0]!) && shape.properties) return object(args[0]!, shape.properties)
    // These checks preserve the output type; predicates and transforms are unsupported.
    if (['min', 'max', 'int', 'positive', 'nonnegative', 'regex', 'url', 'datetime'].includes(method)) return shape
    if (method === 'refine' || method === 'superRefine') {
      let predicate = false
      const visit = (item: ts.Node): void => { if (ts.isTypePredicateNode(item)) predicate = true; ts.forEachChild(item, visit) }
      args.forEach(visit)
      if (!predicate && args[0] && (ts.isArrowFunction(args[0]) || ts.isFunctionExpression(args[0]))) return shape
    }
    throw new Error('METHOD')
  }
  try {
    const replacements: { start: number; end: number; text: string }[] = []
    const visit = (item: ts.Node): void => {
      if (ts.isTypeReferenceNode(item) && ts.isQualifiedName(item.typeName) && ts.isIdentifier(item.typeName.left) && zNames.has(item.typeName.left.text) && item.typeName.right.text === 'infer' && item.typeArguments?.length === 1) {
        if (!schemaOutputs) throw new Error('SCHEMA_CODEC')
        const query = item.typeArguments[0]!
        if (!ts.isTypeQueryNode(query) || !ts.isIdentifier(query.exprName) || !constants.has(query.exprName.text)) throw new Error('QUERY')
        const shape = parse(constants.get(query.exprName.text)!, new Set([query.exprName.text]))
        replacements.push({ start: item.getStart(source) - node.getStart(source), end: item.end - node.getStart(source), text: `(${shape.text})` })
        return
      }
      ts.forEachChild(item, visit)
    }
    visit(node)
    let text = node.getText(source)
    for (const item of replacements.sort((a, b) => b.start - a.start)) text = text.slice(0, item.start) + item.text + text.slice(item.end)
    return text.replace(/^(?:export\s+)?(?:declare\s+)?/, '')
  } catch { return undefined }
}
