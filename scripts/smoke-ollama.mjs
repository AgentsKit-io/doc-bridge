#!/usr/bin/env node
/**
 * Optional Ollama smoke — skips gracefully when Ollama or Layer 1 peers are unavailable.
 * Run locally after: ollama serve && ollama pull llama3.2 && ollama pull nomic-embed-text
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repo, 'bin', 'ak-docs.js')

const log = (message) => process.stdout.write(`${message}\n`)
const skip = (reason) => {
  log(`ollama smoke skipped: ${reason}`)
  process.exit(0)
}

const ollamaUp = () => {
  try {
    const res = spawnSync('curl', ['-sf', 'http://127.0.0.1:11434/api/tags'], { encoding: 'utf8' })
    return res.status === 0
  } catch {
    return false
  }
}

const peersInstalled = () => {
  try {
    execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        "await import('@agentskit/rag'); await import('@agentskit/adapters'); await import('@agentskit/core');",
      ],
      { cwd: repo, stdio: 'pipe' },
    )
    return true
  } catch {
    return false
  }
}

if (!ollamaUp()) skip('Ollama not running at http://127.0.0.1:11434 — start with: ollama serve')
if (!peersInstalled()) {
  skip(
    'Layer 1 peers not installed — run: npm i -D @agentskit/rag @agentskit/ink @agentskit/adapters @agentskit/memory react',
  )
}

const root = mkdtempSync(join(tmpdir(), 'ak-docs-ollama-smoke-'))
try {
  mkdirSync(join(root, 'docs/for-agents/packages'), { recursive: true })
  writeFileSync(
    join(root, 'doc-bridge.config.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        corpus: { agent: { root: 'docs/for-agents' } },
        routing: {
          options: {
            ownership: {
              auth: {
                path: 'packages/auth',
                purpose: 'Authentication package',
                checks: ['npm test'],
                agentDoc: 'docs/for-agents/packages/auth.md',
              },
            },
          },
        },
        intelligence: {
          enabled: true,
          adapter: {
            provider: 'ollama',
            model: 'llama3.2',
            baseUrl: 'http://127.0.0.1:11434',
            options: { embedModel: 'nomic-embed-text' },
          },
          chat: { enabled: true, handoffFirst: true },
          retriever: { enabled: true, mode: 'agentskit-rag' },
        },
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(root, 'docs/for-agents/packages/auth.md'),
    '---\npackage: auth\neditRoot: packages/auth\n---\n\n# auth\n\nOwns authentication.\n',
  )
  writeFileSync(join(root, 'docs/for-agents/INDEX.md'), '# Index\n\n- [auth](./packages/auth.md)\n')

  execFileSync('node', [bin, 'index'], { cwd: root, stdio: 'inherit' })
  execFileSync('node', [bin, 'rag', 'ingest'], { cwd: root, stdio: 'inherit', timeout: 120_000 })

  const ask = spawnSync(
    'node',
    [bin, 'ask', 'who owns authentication?', '--chat'],
    { cwd: root, encoding: 'utf8', timeout: 120_000 },
  )
  if (ask.status !== 0) {
    process.stderr.write(ask.stderr || ask.stdout)
    throw new Error('ak-docs ask --chat failed against local Ollama')
  }
  if (!ask.stdout || ask.stdout.trim().length < 8) {
    throw new Error('Ollama chat returned empty response')
  }

  log('ollama smoke passed')
  log(ask.stdout.trim().slice(0, 400))
} finally {
  rmSync(root, { recursive: true, force: true })
}