import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

test('Copilot plugin exposes the portable handoff skill through Agent Plugins v1', () => {
  const packageJson = readJson('../package.json')
  const manifest = readJson('../plugin.json')

  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
  assert.equal(manifest.name, 'doc-bridge')
  assert.equal(manifest.version, packageJson.version)
  assert.equal('skills' in manifest, false)
  assert.equal('extensions' in manifest, false)

  const skill = readFileSync(
    new URL('../skills/doc-bridge-handoff/SKILL.md', import.meta.url),
    'utf8',
  )
  assert.match(skill, /handoff\.resolve/)
  assert.match(skill, /editRoots/)
  assert.doesNotMatch(skill, /^metadata:/m)
})
