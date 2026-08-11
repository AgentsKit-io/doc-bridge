import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const skillUrl = new URL('../skills/doc-bridge-handoff/SKILL.md', import.meta.url)
const resolverUrl = new URL('../skills/doc-bridge-handoff/scripts/resolve-handoff.mjs', import.meta.url)

const makeFakeCli = () => {
  const dir = mkdtempSync(join(tmpdir(), 'doc-bridge-skill-'))
  const path = join(dir, 'fake-cli.mjs')
  writeFileSync(
    path,
    `#!/usr/bin/env node
const id = process.argv[4]
if (id === 'unknown') {
  process.stderr.write('Unknown package/ownership id "unknown"\\n')
  process.exit(1)
}
const startHere = id === 'malformed' ? '../private.md' : 'docs/for-agents/packages/payments.md'
process.stdout.write(JSON.stringify({
  type: 'agent-handoff',
  schemaVersion: 1,
  target: { type: 'package', id, path: 'packages/payments' },
  startHere,
  readBeforeEditing: [startHere, 'AGENTS.md'],
  editRoots: ['packages/payments'],
  checks: ['npm test -- payments']
}))
`,
  )
  chmodSync(path, 0o755)
  return path
}

test('portable skill uses the open Agent Skills shape and declares bounded authority', () => {
  const skill = readFileSync(skillUrl, 'utf8')
  assert.match(skill, /^---\nname: doc-bridge-handoff\ndescription: .+\n/)
  assert.match(skill, /version: 1\.0\.0/)
  assert.match(skill, /license: MIT/)
  assert.match(skill, /platforms:\n  - darwin\n  - linux\n  - windows/)
  assert.match(skill, /OpenClaw-compatible clients, Hermes Agent, Pi, Cursor/)
  assert.match(skill, /read-only/)
  assert.match(skill, /If resolution fails[^\n]+stop/)
  assert.doesNotMatch(skill, /api[_ -]?key|access[_ -]?token|force-push|--no-verify/i)
})

test('portable resolver returns a complete handoff and fails closed for an unknown target', () => {
  const env = { ...process.env, DOC_BRIDGE_BIN: makeFakeCli() }
  const ok = spawnSync(process.execPath, [resolverUrl.pathname, 'payments'], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  assert.equal(ok.status, 0, ok.stderr)
  const handoff = JSON.parse(ok.stdout)
  assert.equal(handoff.target.id, 'payments')
  assert.deepEqual(handoff.editRoots, ['packages/payments'])
  assert.deepEqual(handoff.checks, ['npm test -- payments'])

  const unknown = spawnSync(process.execPath, [resolverUrl.pathname, 'unknown'], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /handoff blocked: Unknown package\/ownership id/)
  assert.equal(unknown.stdout, '')

  const malformed = spawnSync(process.execPath, [resolverUrl.pathname, 'malformed'], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  assert.equal(malformed.status, 1)
  assert.match(malformed.stderr, /startHere is missing or unsafe/)
  assert.equal(malformed.stdout, '')
})

test('portable compatibility fixture contains no private implementation evidence', () => {
  const config = readFileSync(
    new URL('../skills/doc-bridge-handoff/fixtures/synthetic-repo/doc-bridge.config.json', import.meta.url),
    'utf8',
  )
  assert.match(config, /Synthetic package used only to verify/)
  assert.doesNotMatch(config, /AKOS|customer|private|credential/i)
})
