import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, openSync, fstatSync, closeSync, symlinkSync, rmSync, mkdirSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { loadProtocol, planStudy, parseOptions, runAttempt, repositoryTools, connectMcp, main, runCliAttempt, cliArguments, cliChildEnv, studyPrompt, probeCliVersion } from '../scripts/study-minimal.mjs'

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

  it('initializes the real local MCP server and invokes a read-only tool without a model', async () => {
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
      const result = await tools.find(tool => tool.name === 'doc_search').call({ term: 'Evidence' })
      expect(result.content).toBeDefined()
    } finally { client?.close(); rmSync(root, { recursive: true, force: true }) }
  }, 40000)

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

// Fake Claude Code executable: records its arguments and whether ANTHROPIC_API_KEY reached it, then
// behaves as configured in behavior.json. It never contacts a model.
const FAKE_CLAUDE = `#!/usr/bin/env node
const { readFileSync, writeFileSync } = require('node:fs')
const { join, dirname } = require('node:path')
const dir = dirname(process.argv[1])
if (process.argv[2] === '--version') { process.stdout.write('2.1.0-fixture (Claude Code)\\n'); process.exit(0) }
const behavior = JSON.parse(readFileSync(join(dir, 'behavior.json'), 'utf8'))
writeFileSync(join(dir, 'record.json'), JSON.stringify({ argv: process.argv.slice(2), apiKeyPresent: Object.prototype.hasOwnProperty.call(process.env, 'ANTHROPIC_API_KEY') }))
if (behavior.mode === 'sleep') setTimeout(() => {}, 60000)
else if (behavior.mode === 'exit') { process.stderr.write('fixture failure'); process.exit(2) }
else if (behavior.mode === 'garbage') process.stdout.write('not json')
else process.stdout.write(JSON.stringify(behavior.result))
`
const CLI_VERSION = '2.1.0-fixture (Claude Code)'
const okResult = { type: 'result', subtype: 'success', is_error: false, result: 'Answer with source:1', num_turns: 4, total_cost_usd: 0.0123, duration_ms: 900,
  usage: { input_tokens: 1200, cache_creation_input_tokens: 300, cache_read_input_tokens: 5000, output_tokens: 150 } }
const fakeClaude = (behavior: Record<string, unknown>) => {
  const dir = mkdtempSync(join(tmpdir(), 'study-claude-'))
  const bin = join(dir, 'claude')
  writeFileSync(bin, FAKE_CLAUDE)
  chmodSync(bin, 0o755)
  const setBehavior = (next: Record<string, unknown>) => writeFileSync(join(dir, 'behavior.json'), JSON.stringify(next))
  setBehavior(behavior)
  const record = () => JSON.parse(readFileSync(join(dir, 'record.json'), 'utf8')) as { argv: string[]; apiKeyPresent: boolean }
  const ran = () => existsSync(join(dir, 'record.json'))
  return { dir, bin, setBehavior, record, ran }
}
const cliConfig = (bin: string, extra: Record<string, unknown> = {}) => ({ transport: 'cli', model: 'claude-haiku-5-5', claudeBin: bin, attemptBudgetUsd: 0.5, cliVersion: CLI_VERSION, ...extra })
const engine = resolve('bin/ak-docs.js')

