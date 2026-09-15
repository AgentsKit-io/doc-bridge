import {
  createEngine,
  parse,
  standardFilterMetadata,
  standardFilters,
  validateFilters,
  type ASTNode,
  type Expression,
  type FilterContext,
  type IfNode,
  type ForNode,
  type SetNode,
  type VariableNode,
} from 'knap'

/**
 * The template engine behind every Markdown rendering.
 *
 * Templates are knap templates: knap's parser produces the AST, knap's validators reject an
 * unknown filter or a malformed tag before anything is rendered, and knap's own filters run on
 * the values. What is not knap's is the walk over the AST. knap renders asynchronously — its
 * evaluator awaits at every node so filters and variable resolvers may be promises — and the
 * index pipeline that writes `llms.txt`, the conformance profile that re-renders it to check
 * freshness, and the gates that run both are synchronous. Making them asynchronous to render a
 * template would change the signature of every artifact writer for a property the templates do
 * not use: the application computes every variable before rendering, and none of them is a
 * promise.
 *
 * So the evaluator below is a synchronous port of knap's, node for node, including its
 * whitespace rules — a `for` body is trimmed and joined line by line, `-%}` marks a pending trim
 * that the next text node consumes — and a test renders every bundled template through knap's
 * real engine as well and asserts byte-identical output. The port exists to keep the pipeline
 * synchronous, not to diverge from knap; when the pipeline becomes asynchronous, delete it and
 * call `renderTemplateWithKnap`.
 */

export type TemplateVariables = Record<string, unknown>

export class TemplateError extends Error {
  constructor(
    message: string,
    readonly line?: number,
    readonly column?: number,
  ) {
    super(line === undefined ? message : `${message} (line ${line}, column ${column ?? 1})`)
    this.name = 'TemplateError'
  }
}

export type CompiledTemplate = {
  readonly name: string
  readonly source: string
  readonly ast: readonly ASTNode[]
}

/** Parse and validate a template. A template that references an unknown filter fails here, not mid-render. */
export const compileTemplate = (source: string, name = 'template'): CompiledTemplate => {
  const parsed = parse(source)
  const errors = [...parsed.errors, ...(parsed.errors.length ? [] : validateFilters(parsed.ast, standardFilterMetadata))]
  const first = errors[0]
  if (first) throw new TemplateError(`${name}: ${first.message}`, first.line, first.column)
  return { name, source, ast: parsed.ast }
}

type RenderState = {
  variables: TemplateVariables
  pendingTrimRight: boolean
  readonly name: string
}

// --- knap's value semantics, ported verbatim so `{{ x }}` prints what knap would print.

/*
 * What /[\t ]*\r?\n?$/ did, without the backtracking: a quantified class anchored at the end runs
 * quadratically on a template line of blanks, and a template is repository input.
 */
const trimTrailingWhitespace = (value: string): string => {
  let end = value.length
  if (end > 0 && value[end - 1] === '\n') {
    end -= 1
    if (end > 0 && value[end - 1] === '\r') end -= 1
  }
  while (end > 0 && (value[end - 1] === ' ' || value[end - 1] === '\t')) end -= 1
  return value.slice(0, end)
}
const trimLeadingWhitespace = (value: string): string => value.replace(/^[\t ]*\r?\n?/, '')

const isTruthy = (value: unknown): boolean => {
  if (value === undefined || value === null) return false
  if (value === '') return false
  if (value === 0) return false
  if (value === false) return false
  if (Array.isArray(value) && value.length === 0) return false
  return true
}

const valueToString = (value: unknown): string => {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value) && value.length === 1 && typeof value[0] !== 'object') return String(value[0])
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const ownProperty = (value: unknown, key: unknown): { exists: boolean; value: unknown } => {
  if (value === null || value === undefined || typeof value === 'function' || (typeof key !== 'string' && typeof key !== 'number')) {
    return { exists: false, value: undefined }
  }
  const descriptor = Object.getOwnPropertyDescriptor(Object(value), key)
  return descriptor && 'value' in descriptor ? { exists: true, value: descriptor.value } : { exists: false, value: undefined }
}

