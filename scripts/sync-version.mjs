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

const mcpbManifestPath = resolve(root, 'mcpb', 'manifest.json')
const mcpbManifest = JSON.parse(readFileSync(mcpbManifestPath, 'utf8'))
writeFileSync(mcpbManifestPath, `${JSON.stringify({ ...mcpbManifest, version }, null, 2)}\n`)

const cursorManifestPath = resolve(root, '.cursor-plugin', 'plugin.json')
const cursorManifest = JSON.parse(readFileSync(cursorManifestPath, 'utf8'))
writeFileSync(cursorManifestPath, `${JSON.stringify({ ...cursorManifest, version }, null, 2)}\n`)

const claudeManifestPath = resolve(root, '.claude-plugin', 'plugin.json')
const claudeManifest = JSON.parse(readFileSync(claudeManifestPath, 'utf8'))
writeFileSync(claudeManifestPath, `${JSON.stringify({ ...claudeManifest, version }, null, 2)}\n`)

const copilotManifestPath = resolve(root, 'plugin.json')
const copilotManifest = JSON.parse(readFileSync(copilotManifestPath, 'utf8'))
writeFileSync(copilotManifestPath, `${JSON.stringify({ ...copilotManifest, version }, null, 2)}\n`)

const cursorMcpPath = resolve(root, 'mcp.json')
const cursorMcp = JSON.parse(readFileSync(cursorMcpPath, 'utf8'))
cursorMcp.mcpServers['ak-docs'].args = ['-y', `@agentskit/doc-bridge@${version}`, 'mcp']
writeFileSync(cursorMcpPath, `${JSON.stringify(cursorMcp, null, 2)}\n`)
writeFileSync(resolve(root, '.mcp.json'), `${JSON.stringify(cursorMcp, null, 2)}\n`)

const portableResolverPath = resolve(
  root,
  'skills',
  'doc-bridge-handoff',
  'scripts',
  'resolve-handoff.mjs',
)
const portableResolver = readFileSync(portableResolverPath, 'utf8')
const syncedPortableResolver = portableResolver.replace(
  /const VERSION = '[^']*'/u,
  `const VERSION = '${version}'`,
)
if (
  syncedPortableResolver === portableResolver &&
  !portableResolver.includes(`const VERSION = '${version}'`)
) {
  throw new Error('Could not synchronize portable resolver version')
}
writeFileSync(portableResolverPath, syncedPortableResolver)

// The README quotes the checked-in version (parity claim `checked-in-package-version`); keep it
// in step, then reseal the README Standard source hashes the edit just invalidated.
const readmePath = resolve(root, 'README.md')
const readme = readFileSync(readmePath, 'utf8')
const syncedReadme = readme.replace(/(checked-in package version is `)[^`]*(`)/u, `$1${version}$2`)
if (syncedReadme === readme && !readme.includes(`checked-in package version is \`${version}\``)) {
  throw new Error('Could not synchronize README checked-in package version')
}
writeFileSync(readmePath, syncedReadme)

const { computeSourceHash } = await import('./lib/readme-standard.mjs')
const standardPath = resolve(root, 'readme-standard-v1.json')
const standard = JSON.parse(readFileSync(standardPath, 'utf8'))
let resealed = false
for (const surface of standard.surfaces) {
  const hash = computeSourceHash(root, surface.freshness.sources)
  if (hash !== surface.freshness.sourceHash) {
    surface.freshness.sourceHash = hash
    resealed = true
  }
}
if (resealed) writeFileSync(standardPath, `${JSON.stringify(standard, null, 2)}\n`)
