import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const server = resolve(root, '.mcpb-build', 'server', 'ak-docs.js')
const fixture = resolve(root, 'tests', 'fixtures', 'sample-project')
const project = join(mkdtempSync(join(tmpdir(), 'doc-bridge-mcpb-smoke-')), 'sample-project')
cpSync(fixture, project, { recursive: true })
const config = resolve(project, 'doc-bridge.config.json')

if (!existsSync(server)) throw new Error('MCPB staged server is missing. Run pnpm mcpb:stage first.')
execFileSync(process.execPath, [server, 'index', '--config', config], { cwd: root, stdio: 'pipe' })

const requests = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'handoff.resolve', arguments: { id: 'os-core' } } },
  { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'doc.search', arguments: { term: 'schema' } } },
  { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'doc.get', arguments: { id: 'os-core' } } },
  { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'gate.status', arguments: {} } },
  { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'retriever.query', arguments: { query: 'schema', limit: 1 } } },
  { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'memory.classify', arguments: {} } },
  { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'memory.promoteDraft', arguments: {} } },
  { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'registry.topology', arguments: {} } },
]

const input = requests
  .map((request) => {
    const body = JSON.stringify(request)
    return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
  })
  .join('')

const output = execFileSync(process.execPath, [server, 'mcp', '--config', config], {
  cwd: root,
  input,
  encoding: 'utf8',
  maxBuffer: 2_000_000,
})

const responses = []
let rest = output
while (rest.length > 0) {
  const headerEnd = rest.indexOf('\r\n\r\n')
  assert.notEqual(headerEnd, -1, 'MCP response header is incomplete')
  const header = rest.slice(0, headerEnd)
  const length = Number.parseInt(header.match(/Content-Length: (\d+)/i)?.[1] ?? '', 10)
  assert.ok(Number.isInteger(length), 'MCP response Content-Length is invalid')
  const start = headerEnd + 4
  responses.push(JSON.parse(rest.slice(start, start + length)))
  rest = rest.slice(start + length)
}

assert.equal(responses.length, requests.length)
for (const response of responses) assert.equal(response.error, undefined)
assert.equal(responses[0].result.serverInfo.name, 'ak-docs')
assert.equal(responses[1].result.tools.length, 14)
for (const tool of responses[1].result.tools) {
  assert.equal(typeof tool.title, 'string')
  if (tool.name !== 'docbridge.proposals') assert.equal(tool.annotations.readOnlyHint, true)
}
for (const response of responses.slice(2)) {
  assert.equal(response.result.content[0].type, 'text')
  assert.ok(response.result.content[0].text.length > 1)
}

process.stdout.write(`${JSON.stringify({ server, toolsExercised: 8, advertisedTools: 14, responses: responses.length }, null, 2)}\n`)
