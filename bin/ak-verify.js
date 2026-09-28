#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileUrlToPath, spawnNodeChild } from '@agentskit/cross-platform'

const packageEntry = fileUrlToPath(import.meta.resolve('@agentskit/harness'))
const cli = join(dirname(packageEntry), 'cli.js')
const child = spawnNodeChild(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' })
child.once('error', (error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0)
})
