import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, openSync, fstatSync, closeSync, symlinkSync, rmSync, mkdirSync, chmodSync, existsSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { loadProtocol, planStudy, parseOptions, runAttempt, repositoryTools, connectMcp, probeMcpToolNames, main, runCliAttempt, cliArguments, cliChildEnv, studyPrompt, probeCliVersion,
  safePath, exportCorpus, corpusFiles, removeCorpus, cliDisallowedMcpTools, computeCliCost, checkCliInit, checkCliActivity, observeCliStream, probeDocBridgeReadiness,
  checkoutConfigPath, preflightCliMcp, CHECKOUT_CONFIG_CANDIDATES,
  CLI_DOC_BRIDGE_TOOLS, CLI_DEFAULT_ATTEMPT_BUDGET_USD, CLI_PINNED_VERSION, CLI_PRICES } from '../scripts/study-minimal.mjs'
import { MCP_TOOLS } from '../src/mcp/server.js'

const config = { model: 'fixture-model', key: 'fixture-key', inputPrice: 1, outputPrice: 2 }
const task = { question: 'Find the public contract', expected: ['Never send this rubric'] }
const reply = (input_tokens = 100, output_tokens = 20, extra = {}) => ({ ok: true, json: async () => ({ usage: { input_tokens, output_tokens }, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Answer with source:1' }], ...extra }) })

describe('minimal study without network or a real credential', () => {
  it('validates the six-task paired matrix, pins and pilot', () => {
    const protocol = loadProtocol()
    expect(planStudy(protocol)).toHaveLength(36)
    expect(planStudy(protocol, true)).toHaveLength(2)
    expect(planStudy(protocol).filter(item => item.scenario === 'repository-only')).toHaveLength(18)
    expect(() => planStudy({ ...protocol, repetitions: 2 })).toThrow()
    expect(() => planStudy({ ...protocol, tasks: protocol.tasks.slice(1) })).toThrow()
    expect(() => planStudy({ ...protocol, repositories: { ...protocol.repositories, 'doc-bridge': 'main' } })).toThrow()
  })

  it('dry-run requires neither credentials nor model; execution fails closed', () => {
    expect(parseOptions(['--dry-run'], {}).dryRun).toBe(true)
    expect(() => parseOptions(['--pilot'], {})).toThrow()
    const env = { STUDY_MODEL: 'fixture-model', ANTHROPIC_API_KEY: 'fixture-key', STUDY_BUDGET_USD: '1', STUDY_INPUT_USD_PER_MILLION: '1', STUDY_OUTPUT_USD_PER_MILLION: '2' }
    expect(parseOptions(['--pilot', '--approve-budget', '--output', 'fixture.json'], env).config.model).toBe('fixture-model')
    expect(() => parseOptions(['--pilot', '--approve-budget', '--output', 'fixture.json'], { ...env, STUDY_MODEL: '' })).toThrow()
    expect(() => parseOptions(['--pilot', '--approve-budget', '--output', 'fixture.json'], { ...env, ANTHROPIC_API_KEY: 'bad\nkey' })).toThrow()
    expect(() => parseOptions(['--pilot', '--approve-budget', '--output', 'fixture.json'], { ...env, STUDY_BUDGET_USD: 'NaN' })).toThrow()
  })

  it('refuses the paid call before exceeding the cap', async () => {
    const http = vi.fn()
    const result = await runAttempt({ task, tools: [], config, budget: { cap: 0.000001, spent: 0 }, fetchImpl: http })
    expect(result.status).toBe('budget-exceeded')
    expect(http).not.toHaveBeenCalled()
  })

  it('records measured usage, leaves correctness pending, and withholds expected answers', async () => {
    const budget = { cap: 1, spent: 0 }
    const http = vi.fn(async (_url, request) => {
      expect(request.body).not.toContain('Never send this rubric')
      expect(budget.spent).toBeGreaterThan(0.001)
      return reply()
    })
    const result = await runAttempt({ task, tools: [], config, budget, fetchImpl: http })
    expect(result).toMatchObject({ inputTokens: 100, outputTokens: 20, toolCalls: 0, correctness: null, adjudication: 'pending', status: 'completed' })
    expect(budget.spent).toBeCloseTo(0.00014)
  })

  it('executes tools and accounts for every conversation turn', async () => {
    const call = vi.fn(() => 'source:1 evidence')
    const http = vi.fn().mockResolvedValueOnce(reply(100, 20, { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'repo_read', input: { path: 'README.md' } }] })).mockResolvedValueOnce(reply(150, 30))
    const result = await runAttempt({ task, tools: [{ name: 'repo_read', input_schema: { type: 'object' }, call }], config, budget: { cap: 1, spent: 0 }, fetchImpl: http })
    expect(result).toMatchObject({ inputTokens: 250, outputTokens: 50, toolCalls: 1, status: 'completed' })
    expect(call).toHaveBeenCalledWith({ path: 'README.md' })
    expect(JSON.parse(http.mock.calls[1][1].body).messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' })
  })

  it('retains ambiguous spend and never retries or exposes provider errors', async () => {
    const budget = { cap: 1, spent: 0 }
    const http = vi.fn().mockRejectedValue(new Error('fixture-key secret provider detail'))
    const result = await runAttempt({ task, tools: [], config, budget, fetchImpl: http })
    expect(result).toMatchObject({ status: 'failed', usageComplete: false, answer: '' })
    expect(JSON.stringify(result)).not.toContain('fixture-key')
    expect(budget.spent).toBeGreaterThan(0)
    expect(http).toHaveBeenCalledTimes(1)
  })

  it('rejects missing or over-ceiling usage instead of inventing measurements', async () => {
    for (const response of [reply(-1), reply(100000000), reply(100, 1025), { ok: false }]) {
      const budget = { cap: 1, spent: 0 }
      const result = await runAttempt({ task, tools: [], config, budget, fetchImpl: async () => response })
      expect(result).toMatchObject({ status: 'failed', usageComplete: false })
      expect(budget.spent).toBeGreaterThan(0)
    }
  })

  it('preserves measured prior turns and elapsed time when a later request fails', async () => {
    const http = vi.fn().mockResolvedValueOnce(reply(100, 20, { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'repo_read', input: {} }] })).mockRejectedValueOnce(new Error('fixture-key'))
    const result = await runAttempt({ task, tools: [{ name: 'repo_read', input_schema: { type: 'object' }, call: () => 'evidence' }], config, budget: { cap: 1, spent: 0 }, fetchImpl: http })
    expect(result).toMatchObject({ status: 'failed', inputTokens: 100, outputTokens: 20, toolCalls: 1, usageComplete: false })
    expect(result.wallTimeMs).toBeGreaterThanOrEqual(0)
    expect(http).toHaveBeenCalledTimes(2)
  })

  it('reads frozen Git blobs and rejects traversal, secrets and dirty-file substitution', async () => {
    const root = mkdtempSync(join(tmpdir(), 'study-source-'))
    try {
      execFileSync('git', ['init', root], { stdio: 'ignore' })
      writeFileSync(join(root, 'README.md'), 'frozen evidence\nsecond line')
      writeFileSync(join(root, '.env'), 'not available')
      execFileSync('git', ['-C', root, 'add', '.'])
      execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'fixture'], { stdio: 'ignore' })
      const pin = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      writeFileSync(join(root, 'README.md'), 'dirty substitution')
      const tools = await repositoryTools(root, pin)
      expect(await tools[1].call({ path: 'README.md', lines: 1 })).toBe('1: frozen evidence')
      expect((await tools[2].call({ term: 'frozen' })).matches).toEqual(['README.md:1: frozen evidence'])
      await expect(tools[1].call({ path: '../README.md' })).rejects.toThrow()
      await expect(tools[1].call({ path: '.env' })).rejects.toThrow()
      const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(30001)
      try { await expect(tools[2].call({ term: 'frozen' })).rejects.toThrow('Source search timed out') }
      finally { clock.mockRestore() }
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('initializes the real local MCP server, lists every tool and invokes a read-only tool without a model', async () => {
    const root = mkdtempSync(join(tmpdir(), 'study-mcp-'))
    let client
    try {
      mkdirSync(join(root, 'docs'))
      writeFileSync(join(root, 'docs', 'guide.md'), '# Evidence\nA public fixture guide.')
      writeFileSync(join(root, 'doc-bridge.config.json'), JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs' }, human: { plugin: 'plain-markdown', options: { root: 'docs' } } } }))
      const engine = resolve('bin/ak-docs.js')
      execFileSync(process.execPath, [engine, 'index'], { cwd: root, stdio: 'pipe', timeout: 30000 })
      client = connectMcp(root, engine)
      const tools = await client.tools()
      expect(tools.map(tool => tool.name).sort()).toEqual(['doc_get', 'doc_search', 'handoff_resolve'])
      expect((await probeMcpToolNames(root, engine)).sort()).toEqual(MCP_TOOLS.map(tool => tool.name).sort())
      const result = await tools.find(tool => tool.name === 'doc_search').call({ term: 'Evidence' })
      expect(result.content).toBeDefined()
    } finally { client?.close(); rmSync(root, { recursive: true, force: true }) }
  }, 40000)

  it('derives the CLI deny list from every MCP tool except the three read-only ones, and fails if one is missing', () => {
    const names = MCP_TOOLS.map(tool => tool.name)
    const denied = cliDisallowedMcpTools(names)
    expect(denied).toHaveLength(names.length - 3)
    expect(denied).toContain('mcp__doc-bridge__docbridge_run')
    for (const name of CLI_DOC_BRIDGE_TOOLS) expect(denied).not.toContain(name)
    expect(() => cliDisallowedMcpTools(names.filter(name => name !== 'doc.get'))).toThrow()
    expect(() => cliDisallowedMcpTools([...names, 'bad name'])).toThrow()
  })

  it('exports only HTTP-readable files at the pin into the agent working directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'study-export-'))
    const destination = mkdtempSync(join(tmpdir(), 'study-export-out-'))
    try {
      execFileSync('git', ['init', '--quiet', root], { stdio: 'ignore' })
      const files = { 'README.md': 'public', 'doc-bridge.config.json': '{}', 'docs/guide.md': 'guide', 'src/index.ts': 'export {}', '.env': 'no',
        '.github/ci.yml': 'no', 'pnpm-lock.yaml': 'no', 'docs/credentials.md': 'no', 'logo.png': 'no', 'docs/study/minimal-study-x.md': 'no',
        'CLAUDE.md': 'project rules', 'AGENTS.md': 'agent rules', 'docs/huge.md': 'x'.repeat(200001), 'dist/built.js': 'no' }
      for (const [path, text] of Object.entries(files)) { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text) }
      symlinkSync('README.md', join(root, 'link.md'))
      execFileSync('git', ['-C', root, 'add', '-A'])
      execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'fixture'], { stdio: 'ignore' })
      const pin = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      const exported = await exportCorpus(root, pin, destination)
      const expected = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'doc-bridge.config.json', 'docs/guide.md', 'src/index.ts']
      expect(exported.sort()).toEqual(expected)
      expect(await corpusFiles(root, pin)).toEqual(exported)
      const found = []
      // Directories as well as files carry no write bit, so nothing the agent creates can be written into the export.
      const walk = dir => {
        expect(statSync(dir).mode & 0o222).toBe(0)
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) walk(full)
          else { found.push(relative(destination, full)); expect(statSync(full).mode & 0o222).toBe(0) }
        }
      }
      walk(destination)
      expect(found.sort()).toEqual(expected)
      expect(found.every(path => safePath(path))).toBe(true)
      expect(existsSync(join(destination, '.git'))).toBe(false)
      // A read-only export can still be removed after the run.
      removeCorpus(destination)
      expect(existsSync(destination)).toBe(false)
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(destination, { recursive: true, force: true }) }
  })

  it('runs the complete pilot with mocked HTTP, real frozen corpus/MCP, private ledger and extrapolation', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'study-pilot-'))
    const root = join(temporary, 'corpus')
    const output = join(temporary, 'private.json')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const http = vi.fn(async () => reply())
    vi.stubGlobal('fetch', http)
    try {
      const protocol = loadProtocol()
      protocol.repositories['doc-bridge'] = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      execFileSync('git', ['clone', '--quiet', '--depth', '1', '--no-local', '--no-checkout', resolve('.'), root], { stdio: 'pipe' })
      execFileSync('git', ['-C', root, 'checkout', '--quiet', '--detach', protocol.repositories['doc-bridge']], { stdio: 'pipe' })
      execFileSync(process.execPath, [resolve('bin/ak-docs.js'), 'index'], { cwd: root, stdio: 'pipe', timeout: 60000 })
      const args = ['--pilot', '--approve-budget', '--root', `doc-bridge=${root}`, '--output', output]
      const env = { STUDY_MODEL: config.model, ANTHROPIC_API_KEY: config.key, STUDY_BUDGET_USD: '1', STUDY_INPUT_USD_PER_MILLION: '1', STUDY_OUTPUT_USD_PER_MILLION: '2' }
      const link = join(temporary, 'output-link')
      symlinkSync(root, link, 'junction')
      await expect(main([...args.slice(0, -1), join(link, 'private.json')], env, protocol)).rejects.toThrow('Private output must be outside checkouts')
      expect(http).not.toHaveBeenCalled()
      await main(args, env, protocol)
      const fd = openSync(output, 'r')
      let ledgerText
      try {
        expect(fstatSync(fd).mode & 0o777).toBe(0o600)
        ledgerText = readFileSync(fd, 'utf8')
      } finally { closeSync(fd) }
      const ledger = JSON.parse(ledgerText)
      expect(ledger).toMatchObject({ mode: 'pilot', status: 'awaiting-adjudication', model: 'fixture-model', adjudication: { method: 'agent', humanReview: false } })
      expect(ledger.observations).toHaveLength(2)
      expect(ledgerText).not.toContain(config.key)
      const summary = JSON.parse(log.mock.calls.at(-1)![0])
      expect(summary).toMatchObject({ inputTokens: 200, outputTokens: 40, attempts: 2 })
      expect(summary.extrapolatedFullRunUsd).toBeCloseTo(0.00028 * 18)
      const requests = http.mock.calls.map(call => JSON.parse(call[1].body))
      expect(requests[0].tools).toHaveLength(3)
      expect(requests[1].tools).toHaveLength(6)
      await expect(main(args, env, protocol)).rejects.toThrow()
      expect(http).toHaveBeenCalledTimes(2)
    } finally { vi.unstubAllGlobals(); log.mockRestore(); rmSync(temporary, { recursive: true, force: true }) }
  }, 120000)
})

