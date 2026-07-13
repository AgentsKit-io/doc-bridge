const stripComments = (source: string): string => {
  let out = ''
  let index = 0
  let quote: string | undefined
  while (index < source.length) {
    const char = source[index] ?? ''
    const next = source[index + 1] ?? ''
    if (quote) {
      out += char
      if (char === '\\') {
        out += next
        index += 2
        continue
      }
      if (char === quote) quote = undefined
      index += 1
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      out += char
      index += 1
      continue
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1
      out += '\n'
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1
      index += 2
      out += ' '
      continue
    }
    out += char
    index += 1
  }
  if (quote) throw new Error('Unterminated string in static JavaScript literal.')
  return out
}

class LiteralParser {
  private index = 0

  constructor(private readonly source: string) {}

  parseAt(index: number): unknown {
    this.index = index
    const value = this.value()
    this.space()
    return value
  }

  private space(): void {
    while (/\s/.test(this.source[this.index] ?? '')) this.index += 1
  }

  private value(): unknown {
    this.space()
    const char = this.source[this.index]
    if (char === '{') return this.object()
    if (char === '[') return this.array()
    if (char === '"' || char === "'") return this.string()
    const word = this.word()
    if (word === 'true') return true
    if (word === 'false') return false
    if (word === 'null') return null
    if (/^-?\d+(?:\.\d+)?$/.test(word)) return Number(word)
    throw new Error(`Unsupported dynamic sidebar expression near "${word || char || 'EOF'}".`)
  }

  private object(): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    this.index += 1
    this.space()
    while (this.source[this.index] !== '}') {
      const key = this.source[this.index] === '"' || this.source[this.index] === "'" ? this.string() : this.word()
      if (!key) throw new Error('Static sidebar object key is required.')
      this.space()
      if (this.source[this.index] !== ':') throw new Error(`Static sidebar key "${key}" requires a literal value.`)
      this.index += 1
      result[key] = this.value()
      this.space()
      if (this.source[this.index] === ',') {
        this.index += 1
        this.space()
        continue
      }
      if (this.source[this.index] !== '}') throw new Error('Expected comma or closing brace in static sidebar.')
    }
    this.index += 1
    return result
  }

  private array(): unknown[] {
    const result: unknown[] = []
    this.index += 1
    this.space()
    while (this.source[this.index] !== ']') {
      result.push(this.value())
      this.space()
      if (this.source[this.index] === ',') {
        this.index += 1
        this.space()
        continue
      }
      if (this.source[this.index] !== ']') throw new Error('Expected comma or closing bracket in static sidebar.')
    }
    this.index += 1
    return result
  }

  private string(): string {
    const quote = this.source[this.index] ?? ''
    this.index += 1
    let result = ''
    while (this.index < this.source.length) {
      const char = this.source[this.index] ?? ''
      if (char === quote) {
        this.index += 1
        return result
      }
      if (char === '\\') {
        const escaped = this.source[this.index + 1]
        if (escaped === undefined) break
        const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t' }
        result += escapes[escaped] ?? escaped
        this.index += 2
        continue
      }
      result += char
      this.index += 1
    }
    throw new Error('Unterminated string in static sidebar.')
  }

  private word(): string {
    this.space()
    const start = this.index
    while (/[A-Za-z0-9_$.-]/.test(this.source[this.index] ?? '')) this.index += 1
    return this.source.slice(start, this.index)
  }
}

const maskStrings = (source: string): string => {
  const chars = [...source]
  let quote: string | undefined
  let previousToken: string | undefined
  const regexPrefixKeywords = new Set([
    'await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'new',
    'of', 'return', 'throw', 'typeof', 'void', 'yield',
  ])
  const canStartRegex = (): boolean => previousToken === undefined
    || '=(:,[!&|?{};'.includes(previousToken)
    || previousToken === '=>'
    || regexPrefixKeywords.has(previousToken)
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? ''
    if (quote) {
      chars[index] = ' '
      if (char === '\\') {
        if (index + 1 < chars.length) chars[index + 1] = ' '
        index += 1
      } else if (char === quote) {
        quote = undefined
        previousToken = 'literal'
      }
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      chars[index] = ' '
      continue
    }
    if (char === '/' && canStartRegex()) {
      chars[index] = ' '
      let inClass = false
      for (index += 1; index < chars.length; index += 1) {
        const regexChar = chars[index] ?? ''
        chars[index] = ' '
        if (regexChar === '\\') {
          if (index + 1 < chars.length) chars[index + 1] = ' '
          index += 1
        } else if (regexChar === '[') {
          inClass = true
        } else if (regexChar === ']') {
          inClass = false
        } else if (regexChar === '/' && !inClass) {
          while (/[A-Za-z]/.test(chars[index + 1] ?? '')) {
            index += 1
            chars[index] = ' '
          }
          break
        }
      }
      previousToken = 'literal'
      continue
    }
    if (/[A-Za-z_$]/.test(char)) {
      const start = index
      while (/[A-Za-z0-9_$]/.test(chars[index + 1] ?? '')) index += 1
      previousToken = chars.slice(start, index + 1).join('')
      continue
    }
    if (char === '=' && chars[index + 1] === '>') {
      previousToken = '=>'
      index += 1
      continue
    }
    if (!/\s/.test(char)) previousToken = char
  }
  return chars.join('')
}

const nonSpace = (source: string, start: number): number => {
  let index = start
  while (/\s/.test(source[index] ?? '')) index += 1
  return index
}

const escapedRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const parseStaticJsObject = (source: string): unknown => {
  const clean = stripComments(source)
  const mask = maskStrings(clean)
  const parseBinding = (identifier: string): unknown => {
    const declaration = new RegExp(`\\b(?:const|let|var)\\s+${escapedRegex(identifier)}(?:\\s*:[^=;]+)?\\s*=`).exec(mask)
    if (!declaration) throw new Error(`Exported binding "${identifier}" must reference a static object declaration.`)
    const start = nonSpace(mask, declaration.index + declaration[0].length)
    if (mask[start] !== '{') throw new Error(`Exported binding "${identifier}" must be a static object literal.`)
    return new LiteralParser(clean).parseAt(start)
  }
  const commonJs = /\bmodule\.exports\s*=/.exec(mask)
  if (commonJs) {
    const start = nonSpace(mask, commonJs.index + commonJs[0].length)
    if (mask[start] === '{') return new LiteralParser(clean).parseAt(start)
    const identifier = /^[A-Za-z_$][\w$]*/.exec(mask.slice(start))?.[0]
    if (identifier) return parseBinding(identifier)
    throw new Error('module.exports must be assigned a static object literal or binding.')
  }

  const exported = /\bexport\s+default\b/.exec(mask)
  if (exported) {
    let start = nonSpace(mask, exported.index + exported[0].length)
    if (mask.slice(start).startsWith('defineConfig')) {
      start = nonSpace(mask, start + 'defineConfig'.length)
      if (mask[start] !== '(') throw new Error('defineConfig must be called with a static object literal.')
      start = nonSpace(mask, start + 1)
      if (mask[start] !== '{') throw new Error('defineConfig must be called with a static object literal.')
      return new LiteralParser(clean).parseAt(start)
    }
    if (mask[start] === '{') return new LiteralParser(clean).parseAt(start)

    const identifier = /^[A-Za-z_$][\w$]*/.exec(mask.slice(start))?.[0]
    if (identifier) return parseBinding(identifier)
  }
  throw new Error('Docusaurus sidebar must export a static object or assign one to a const.')
}
