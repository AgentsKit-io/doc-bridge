import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample-project')
const originalCwd = process.cwd()
let projectRoot = fixtureRoot

const captureStdout = (fn: () => number | undefined): { code: number | undefined; out: string } => {
  const write = process.stdout.write
  let out = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk)
    return true
  }) as typeof process.stdout.write
  try {
    return { code: fn(), out }
  } finally {
    process.stdout.write = write
  }
}

const captureStderr = (fn: () => number | undefined): { code: number | undefined; err: string } => {
  const write = process.stderr.write
  let err = ''
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err += String(chunk)
    return true
  }) as typeof process.stderr.write
  try {
    return { code: fn(), err }
  } finally {
    process.stderr.write = write
  }
}

const captureStdoutAsync = async (
  fn: () => number | undefined | Promise<number | undefined>,
): Promise<{ code: number | undefined; out: string }> => {
  const write = process.stdout.write
  let out = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk)
    return true
  }) as typeof process.stdout.write
  try {
    return { code: await fn(), out }
  } finally {
    process.stdout.write = write
  }
}

describe('ak-docs CLI', () => {
  beforeAll(() => {
    projectRoot = join(mkdtempSync(join(tmpdir(), 'ak-docs-cli-')), 'sample-project')
    cpSync(fixtureRoot, projectRoot, { recursive: true })
    process.chdir(projectRoot)
  })

  afterAll(() => {
    process.chdir(originalCwd)
  })

  it('prints version', () => {
    const code = runCli(['--version'])
    expect(code).toBe(0)
  })

  it('prints help and fallback usage', () => {
    const help = captureStdout(() => runCli(['--help']))
    expect(help.code).toBe(0)
    expect(help.out).toContain('Core (no API key)')
    expect(captureStdout(() => runCli(['unknown-command'])).out).toContain('ak-docs')
  })

  it('validates config file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ak-docs-'))
    const configPath = join(dir, 'doc-bridge.config.json')
    writeFileSync(
      configPath,
      JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } }),
    )
    const code = runCli(['validate-config', '--config', configPath])
    expect(code).toBe(0)
  })

  it('prints validation errors for bad config and handoffs', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-invalid-'))
    try {
      process.chdir(root)
      writeFileSync(join(root, 'doc-bridge.config.json'), '{"schemaVersion":1,"corpus":{"agent":{}}}\n')
      expect(captureStderr(() => runCli(['validate-config'])).err).toContain('corpus.agent.root')

      expect(captureStderr(() => runCli(['validate-handoff'])).err).toContain('Missing handoff')
      writeFileSync(join(root, 'bad.json'), '{"type":"agent-handoff"}\n')
      expect(captureStderr(() => runCli(['validate-handoff', 'bad.json'])).err).toContain(
        'Invalid AgentHandoff',
      )
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('initializes a demo project with handoff-ready ownership', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-init-'))
    try {
      process.chdir(root)
      expect(runCli(['init'])).toBe(0)
      expect(existsSync(join(root, 'doc-bridge.config.json'))).toBe(true)
      expect(existsSync(join(root, 'docs/for-agents/INDEX.md'))).toBe(true)
      expect(existsSync(join(root, 'docs/for-agents/packages/example.md'))).toBe(true)
      expect(existsSync(join(root, 'AGENTS.md'))).toBe(true)
      expect(runCli(['validate-config'])).toBe(0)
      const index = captureStdout(() => runCli(['index']))
      expect(index.code).toBe(0)
      const payload = JSON.parse(index.out) as {
        handoffCount: number
        packageCount: number
        nextCommands: string[]
      }
      expect(payload.handoffCount).toBeGreaterThanOrEqual(1)
      expect(payload.packageCount).toBeGreaterThanOrEqual(1)
      expect(payload.nextCommands[0]).toContain('query package example')

      const handoff = captureStdout(() => runCli(['query', 'package', 'example', '--agent']))
      expect(handoff.code).toBe(0)
      expect(JSON.parse(handoff.out)).toMatchObject({
        type: 'agent-handoff',
        editRoots: ['src'],
      })

      const knowledge = captureStdout(() => runCli(['list', 'knowledge', '--text']))
      expect(knowledge.code).toBe(0)
      expect(knowledge.out).toContain('docs/for-agents')
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('supports --no-demo init for empty corpus path', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-init-nodemo-'))
    try {
      process.chdir(root)
      expect(runCli(['init', '--no-demo'])).toBe(0)
      const index = captureStdout(() => runCli(['index']))
      expect(index.code).toBe(0)
      expect(JSON.parse(index.out)).toMatchObject({
        handoffCount: 0,
        diagnostics: expect.arrayContaining([
          expect.stringContaining('No ownership handoffs'),
        ]),
      })
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('resolves project root from --config path', () => {
    const outer = mkdtempSync(join(tmpdir(), 'ak-docs-config-root-'))
    const project = join(outer, 'nested-app')
    mkdirSync(join(project, 'docs/for-agents/packages'), { recursive: true })
    writeFileSync(
      join(project, 'doc-bridge.config.json'),
      JSON.stringify({
        schemaVersion: 1,
        corpus: { agent: { root: 'docs/for-agents' } },
        routing: {
          options: {
            ownership: {
              nested: { path: 'lib', purpose: 'Nested', checks: ['npm test'] },
            },
          },
        },
      }),
    )
    writeFileSync(
      join(project, 'docs/for-agents/packages/nested.md'),
      '---\npackage: nested\neditRoot: lib\n---\n\n# nested\n',
    )
    try {
      process.chdir(outer)
      const index = captureStdout(() =>
        runCli(['index', '--config', join(project, 'doc-bridge.config.json')]),
      )
      expect(index.code).toBe(0)
      expect(existsSync(join(project, '.doc-bridge/index.json'))).toBe(true)
      expect(existsSync(join(outer, '.doc-bridge/index.json'))).toBe(false)
      const handoff = captureStdout(() =>
        runCli([
          'query',
          'package',
          'nested',
          '--agent',
          '--config',
          join(project, 'doc-bridge.config.json'),
        ]),
      )
      expect(handoff.code).toBe(0)
      expect(JSON.parse(handoff.out).editRoots).toEqual(['lib'])
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('errors clearly when rag peers are missing', async () => {
    const result = await captureStdoutAsync(async () => runCli(['rag', 'ingest']))
    // may write to stderr
    const err = captureStderr(() => {
      // sync path not used
      return 0
    })
    void err
    const stderr = await (async () => {
      const write = process.stderr.write
      let buf = ''
      process.stderr.write = ((chunk: string | Uint8Array) => {
        buf += String(chunk)
        return true
      }) as typeof process.stderr.write
      try {
        const code = await runCli(['rag', 'ingest'])
        return { code, buf }
      } finally {
        process.stderr.write = write
      }
    })()
    expect(stderr.code).toBe(1)
    expect(stderr.buf.toLowerCase()).toMatch(/intelligence|peer|adapter|install/)
    void result
  })

  it('initializes a TypeScript config when requested', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-init-ts-'))
    try {
      process.chdir(root)
      expect(runCli(['init', '--config', 'doc-bridge.config.ts'])).toBe(0)
      expect(existsSync(join(root, 'doc-bridge.config.ts'))).toBe(true)
      expect(runCli(['validate-config'])).toBe(0)
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('scaffolds draft package docs from pnpm workspaces without overwriting', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-scaffold-'))
    try {
      mkdirSync(join(root, 'packages/auth'), { recursive: true })
      writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
      writeFileSync(join(root, 'packages/auth/package.json'), JSON.stringify({ name: '@acme/auth' }))
      process.chdir(root)

      const init = captureStdout(() => runCli(['init', '--scaffold-workspaces']))
      expect(init.code).toBe(0)
      const draftPath = join(root, 'docs/for-agents/packages/auth.md')
      expect(readFileSync(draftPath, 'utf8')).toContain('draft: true')
      expect(readFileSync(draftPath, 'utf8')).toContain('TODO: describe responsibility')

      writeFileSync(draftPath, '# Auth\n\nCurated.\n')
      const rerun = captureStdout(() => runCli(['init', '--scaffold-workspaces']))
      expect(rerun.code).toBe(0)
      expect(readFileSync(draftPath, 'utf8')).toBe('# Auth\n\nCurated.\n')
      const payload = JSON.parse(rerun.out) as { skipped?: { workspaceDocs?: string[] } }
      expect(payload.skipped?.workspaceDocs?.some((path) =>
        path.endsWith('docs/for-agents/packages/auth.md'),
      )).toBe(true)
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('bootstraps agent-doc drafts from human docs without overwriting', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'ak-docs-bootstrap-human-')), 'sample-project')
    cpSync(fixtureRoot, root, { recursive: true })
    try {
      process.chdir(root)
      const result = captureStdout(() => runCli(['bootstrap', 'agent-docs']))
      expect(result.code).toBe(0)
      const draftPath = join(root, 'docs/for-agents/human/os-core.md')
      const draft = readFileSync(draftPath, 'utf8')
      expect(draft).toContain('draft: true')
      expect(draft).toContain('humanDoc: /docs/packages/os-core')
      expect(draft).toContain('# Core contracts')

      writeFileSync(draftPath, '# Curated\n')
      expect(runCli(['bootstrap', 'agent-docs'])).toBe(0)
      expect(readFileSync(draftPath, 'utf8')).toBe('# Curated\n')
      expect(runCli(['index'])).toBe(0)
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('bootstraps agent-doc drafts from Docusaurus docs', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-bootstrap-docusaurus-'))
    try {
      mkdirSync(join(root, 'website/docs/guide'), { recursive: true })
      writeFileSync(
        join(root, 'doc-bridge.config.json'),
        JSON.stringify({
          schemaVersion: 1,
          corpus: {
            agent: { root: 'docs/for-agents' },
            human: {
              plugin: 'docusaurus',
              options: { docsDir: 'website/docs', urlPrefix: '/docs' },
            },
          },
        }),
      )
      writeFileSync(
        join(root, 'website/docs/guide/hello.md'),
        '---\nid: hello\nslug: /hello\n---\n\n# Hello\n\nHuman guide.\n',
      )
      process.chdir(root)

      expect(runCli(['bootstrap', 'agent-docs'])).toBe(0)
      const draft = readFileSync(join(root, 'docs/for-agents/human/guide/hello.md'), 'utf8')
      expect(draft).toContain('humanDoc: /docs/hello')
      expect(draft).toContain('Human guide.')
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('prints bootstrap usage for unknown bootstrap targets', () => {
    const result = captureStderr(() => runCli(['bootstrap', 'nope']))
    expect(result.code).toBe(1)
    expect(result.err).toContain('bootstrap agent-docs')
  })

  it('builds index from fixture project', () => {
    const code = runCli(['index'])
    expect(code).toBe(0)
  })

  it('runs index freshness gate', () => {
    runCli(['index'])
    const code = runCli(['gate', 'run', 'index-freshness'])
    expect(code).toBe(0)
  })

  it('runs human guide links gate', () => {
    const code = runCli(['gate', 'run', 'human-guide-links'])
    expect(code).toBe(0)
  })

  it('prints usage for unsupported gates', () => {
    expect(captureStderr(() => runCli(['gate'])).err).toContain('ak-docs gate run')
    expect(captureStderr(() => runCli(['gate', 'run', 'nope'])).err).toContain('Unsupported gate')
  })

  it('runs OKF type gate from the CLI', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-cli-okf-'))
    try {
      process.chdir(root)
      writeFileSync(
        join(root, 'doc-bridge.config.json'),
        JSON.stringify({
          schemaVersion: 1,
          corpus: { agent: { root: 'docs/for-agents', okf: { requireType: true } } },
        }),
      )
      mkdirSync(join(root, 'docs/for-agents/modules'), { recursive: true })
      writeFileSync(join(root, 'docs/for-agents/modules/auth.md'), '---\ntype: module\n---\n\n# Auth\n')

      const code = runCli(['gate', 'run', 'okf-type'])
      expect(code).toBe(0)
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('runs docs style gate from the CLI', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-cli-style-'))
    try {
      process.chdir(root)
      writeFileSync(
        join(root, 'doc-bridge.config.json'),
        JSON.stringify({
          schemaVersion: 1,
          corpus: { agent: { root: 'docs/for-agents' } },
          gates: {
            include: ['docs-style'],
            options: { 'docs-style': { profile: 'playbook-okf' } },
          },
        }),
      )
      mkdirSync(join(root, 'docs/for-agents/modules'), { recursive: true })
      writeFileSync(join(root, 'docs/for-agents/INDEX.md'), '# Agent docs index\n')
      writeFileSync(
        join(root, 'docs/for-agents/modules/auth.md'),
        [
          '---',
          'type: module',
          'purpose: Explain authentication ownership.',
          'owner: platform',
          '---',
          '',
          '# Auth',
          '',
          'Auth ownership guide.',
          '',
        ].join('\n'),
      )

      const code = runCli(['gate', 'run', 'docs-style'])
      expect(code).toBe(0)
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('fails index freshness gate when the index hash drifts', () => {
    const staleProjectRoot = join(mkdtempSync(join(tmpdir(), 'ak-docs-fixture-')), 'sample-project')
    cpSync(fixtureRoot, staleProjectRoot, { recursive: true })
    try {
      process.chdir(staleProjectRoot)

      runCli(['index'])
      const indexPath = join(staleProjectRoot, '.doc-bridge', 'index.json')
      const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { contentHash: string }
      writeFileSync(indexPath, JSON.stringify({ ...index, contentHash: '0'.repeat(64) }))

      const code = runCli(['gate', 'run', 'index-freshness'])
      expect(code).toBe(1)

      runCli(['index'])
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('fails human guide links gate when a humanDoc is broken', () => {
    const brokenProjectRoot = join(mkdtempSync(join(tmpdir(), 'ak-docs-human-')), 'sample-project')
    cpSync(fixtureRoot, brokenProjectRoot, { recursive: true })
    try {
      const configPath = join(brokenProjectRoot, 'doc-bridge.config.json')
      const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
        routing: { options: { ownership: { 'os-core': { humanDoc?: string } } } }
      }
      config.routing.options.ownership['os-core'].humanDoc = '/docs/missing'
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      process.chdir(brokenProjectRoot)

      const code = runCli(['gate', 'run', 'human-guide-links'])
      expect(code).toBe(1)
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('lists packages after index', () => {
    const code = runCli(['list', 'packages'])
    expect(code).toBe(0)
  })

  it('lists intents, changes, and knowledge as JSON', () => {
    expect(captureStdout(() => runCli(['list', 'intents'])).out).toContain('"kind": "intents"')
    expect(captureStdout(() => runCli(['list', 'changes'])).out).toContain('"kind": "changes"')
    expect(captureStdout(() => runCli(['list', 'knowledge'])).out).toContain('"kind": "knowledge"')
  })

  it('prints rebuild hint when query/list need a missing index', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-missing-index-'))
    try {
      process.chdir(root)
      runCli(['init'])

      const query = captureStderr(() => runCli(['query', 'ownership', 'auth']))
      expect(query.code).toBe(1)
      expect(query.err).toContain('Run: ak-docs index')

      const list = captureStderr(() => runCli(['list', 'knowledge']))
      expect(list.code).toBe(1)
      expect(list.err).toContain('Run: ak-docs index')
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('prints list output as text when requested', () => {
    const code = runCli(['list', 'packages', '--text'])
    expect(code).toBe(0)
  })

  it('prints intent and change lists as text', () => {
    expect(captureStdout(() => runCli(['list', 'intents', '--text'])).out).toContain('find-package')
    expect(captureStdout(() => runCli(['list', 'changes', '--text'])).out).toContain('zod-schema')
  })

  it('uses configured text output unless --json is passed', () => {
    const textProjectRoot = join(mkdtempSync(join(tmpdir(), 'ak-docs-text-default-')), 'sample-project')
    cpSync(fixtureRoot, textProjectRoot, { recursive: true })
    try {
      const configPath = join(textProjectRoot, 'doc-bridge.config.json')
      const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
        surfaces?: { cli?: { defaultFormat?: 'json' | 'text' } }
      }
      config.surfaces = { ...config.surfaces, cli: { ...config.surfaces?.cli, defaultFormat: 'text' } }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      process.chdir(textProjectRoot)
      runCli(['index'])

      const text = captureStdout(() => runCli(['list', 'packages']))
      expect(text.code).toBe(0)
      expect(text.out).toBe('os-core\n')

      const json = captureStdout(() => runCli(['list', 'packages', '--json']))
      expect(json.code).toBe(0)
      expect(json.out).toContain('"kind": "packages"')
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('queries ownership handoff with --agent', () => {
    const code = runCli(['query', 'ownership', 'os-core', '--agent'])
    expect(code).toBe(0)
  })

  it('prints query/search/retrieve usage for missing arguments', () => {
    expect(captureStderr(() => runCli(['query', 'search', 'schema'])).err).toContain('ak-docs query')
    expect(captureStderr(() => runCli(['query', 'ownership'])).err).toContain('Missing id')
    expect(captureStderr(() => runCli(['search'])).err).toContain('ak-docs search')
    expect(captureStderr(() => runCli(['retrieve'])).err).toContain('ak-docs retrieve')
    expect(captureStderr(() => runCli(['list'])).err).toContain('ak-docs list')
  })

  it('prints query output as text when requested', () => {
    const code = runCli(['query', 'ownership', 'os-core', '--text'])
    expect(code).toBe(0)
  })

  it('prints package query output as text', () => {
    expect(captureStdout(() => runCli(['query', 'package', 'os-core', '--text'])).out).toContain(
      'packages/os-core',
    )
  })

  it('searches corpus with --agent', () => {
    const code = runCli(['search', 'schema', '--agent'])
    expect(code).toBe(0)
  })

  it('prints search output as text when requested', () => {
    const code = runCli(['search', 'schema', '--text'])
    expect(code).toBe(0)
  })

  it('prints search output as JSON by default', () => {
    expect(captureStdout(() => runCli(['search', 'schema'])).out).toContain('"term": "schema"')
  })

  it('answers local docs questions with deterministic matches', () => {
    const result = captureStdout(() => runCli(['ask', 'who owns schemas']))
    expect(result.code).toBe(0)
    expect(result.out).toContain('Best match:')
    expect(result.out).toContain('ak-docs search "who owns schemas" --agent')
  })

  it('does not suggest ownership query for plain knowledge-only matches', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-ask-knowledge-'))
    try {
      process.chdir(root)
      expect(runCli(['init', '--no-demo'])).toBe(0)
      expect(runCli(['index'])).toBe(0)
      const result = captureStdout(() => runCli(['ask', 'where do I start']))
      expect(result.code).toBe(0)
      expect(result.out).not.toContain('ak-docs query ownership INDEX --agent')
      expect(result.out).toContain('ak-docs list knowledge --text')
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('suggests ownership handoff when ask has a knowledge best match plus owner matches', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-ask-owner-fallback-'))
    try {
      process.chdir(root)
      writeFileSync(
        join(root, 'doc-bridge.config.json'),
        JSON.stringify({
          schemaVersion: 1,
          corpus: { agent: { root: 'docs/for-agents' } },
          routing: { plugin: 'pnpm-monorepo', options: { packages: ['packages/*'] } },
        }),
      )
      mkdirSync(join(root, 'docs/for-agents/packages'), { recursive: true })
      mkdirSync(join(root, 'packages/auth'), { recursive: true })
      writeFileSync(join(root, 'packages/auth/package.json'), '{"name":"@acme/auth"}\n')
      writeFileSync(join(root, 'docs/for-agents/INDEX.md'), '# Integration setup\n\nIntegration setup auth guide.\n')
      writeFileSync(join(root, 'docs/for-agents/packages/auth.md'), '# Auth\n\nAuth package.\n')
      expect(runCli(['index'])).toBe(0)

      const result = captureStdout(() => runCli(['ask', 'integration setup auth']))
      expect(result.code).toBe(0)
      // ownership preferred for routing-style questions
      expect(result.out).toMatch(/Best match: ownership auth/)
      expect(result.out).toContain('ak-docs query ownership auth --agent')
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('prints ask usage when no question is provided outside a TTY', () => {
    const result = captureStderr(() => runCli(['ask']))
    expect(result.code).toBe(1)
    expect(result.err).toContain('Usage: ak-docs ask <question>')
  })

  it('prints rebuild hints for search when index is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-search-missing-index-'))
    try {
      process.chdir(root)
      runCli(['init'])
      const result = captureStderr(() => runCli(['search', 'schema']))
      expect(result.code).toBe(1)
      expect(result.err).toContain('Run: ak-docs index')
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('prints a clear chat adapter error when chat mode is requested without intelligence config', () => {
    const result = captureStderr(() => runCli(['ask', '--chat', 'who owns schemas']))
    expect(result.code).toBe(1)
    expect(result.err).toContain('Chat mode requires intelligence.enabled')
  })

  it('prints actionable intelligence errors for chat when peers or provider fail', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-chat-'))
    try {
      process.chdir(root)
      writeFileSync(
        join(root, 'doc-bridge.config.json'),
        JSON.stringify({
          schemaVersion: 1,
          corpus: { agent: { root: 'docs/for-agents' } },
          intelligence: { enabled: true, adapter: { provider: 'ollama', model: 'llama3.2' } },
        }),
      )
      mkdirSync(join(root, 'docs/for-agents'), { recursive: true })
      writeFileSync(join(root, 'docs/for-agents/INDEX.md'), '# Index\n\nHello.\n')
      expect(runCli(['index'])).toBe(0)

      const write = process.stderr.write
      let err = ''
      process.stderr.write = ((chunk: string | Uint8Array) => {
        err += String(chunk)
        return true
      }) as typeof process.stderr.write
      try {
        const code = await runCli(['ask', '--chat', 'who owns schemas'])
        expect(code).toBe(1)
        // Peers may be missing (CI clean) or present but Ollama down (local/dev):
        // both paths must include the Layer 1 install hint.
        expect(err).toMatch(/Install Layer 1 intelligence peers|Optional peer/)
      } finally {
        process.stderr.write = write
      }
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('ingests local memory files as memory candidates', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-memory-'))
    try {
      process.chdir(root)
      writeFileSync(
        join(root, 'doc-bridge.config.json'),
        JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs/for-agents' } } }),
      )
      mkdirSync(join(root, '.cursor/rules'), { recursive: true })
      mkdirSync(join(root, '.agent-memory'), { recursive: true })
      writeFileSync(join(root, '.cursor/rules/auth.mdc'), '# Auth\n\nAuth handlers must forward AbortSignal.\n')
      writeFileSync(join(root, '.agent-memory/release.md'), '# Release\n\nPublish only after npm pack dry-run passes.\n')

      const result = captureStdout(() => runCli(['memory', 'ingest']))
      expect(result.code).toBe(0)
      expect(JSON.parse(result.out)).toMatchObject({
        ok: true,
        count: 2,
        candidates: [
          {
            source: 'agent-memory',
            rawPath: '.agent-memory/release.md',
            fact: 'Publish only after npm pack dry-run passes.',
            suggestedType: 'project',
          },
          {
            source: 'cursor',
            rawPath: '.cursor/rules/auth.mdc',
            fact: 'Auth handlers must forward AbortSignal.',
            suggestedType: 'project',
          },
        ],
      })
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('classifies and drafts memory promotion from local candidates', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-memory-pipeline-'))
    try {
      process.chdir(root)
      writeFileSync(
        join(root, 'doc-bridge.config.json'),
        JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs/for-agents' } } }),
      )
      mkdirSync(join(root, 'docs/for-agents/packages'), { recursive: true })
      mkdirSync(join(root, '.agent-memory'), { recursive: true })
      writeFileSync(join(root, 'docs/for-agents/INDEX.md'), '# Agent docs\n')
      writeFileSync(join(root, 'docs/for-agents/packages/sidecar.md'), '# Sidecar\n\nPackage sidecar owns transport.\n')
      writeFileSync(join(root, '.agent-memory/sidecar.md'), '# Sidecar\n\npackage sidecar owns transport boundaries.\n')
      expect(runCli(['index'])).toBe(0)

      const classified = captureStdout(() => runCli(['memory', 'classify']))
      expect(classified.code).toBe(0)
      expect(classified.out).toContain('"route": "agent"')

      const promoted = captureStdout(() => runCli(['memory', 'promote']))
      expect(promoted.code).toBe(0)
      expect(promoted.out).toContain('Draft doc-bridge memory promotion')
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('prints registry topology and playbook draft', () => {
    const topology = captureStdout(() => runCli(['registry', 'topology']))
    expect(topology.code).toBe(0)
    expect(topology.out).toContain('doc-curator')

    const draft = captureStdout(() => runCli(['playbook', 'draft']))
    expect(draft.code).toBe(0)
    expect(draft.out).toContain('Doc Bridge Pattern')
  })

  it('prints command usage for registry, playbook, and memory mistakes', () => {
    expect(captureStderr(() => runCli(['registry'])).err).toContain('registry topology')
    expect(captureStderr(() => runCli(['playbook'])).err).toContain('playbook draft')
    expect(captureStdout(() => runCli(['playbook', 'pattern', '--text'])).out).toContain(
      'Doc Bridge Pattern',
    )
    expect(captureStderr(() => runCli(['memory', 'nope'])).err).toContain('memory <ingest|classify|promote>')
  })

  it('returns errors when commands cannot load the project', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-bad-project-'))
    try {
      process.chdir(root)
      writeFileSync(join(root, 'doc-bridge.config.json'), '{"schemaVersion":1,"corpus":{"agent":{}}}\n')
      for (const argv of [
        ['bootstrap', 'agent-docs'],
        ['memory', 'ingest'],
        ['playbook', 'draft'],
        ['index'],
        ['gate', 'run'],
        ['ask', 'question'],
      ]) {
        const result = captureStderr(() => runCli(argv))
        expect(result.code).toBe(1)
        expect(result.err).toContain('corpus.agent.root')
      }

      const retrieve = await captureStdoutAsync(() => runCli(['retrieve', 'query']))
      expect(retrieve.code).toBe(1)
    } finally {
      process.chdir(projectRoot)
    }
  })

  it('retrieves hybrid chunks from local index', async () => {
    const result = await captureStdoutAsync(() => runCli(['retrieve', 'schema']))
    expect(result.code).toBe(0)
    expect(result.out).toContain('"chunks"')
  })
})
