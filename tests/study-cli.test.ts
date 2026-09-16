import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'
import { createStudyProviderCliConfig } from '../src/study/provider-cli.js'
import { createStudyRepositoryConfig } from '../src/study/execution.js'
import { createStudyExpectations } from '../src/study/expectations.js'
import { createStudyTaskSuite } from '../src/study/task-suite.js'
import { contentHashForArtifactV1 } from '../src/index-builder/content-hash.js'

const root = process.cwd()
const artifact = (name: string) => join(root, 'docs', 'study', name)

const capture = async (action: () => number | undefined | Promise<number | undefined>) => {
  const stdout = process.stdout.write
  const stderr = process.stderr.write
  let output = ''
  let errors = ''
  process.stdout.write = ((chunk: string | Uint8Array) => { output += String(chunk); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => { errors += String(chunk); return true }) as typeof process.stderr.write
  try { return { code: await action(), output, errors } } finally {
    process.stdout.write = stdout
    process.stderr.write = stderr
  }
}

const providerConfig = () => {
  const command = process.execPath
  const provider = { command, args: ['-e', 'process.stdout.write(JSON.stringify({}))'], envAllowlist: [], providerNetwork: false, maxInputBytes: 1_000_000, maxOutputBytes: 10_000 }
  const adjudicator = { id: 'study-reviewer', modelId: 'reference-model', command, args: ['-e', "process.stdout.write(JSON.stringify({outcome:'success',confidence:0.9,reasonCodes:['bounded-review']}))"], envAllowlist: [], providerNetwork: false, maxInputBytes: 1_000_000, maxOutputBytes: 10_000 }
  return createStudyProviderCliConfig({
    type: 'study-provider-cli-config', schemaVersion: 1, configVersion: 'cli-contract-test',
    providers: ['low-cost-model', 'reference-model'].flatMap((modelId) => ['repository-only', 'deterministic-doc-bridge', 'registry-assisted'].map((scenarioId) => ({ modelId, scenarioIds: [scenarioId], ...provider }))),
    adjudicator,
  })
}

describe('study CLI artifact contracts', () => {
  it('serves every read-only study artifact command from the canonical fixtures', async () => {
    const commands = [
      ['protocol', artifact('protocol-v1.json')],
      ['history', artifact('historical-evidence-v1.json'), '--protocol', artifact('protocol-v1.json')],
      ['tasks', artifact('task-suite-v1.json')],
      ['select', artifact('task-suite-v1.json')],
      ['plan', artifact('run-plan-v1.json')],
      ['providers', artifact('provider-cli-fixture.json')],
      ['ledger', artifact('observation-ledger-v1.json')],
      ['metrics', artifact('observation-ledger-v1.json'), '--allow-regressions'],
      ['verification', artifact('verification-binding-v1.json')],
    ] as const
    const providerPath = join(mkdtempSync(join(tmpdir(), 'doc-bridge-study-cli-')), 'provider-cli-fixture.json')
    writeFileSync(providerPath, `${JSON.stringify(providerConfig())}\n`)
    const withProvider = commands.map((args) => args[0] === 'providers' ? [args[0], providerPath] : args)
    for (const args of withProvider) {
      const result = await capture(() => runCli(['study', ...args]))
      expect(result.code, args[0]).toBe(0)
      expect(result.errors, args[0]).toBe('')
    }
  })

  it('runs the real study dry-run and a bounded independent adjudication', { timeout: 30000 }, async () => {
    const temp = mkdtempSync(join(tmpdir(), 'doc-bridge-study-cli-run-'))
    const providersPath = join(temp, 'providers.json')
    const repositoriesPath = join(temp, 'repositories.json')
    const ledgerPath = join(temp, 'ledger.json')
    const adjudicatedPath = join(temp, 'adjudicated.json')
    const providers = providerConfig()
    const suite = JSON.parse(readFileSync(artifact('task-suite-v1.json'), 'utf8')) as { population: string[] }
    const repositories = createStudyRepositoryConfig({ type: 'controlled-study-repository-config', schemaVersion: 1, configVersion: 'cli-contract-test', repositories: suite.population.map((id) => ({ id, root })) })
    writeFileSync(providersPath, `${JSON.stringify(providers)}\n`)
    writeFileSync(repositoriesPath, `${JSON.stringify(repositories)}\n`)
    const dryRun = await capture(() => runCli(['study', 'run', artifact('run-plan-v1.json'), artifact('task-suite-v1.json'), '--providers', providersPath, '--repositories', repositoriesPath, '--ledger', ledgerPath, '--dry-run']))
    expect(dryRun.code).toBe(0)
    expect(JSON.parse(dryRun.output)).toMatchObject({ ok: true, summary: { status: 'dry-run', executed: 0 } })
    const run = await capture(() => runCli(['study', 'run', artifact('run-plan-v1.json'), artifact('task-suite-v1.json'), '--providers', providersPath, '--repositories', repositoriesPath, '--ledger', ledgerPath, '--round', 'cli-contract']))
    expect(run.code).toBe(0)
    expect(JSON.parse(run.output)).toMatchObject({ ok: true, summary: { status: 'completed', executed: 24 } })
    expect(existsSync(ledgerPath)).toBe(true)
    const adjudicated = await capture(() => runCli(['study', 'adjudicate', artifact('observation-ledger-v1.json'), artifact('task-suite-v1.json'), '--adjudicator', providersPath, '--output', adjudicatedPath, '--limit', '1']))
    expect(adjudicated.code).toBe(0)
    expect(existsSync(adjudicatedPath)).toBe(true)
  })
})

/**
 * `ak-docs study expectations` — the mechanical half, checked by the retrieval benchmark.
 *
 * The suite that ships here declares no expectations, because its hash is bound to published
 * artifacts and its references would have to name repositories that are not in this one. So the
 * command is exercised against a suite built in the test, which is also what an operator does:
 * the suite is published, the resolution is local, and the two are bound by the suite hash.
 */
describe('ak-docs study expectations', () => {
  const fixtureProject = (): { readonly dir: string; readonly configPath: string; readonly indexPath: string } => {
    const dir = mkdtempSync(join(tmpdir(), 'doc-bridge-study-expect-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0' }))
    const configPath = join(dir, 'doc-bridge.config.json')
    writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } }))
    const indexPath = join(dir, 'index.json')
    const index = {
      schemaVersion: 1,
      contentHashAlgo: 'sha256-normalized-v1',
      project: { name: 'fixture', root: '.' },
      knowledge: [
        { id: 'alpha', type: 'agent-doc', title: 'Alpha', path: 'docs/alpha.md', description: 'Alpha covers the subsystem entrypoints.' },
        { id: 'beta', type: 'agent-doc', title: 'Beta', path: 'docs/beta.md', description: 'Beta explains ranking.' },
      ],
      lookup: { packages: [] },
    }
    writeFileSync(indexPath, JSON.stringify({ ...index, contentHash: contentHashForArtifactV1({ ...index, contentHash: 'x' }) }))
    return { dir, configPath, indexPath }
  }

  const suiteWithExpectations = () => {
    const { contentHash: _hash, contentHashAlgo: _algo, ...payload } = JSON.parse(readFileSync(artifact('task-suite-v1.json'), 'utf8')) as Record<string, unknown>
    const tasks = (payload.tasks as Record<string, unknown>[]).map((task) =>
      task.id === 'consumer-01-discovery' ? { ...task, expectedDocuments: ['primary-entrypoint'], retrievalQueries: ['alpha subsystem'] } : task,
    )
    return createStudyTaskSuite({ ...payload, tasks })
  }

  const expectationsFile = (dir: string, suite: { contentHash: string }, targets: Record<string, string[]>): string => {
    const path = join(dir, 'expectations.json')
    writeFileSync(path, `${JSON.stringify(createStudyExpectations({
      type: 'controlled-study-expectations',
      schemaVersion: 1,
      configVersion: 'cli-contract-test',
      scope: 'local',
      taskSuiteHash: suite.contentHash,
      repositories: [{ id: 'consumer-01', targets }],
    }))}\n`)
    return path
  }

  it('passes when the resolved references are retrieved, in both output modes', async () => {
    const { dir, configPath, indexPath } = fixtureProject()
    const suite = suiteWithExpectations()
    const suitePath = join(dir, 'task-suite.json')
    writeFileSync(suitePath, `${JSON.stringify(suite)}\n`)
    const expectations = expectationsFile(dir, suite, { 'primary-entrypoint': ['docs/alpha.md'] })

    const json = await capture(() => runCli(['study', 'expectations', suitePath, '--expectations', expectations, '--index', indexPath, '--config', configPath]))
    expect(json.code).toBe(0)
    const payload = JSON.parse(json.output) as { ok: boolean; expectations: { checkedTasks: number; outcomes: { caseId: string; hit: boolean }[]; withoutExpectations: string[] } }
    expect(payload.ok).toBe(true)
    expect(payload.expectations.checkedTasks).toBe(1)
    expect(payload.expectations.outcomes).toEqual([{ taskId: 'consumer-01-discovery', repositoryId: 'consumer-01', caseId: 'consumer-01-discovery', hit: true, rank: 1, expectedTargets: ['docs/alpha.md'], rankedTargets: expect.any(Array) }])
    expect(payload.expectations.withoutExpectations).toHaveLength(23)

    const text = await capture(() => runCli(['study', 'expectations', suitePath, '--expectations', expectations, '--index', indexPath, '--config', configPath, '--text']))
    expect(text.code).toBe(0)
    expect(text.output).toContain('Study expectations: pass')
    expect(text.output).toContain('hit@3: 100.0% over 1 case(s)')
  })

  it('exits non-zero when a reference does not resolve or retrieval misses it', async () => {
    const { dir, configPath, indexPath } = fixtureProject()
    const suite = suiteWithExpectations()
    const suitePath = join(dir, 'task-suite.json')
    writeFileSync(suitePath, `${JSON.stringify(suite)}\n`)

    const missed = expectationsFile(dir, suite, { 'primary-entrypoint': ['docs/beta.md'] })
    const miss = await capture(() => runCli(['study', 'expectations', suitePath, '--expectations', missed, '--index', indexPath, '--config', configPath]))
    expect(miss.code).toBe(1)
    expect((JSON.parse(miss.output) as { ok: boolean }).ok).toBe(false)

    const unresolved = expectationsFile(dir, suite, { 'something-else': ['docs/alpha.md'] })
    const unresolvedRun = await capture(() => runCli(['study', 'expectations', suitePath, '--expectations', unresolved, '--index', indexPath, '--config', configPath, '--text']))
    expect(unresolvedRun.code).toBe(1)
    expect(unresolvedRun.output).toContain('unresolved document reference "primary-entrypoint"')

    const noFile = await capture(() => runCli(['study', 'expectations', suitePath, '--index', indexPath, '--config', configPath]))
    expect(noFile.code).toBe(2)
    expect(noFile.errors).toContain('--expectations')
  })
})
