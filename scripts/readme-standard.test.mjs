import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { auditReadme } from './lib/readme-standard.mjs'

test('README Standard v1 evidence and freshness pass', () => {
  const config = JSON.parse(readFileSync('readme-standard-v1.json', 'utf8'))
  assert.deepEqual(auditReadme(process.cwd(), config).failures, [])
})

test('README verified handoff example executes', () => {
  const output = execFileSync(process.execPath, ['examples/verify-handoff.mjs'], { encoding: 'utf8' })
  assert.match(output, /handoff/i)
  assert.match(output, /Gate: red.*green/is)
})
