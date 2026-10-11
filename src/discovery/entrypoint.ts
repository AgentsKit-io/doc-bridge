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
 * Not recognized, so reported as a library: `process.argv.at(1)`, guards split across lines or
 * statements, `!==` comparisons, and a module that only mentions `import.meta.url` or
 * `process.argv` without comparing them.
 */
const SHEBANG = /^#!/
const ESM_GUARD = /\bimport\.meta\.url\b[^\n;]*(?<![!=<>])={2,3}[^\n;]*\bprocess\.argv\[1\]|\bprocess\.argv\[1\][^\n;]*(?<![!=<>])={2,3}[^\n;]*\bimport\.meta\.url/
const CJS_GUARD = /\brequire\.main\s*={2,3}\s*module\b|\bmodule\s*={2,3}\s*require\.main\b/

export const isEntrypointScript = (text: string): boolean =>
  SHEBANG.test(text) || ESM_GUARD.test(text) || CJS_GUARD.test(text)