// Fake Claude Code executable. It records each invocation (argv, whether ANTHROPIC_API_KEY reached it, its working
// directory entries) and then emits a stream-json transcript built from behavior.json. It never contacts a model.
// The init event reflects the arguments it received: doc-bridge MCP only when --mcp-config names doc-bridge.
const FAKE_CLAUDE = `#!/usr/bin/env node
const { readFileSync, writeFileSync, existsSync, readdirSync } = require('node:fs')
const { join, dirname } = require('node:path')
const dir = dirname(process.argv[1])
if (process.argv[2] === '--version') { process.stdout.write(readFileSync(join(dir, 'version.txt'), 'utf8')); process.exit(0) }
const behavior = JSON.parse(readFileSync(join(dir, 'behavior.json'), 'utf8'))
const argv = process.argv.slice(2)
const recordPath = join(dir, 'records.json')
const records = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : []
records.push({ argv, apiKeyPresent: Object.prototype.hasOwnProperty.call(process.env, 'ANTHROPIC_API_KEY'), entries: readdirSync(process.cwd(), { recursive: true }).sort(), cwd: process.cwd() })
writeFileSync(recordPath, JSON.stringify(records))
if (behavior.mode === 'sleep') setTimeout(() => {}, 60000)
else if (behavior.mode === 'exit') { process.stderr.write('fixture failure'); process.exit(2) }
else if (behavior.mode === 'garbage') process.stdout.write('not json')
else {
  const mcpConfig = argv[argv.indexOf('--mcp-config') + 1] ?? '{}'
  const mcp = mcpConfig.includes('"doc-bridge"')
  const builtins = ['Read', 'Grep', 'Glob']
  const init = { type: 'system', subtype: 'init', model: 'claude-haiku-5-5', tools: mcp ? [...builtins, ...behavior.mcpTools] : builtins,
    mcp_servers: mcp ? [{ name: 'doc-bridge', status: 'connected' }] : [], ...behavior.init }
  const lines = [init, ...behavior.events, behavior.result]
  // Raw text written before the transcript, to simulate a malformed line ahead of the result.
  if (behavior.prefix) process.stdout.write(behavior.prefix)
  process.stdout.write(lines.map(line => JSON.stringify(line)).join('\\n') + '\\n')
  // result-then-sleep: the transcript is complete but the process hangs, as a timed-out CLI would.
  if (behavior.mode === 'result-then-sleep') setTimeout(() => {}, 60000)
  // The 2.1.296 bundle exits with is_error ? 1 : 0 in print mode, so the fixture can exit non-zero after a result.
  else process.exitCode = behavior.exitCode ?? 0
}
`
const CLI_VERSION = '2.1.296 (Claude Code)'
const okUsage = { input_tokens: 1200, cache_creation_input_tokens: 300, cache_read_input_tokens: 5000, output_tokens: 150 }
const okModelUsage = { 'claude-haiku-5-5': { inputTokens: 1200, outputTokens: 150, cacheReadInputTokens: 5000, cacheCreationInputTokens: 300, costUSD: 0.0002825 } }
// 1200*0.10 + 150*0.50 + 5000*0.01 + 300*0.125 = 282.5 per million tokens = 0.0002825 USD at list price.
const okResult = { type: 'result', subtype: 'success', is_error: false, result: 'Answer with source:1', num_turns: 2, total_cost_usd: 0.0002825, duration_ms: 900,
  usage: okUsage, modelUsage: okModelUsage, permission_denials: [] }
