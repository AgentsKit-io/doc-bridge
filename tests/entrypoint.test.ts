import { expect, it } from 'vitest'
import { isEntrypointScript } from '../src/discovery/entrypoint.js'

it('recognizes a shebang line as an entrypoint script', () => {
  expect(isEntrypointScript('#!/usr/bin/env node\nexport function main() {}\n')).toBe(true)
})

it('recognizes an ESM guard comparing import.meta.url with process.argv[1] in either direction', () => {
  expect(isEntrypointScript('if (import.meta.url === `file://${process.argv[1]}`) main()\n')).toBe(true)
  expect(isEntrypointScript('if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()\n')).toBe(true)
  expect(isEntrypointScript('if (process.argv[1] == fileURLToPath(import.meta.url)) main()\n')).toBe(true)
  expect(isEntrypointScript('const isMain = pathToFileURL(process.argv[1]).href === import.meta.url\n')).toBe(true)
})

it('recognizes a CommonJS require.main guard in either order', () => {
  expect(isEntrypointScript('if (require.main === module) main()\n')).toBe(true)
  expect(isEntrypointScript('if (module === require.main) main()\n')).toBe(true)
})

it('does not treat a library that merely mentions import.meta.url or process.argv as an entrypoint', () => {
  expect(isEntrypointScript('export const here = new URL("./", import.meta.url)\n')).toBe(false)
  expect(isEntrypointScript('export const dir = dirname(fileURLToPath(import.meta.url))\n')).toBe(false)
  expect(isEntrypointScript('export const args = process.argv.slice(2)\nexport const first = process.argv[1]\n')).toBe(false)
})

it('does not treat a non-equality comparison or a split guard as an entrypoint', () => {
  expect(isEntrypointScript('if (import.meta.url !== `file://${process.argv[1]}`) throw new Error("import only")\n')).toBe(false)
  expect(isEntrypointScript('const url = import.meta.url;\nconst argv = process.argv[1];\nexport { url, argv }\n')).toBe(false)
  expect(isEntrypointScript('export function main() { return require.main }\n')).toBe(false)
})

it('does not treat a shebang that is not on the first line as an entrypoint', () => {
  expect(isEntrypointScript('export const x = 1\n#!/usr/bin/env node\n')).toBe(false)
})
