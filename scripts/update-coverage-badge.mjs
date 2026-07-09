#!/usr/bin/env node
/**
 * Writes .doc-bridge/coverage-badge.json from ak-docs doctor --write-badge.
 * CI can commit this file or paste output into README.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repo, 'bin', 'ak-docs.js')

execFileSync('node', [bin, 'index'], { cwd: repo, stdio: 'inherit' })
execFileSync('node', [bin, 'doctor', '--write-badge'], { cwd: repo, stdio: 'inherit' })

const badgePath = join(repo, '.doc-bridge', 'coverage-badge.json')
if (!existsSync(badgePath)) {
  throw new Error('doctor --write-badge did not create coverage-badge.json')
}

const badge = JSON.parse(readFileSync(badgePath, 'utf8'))
process.stdout.write(`${badge.markdown}\n`)