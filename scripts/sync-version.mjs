import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version

writeFileSync(resolve(root, 'src/version.ts'), `export const PACKAGE_VERSION = '${version}'\n`)

const actionPath = resolve(root, 'action.yml')
const action = readFileSync(actionPath, 'utf8')
const syncedAction = action.replace(
  /(package-version:\n(?:.*\n){2}\s+default: )'[^']*'/u,
  `$1'${version}'`,
)
if (syncedAction === action && !action.includes(`default: '${version}'`)) {
  throw new Error('Could not synchronize action.yml package-version default')
}
writeFileSync(actionPath, syncedAction)
