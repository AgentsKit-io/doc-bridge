/**
 * Whether a JavaScript or TypeScript module is an entrypoint script: a file meant to be run,
 * not imported. Decided from the module's own source text, so it is deterministic and needs no
 * execution.
 *
 * A script exports a `main()` it calls itself, and so does a library that happens to name its
 * helper `main`. Prose that says "`main`" about a branch must not resolve to the script, so the
 * Markdown analyzer treats entrypoint scripts as citable only when a document also cites them.
 *
 * Recognized forms, each on one line (no statement or line break between the operands):
 * - a shebang on the first line: `#!/usr/bin/env node`
 * - an ESM main guard comparing `import.meta.url` with `process.argv[1]` using `==` or `===`,
 *   in either order, e.g. `import.meta.url === \`file://${process.argv[1]}\`` or
 *   `resolve(process.argv[1]) === fileURLToPath(import.meta.url)`
 * - a CommonJS main guard: `require.main === module` or `module === require.main`
 *
 * Guards are matched against code only: line and block comments and the contents of string and
 * template literals are blanked first, so a guard written in a comment or a string does not count.
 * Template interpolations (`${...}`) are code and are kept.
 *
 * Not recognized, so reported as a library: `process.argv.at(1)`, guards split across lines or
 * statements, `!==` comparisons, and a module that only mentions `import.meta.url` or
 * `process.argv` without comparing them.
 */
const SHEBANG = /^#!/
const ESM_GUARD = /\bimport\.meta\.url\b[^\n;]*(?<![!=<>])={2,3}[^\n;]*\bprocess\.argv\[1\]|\bprocess\.argv\[1\][^\n;]*(?<![!=<>])={2,3}[^\n;]*\bimport\.meta\.url/
const CJS_GUARD = /\brequire\.main\s*={2,3}\s*module\b|\bmodule\s*={2,3}\s*require\.main\b/

/** Scanner state: code (with the open-brace depth of an interpolation), a quoted string, or a template literal. */
type Frame = { kind: 'code'; braces: number } | { kind: 'string'; quote: string } | { kind: 'template' }

const blankOut = (text: string): string => text.replace(/[^\n]/g, ' ')

const REGEX_PRECEDERS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^'])
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof'])

/** Whether a `/` at this point of the emitted code starts a regular expression rather than a division. */
const regexMayStart = (code: string): boolean => {
  let j = code.length - 1
  while (j >= 0 && /\s/.test(code[j]!)) j--
  if (j < 0) return true
  const last = code[j]!
  if (REGEX_PRECEDERS.has(last)) return true
  if (!/[A-Za-z_$]/.test(last)) return false
  let k = j
  while (k >= 0 && /[A-Za-z0-9_$]/.test(code[k]!)) k--
  return REGEX_KEYWORDS.has(code.slice(k + 1, j + 1))
}

/** Index just past a regular expression literal starting at `start`, ending at its closing `/` or the line break. */
const regexEnd = (text: string, start: number): number => {
  let inClass = false
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '\n') return i
    if (ch === '\\') { i++; continue }
    if (ch === '[') inClass = true
    else if (ch === ']') inClass = false
    else if (ch === '/' && !inClass) return i + 1
  }
  return text.length
}

/**
 * The source with comments and string or template contents replaced by spaces, newlines kept so
 * that line-bounded patterns keep their meaning. A small scanner: it tracks string, template and
 * interpolation nesting, and ends an unterminated single-line string at the line break. A `/` where
 * an expression may start (after an operator, an opening bracket, a separator, a keyword such as
 * `return`, or at the start of the text) begins a regular expression literal, which is blanked up
 * to its closing `/` (outside a character class) or the end of the line, so quotes, backticks and
 * comment markers inside it cannot open a string, template or comment.
 */
export const codeOnly = (text: string): string => {
  const stack: Frame[] = [{ kind: 'code', braces: 0 }]
  let out = ''
  let i = 0
  while (i < text.length) {
    const top = stack[stack.length - 1]!
    const ch = text[i]!
    const next = text[i + 1] ?? ''
    if (top.kind === 'code') {
      if (ch === '/' && next === '/') {
        const end = text.indexOf('\n', i)
        const stop = end < 0 ? text.length : end
        out += blankOut(text.slice(i, stop))
        i = stop
      } else if (ch === '/' && next === '*') {
        const end = text.indexOf('*/', i + 2)
        const stop = end < 0 ? text.length : end + 2
        out += blankOut(text.slice(i, stop))
        i = stop
      } else if (ch === '/' && regexMayStart(out)) {
        const stop = regexEnd(text, i)
        out += '/' + blankOut(text.slice(i + 1, stop))
        i = stop
      } else if (ch === '"' || ch === "'") {
        stack.push({ kind: 'string', quote: ch })
        out += ch
        i++
      } else if (ch === '`') {
        stack.push({ kind: 'template' })
        out += ch
        i++
      } else if (ch === '{') {
        top.braces++
        out += ch
        i++
      } else if (ch === '}') {
        if (top.braces === 0 && stack.length > 1) stack.pop()
        else top.braces--
        out += ch
        i++
      } else {
        out += ch
        i++
      }
    } else if (top.kind === 'string') {
      if (ch === '\\') {
        out += blankOut(text.slice(i, i + 2))
        i += 2
      } else if (ch === top.quote) {
        stack.pop()
        out += ch
        i++
      } else if (ch === '\n') {
        stack.pop()
        out += ch
        i++
      } else {
        out += blankOut(ch)
        i++
      }
    } else if (ch === '\\') {
      out += blankOut(text.slice(i, i + 2))
      i += 2
    } else if (ch === '`') {
      stack.pop()
      out += ch
      i++
    } else if (ch === '$' && next === '{') {
      stack.push({ kind: 'code', braces: 0 })
      out += '${'
      i += 2
    } else {
      out += blankOut(ch)
      i++
    }
  }
  return out
}

export const isEntrypointScript = (text: string): boolean => {
  if (SHEBANG.test(text)) return true
  const code = codeOnly(text)
  return ESM_GUARD.test(code) || CJS_GUARD.test(code)
}
