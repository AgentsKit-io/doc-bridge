import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

test('Claude plugin exposes the portable skill and pinned read-only MCP', () => {
  const packageJson = readJson('../package.json')
  const manifest = readJson('../.claude-plugin/plugin.json')
  const claudeMcp = readJson('../.mcp.json')
  const sharedMcp = readJson('../mcp.json')

  assert.equal(manifest.name, 'doc-bridge')
  assert.equal(manifest.version, packageJson.version)
  assert.deepEqual(claudeMcp, sharedMcp)
  assert.equal('env' in claudeMcp.mcpServers['ak-docs'], false)

  const skill = readFileSync(
    new URL('../skills/doc-bridge-handoff/SKILL.md', import.meta.url),
    'utf8',
  )
  assert.match(skill, /handoff\.resolve/)
  assert.match(skill, /editRoots/)
  assert.match(skill, /read-only/)
})
