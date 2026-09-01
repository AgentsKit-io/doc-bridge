#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'

import { scanStudyPublicationArtifact } from '../dist/index.js'

const filesFor = (input) => {
  const path = resolve(input)
  if (!existsSync(path)) throw new Error(`Privacy input does not exist: ${input}`)
  if (statSync(path).isFile()) return [path]
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => filesFor(resolve(path, entry.name)))
}

const inputs = process.argv.slice(2)
if (!inputs.length) {
  process.stderr.write('Usage: study-privacy-gate.mjs <file-or-directory> [...paths]\n')
  process.exit(2)
}

try {
  const files = [...new Set(inputs.flatMap(filesFor))].sort()
  const failures = []
  let checkedStrings = 0
  for (const file of files) {
    const raw = readFileSync(file, 'utf8')
    const value = extname(file) === '.json' ? JSON.parse(raw) : raw
    const result = scanStudyPublicationArtifact(value)
    checkedStrings += result.checkedStrings
    if (!result.ok) failures.push({ file, matches: result.forbiddenMatches })
  }
  const result = { status: failures.length ? 'failed' : 'passed', scannedFiles: files.length, checkedStrings, failures }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = failures.length ? 1 : 0
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}
