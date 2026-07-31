import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { relative, resolve } from 'node:path'

import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const stageDir = resolve(root, '.mcpb-build')
const runtimeDir = resolve(root, '.mcpb-runtime')
const outputDir = resolve(root, '.mcpb-output')
const manifestPath = resolve(root, 'mcpb', 'manifest.json')
const mcpbBin = resolve(root, 'node_modules', '.bin', 'mcpb')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const mode = process.argv[2]

const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env })

const copy = (source, destination) => cpSync(source, destination, { recursive: true })

const listFiles = (directory, prefix = '') =>
  readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      return entry.isDirectory() ? listFiles(path, rel) : [rel]
    })
    .sort()

const assertSafeInventory = (files) => {
  const forbidden = files.filter((file) =>
    /(^|\/)(?:\.env(?:\.|$)|\.git(?:\/|$)|coverage(?:\/|$)|tests?(?:\/|$))/u.test(file) ||
    /\.(?:pem|key|p12|log|map)$/u.test(file),
  )
  if (forbidden.length > 0) throw new Error(`MCPB contains forbidden files: ${forbidden.join(', ')}`)
}

const stage = async () => {
  if (!existsSync(resolve(root, 'dist', 'cli', 'program.js'))) {
    throw new Error('Build output is missing. Run pnpm build before staging MCPB.')
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.version !== packageJson.version) throw new Error('MCPB manifest version does not match package.json')

  rmSync(stageDir, { recursive: true, force: true })
  rmSync(runtimeDir, { recursive: true, force: true })
  mkdirSync(runtimeDir, { recursive: true })
  await build({
    entryPoints: [resolve(root, 'bin', 'ak-docs.js')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: resolve(runtimeDir, 'ak-docs.js'),
    sourcemap: false,
    packages: 'bundle',
    external: [...new Set(builtinModules.flatMap((name) => [name, `node:${name}`]))],
    logLevel: 'info',
  })

  mkdirSync(resolve(stageDir, 'server'), { recursive: true })
  copy(manifestPath, resolve(stageDir, 'manifest.json'))
  copy(resolve(root, 'mcpb', 'icon.png'), resolve(stageDir, 'icon.png'))
  copy(resolve(root, 'mcpb', '.mcpbignore'), resolve(stageDir, '.mcpbignore'))
  copy(resolve(runtimeDir, 'ak-docs.js'), resolve(stageDir, 'server', 'ak-docs.js'))
  copy(resolve(root, 'LICENSE'), resolve(stageDir, 'server', 'LICENSE'))
  writeFileSync(
    resolve(stageDir, 'server', 'package.json'),
    `${JSON.stringify({ name: '@agentskit/doc-bridge-mcpb-runtime', version: packageJson.version, private: true, type: 'module' }, null, 2)}\n`,
  )

  const files = listFiles(stageDir)
  assertSafeInventory(files)
  process.stdout.write(`${JSON.stringify({ stageDir, files: files.length }, null, 2)}\n`)
}

const validate = () => {
  if (!existsSync(resolve(stageDir, 'manifest.json'))) throw new Error('MCPB staging directory is missing')
  if (!existsSync(mcpbBin)) throw new Error('MCPB CLI is missing. Run pnpm install.')
  run(mcpbBin, ['validate', stageDir])
}

const pack = () => {
  validate()
  mkdirSync(outputDir, { recursive: true })
  const output = resolve(outputDir, `doc-bridge-${packageJson.version}.mcpb`)
  rmSync(output, { force: true })
  run(mcpbBin, ['pack', stageDir, output])
  const files = execFileSync('unzip', ['-Z1', output], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort()
  assertSafeInventory(files)
  run(mcpbBin, ['info', output])
  const sha256 = createHash('sha256').update(readFileSync(output)).digest('hex')
  process.stdout.write(`${JSON.stringify({ output: relative(root, output), sha256, files: files.length }, null, 2)}\n`)
}

if (mode === 'stage') await stage()
else if (mode === 'validate') validate()
else if (mode === 'pack') pack()
else throw new Error('Usage: node scripts/build-mcpb.mjs stage|validate|pack')
