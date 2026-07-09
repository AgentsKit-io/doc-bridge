import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = mkdtempSync(join(tmpdir(), 'doc-bridge-smoke-'))
const version = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version
const tarball = join(repo, `agentskit-doc-bridge-${version}.tgz`)

const run = (cmd, args, cwd = repo) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

const frame = (req) => {
  const body = JSON.stringify(req)
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
}

try {
  rmSync(tarball, { force: true })
  run('npm', ['run', 'build'])
  run('npm', ['pack', '--json'])

  run('npm', ['init', '-y'], tmp)
  run('npm', ['install', tarball], tmp)
  const bin = join(tmp, 'node_modules', '.bin', 'ak-docs')
  const versionOut = run(bin, ['--version'], tmp)
  if (!versionOut.includes(`ak-docs ${version} `)) {
    throw new Error(`version smoke failed: expected ${version}, got ${versionOut}`)
  }

  run('node', ['--input-type=module', '-e', `
    import { buildDocBridgeIndex, parseDocBridgeConfig } from '@agentskit/doc-bridge'
    import { defineConfig } from '@agentskit/doc-bridge/config'
    if (typeof buildDocBridgeIndex !== 'function') throw new Error('missing buildDocBridgeIndex')
    if (typeof parseDocBridgeConfig !== 'function') throw new Error('missing parseDocBridgeConfig')
    if (defineConfig({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } }).surfaces?.cli?.bin !== 'ak-docs') throw new Error('defineConfig defaults failed')
  `], tmp)
  run('npm', ['audit', '--omit=dev', '--audit-level=high'], tmp)

  const market = join(tmp, 'market')
  mkdirSync(market)
  write(join(market, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
  write(join(market, 'packages/auth/package.json'), JSON.stringify({ name: '@acme/auth' }, null, 2))
  write(join(market, 'doc-bridge.config.json'), JSON.stringify({
    schemaVersion: 1,
    project: { name: 'packaged-smoke' },
    corpus: {
      agent: { root: 'docs/for-agents', okf: { requireType: true } },
      human: { plugin: 'plain-markdown', options: { root: 'docs/human', urlPrefix: '/docs' } },
    },
    routing: {
      plugin: 'pnpm-monorepo',
      options: {
        packages: ['packages/*'],
        ownership: {
          auth: {
            path: 'packages/auth',
            agentDoc: 'docs/for-agents/packages/auth.md',
            humanDoc: '/docs/auth',
            checks: ['npm test'],
          },
        },
      },
    },
    federation: { sources: [{ id: 'playbook', llmsTxt: 'https://playbook.agentskit.io/llms.txt' }] },
    gates: {
      include: ['index-freshness', 'human-guide-links', 'okf-type', 'docs-style'],
      options: { 'docs-style': { profile: 'playbook-okf' } },
    },
  }, null, 2))
  write(join(market, 'docs/for-agents/INDEX.md'), '---\ntype: index\npurpose: Route coding agents.\nowner: platform\n---\n\n# Agent docs\n\nRoute coding agents.\n')
  write(join(market, 'docs/for-agents/packages/auth.md'), '---\ntype: package\npurpose: Auth ownership.\nowner: platform\n---\n\n# Auth package\n\nAuth owns login, sessions, token validation, and permission middleware.\n')
  write(join(market, 'docs/human/auth.md'), '# Auth guide\n\nHuman auth guide.\n')
  write(join(market, '.agent-memory/auth.md'), '# Auth memory\n\npackage auth owns OAuth callback timeout boundaries.\n')

  run(bin, ['validate-config'], market)
  run(bin, ['index'], market)
  const ask = run(bin, ['ask', 'who owns token validation'], market)
  if (!ask.includes('Best match: ownership auth') || !ask.includes('ak-docs query ownership auth --agent')) {
    throw new Error(`ask smoke failed:\n${ask}`)
  }
  const retrieve = run(bin, ['retrieve', 'Self-Describe discovery'], market)
  if (!retrieve.includes('self-describe-pattern')) throw new Error('retrieve did not find Self-Describe Pattern')
  if (/akos/i.test(retrieve)) throw new Error('retrieve crawled an unrelated origin')
  run(bin, ['memory', 'promote'], market)
  run(bin, ['gate', 'run'], market)

  const mcp = spawnSync(bin, ['mcp'], {
    cwd: market,
    input: [
      frame({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'doc.get', arguments: { id: 'auth' } } }),
      frame({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'doc.get', arguments: { path: '../package.json' } } }),
    ].join(''),
    encoding: 'utf8',
    timeout: 5_000,
  })
  if (!mcp.stdout.includes('Auth package')) throw new Error(`MCP doc.get smoke failed:\n${mcp.stdout}\n${mcp.stderr}`)
  if (!mcp.stdout.includes('Unknown indexed doc path')) throw new Error('MCP path rejection smoke failed')

  const empty = join(tmp, 'empty')
  mkdirSync(empty)
  run(bin, ['init'], empty)
  const demoIndex = run(bin, ['index'], empty)
  if (!demoIndex.includes('"handoffCount": 1') && !demoIndex.includes('"handoffCount":1')) {
    throw new Error(`demo init index missing handoff:\n${demoIndex}`)
  }
  const demoHandoff = run(bin, ['query', 'package', 'example', '--agent'], empty)
  if (!demoHandoff.includes('"type": "agent-handoff"') && !demoHandoff.includes('"type":"agent-handoff"')) {
    throw new Error(`2-minute path handoff failed:\n${demoHandoff}`)
  }
  if (!demoHandoff.includes('editRoots')) throw new Error('demo handoff missing editRoots')
  const starterAsk = run(bin, ['ask', 'where do I start'], empty)
  if (starterAsk.includes('query ownership INDEX')) throw new Error('starter ask suggested invalid ownership query')

  // Layer 1 peers optional: command must fail with install hint, not crash
  const ragMissing = spawnSync(bin, ['rag', 'ingest'], { cwd: empty, encoding: 'utf8' })
  if (ragMissing.status === 0) throw new Error('rag ingest should fail without intelligence config/peers')
  if (!/intelligence|peer|install|adapter/i.test(`${ragMissing.stdout}\n${ragMissing.stderr}`)) {
    throw new Error(`rag missing-peer UX failed:\n${ragMissing.stdout}\n${ragMissing.stderr}`)
  }

  const invalid = join(tmp, 'invalid')
  mkdirSync(invalid)
  write(join(invalid, 'doc-bridge.config.json'), '{"schemaVersion":1,"corpus":{"agent":{}}}\n')
  const bad = spawnSync(bin, ['validate-config'], { cwd: invalid, encoding: 'utf8' })
  if (bad.status === 0 || !bad.stderr.includes('corpus.agent.root: Required')) {
    throw new Error(`invalid config UX smoke failed:\n${bad.stdout}\n${bad.stderr}`)
  }

  process.stdout.write(`packaged smoke passed: ${tmp}\n`)
} finally {
  rmSync(tarball, { force: true })
}