const getNestedValue = (object: unknown, keys: readonly string[]): unknown => {
  if (keys.length === 0 || !object) return undefined
  let value: unknown = object
  for (const key of keys) {
    if (value === undefined || value === null) return undefined
    if (key.includes('[') && key.includes(']')) {
      const match = key.match(/^([^[]*)\[([^\]]+)\]/)
      if (match) {
        const arrayKey = match[1] as string
        const indexText = match[2] as string
        const base = arrayKey ? ownProperty(value, arrayKey).value : value
        if (Array.isArray(base)) value = ownProperty(base, Number.parseInt(indexText, 10)).value
        else if (base && typeof base === 'object') value = ownProperty(base, indexText.replace(/^["']|["']$/g, '')).value
        else return undefined
        continue
      }
    }
    const wrapped = ownProperty(value, `{{${key}}}`).value
    value = wrapped !== undefined ? wrapped : ownProperty(value, key).value
  }
  return value
}

const resolveVariable = (name: string, variables: TemplateVariables, path: readonly string[] | undefined): unknown => {
  const trimmed = name.trim()
  const wrapped = ownProperty(variables, `{{${trimmed}}}`).value
  if (wrapped !== undefined) return wrapped
  const direct = ownProperty(variables, trimmed).value
  if (direct !== undefined) return direct
  if (trimmed.includes('.')) return getNestedValue(variables, path ?? trimmed.split('.'))
  return undefined
}

const evaluateContains = (left: unknown, right: unknown): boolean => {
  if (left === undefined || left === null) return false
  if (right === undefined || right === null) return false
  if (Array.isArray(left)) {
    return left.some((item) => (typeof item === 'string' && typeof right === 'string' ? item.toLowerCase() === right.toLowerCase() : item == right))
  }
  if (typeof left === 'string') {
    const search = typeof right === 'string' ? right : String(right)
    return left.toLowerCase().includes(search.toLowerCase())
  }
  return false
}

const isQuotedString = (value: string): boolean => /^["'][\s\S]*["']$/.test(value) || value.includes('":"') || value.includes("':'")

const unwrapGroup = (expression: Expression): Expression => {
  let current = expression
  while (current.type === 'group') current = current.expression
  return current
}

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'

const evaluateExpression = (expression: Expression, state: RenderState): unknown => {
  switch (expression.type) {
    case 'literal':
      return expression.value
    case 'identifier':
      return resolveVariable(expression.name, state.variables, expression.path)
    case 'group':
      return evaluateExpression(expression.expression, state)
    case 'member': {
      const object = evaluateExpression(expression.object, state)
      const property = evaluateExpression(expression.property, state)
      if (object === undefined || object === null) return undefined
      return ownProperty(object, property).value
    }
    case 'unary': {
      const argument = evaluateExpression(expression.argument, state)
      if (expression.operator === 'not') return !isTruthy(argument)
      throw new TemplateError(`${state.name}: unknown unary operator "${expression.operator}"`, expression.line, expression.column)
    }
    case 'binary': {
      if (expression.operator === '??') {
        const left = evaluateExpression(expression.left, state)
        return isTruthy(left) ? left : evaluateExpression(expression.right, state)
      }
      const left = evaluateExpression(expression.left, state)
      const right = evaluateExpression(expression.right, state)
      switch (expression.operator) {
        case '==':
          return left == right
        case '!=':
          return left != right
        case '>':
          return (left as number) > (right as number)
        case '<':
          return (left as number) < (right as number)
        case '>=':
          return (left as number) >= (right as number)
        case '<=':
          return (left as number) <= (right as number)
        case 'contains':
          return evaluateContains(left, right)
        case 'and':
          return isTruthy(left) && isTruthy(right)
        case 'or':
          return isTruthy(left) || isTruthy(right)
        default:
          throw new TemplateError(`${state.name}: unknown binary operator "${expression.operator}"`, expression.line, expression.column)
      }
    }
    case 'filter':
      return evaluateFilter(expression, state)
    default:
      throw new TemplateError(`${state.name}: unknown expression type "${(expression as { type: string }).type}"`)
  }
}

/**
 * A filter call, exactly as knap makes it: the value is serialised to a string, the arguments to
 * one parameter string, and knap's own filter function runs on both. A filter that returns a
 * promise cannot be honoured synchronously and is refused rather than rendered as "[object
 * Promise]"; none of the standard filters does.
 */
const evaluateFilter = (expression: Extract<Expression, { type: 'filter' }>, state: RenderState): unknown => {
  const value = evaluateExpression(expression.value, state)
  const args: unknown[] = expression.args.map((argument) => {
    const evaluated = evaluateExpression(argument, state)
    return evaluated === undefined && argument.type === 'identifier' ? argument.name : evaluated
  })
  const rawArguments = args.map((argument, index) => {
    const source = unwrapGroup(expression.args[index] as Expression)
    return source.type === 'literal' ? (source.unquotedValue ?? argument) : argument
  })
  const stringValue = valueToString(value)
  const paramString = args.length
    ? args
        .map((argument) => {
          if (typeof argument === 'string') {
            if (isQuotedString(argument)) return argument
            if (/\w\s*=>/.test(argument)) return argument
            if (/^[\w.:+\-*/]+$/.test(argument)) return argument
            return `"${argument}"`
          }
          return String(argument)
        })
        .join(',')
    : undefined
  const filter = Object.prototype.hasOwnProperty.call(standardFilters, expression.name) ? standardFilters[expression.name] : undefined
  if (!filter) return stringValue
  const context: FilterContext = {
    variables: state.variables,
    rawValue: value,
    rawArguments,
    allowRegex: true,
    reportWarning: () => undefined,
    checkValue: () => undefined,
    checkLength: () => undefined,
  }
  let result: unknown
  try {
    result = filter(stringValue, paramString, context)
  } catch (error) {
    throw new TemplateError(`${state.name}: filter "${expression.name}" failed: ${error instanceof Error ? error.message : String(error)}`, expression.line, expression.column)
  }
  if (isPromiseLike(result)) {
    throw new TemplateError(`${state.name}: filter "${expression.name}" is asynchronous and cannot be used in a synchronous rendering`, expression.line, expression.column)
  }
  return result
}

const appendNodeOutput = (output: string, nodeOutput: string, node: ASTNode, state: RenderState): string => {
  let next = output
  if ('trimLeft' in node && node.trimLeft && next.length > 0) next = trimTrailingWhitespace(next)
  if (state.pendingTrimRight && nodeOutput.length > 0) {
    state.pendingTrimRight = false
    return next + trimLeadingWhitespace(nodeOutput)
  }
  return next + nodeOutput
}

const renderNodes = (nodes: readonly ASTNode[], state: RenderState): string => {
  let output = ''
  for (const node of nodes) output = appendNodeOutput(output, renderNode(node, state), node, state)
  return output
}

const renderVariable = (node: VariableNode, state: RenderState): string => {
  const result = valueToString(evaluateExpression(node.expression, state))
  if (node.trimRight) state.pendingTrimRight = true
  return result
}

const renderIf = (node: IfNode, state: RenderState): string => {
  if (isTruthy(evaluateExpression(node.condition, state))) {
    const result = renderNodes(node.consequent, state)
    if (node.trimRight) state.pendingTrimRight = true
    return result
  }
  for (const branch of node.elseifs) {
    if (isTruthy(evaluateExpression(branch.condition, state))) {
      const result = renderNodes(branch.body, state)
      if (node.trimRight) state.pendingTrimRight = true
      return result
    }
  }
  if (node.alternate) {
    const result = renderNodes(node.alternate, state)
    if (node.trimRight) state.pendingTrimRight = true
    return result
  }
  if (node.trimRight) state.pendingTrimRight = true
  return ''
}

const renderFor = (node: ForNode, state: RenderState): string => {
  const iterable = evaluateExpression(node.iterable, state)
  if (iterable === undefined || iterable === null) {
    if (node.trimRight) state.pendingTrimRight = true
    return ''
  }
  let items: unknown = iterable
  if (!Array.isArray(items) && typeof items === 'string') {
    try {
      const parsed: unknown = JSON.parse(items)
      if (Array.isArray(parsed)) items = parsed
    } catch {
      // A string that is not a JSON array is reported below, as knap reports it.
    }
  }
  if (!Array.isArray(items)) {
    throw new TemplateError(`${state.name}: for loop iterable is not an array: ${typeof items}`, node.line, node.column)
  }
  const results: string[] = []
  const length = items.length
  for (let index = 0; index < length; index += 1) {
    const loop = { index: index + 1, index0: index, first: index === 0, last: index === length - 1, length }
    const loopState: RenderState = {
      ...state,
      variables: { ...state.variables, [node.iterator]: items[index], [`${node.iterator}_index`]: index, loop },
    }
    const result = trimLeadingWhitespace(renderNodes(node.body, loopState))
    if (result !== '') results.push(result)
  }
  if (node.trimRight) state.pendingTrimRight = true
  return results
    .map((result, index) => {
      if (index === results.length - 1) return trimTrailingWhitespace(result)
      return result.endsWith('\n') ? result : `${result}\n`
    })
    .join('')
}

const renderSet = (node: SetNode, state: RenderState): string => {
  state.variables[node.variable] = evaluateExpression(node.value, state)
  if (node.trimRight) state.pendingTrimRight = true
  return ''
}

const renderNode = (node: ASTNode, state: RenderState): string => {
  switch (node.type) {
    case 'text': {
      if (!state.pendingTrimRight) return node.value
      state.pendingTrimRight = false
      return trimLeadingWhitespace(node.value)
    }
    case 'variable':
      return renderVariable(node, state)
    case 'if':
      return renderIf(node, state)
    case 'for':
      return renderFor(node, state)
    case 'set':
      return renderSet(node, state)
    default:
      throw new TemplateError(`${state.name}: unknown node type "${(node as { type: string }).type}"`)
  }
}

/** Render a compiled template synchronously. The variables are copied: `{% set %}` never reaches the caller. */
export const renderCompiledTemplate = (template: CompiledTemplate, variables: TemplateVariables): string =>
  renderNodes(template.ast, { name: template.name, variables: { ...variables }, pendingTrimRight: false })

export const renderTemplate = (source: string, variables: TemplateVariables, name = 'template'): string =>
  renderCompiledTemplate(compileTemplate(source, name), variables)

/**
 * The same template through knap's own engine. Tests hold the synchronous evaluator to this;
 * a caller that can await may use it directly.
 */
export const renderTemplateWithKnap = async (source: string, variables: TemplateVariables): Promise<string> =>
  createEngine({ filters: standardFilters }).renderOrThrow(source, { variables })