describe('CLI transport: headless Claude Code without an API key', () => {
  it('builds one argument array per scenario that differ only in MCP config and its allowed tools', async () => {
    const fake = fakeClaude({ mode: 'ok', result: okResult })
    try {
      const budget = { cap: 1, spent: 0 }
      await runCliAttempt({ task, scenario: 'repository-only', config: cliConfig(fake.bin), budget, engine, root: fake.dir })
      const repository = fake.record().argv
      await runCliAttempt({ task, scenario: 'doc-bridge-mcp', config: cliConfig(fake.bin), budget: { cap: 1, spent: 0 }, engine, root: fake.dir })
      const mcp = fake.record().argv
      expect(repository).toHaveLength(mcp.length)
      const differing = repository.flatMap((value, index) => value === mcp[index] ? [] : [index])
      expect(differing.map(index => repository[index - 1])).toEqual(['--allowedTools', '--mcp-config'])
      expect(JSON.parse(repository[differing[1]])).toEqual({ mcpServers: {} })
      expect(JSON.parse(mcp[differing[1]]).mcpServers['doc-bridge']).toEqual({ type: 'stdio', command: process.execPath, args: [engine, 'mcp'] })
      expect(mcp[differing[0]]).toBe('Read,Grep,Glob,mcp__doc-bridge__doc_search,mcp__doc-bridge__doc_get,mcp__doc-bridge__handoff_resolve')
      expect(repository[repository.length - 1]).toBe(studyPrompt(task))
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('uses print mode, pinned model, JSON output, read-only tools, non-interactive permissions and the per-attempt cap', async () => {
    const fake = fakeClaude({ mode: 'ok', result: okResult })
    try {
      await runCliAttempt({ task, scenario: 'repository-only', config: cliConfig(fake.bin), budget: { cap: 1, spent: 0 }, engine, root: fake.dir })
      const argv = fake.record().argv
      expect(argv).toEqual(expect.arrayContaining(['-p', '--model', 'claude-haiku-5-5', '--output-format', 'json', '--no-session-persistence',
        '--restricted', '--disable-slash-commands', '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--strict-mcp-config']))
      expect(argv[argv.indexOf('--max-budget-usd') + 1]).toBe('0.500000')
      expect(argv[argv.indexOf('--tools') + 1]).toBe('Read,Grep,Glob')
      const denied = argv[argv.indexOf('--disallowedTools') + 1].split(',')
      expect(denied).toEqual(expect.arrayContaining(['Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch']))
      expect(cliArguments({ model: 'm', scenario: 'doc-bridge-mcp', prompt: 'p', maxBudgetUsd: '1.000000', engine })).toHaveLength(argv.length)
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('never passes ANTHROPIC_API_KEY to the child, even when the parent has one', async () => {
    const saved = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'fixture-parent-key-not-real'
    const fake = fakeClaude({ mode: 'ok', result: okResult })
    try {
      const result = await runCliAttempt({ task, scenario: 'doc-bridge-mcp', config: cliConfig(fake.bin), budget: { cap: 1, spent: 0 }, engine, root: fake.dir })
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

  it('does not require or read a credential for CLI execution options', () => {
    const options = parseOptions(['--pilot', '--approve-budget', '--transport', 'cli', '--output', 'fixture.json'], { STUDY_MODEL: 'claude-haiku-5-5', STUDY_BUDGET_USD: '1' })
    expect(options.config).toEqual({ transport: 'cli', model: 'claude-haiku-5-5', claudeBin: 'claude', attemptBudgetUsd: 0.25 })
    expect(() => parseOptions(['--transport', 'bogus', '--dry-run'], {})).toThrow()
    expect(parseOptions(['--pilot', '--approve-budget', '--output', 'fixture.json'], { STUDY_MODEL: 'fixture-model', ANTHROPIC_API_KEY: 'fixture-key', STUDY_BUDGET_USD: '1', STUDY_INPUT_USD_PER_MILLION: '1', STUDY_OUTPUT_USD_PER_MILLION: '2' }).config.transport).toBe('http')
  })

  it('parses usage, cache tokens and the CLI-reported cost into the ledger shape', async () => {
    const fake = fakeClaude({ mode: 'ok', result: okResult })
    try {
      const budget = { cap: 1, spent: 0 }
      const result = await runCliAttempt({ task, scenario: 'repository-only', config: cliConfig(fake.bin), budget, engine, root: fake.dir })
      expect(result).toMatchObject({ transport: 'cli', status: 'completed', answer: 'Answer with source:1', inputTokens: 1200, outputTokens: 150,
        cacheCreationInputTokens: 300, cacheReadInputTokens: 5000, numTurns: 4, reportedCostUsd: 0.0123, chargedUsd: 0.0123,
        isError: false, usageComplete: true, toolCalls: null, cliVersion: CLI_VERSION, correctness: null, adjudication: 'pending' })
      expect(budget.spent).toBeCloseTo(0.0123)
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('refuses to start when the cap is reached and passes min(remaining, per-attempt limit)', async () => {
    const fake = fakeClaude({ mode: 'ok', result: okResult })
    try {
      const refused = await runCliAttempt({ task, scenario: 'repository-only', config: cliConfig(fake.bin), budget: { cap: 1, spent: 1 }, engine, root: fake.dir })
      expect(refused.status).toBe('budget-exceeded')
      expect(fake.ran()).toBe(false)
      await runCliAttempt({ task, scenario: 'repository-only', config: cliConfig(fake.bin), budget: { cap: 1, spent: 0.7 }, engine, root: fake.dir })
      expect(fake.record().argv[fake.record().argv.indexOf('--max-budget-usd') + 1]).toBe('0.300000')
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  })

  it('charges the full per-attempt limit on non-zero exit, timeout, malformed JSON and error results', async () => {
    const fake = fakeClaude({ mode: 'exit' })
    try {
      const exit = { cap: 1, spent: 0 }
      const failed = await runCliAttempt({ task, scenario: 'repository-only', config: cliConfig(fake.bin), budget: exit, engine, root: fake.dir })
      expect(failed).toMatchObject({ status: 'failed', usageComplete: false, chargedUsd: 0.5, answer: '' })
      expect(exit.spent).toBeCloseTo(0.5)

      fake.setBehavior({ mode: 'sleep' })
      const timeout = { cap: 1, spent: 0 }
      const timedOut = await runCliAttempt({ task, scenario: 'repository-only', config: cliConfig(fake.bin), budget: timeout, engine, root: fake.dir, timeoutMs: 300 })
      expect(timedOut).toMatchObject({ status: 'timed-out', chargedUsd: 0.5 })
      expect(timeout.spent).toBeCloseTo(0.5)

      fake.setBehavior({ mode: 'garbage' })
      const malformed = { cap: 1, spent: 0 }
      expect(await runCliAttempt({ task, scenario: 'repository-only', config: cliConfig(fake.bin), budget: malformed, engine, root: fake.dir })).toMatchObject({ status: 'failed', chargedUsd: 0.5 })
      expect(malformed.spent).toBeCloseTo(0.5)

      fake.setBehavior({ mode: 'ok', result: { ...okResult, is_error: true, subtype: 'error_max_budget_usd', total_cost_usd: 0.2 } })
      const errored = { cap: 1, spent: 0 }
      expect(await runCliAttempt({ task, scenario: 'repository-only', config: cliConfig(fake.bin), budget: errored, engine, root: fake.dir })).toMatchObject({ status: 'failed', isError: true, reportedCostUsd: 0.2, chargedUsd: 0.5 })
      expect(errored.spent).toBeCloseTo(0.5)
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
  }, 20000)

  it('reports the CLI version from a probe that runs no prompt', async () => {
    const fake = fakeClaude({ mode: 'ok', result: okResult })
    try {
      expect(await probeCliVersion(fake.bin)).toBe(CLI_VERSION)
      expect(fake.ran()).toBe(false)
    } finally { rmSync(fake.dir, { recursive: true, force: true }) }
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

  it('runs the pilot end to end through the CLI transport with a private ledger and no API key', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'study-cli-pilot-'))
    const root = join(temporary, 'corpus')
    const output = join(temporary, 'private.json')
    const fake = fakeClaude({ mode: 'ok', result: okResult })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const protocol = loadProtocol()
      protocol.repositories['doc-bridge'] = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      execFileSync('git', ['clone', '--quiet', '--depth', '1', '--no-local', '--no-checkout', resolve('.'), root], { stdio: 'pipe' })
      execFileSync('git', ['-C', root, 'checkout', '--quiet', '--detach', protocol.repositories['doc-bridge']], { stdio: 'pipe' })
      const args = ['--pilot', '--approve-budget', '--transport', 'cli', '--claude-bin', fake.bin, '--attempt-budget-usd', '0.5', '--root', `doc-bridge=${root}`, '--output', output]
      const env = { STUDY_MODEL: 'claude-haiku-5-5', STUDY_BUDGET_USD: '1' }
      await main(args, env, protocol)
      const ledgerText = readFileSync(output, 'utf8')
      const ledger = JSON.parse(ledgerText)
      expect(ledger).toMatchObject({ transport: 'cli', mode: 'pilot', status: 'awaiting-adjudication', model: 'claude-haiku-5-5', adjudication: { method: 'agent', humanReview: false } })
      expect(ledger.cli.cliVersion).toBe(CLI_VERSION)
      expect(ledger.observations).toHaveLength(2)
      expect(ledger.observations.map((item: { scenario: string }) => item.scenario)).toEqual(['repository-only', 'doc-bridge-mcp'])
      const summary = JSON.parse(log.mock.calls.at(-1)![0])
      expect(summary).toMatchObject({ transport: 'cli', attempts: 2, inputTokens: 2400, outputTokens: 300, cacheReadInputTokens: 10000, cacheCreationInputTokens: 600 })
      expect(summary.spentUsd).toBeCloseTo(0.0246)
      expect(summary.extrapolatedFullRunUsd).toBeCloseTo(0.0246 * 18)
      expect(fake.record().apiKeyPresent).toBe(false)
      expect(ledgerText).not.toContain('ANTHROPIC_API_KEY')
    } finally { log.mockRestore(); rmSync(fake.dir, { recursive: true, force: true }); rmSync(temporary, { recursive: true, force: true }) }
  }, 60000)
})