const okEvents = [{ type: 'assistant', message: { id: 'm1', model: 'claude-haiku-5-5', usage: okUsage, content: [{ type: 'text', text: 'Answer with source:1' }] } }]
const toolUse = (id: string, name: string) => ({ type: 'assistant', message: { id: `msg-${id}`, model: 'claude-haiku-5-5', content: [{ type: 'tool_use', id, name, input: {} }] } })
const toolResult = (tool_use_id: string, is_error: boolean) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id, is_error, content: is_error ? 'error' : 'ok' }] } })
// A success whose charged cost is 0.7 USD at list price (1,400,000 output tokens at 0.50 per million).
const overCost = { ...okResult, total_cost_usd: 0.7, usage: { input_tokens: 0, output_tokens: 1400000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  modelUsage: { 'claude-haiku-5-5': { inputTokens: 0, outputTokens: 1400000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.7 } } }
const fakeClaude = (behavior: Record<string, unknown>, version = `${CLI_VERSION}\n`) => {
  const dir = mkdtempSync(join(tmpdir(), 'study-claude-'))
  const bin = join(dir, 'claude')
  writeFileSync(bin, FAKE_CLAUDE)
  chmodSync(bin, 0o755)
  writeFileSync(join(dir, 'version.txt'), version)
  const setBehavior = (next: Record<string, unknown>) => writeFileSync(join(dir, 'behavior.json'), JSON.stringify({ mcpTools: CLI_DOC_BRIDGE_TOOLS, ...next }))
  setBehavior(behavior)
  const records = () => (existsSync(join(dir, 'records.json')) ? JSON.parse(readFileSync(join(dir, 'records.json'), 'utf8')) : []) as { argv: string[]; apiKeyPresent: boolean; entries: string[]; cwd: string }[]
  const record = () => records().at(-1)!
  const ran = () => existsSync(join(dir, 'records.json'))
  return { dir, bin, setBehavior, records, record, ran }
}
const cliFake = (extra: Record<string, unknown> = {}) => fakeClaude({ mode: 'ok', events: okEvents, result: okResult, ...extra })
const cliConfig = (bin: string, extra: Record<string, unknown> = {}) => ({ transport: 'cli', model: 'claude-haiku-5-5', claudeBin: bin, attemptBudgetUsd: 0.5, cliVersion: CLI_VERSION, expectedCliVersion: CLI_PINNED_VERSION, disallowedMcpTools: ['mcp__doc-bridge__docbridge_run'], ...extra })
const engine = resolve('bin/ak-docs.js')
const runCli = (fake: { dir: string; bin: string }, scenario: string, options: { config?: Record<string, unknown>; budget?: { cap: number; spent: number }; timeoutMs?: number } = {}) =>
  runCliAttempt({ task, scenario, config: cliConfig(fake.bin, options.config), budget: options.budget ?? { cap: 1, spent: 0 }, engine, workdir: fake.dir, mcpRoot: resolve('.'), timeoutMs: options.timeoutMs })

describe('CLI transport: headless Claude Code without an API key', () => {
  it('builds one argument array per scenario that differ only in MCP config and its allowed tools', async () => {
    const fake = cliFake()
    try {
      await runCli(fake, 'repository-only')
      const repository = fake.record().argv
      await runCli(fake, 'doc-bridge-mcp')
      const mcp = fake.record().argv
      expect(repository).toHaveLength(mcp.length)
      const differing = repository.flatMap((value, index) => value === mcp[index] ? [] : [index])
      expect(differing.map(index => repository[index - 1])).toEqual(['--allowedTools', '--mcp-config'])
      expect(JSON.parse(repository[differing[1]])).toEqual({ mcpServers: {} })
      expect(JSON.parse(mcp[differing[1]]).mcpServers['doc-bridge']).toEqual({ type: 'stdio', command: process.execPath,
        args: [engine, '--config', join(resolve('.'), 'doc-bridge.config.json'), 'mcp'] })
      expect(mcp[differing[0]]).toBe('Read,Grep,Glob,mcp__doc-bridge__doc_search,mcp__doc-bridge__doc_get,mcp__doc-bridge__handoff_resolve')
      expect(repository[repository.length - 1]).toBe(studyPrompt(task))
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('uses stream-json with --verbose, the pinned model, read-only tools, non-interactive permissions and the per-attempt cap', async () => {
    const fake = cliFake()
    try {
      await runCli(fake, 'repository-only')
      const argv = fake.record().argv
      expect(argv).toEqual(expect.arrayContaining(['-p', '--model', 'claude-haiku-5-5', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
        '--restricted', '--disable-slash-commands', '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--strict-mcp-config']))
      expect(argv).not.toContain('json')
      expect(argv[argv.indexOf('--max-budget-usd') + 1]).toBe('0.500000')
      expect(argv[argv.indexOf('--tools') + 1]).toBe('Read,Grep,Glob')
      const denied = argv[argv.indexOf('--disallowedTools') + 1].split(',')
      expect(denied).toEqual(expect.arrayContaining(['Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'mcp__doc-bridge__docbridge_run']))
      expect(denied).not.toContain('mcp__doc-bridge__doc_search')
      expect(argv[argv.length - 1]).toBe(studyPrompt(task))
      expect(cliArguments({ model: 'm', scenario: 'doc-bridge-mcp', prompt: 'p', maxBudgetUsd: '1.000000', engine, checkoutRoot: '/x' })).toHaveLength(argv.length)
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('pins the Claude Code version: any other probed version is refused before any prompt runs', async () => {
    const old = fakeClaude({ mode: 'ok' }, '2.1.288 (Claude Code)\n')
    const fake = cliFake()
    try {
      await expect(probeCliVersion(old.bin)).rejects.toThrow('not the pinned version')
      await expect(probeCliVersion(old.bin, '2.1.288')).resolves.toBe('2.1.288 (Claude Code)')
      expect(await probeCliVersion(fake.bin)).toBe(CLI_VERSION)
      expect(fake.ran()).toBe(false)
      expect(old.ran()).toBe(false)
      expect(() => parseOptions(['--pilot', '--approve-budget', '--transport', 'cli', '--cli-version', 'latest', '--output', 'f.json'], { STUDY_MODEL: 'claude-haiku-5-5', STUDY_BUDGET_USD: '1' })).toThrow()
    } finally { rmSync(old.dir, { recursive: true, force: true }); rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('never passes ANTHROPIC_API_KEY to the child, even when the parent has one', async () => {
    const saved = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'fixture-parent-key-not-real'
    const fake = cliFake()
    try {
      const result = await runCli(fake, 'doc-bridge-mcp')
      expect(fake.record().apiKeyPresent).toBe(false)
      expect(JSON.stringify(result)).not.toContain('fixture-parent-key-not-real')
      expect(cliChildEnv({ ANTHROPIC_API_KEY: 'x', PATH: '/usr/bin:/bin', HOME: '/home/fixture' })).not.toHaveProperty('ANTHROPIC_API_KEY')
      expect(cliChildEnv({ ANTHROPIC_API_KEY: 'x', PATH: '/usr/bin:/bin' })).toHaveProperty('PATH', '/usr/bin:/bin')
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = saved
      rmSync(fake.dir, { recursive: true, force: true })
    }
  })

  it('does not require or read a credential for CLI execution options and defaults the attempt bound to 0.10 USD', () => {
    const options = parseOptions(['--pilot', '--approve-budget', '--transport', 'cli', '--output', 'fixture.json'], { STUDY_MODEL: 'claude-haiku-5-5', STUDY_BUDGET_USD: '1' })
    expect(options.config).toEqual({ transport: 'cli', model: 'claude-haiku-5-5', claudeBin: 'claude', expectedCliVersion: '2.1.296', attemptBudgetUsd: 0.1 })
    expect(CLI_DEFAULT_ATTEMPT_BUDGET_USD).toBe(0.1)
    expect(() => parseOptions(['--transport', 'bogus', '--dry-run'], {})).toThrow()
    expect(() => parseOptions(['--pilot', '--approve-budget', '--transport', 'cli', '--output', 'f.json'], { STUDY_MODEL: 'claude-haiku-4-5', STUDY_BUDGET_USD: '1' })).toThrow('claude-haiku-5-5')
    expect(parseOptions(['--pilot', '--approve-budget', '--output', 'fixture.json'], { STUDY_MODEL: 'fixture-model', ANTHROPIC_API_KEY: 'fixture-key', STUDY_BUDGET_USD: '1', STUDY_INPUT_USD_PER_MILLION: '1', STUDY_OUTPUT_USD_PER_MILLION: '2' }).config.transport).toBe('http')
  })

  it('parses usage, cache tokens, the CLI-reported cost and the computed cost, and charges the completed attempt', async () => {
    const fake = cliFake()
    try {
      const budget = { cap: 1, spent: 0 }
      const result = await runCli(fake, 'repository-only', { budget })
      expect(result).toMatchObject({ transport: 'cli', status: 'completed', answer: 'Answer with source:1', inputTokens: 1200, outputTokens: 150,
        cacheCreationInputTokens: 300, cacheReadInputTokens: 5000, numTurns: 2, cliReportedCostUsd: 0.0002825, chargedUsd: 0.0002825,
        isError: false, usageComplete: true, toolCalls: 0, cliVersion: CLI_VERSION, correctness: null, adjudication: 'pending', costBasis: 'per-request tier' })
      expect(result.computedCostUsd).toBeCloseTo(0.0002825, 12)
      expect(result.initModel).toBe('claude-haiku-5-5')
      expect(result.initTools).toEqual(['Read', 'Grep', 'Glob'])
      expect(result.initMcpServers).toEqual([])
      expect(budget.spent).toBeCloseTo(0.0002825, 12)
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('records the init tool list and MCP status, and counts tool calls by name from the stream', async () => {
    const fake = cliFake({ events: [toolUse('t1', 'Read'), toolUse('t2', 'Read'), toolUse('t3', 'Grep'), toolUse('t4', 'mcp__doc-bridge__doc_search'), ...okEvents] })
    try {
      const repository = await runCli(fake, 'repository-only')
      expect(repository).toMatchObject({ status: 'invalid-setup', toolCallsByName: { Read: 2, Grep: 1, 'mcp__doc-bridge__doc_search': 1 }, toolCalls: 4 })
      expect(repository.setupProblem).toMatch(/outside the allowed set/)
      fake.setBehavior({ mode: 'ok', events: [toolUse('t1', 'Read'), toolUse('t2', 'mcp__doc-bridge__doc_search'), toolUse('t2', 'mcp__doc-bridge__doc_search'), ...okEvents], result: okResult })
      const mcp = await runCli(fake, 'doc-bridge-mcp')
      expect(mcp).toMatchObject({ status: 'completed', toolCallsByName: { Read: 1, 'mcp__doc-bridge__doc_search': 1 }, toolCalls: 2 })
      expect(mcp.initMcpServers).toEqual([{ name: 'doc-bridge', status: 'connected' }])
      expect(mcp.initTools).toEqual(['Read', 'Grep', 'Glob', ...CLI_DOC_BRIDGE_TOOLS])
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('fails closed with invalid-setup on init mismatches, charging the limit and never a completed result', async () => {
    const builtins = ['Read', 'Grep', 'Glob']
    const cases: [string, Record<string, unknown>][] = [
      ['repository-only', { init: { tools: [...builtins, 'Bash'] } }],
      ['repository-only', { init: { mcp_servers: [{ name: 'claude.ai Notion', status: 'connected' }] } }],
      ['repository-only', { init: { model: 'claude-haiku-4-5' } }],
      ['doc-bridge-mcp', { init: { mcp_servers: [{ name: 'doc-bridge', status: 'failed' }] } }],
      ['doc-bridge-mcp', { init: { tools: [...builtins, ...CLI_DOC_BRIDGE_TOOLS.slice(0, 2)] } }],
      ['doc-bridge-mcp', { init: { tools: [...builtins, ...CLI_DOC_BRIDGE_TOOLS, 'mcp__doc-bridge__docbridge_run'] } }],
    ]
    for (const [scenario, behavior] of cases) {
      const fake = cliFake({ ...behavior })
      try {
        const budget = { cap: 1, spent: 0 }
        const result = await runCli(fake, scenario, { budget })
        expect(result).toMatchObject({ status: 'invalid-setup', answer: '', chargedUsd: 0.5 })
        expect(result.setupProblem).toBeTruthy()
        expect(budget.spent).toBeCloseTo(0.5)
      } finally { rmSync(fake.dir, { recursive: true, force: true }) }
    }
  })

  it('treats a denied MCP call, a denied non-read tool or an attempted tool outside the set as invalid-setup', async () => {
    const denied = (tool_name: string) => ({ ...okResult, permission_denials: [{ tool_name, tool_use_id: 'x' }] })
    const cases: [string, Record<string, unknown>][] = [
      ['doc-bridge-mcp', { result: denied('mcp__doc-bridge__doc_search') }],
      ['doc-bridge-mcp', { result: denied('Bash') }],
      ['doc-bridge-mcp', { events: [toolUse('b1', 'Bash'), ...okEvents] }],
    ]
    for (const [scenario, behavior] of cases) {
      const fake = cliFake(behavior)
      try {
        expect(await runCli(fake, scenario)).toMatchObject({ status: 'invalid-setup' })
      } finally { rmSync(fake.dir, { recursive: true, force: true }) }
    }
    const readDenied = cliFake({ result: denied('Read') })
    try {
      expect(await runCli(readDenied, 'repository-only')).toMatchObject({ status: 'completed', permissionDenials: 1, permissionDenialTools: ['Read'] })
    } finally { rmSync(readDenied.dir, { recursive: true, force: true }) }
  })

  it('records MCP tool_result errors by tool name and fails the doc-bridge attempt when every MCP call errored', async () => {
    const search = 'mcp__doc-bridge__doc_search'
    const allFailed = cliFake({ events: [toolUse('m1', search), toolResult('m1', true), toolUse('m2', 'mcp__doc-bridge__doc_get'), toolResult('m2', true), ...okEvents] })
    const partlyFailed = cliFake({ events: [toolUse('m1', search), toolResult('m1', true), toolUse('m2', 'mcp__doc-bridge__doc_get'), toolResult('m2', false), ...okEvents] })
    try {
      const failed = await runCli(allFailed, 'doc-bridge-mcp')
      expect(failed).toMatchObject({ status: 'invalid-setup', toolErrorsByName: { [search]: 1, 'mcp__doc-bridge__doc_get': 1 }, chargedUsd: 0.5 })
      expect(failed.setupProblem).toMatch(/every doc-bridge tool call returned an error/)
      const partial = await runCli(partlyFailed, 'doc-bridge-mcp')
      expect(partial).toMatchObject({ status: 'completed', toolErrorsByName: { [search]: 1 }, toolCalls: 2 })
    } finally { rmSync(allFailed.dir, { recursive: true, force: true }); rmSync(partlyFailed.dir, { recursive: true, force: true }) }
  })

  it('probes every doc-bridge checkout before any paid attempt, not only the first one in the plan', async () => {
    const indexed = mkdtempSync(join(tmpdir(), 'study-preflight-a-'))
    const bare = mkdtempSync(join(tmpdir(), 'study-preflight-b-'))
    try {
      for (const root of [indexed, bare]) {
        mkdirSync(join(root, 'docs'))
        writeFileSync(join(root, 'docs', 'guide.md'), '# Evidence\nA public fixture guide.')
        writeFileSync(join(root, 'doc-bridge.config.json'), JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs' }, human: { plugin: 'plain-markdown', options: { root: 'docs' } } } }))
      }
      execFileSync(process.execPath, [engine, 'index'], { cwd: indexed, stdio: 'pipe', timeout: 30000 })
      const plan = [{ task: { repository: 'agentskit-chat' }, scenario: 'doc-bridge-mcp' }, { task: { repository: 'agents-playbook' }, scenario: 'doc-bridge-mcp' }]
      // The second checkout has no index; it must be refused even though the first one passes.
      await expect(preflightCliMcp(plan, { 'agentskit-chat': indexed, 'agents-playbook': bare }, engine)).rejects.toThrow('fresh index')
      const denied = await preflightCliMcp(plan.slice(0, 1), { 'agentskit-chat': indexed }, engine)
      expect(denied).toContain('mcp__doc-bridge__gate_status')
      expect(denied).not.toContain('mcp__doc-bridge__doc_search')
      expect(await preflightCliMcp([{ task: { repository: 'agentskit-chat' }, scenario: 'repository-only' }], {}, engine)).toEqual([])
    } finally { rmSync(indexed, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }) }
  }, 90000)

  it('resolves the checkout config like the server does and refuses a checkout without one', () => {
    const root = mkdtempSync(join(tmpdir(), 'study-config-'))
    try {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'no-config' }))
      expect(() => checkoutConfigPath(root)).toThrow('No doc-bridge config')
      writeFileSync(join(root, 'doc-bridge.config.yaml'), 'schemaVersion: 1\n')
      expect(checkoutConfigPath(root)).toBe(join(root, 'doc-bridge.config.yaml'))
      writeFileSync(join(root, 'doc-bridge.config.ts'), 'export default {}\n')
      expect(checkoutConfigPath(root)).toBe(join(root, 'doc-bridge.config.ts'))
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('keeps the checkout config candidates identical to the server discovery order in src', () => {
    const source = readFileSync(resolve('src/config/load-config.ts'), 'utf8')
    const block = /const CONFIG_CANDIDATES = \[([\s\S]*?)\] as const/.exec(source)?.[1] ?? ''
    expect([...block.matchAll(/'([^']+)'/g)].map(match => match[1])).toEqual(CHECKOUT_CONFIG_CANDIDATES)
  })

  it('refuses the doc-bridge arm before any paid attempt when the server does not answer from an index at the pin', async () => {
    const root = mkdtempSync(join(tmpdir(), 'study-ready-'))
    try {
      mkdirSync(join(root, 'docs'))
      writeFileSync(join(root, 'docs', 'guide.md'), '# Evidence\nA public fixture guide.')
      writeFileSync(join(root, 'doc-bridge.config.json'), JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs' }, human: { plugin: 'plain-markdown', options: { root: 'docs' } } } }))
      await expect(probeDocBridgeReadiness(root, engine)).rejects.toThrow('fresh index')
      execFileSync(process.execPath, [engine, 'index'], { cwd: root, stdio: 'pipe', timeout: 30000 })
      await expect(probeDocBridgeReadiness(root, engine)).resolves.toBeUndefined()
    } finally { rmSync(root, { recursive: true, force: true }) }
  }, 60000)

  it('computes cost at list price per request, applies the above-100k tier, and flags any non-study model or a 2x disagreement', () => {
    const price = CLI_PRICES['claude-haiku-5-5']
    expect(price.threshold).toBe(100000)
    const aggregate = (tokens: Record<string, number>) => ({ 'claude-haiku-5-5': { inputTokens: tokens.input ?? 0, outputTokens: tokens.output ?? 0,
      cacheReadInputTokens: tokens.read ?? 0, cacheCreationInputTokens: tokens.write ?? 0, costUSD: 0 } })
    expect(computeCliCost({ modelUsage: aggregate({ input: 50000 }), model: 'claude-haiku-5-5' }).computedCostUsd).toBeCloseTo(0.005, 12)
    // Aggregate prompt above 100k: the above-100k tier is used for all tokens (conservative upper bound).
    const above = computeCliCost({ modelUsage: aggregate({ input: 120000, output: 1000 }), model: 'claude-haiku-5-5' })
    expect(above.computedCostUsd).toBeCloseTo((120000 * 0.5 + 1000 * 2.5) / 1000000, 12)
    expect(above.basis).toBe('aggregate-above-100k')
    // Per-request usage chooses the tier per request: one 150k request and one 10k request.
    const per = computeCliCost({ model: 'claude-haiku-5-5', modelUsage: aggregate({ input: 160000, output: 0 }), requests: [{ input_tokens: 150000, output_tokens: 0 }, { input_tokens: 10000, output_tokens: 0 }].map(u => ({ ...u, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })) })
    expect(per.computedCostUsd).toBeCloseTo((150000 * 0.5 + 10000 * 0.1) / 1000000, 12)
    expect(computeCliCost({ model: 'claude-haiku-5-5', modelUsage: { ...aggregate({ input: 1 }), 'claude-haiku-4-5': { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0 } } }).problem).toMatch(/other than the study model/)
    expect(computeCliCost({ model: 'claude-haiku-5-5', modelUsage: aggregate({ input: 1 }), foreignModel: true }).problem).toMatch(/other than the study model/)
    expect(computeCliCost({ model: 'claude-haiku-5-5', modelUsage: aggregate({ input: 10 }), requests: [{ input_tokens: 9, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }] }).problem).toMatch(/does not match/)
  })

  it('marks invalid-cost and stops when the CLI and computed costs differ by more than 2x, or a foreign model is in modelUsage', async () => {
    const foreign = cliFake({ result: { ...okResult, modelUsage: { ...okModelUsage, 'claude-haiku-4-5': { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.001 } } } })
    const disagree = cliFake({ result: { ...okResult, total_cost_usd: 0.057 } })
    try {
      const budget = { cap: 1, spent: 0 }
      expect(await runCli(foreign, 'repository-only', { budget })).toMatchObject({ status: 'invalid-cost', chargedUsd: 0.5 })
      expect(budget.spent).toBeCloseTo(0.5)
      const second = await runCli(disagree, 'repository-only')
      expect(second).toMatchObject({ status: 'invalid-cost', cliReportedCostUsd: 0.057, computedCostUsd: expect.any(Number) })
      expect(second.costProblem).toMatch(/differ by more than 2x/)
    } finally { rmSync(foreign.dir, { recursive: true, force: true }); rmSync(disagree.dir, { recursive: true, force: true }) }
  })

  it('charges a budget-exceeded attempt its reported cost when that cost is above the per-attempt limit', async () => {
    // Reported and computed costs agree at 0.7 USD (1,400,000 output tokens at 0.50 per million), above the 0.5 limit.
    const overrun = { modelUsage: { 'claude-haiku-5-5': { inputTokens: 0, outputTokens: 1400000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.7 } },
      usage: { input_tokens: 0, output_tokens: 1400000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, total_cost_usd: 0.7, is_error: true, subtype: 'error_max_budget_usd' }
    const fake = cliFake({ events: [], result: { ...okResult, ...overrun } })
    try {
      const budget = { cap: 1, spent: 0 }
      const result = await runCli(fake, 'repository-only', { budget })
      expect(result).toMatchObject({ status: 'budget-exceeded', cliSubtype: 'error_max_budget_usd', cliReportedCostUsd: 0.7, computedCostUsd: 0.7, chargedUsd: 0.7 })
      expect(budget.spent).toBeCloseTo(0.7)
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('keeps the valid result of a non-zero exit and charges its reported cost, not only the reservation', async () => {
    // Reproduces the measured 2.1.296 pattern: error_max_budget_usd printed on stdout with exit code 1.
    const overrun = { ...okResult, subtype: 'error_max_budget_usd', is_error: true, total_cost_usd: 0.03,
      usage: { input_tokens: 0, output_tokens: 60000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      modelUsage: { 'claude-haiku-5-5': { inputTokens: 0, outputTokens: 60000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.03 } } }
    const fake = cliFake({ events: [], result: overrun, exitCode: 1 })
    try {
      const budget = { cap: 1, spent: 0 }
      const result = await runCli(fake, 'repository-only', { budget, config: { attemptBudgetUsd: 0.02 } })
      expect(result).toMatchObject({ status: 'budget-exceeded', exitCode: 1, cliSubtype: 'error_max_budget_usd', cliReportedCostUsd: 0.03 })
      expect(result.chargedUsd).toBeCloseTo(0.03, 12)
      expect(budget.spent).toBeCloseTo(0.03, 12)
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('charges the cost of the last result event when an earlier stream line is malformed, as invalid-setup', async () => {
    // Before the fix the malformed line discarded the transcript, so only the 0.5 USD reservation was charged.
    const fake = cliFake({ prefix: 'not json\n', events: [], result: overCost })
    try {
      const budget = { cap: 1, spent: 0 }
      const result = await runCli(fake, 'repository-only', { budget })
      expect(result).toMatchObject({ status: 'invalid-setup', cliReportedCostUsd: 0.7, computedCostUsd: 0.7, chargedUsd: 0.7 })
      expect(result.setupProblem).toBe('malformed stream line')
      expect(budget.spent).toBeCloseTo(0.7, 12)
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('reads the valid result of a timed-out process, so its reported cost is charged', async () => {
    const fake = cliFake({ mode: 'result-then-sleep', events: [], result: overCost })
    try {
      const budget = { cap: 1, spent: 0 }
      const result = await runCli(fake, 'repository-only', { budget, timeoutMs: 1500 })
      expect(result).toMatchObject({ status: 'budget-exceeded', timedOut: true, cliReportedCostUsd: 0.7, chargedUsd: 0.7 })
      expect(budget.spent).toBeCloseTo(0.7, 12)
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  }, 20000)

  it('marks a success that costs more than its reservation as budget-exceeded and flags a cumulative cap overrun', async () => {
    const fake = cliFake({ events: [], result: overCost })
    try {
      const budget = { cap: 0.6, spent: 0 }
      const result = await runCli(fake, 'repository-only', { budget, config: { attemptBudgetUsd: 0.5 } })
      expect(result).toMatchObject({ status: 'budget-exceeded', cumulativeCapExceeded: true, chargedUsd: 0.7 })
      expect(budget.spent).toBeCloseTo(0.7, 12)
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('refuses to start when the cap is reached and passes min(remaining, per-attempt limit)', async () => {
    const fake = cliFake()
    try {
      const refused = await runCli(fake, 'repository-only', { budget: { cap: 1, spent: 1 } })
      expect(refused.status).toBe('budget-exceeded')
      expect(fake.ran()).toBe(false)
      await runCli(fake, 'repository-only', { budget: { cap: 1, spent: 0.7 } })
      expect(fake.record().argv[fake.record().argv.indexOf('--max-budget-usd') + 1]).toBe('0.300000')
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('charges the full per-attempt limit on non-zero exit, timeout, malformed stream and an incomplete result', async () => {
    const fake = fakeClaude({ mode: 'exit' })
    try {
      const exit = { cap: 1, spent: 0 }
      const failed = await runCli(fake, 'repository-only', { budget: exit })
      expect(failed).toMatchObject({ status: 'failed', usageComplete: false, chargedUsd: 0.5, answer: '' })
      expect(exit.spent).toBeCloseTo(0.5)

      fake.setBehavior({ mode: 'sleep' })
      const timeout = { cap: 1, spent: 0 }
      expect(await runCli(fake, 'repository-only', { budget: timeout, timeoutMs: 300 })).toMatchObject({ status: 'timed-out', chargedUsd: 0.5 })
      expect(timeout.spent).toBeCloseTo(0.5)

      fake.setBehavior({ mode: 'garbage' })
      const malformed = { cap: 1, spent: 0 }
      expect(await runCli(fake, 'repository-only', { budget: malformed })).toMatchObject({ status: 'failed', chargedUsd: 0.5 })
      expect(malformed.spent).toBeCloseTo(0.5)

      fake.setBehavior({ mode: 'ok', events: okEvents, result: { type: 'result', subtype: 'success', is_error: false, result: 'x' } })
      const incomplete = { cap: 1, spent: 0 }
      expect(await runCli(fake, 'repository-only', { budget: incomplete })).toMatchObject({ status: 'failed', chargedUsd: 0.5 })
      expect(incomplete.spent).toBeCloseTo(0.5)

      fake.setBehavior({ mode: 'ok', events: okEvents, result: { ...okResult, is_error: true, subtype: 'error_during_execution', total_cost_usd: 0.0002825 } })
      expect(await runCli(fake, 'repository-only')).toMatchObject({ status: 'failed', isError: true, cliReportedCostUsd: 0.0002825, chargedUsd: 0.5 })
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  }, 20000)

  it('reports the CLI version from a probe that runs no prompt', async () => {
    const fake = cliFake()
    try {
      expect(await probeCliVersion(fake.bin)).toBe(CLI_VERSION)
      expect(fake.ran()).toBe(false)
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('checks the init event and the activity rules as pure functions', () => {
    const repository = { scenario: 'repository-only', model: 'claude-haiku-5-5' }
    expect(checkCliInit({ model: 'claude-haiku-5-5', tools: ['Read', 'Grep', 'Glob'], mcp_servers: [] }, repository)).toBeNull()
    expect(checkCliInit({ model: 'claude-haiku-5-5', tools: ['Read', 'Grep', 'Glob', 'Read'], mcp_servers: [] }, repository)).toMatch(/tool list/)
    expect(checkCliActivity({ toolCallsByName: { Read: 3 }, denialNames: ['Read'], scenario: 'repository-only' })).toBeNull()
    expect(checkCliActivity({ toolCallsByName: { Write: 1 }, denialNames: [], scenario: 'repository-only' })).toMatch(/outside the allowed set/)
    expect(checkCliActivity({ toolCallsByName: {}, denialNames: ['<unknown>'], scenario: 'repository-only' })).toMatch(/denied/)
    expect(observeCliStream('{"type":"result"}\n{"type":"assistant"}', 'claude-haiku-5-5').problems).toContain('result is not the last stream event')
    // A malformed line is reported, and the last result event is still read so its cost can be charged.
    const garbled = observeCliStream('not json\n{"type":"result","total_cost_usd":0.7}\n', 'claude-haiku-5-5')
    expect(garbled.problems).toEqual(['malformed stream line'])
    expect(garbled.result).toMatchObject({ total_cost_usd: 0.7 })
  })

  it('keeps the dry run at 36 full and 2 pilot attempts without spawning Claude or using the network', async () => {
    const protocol = loadProtocol()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      await main(['--dry-run', '--transport', 'cli', '--claude-bin', '/nonexistent/claude'], {}, protocol)
      expect(JSON.parse(log.mock.calls.at(-1)![0])).toMatchObject({ attempts: 36, transport: 'cli', networkCalls: 0, claudeProcesses: 0 })
      await main(['--dry-run', '--pilot', '--transport', 'cli', '--claude-bin', '/nonexistent/claude'], {}, protocol)
      expect(JSON.parse(log.mock.calls.at(-1)![0])).toMatchObject({ attempts: 2, transport: 'cli', claudeProcesses: 0 })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals(); log.mockRestore() }
  })

  it('runs the pilot end to end through the CLI transport: clean export, private ledger, no API key', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'study-cli-pilot-'))
    const root = join(temporary, 'corpus')
    const output = join(temporary, 'private.json')
    const fake = cliFake()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const protocol = loadProtocol()
      protocol.repositories['doc-bridge'] = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      execFileSync('git', ['clone', '--quiet', '--depth', '1', '--no-local', '--no-checkout', resolve('.'), root], { stdio: 'pipe' })
      execFileSync('git', ['-C', root, 'checkout', '--quiet', '--detach', protocol.repositories['doc-bridge']], { stdio: 'pipe' })
      execFileSync(process.execPath, [engine, 'index'], { cwd: root, stdio: 'pipe', timeout: 60000 })
      const args = ['--pilot', '--approve-budget', '--transport', 'cli', '--claude-bin', fake.bin, '--attempt-budget-usd', '0.5', '--root', `doc-bridge=${root}`, '--output', output]
      const env = { STUDY_MODEL: 'claude-haiku-5-5', STUDY_BUDGET_USD: '1' }
      await main(args, env, protocol)
      const ledgerText = readFileSync(output, 'utf8')
      const ledger = JSON.parse(ledgerText)
      expect(ledger).toMatchObject({ transport: 'cli', mode: 'pilot', status: 'awaiting-adjudication', model: 'claude-haiku-5-5', adjudication: { method: 'agent', humanReview: false } })
      expect(ledger.cli).toMatchObject({ cliVersion: CLI_VERSION, expectedCliVersion: '2.1.296', disallowedMcpTools: expect.arrayContaining(['mcp__doc-bridge__docbridge_run']) })
      expect(ledger.observations).toHaveLength(2)
      expect(ledger.observations.map((item: { scenario: string }) => item.scenario)).toEqual(['repository-only', 'doc-bridge-mcp'])
      expect(ledger.observations[1]).toMatchObject({ status: 'completed', initMcpServers: [{ name: 'doc-bridge', status: 'connected' }], initTools: ['Read', 'Grep', 'Glob', ...CLI_DOC_BRIDGE_TOOLS] })
      const summary = JSON.parse(log.mock.calls.at(-1)![0])
      expect(summary).toMatchObject({ transport: 'cli', attempts: 2, inputTokens: 2400, outputTokens: 300, cacheReadInputTokens: 10000, cacheCreationInputTokens: 600 })
      expect(summary.spentUsd).toBeCloseTo(2 * 0.0002825, 12)
      expect(summary.extrapolatedFullRunUsd).toBeCloseTo(2 * 0.0002825 * 18, 10)
      const records = fake.records()
      expect(records.every(record => !record.apiKeyPresent)).toBe(true)
      // The agent's working directory is the export: the same entries in both arms, no git metadata or lockfile.
      expect(records[0].entries).toEqual(records[1].entries)
      expect(records[0].entries).toContain('README.md')
      expect(records[0].entries.some(entry => /(^|\/)\.|node_modules|pnpm-lock|dist\//.test(entry))).toBe(false)
      expect(records[0].cwd).not.toBe(root)
      expect(ledgerText).not.toContain('ANTHROPIC_API_KEY')
    } finally { log.mockRestore(); rmSync(fake.dir, { recursive: true, force: true }); rmSync(temporary, { recursive: true, force: true }) }
  }, 60000)

  it('stops the pilot at the first invalid setup and keeps the private ledger', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'study-cli-stop-'))
    const root = join(temporary, 'corpus')
    const output = join(temporary, 'private.json')
    const fake = cliFake({ init: { tools: ['Read', 'Grep', 'Glob', 'Bash'] } })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const protocol = loadProtocol()
      protocol.repositories['doc-bridge'] = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      execFileSync('git', ['clone', '--quiet', '--depth', '1', '--no-local', '--no-checkout', resolve('.'), root], { stdio: 'pipe' })
      execFileSync('git', ['-C', root, 'checkout', '--quiet', '--detach', protocol.repositories['doc-bridge']], { stdio: 'pipe' })
      execFileSync(process.execPath, [engine, 'index'], { cwd: root, stdio: 'pipe', timeout: 60000 })
      const args = ['--pilot', '--approve-budget', '--transport', 'cli', '--claude-bin', fake.bin, '--root', `doc-bridge=${root}`, '--output', output]
      await expect(main(args, { STUDY_MODEL: 'claude-haiku-5-5', STUDY_BUDGET_USD: '1' }, protocol)).resolves.toBeUndefined()
      const ledger = JSON.parse(readFileSync(output, 'utf8'))
      expect(ledger).toMatchObject({ status: 'blocked' })
      expect(ledger.observations).toHaveLength(1)
      expect(ledger.observations[0]).toMatchObject({ status: 'invalid-setup', chargedUsd: 0.1 })
      expect(fake.records()).toHaveLength(1)
    } finally { process.exitCode = undefined; log.mockRestore(); rmSync(fake.dir, { recursive: true, force: true }); rmSync(temporary, { recursive: true, force: true }) }
  }, 60000)
})
