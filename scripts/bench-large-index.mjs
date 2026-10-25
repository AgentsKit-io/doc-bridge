#!/usr/bin/env node
// Time `ak-docs index` on a generated large fixture and print artifact hashes.
// Usage: node scripts/bench-large-index.mjs <fixtureDir> [--cli bin/ak-docs.js] [--runs 3]
//          [--packages 100] [--docs 20] [--cpu-prof <dir>] [--save-index f | --seed-index f]
// Compare two builds by passing each build's bin/ak-docs.js as --cli; identical sha256 values
// for index.json and capabilities.json prove the output did not change.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { generateLargeFixture } from './generate-large-fixture.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback }
const dir = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))
if (!dir) { console.error('usage: bench-large-index.mjs <fixtureDir> [--cli path] [--runs n] [--packages n] [--docs n] [--cpu-prof dir]'); process.exit(2) }
const cli = resolve(flag('cli', 'bin/ak-docs.js'))
const runs = Number(flag('runs', '3'))
const prof = flag('cpu-prof')
const root = generateLargeFixture(dir, Number(flag('packages', '100')), Number(flag('docs', '20')))
const sha = (file) => createHash('sha256').update(readFileSync(join(root, file))).digest('hex')
const times = []
for (let i = 0; i < runs; i++) {
  rmSync(join(root, '.doc-bridge'), { recursive: true, force: true })
  const started = performance.now()
  const res = spawnSync(process.execPath, [...(prof ? ['--cpu-prof', `--cpu-prof-dir=${resolve(prof)}`] : []), cli, 'index'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  times.push(performance.now() - started)
  if (res.status !== 0) { console.error(res.stderr); process.exit(1) }
}
const sorted = [...times].sort((a, b) => a - b)
// generatedAt is a wall-clock stamp that `index` keeps while contentHash is unchanged. To compare
// two builds byte for byte, run the first with --save-index <file> and the second with
// --seed-index <file>: the seeded run reuses that stamp, so equal output means equal hashes.
const seed = flag('seed-index')
if (seed) {
  mkdirSync(join(root, '.doc-bridge'), { recursive: true })
  copyFileSync(resolve(seed), join(root, '.doc-bridge/index.json'))
  const res = spawnSync(process.execPath, [cli, 'index'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (res.status !== 0) { console.error(res.stderr); process.exit(1) }
}
const save = flag('save-index')
if (save) copyFileSync(join(root, '.doc-bridge/index.json'), resolve(save))
const hashes = { 'index.json': sha('.doc-bridge/index.json'), 'capabilities.json': sha('.doc-bridge/capabilities.json') }
console.log(JSON.stringify({ cli, runs, timesMs: times.map(Math.round), medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]), hashes }, null, 2))
