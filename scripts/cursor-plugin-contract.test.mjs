import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

test('Cursor plugin exposes the pinned Doc Bridge MCP without credentials', () => {
  const packageJson = readJson('../package.json')
  const manifest = readJson('../.cursor-plugin/plugin.json')
  const mcp = readJson('../mcp.json')
  const server = mcp.mcpServers['ak-docs']

  assert.equal(manifest.name, 'doc-bridge')
  assert.equal(manifest.version, packageJson.version)
  assert.equal(server.command, 'npx')
  assert.deepEqual(server.args, ['-y', `@agentskit/doc-bridge@${packageJson.version}`, 'mcp'])
  assert.equal('env' in server, false)
})

test('Cursor skill requires a deterministic handoff and keeps authority bounded', () => {
  const skill = readFileSync(
    new URL('../skills/doc-bridge-handoff/SKILL.md', import.meta.url),
    'utf8',
  )

  assert.match(skill, /^---\nname: doc-bridge-handoff\ndescription: .+\n/)
  assert.match(skill, /handoff\.resolve/)
  assert.match(skill, /readBeforeEditing/)
  assert.match(skill, /editRoots/)
  assert.match(skill, /read-only/)
  assert.doesNotMatch(skill, /force-push|--no-verify/)
})
