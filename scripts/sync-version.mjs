import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version

writeFileSync(resolve(root, 'src/version.ts'), `export const PACKAGE_VERSION = '${version}'\n`)
