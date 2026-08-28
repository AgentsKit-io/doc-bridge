import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const manifest = JSON.parse(readFileSync('mcpb/manifest.json', 'utf8'))
const readme = readFileSync('README.md', 'utf8')
const privacy = readFileSync('PRIVACY.md', 'utf8')
const ignore = readFileSync('mcpb/.mcpbignore', 'utf8')
const icon = readFileSync('mcpb/icon.png')

const expectedTools = [
  'handoff.resolve',
  'doc.search',
  'doc.get',
  'gate.status',
  'retriever.query',
  'memory.classify',
  'memory.promoteDraft',
  'registry.topology',
  'docbridge.snapshot',
  'docbridge.report',
  'docbridge.diagnostics',
  'docbridge.relations',
  'docbridge.run',
  'docbridge.proposals',
]

test('MCPB manifest pins the local read-only Doc Bridge entrypoint', () => {
  assert.equal(manifest.manifest_version, '0.3')
  assert.equal(manifest.version, packageJson.version)
  assert.equal(manifest.server.type, 'node')
  assert.equal(manifest.icon, 'icon.png')
  assert.equal(icon.subarray(1, 4).toString('ascii'), 'PNG')
  assert.equal(icon.readUInt32BE(16), 512)
  assert.equal(icon.readUInt32BE(20), 512)
  assert.equal(manifest.server.entry_point, 'server/ak-docs.js')
  assert.deepEqual(manifest.server.mcp_config.args, [
    '${__dirname}/server/ak-docs.js',
    'mcp',
    '--config',
    '${user_config.project_config}',
  ])
  assert.deepEqual(manifest.compatibility.platforms, ['darwin'])
  assert.deepEqual(manifest.tools.map((tool) => tool.name), expectedTools)
  assert.equal(new Set(expectedTools).size, expectedTools.length)
})

test('MCPB requires an explicit project configuration boundary', () => {
  assert.deepEqual(manifest.user_config.project_config, {
    type: 'file',
    title: 'Doc Bridge configuration',
    description: 'Select the doc-bridge.config.json file at the root of the repository Doc Bridge may read.',
    required: true,
  })
})

test('privacy requirements are public and complete', () => {
  assert.deepEqual(manifest.privacy_policies, [
    'https://github.com/AgentsKit-io/doc-bridge/blob/master/PRIVACY.md',
  ])
  assert.match(readme, /^## Privacy Policy$/m)
  assert.match(readme, /\[Privacy Policy\]\(PRIVACY\.md\)/)
  for (const heading of [
    'Data the connector accesses',
    'Collection, use, and storage',
    'Sharing and external services',
    'Retention and deletion',
    'Contact',
  ]) {
    assert.match(privacy, new RegExp(`^## ${heading}$`, 'm'))
  }
})

test('MCPB ignore rules reject local credentials and development artifacts', () => {
  for (const pattern of ['.env*', '*.log', '*.map', 'coverage/', 'tests/', 'src/']) {
    assert.ok(ignore.split('\n').includes(pattern), `missing ignore pattern ${pattern}`)
  }
})
