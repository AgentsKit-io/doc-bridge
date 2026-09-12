#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageEntry = fileURLToPath(import.meta.resolve('@agentskit/harness'))
const cli = join(dirname(packageEntry), 'cli.js')
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' })
child.once('error', (error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0)
})
