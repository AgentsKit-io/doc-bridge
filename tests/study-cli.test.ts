import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'
import { createStudyProviderCliConfig } from '../src/study/provider-cli.js'
import { createStudyRepositoryConfig } from '../src/study/execution.js'

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

  it('runs the real study dry-run and a bounded independent adjudication', async () => {
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
