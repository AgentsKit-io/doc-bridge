import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, statSync, symlinkSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { loadProtocol, planStudy, parseOptions, runAttempt, repositoryTools, connectMcp, main } from '../scripts/study-minimal.mjs'

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
      execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', resolve('.'), root], { stdio: 'pipe' })
      execFileSync('git', ['-C', root, 'checkout', '--quiet', '--detach', loadProtocol().repositories['doc-bridge']], { stdio: 'pipe' })
      execFileSync(process.execPath, [resolve('bin/ak-docs.js'), 'index'], { cwd: root, stdio: 'pipe', timeout: 60000 })
      const args = ['--pilot', '--approve-budget', '--root', `doc-bridge=${root}`, '--output', output]
      const env = { STUDY_MODEL: config.model, ANTHROPIC_API_KEY: config.key, STUDY_BUDGET_USD: '1', STUDY_INPUT_USD_PER_MILLION: '1', STUDY_OUTPUT_USD_PER_MILLION: '2' }
      const link = join(temporary, 'output-link')
      symlinkSync(root, link, 'junction')
      await expect(main([...args.slice(0, -1), join(link, 'private.json')], env)).rejects.toThrow('Private output must be outside checkouts')
      expect(http).not.toHaveBeenCalled()
      await main(args, env)
      const ledger = JSON.parse(readFileSync(output, 'utf8'))
      expect(ledger).toMatchObject({ mode: 'pilot', status: 'awaiting-adjudication', model: 'fixture-model' })
      expect(ledger.observations).toHaveLength(2)
      expect(statSync(output).mode & 0o777).toBe(0o600)
      expect(readFileSync(output, 'utf8')).not.toContain(config.key)
      const summary = JSON.parse(log.mock.calls.at(-1)![0])
      expect(summary).toMatchObject({ inputTokens: 200, outputTokens: 40, attempts: 2 })
      expect(summary.extrapolatedFullRunUsd).toBeCloseTo(0.00028 * 18)
      const requests = http.mock.calls.map(call => JSON.parse(call[1].body))
      expect(requests[0].tools).toHaveLength(3)
      expect(requests[1].tools).toHaveLength(6)
      await expect(main(args, env)).rejects.toThrow()
      expect(http).toHaveBeenCalledTimes(2)
    } finally { vi.unstubAllGlobals(); log.mockRestore(); rmSync(temporary, { recursive: true, force: true }) }
  }, 120000)
})
