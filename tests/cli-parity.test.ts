import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'

/*
 * Parity contract for the ak-docs parser. Every case records what the CLI does today: the exit
 * code, whether the command is accepted, and the shape of stdout or stderr. A parser migration
 * must keep these green. Help and error wording may change on purpose; exit codes may not.
 */

const fixtureRoot = fileURLToPath(new URL('./fixtures/sample-project', import.meta.url))
const originalCwd = process.cwd()

interface Outcome {
  readonly code: number | undefined
  readonly out: string
  readonly err: string
}

interface ParityCase {
  readonly name: string
  readonly argv: readonly string[]
  readonly code: number
  readonly assert?: (outcome: Outcome) => void
}

/*
 * Helper files live beside the project, not in it: a file inside the repository would change the
 * index inputs and make every query stale. `$SIDE/` in a case is replaced with that directory.
 */
let sideDir = ''

const run = async (argv: readonly string[]): Promise<Outcome> => {
  const writeOut = process.stdout.write
  const writeErr = process.stderr.write
  let out = ''
  let err = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk)
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err += String(chunk)
    return true
  }) as typeof process.stderr.write
  try {
    const code = await runCli(argv.map((arg) => arg.replaceAll('$SIDE/', `${sideDir}/`)))
    return { code, out, err }
  } finally {
    process.stdout.write = writeOut
    process.stderr.write = writeErr
  }
}

const json = (text: string): Record<string, unknown> => JSON.parse(text) as Record<string, unknown>

const stderrIncludes = (text: string) => (outcome: Outcome) => expect(outcome.err).toContain(text)
const stdoutIncludes = (text: string) => (outcome: Outcome) => expect(outcome.out).toContain(text)

const CASES: readonly ParityCase[] = [
  // Global flags and help
  { name: '--version prints the package version', argv: ['--version'], code: 0, assert: (o) => expect(o.out).toMatch(/^ak-docs \S+ \(@agentskit\/doc-bridge\)\n$/) },
  { name: '-V prints the package version', argv: ['-V'], code: 0, assert: (o) => expect(o.out).toMatch(/^ak-docs /) },
  { name: '--help lists the top-level commands', argv: ['--help'], code: 0, assert: (o) => expect(o.out).toContain('validate-config') },
  { name: '-h lists the top-level commands', argv: ['-h'], code: 0, assert: (o) => expect(o.out).toContain('validate-handoff') },
  { name: 'no arguments prints help', argv: [], code: 0, assert: stdoutIncludes('index') },
  { name: '<command> --help prints help for that command', argv: ['index', '--help'], code: 0, assert: stdoutIncludes('index') },
  // Quirk kept on purpose: an unknown command prints the usage and exits 0 today. Changing it is a
  // separate, announced decision, so the migration must not move this code.
  { name: 'an unknown command prints usage and exits 0', argv: ['nope-command'], code: 0, assert: stdoutIncludes('validate-config') },
  { name: '--profile with an unknown value is rejected', argv: ['--profile', 'bogus', 'index'], code: 2, assert: stderrIncludes('Unknown execution profile') },
  { name: '--profile local is accepted and stripped', argv: ['--profile', 'local', 'validate-config'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true }) },

  // Configuration
  { name: 'validate-config reads the discovered config', argv: ['validate-config'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true, schemaVersion: 1 }) },
  { name: 'validate-config accepts --config <path>', argv: ['validate-config', '--config', 'doc-bridge.config.json'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true }) },
  { name: 'validate-config accepts --json', argv: ['validate-config', '--json'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true }) },
  { name: 'validate-config rejects an invalid config', argv: ['validate-config', '--config', '$SIDE/bad-config.json'], code: 1, assert: stderrIncludes('corpus.agent.root') },
  { name: 'validate-handoff without a file is rejected', argv: ['validate-handoff'], code: 1, assert: stderrIncludes('Missing handoff') },
  { name: 'validate-handoff rejects an invalid handoff', argv: ['validate-handoff', '$SIDE/handoff.bad.json'], code: 1, assert: stderrIncludes('Invalid AgentHandoff') },
  { name: 'benchmark without arguments prints usage', argv: ['benchmark'], code: 1, assert: stderrIncludes('Usage: ak-docs benchmark') },
  { name: 'benchmark measures a fixture and observation', argv: ['benchmark', '$SIDE/fixture.json', '$SIDE/observation.json'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ schemaVersion: 1, regressions: [] }) },

  // Index and gates
  { name: 'index writes the index and reports its hash', argv: ['index'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true, indexPath: expect.any(String), contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) }) },
  { name: 'index accepts --json', argv: ['index', '--json'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true }) },
  { name: 'index accepts --config <path>', argv: ['index', '--config', 'doc-bridge.config.json'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true }) },
  { name: 'index accepts --allow-pending-findings', argv: ['index', '--allow-pending-findings'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true }) },
  { name: 'index ignores an unknown flag', argv: ['index', '--no-such-flag'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true }) },
  { name: 'index with --config and no value still runs', argv: ['index', '--config'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true }) },
  { name: 'gate run lists every gate result as JSON', argv: ['gate', 'run'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true, results: expect.any(Array) }) },
  { name: 'gate run <id> runs one gate', argv: ['gate', 'run', 'index-freshness'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true }) },
  { name: 'gate run with an unsupported id is rejected', argv: ['gate', 'run', 'nope'], code: 1, assert: stderrIncludes('Unsupported gate') },
  { name: 'gate without run prints usage', argv: ['gate'], code: 1, assert: stderrIncludes('ak-docs gate run') },

  // Retrieval and the local consult commands
  { name: 'search prints JSON by default', argv: ['search', 'schema'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ term: 'schema', count: expect.any(Number), matches: expect.any(Array) }) },
  { name: 'search --text prints a text header', argv: ['search', 'schema', '--text'], code: 0, assert: (o) => expect(o.out.split('\n')[0]).toBe('Search: schema') },
  { name: 'search --agent prints a single JSON line', argv: ['search', 'schema', '--agent'], code: 0, assert: (o) => expect(o.out.trim().split('\n')).toHaveLength(1) },
  { name: 'search accepts --mode and --context-budget', argv: ['search', 'schema', '--agent', '--mode=discovery', '--context-budget=256'], code: 0, assert: (o) => expect(() => json(o.out)).not.toThrow() },
  { name: 'search ignores an unknown flag', argv: ['search', 'schema', '--no-such-flag'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ term: 'schema' }) },
  { name: 'search without a term prints usage', argv: ['search'], code: 1, assert: stderrIncludes('ak-docs search') },
  { name: 'query without an id prints usage', argv: ['query'], code: 1, assert: stderrIncludes('ak-docs query') },
  { name: 'query search is rejected in favour of search', argv: ['query', 'search', 'schema'], code: 1, assert: stderrIncludes('ak-docs query') },
  { name: 'query ownership --agent returns a handoff', argv: ['query', 'ownership', 'os-core', '--agent'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ type: 'agent-handoff' }) },
  { name: 'query with a bare package id returns a handoff', argv: ['query', 'os-core', '--agent'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ target: { id: 'os-core' } }) },
  { name: 'query --text prints the package path', argv: ['query', 'package', 'os-core', '--text'], code: 0, assert: stdoutIncludes('packages/os-core') },
  { name: 'list without a kind prints usage', argv: ['list'], code: 1, assert: stderrIncludes('ak-docs list') },
  { name: 'list with an unknown kind prints usage', argv: ['list', 'nope'], code: 1, assert: stderrIncludes('Usage: ak-docs list') },
  { name: 'list packages prints JSON by default', argv: ['list', 'packages'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ kind: 'packages', items: ['os-core'] }) },
  { name: 'list packages --text prints one id per line', argv: ['list', 'packages', '--text'], code: 0, assert: (o) => expect(o.out).toBe('os-core\n') },
  { name: 'ask prints a text consult', argv: ['ask', 'who owns schemas'], code: 0, assert: (o) => expect(o.out.split('\n')[0]).toBe('Question: who owns schemas') },
  { name: 'ask without a question outside a TTY prints usage', argv: ['ask'], code: 1, assert: stderrIncludes('Usage: ak-docs ask <question>') },
  { name: 'ask --chat without intelligence is rejected', argv: ['ask', '--chat', 'who owns schemas'], code: 1, assert: stderrIncludes('Chat mode requires intelligence.enabled') },
  { name: 'why --json prints a JSON response', argv: ['why', 'schema', '--json'], code: 0, assert: (o) => expect(() => json(o.out)).not.toThrow() },
  { name: 'retrieve prints chunks as JSON', argv: ['retrieve', 'schema'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ query: 'schema', chunks: expect.any(Array) }) },
  { name: 'retrieve without a query prints usage', argv: ['retrieve'], code: 1, assert: stderrIncludes('ak-docs retrieve') },
  { name: 'rag without an action prints usage', argv: ['rag'], code: 1, assert: stderrIncludes('ak-docs rag ingest') },
  { name: 'rag ingest without intelligence is rejected', argv: ['rag', 'ingest'], code: 1, assert: stderrIncludes('Intelligence is disabled') },
  { name: 'chat without intelligence is rejected', argv: ['chat'], code: 1, assert: stderrIncludes('Chat requires intelligence.enabled') },

  // Workflow commands
  { name: 'scan prints a JSON run result', argv: ['scan'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true, snapshotHash: expect.any(String) }) },
  { name: 'scan --text prints a run header', argv: ['scan', '--text'], code: 0, assert: (o) => expect(o.out.startsWith('Run: ')).toBe(true) },
  { name: 'reconcile prints a JSON run result', argv: ['reconcile'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true, reportHash: expect.any(String) }) },
  { name: 'check --format finding emits the finding shape', argv: ['check', '--format', 'finding'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ format: 'finding', findings: expect.any(Array) }) },
  { name: 'check with an unknown --format is rejected', argv: ['check', '--format', 'bogus'], code: 2, assert: stderrIncludes('--format must be json or finding.') },
  { name: '--format finding is rejected outside check', argv: ['scan', '--format', 'finding'], code: 2, assert: stderrIncludes('only available for ak-docs check') },
  { name: 'map emits the architecture map', argv: ['map'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ kind: 'architecture-map' }) },
  { name: 'discover prints a snapshot as JSON', argv: ['discover'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true, snapshot: expect.any(Object) }) },
  { name: 'discover --text prints a project header', argv: ['discover', '--text'], code: 0, assert: (o) => expect(o.out.split('\n')[0]).toMatch(/^Project: /) },
  { name: 'diff without --base prints usage', argv: ['diff'], code: 2, assert: stderrIncludes('Usage: ak-docs diff') },
  { name: 'diff with a missing snapshot is an error', argv: ['diff', '--base', 'missing.json'], code: 2, assert: (o) => expect(o.err).not.toBe('') },
  { name: 'diff against a snapshot returns a change set', argv: ['diff', '--base', '$SIDE/base.json'], code: 0, assert: (o) => expect(json(o.out)).toHaveProperty('changeSet') },

  // Analysis and conformance
  { name: 'bench without a suite prints usage', argv: ['bench'], code: 1, assert: stderrIncludes('Usage: ak-docs bench retrieval') },
  { name: 'bench retrieval with a missing suite is an error', argv: ['bench', 'retrieval', 'missing.json'], code: 2, assert: (o) => expect(o.err).not.toBe('') },
  { name: 'rules without run prints usage', argv: ['rules'], code: 2, assert: stderrIncludes('Usage: ak-docs rules run') },
  { name: 'rules run with a missing report is an error', argv: ['rules', 'run', 'missing.json'], code: 2, assert: (o) => expect(o.err).not.toBe('') },
  { name: 'conformance without a profile prints usage', argv: ['conformance'], code: 1, assert: stderrIncludes('Usage: ak-docs conformance run') },
  { name: 'audit without documentation prints usage', argv: ['audit'], code: 1, assert: stderrIncludes('Usage: ak-docs audit documentation') },
  { name: 'parity without a claim registry is an error', argv: ['parity'], code: 2, assert: (o) => expect(o.err).not.toBe('') },
  { name: 'parity --claims with a missing file is an error', argv: ['parity', '--claims', 'missing.json'], code: 2, assert: (o) => expect(o.err).not.toBe('') },

  // Rendering, studio, vault
  { name: 'render without a template prints usage', argv: ['render'], code: 1, assert: stderrIncludes('Usage: ak-docs render') },
  { name: 'render with an unknown template is rejected', argv: ['render', 'nope'], code: 1, assert: stderrIncludes('Unknown template "nope"') },
  { name: 'render --print-template prints the template source', argv: ['render', 'llms.txt', '--print-template'], code: 0, assert: (o) => expect(o.out.length).toBeGreaterThan(0) },
  { name: 'studio without export prints usage', argv: ['studio'], code: 1, assert: stderrIncludes('Usage: ak-docs studio export') },
  { name: 'studio export rejects an unknown argument', argv: ['studio', 'export', '--bogus'], code: 1, assert: stderrIncludes('Unknown studio export argument') },
  { name: 'studio export prints the graph as JSON', argv: ['studio', 'export'], code: 0, assert: (o) => expect(() => json(o.out)).not.toThrow() },
  { name: 'vault without export or diff prints usage', argv: ['vault'], code: 1, assert: stderrIncludes('Usage: ak-docs vault export') },
  { name: 'vault export without a configured output is an error', argv: ['vault', 'export'], code: 1, assert: (o) => expect(o.err).not.toBe('') },

  // Memory, registry, playbook, setup
  { name: 'memory without an action prints usage', argv: ['memory'], code: 1, assert: stderrIncludes('memory <ingest|classify|promote>') },
  { name: 'memory ingest reports candidates as JSON', argv: ['memory', 'ingest'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true, count: expect.any(Number) }) },
  { name: 'registry without topology prints usage', argv: ['registry'], code: 1, assert: stderrIncludes('registry topology') },
  { name: 'registry topology prints the curator topology', argv: ['registry', 'topology'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ id: 'doc-curator' }) },
  { name: 'playbook without an action prints usage', argv: ['playbook'], code: 1, assert: stderrIncludes('playbook draft') },
  { name: 'playbook pattern --text prints the pattern', argv: ['playbook', 'pattern', '--text'], code: 0, assert: stdoutIncludes('Doc Bridge Pattern') },
  { name: 'playbook pattern prints JSON by default', argv: ['playbook', 'pattern'], code: 0, assert: (o) => expect(() => json(o.out)).not.toThrow() },
  { name: 'bootstrap without agent-docs prints usage', argv: ['bootstrap'], code: 1, assert: stderrIncludes('bootstrap agent-docs') },
  { name: 'init scaffolds without a demo', argv: ['init', '--no-demo'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true, created: expect.any(Object) }) },
  { name: 'demo prints a text summary by default', argv: ['demo'], code: 0, assert: (o) => expect(o.out.length).toBeGreaterThan(0) },
  { name: 'demo --json prints JSON', argv: ['demo', '--json'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true }) },
  { name: 'doctor --json reports ok as JSON', argv: ['doctor', '--json'], code: 0, assert: (o) => expect(json(o.out)).toHaveProperty('ok') },
  { name: 'doctor --badge prints the badge', argv: ['doctor', '--badge'], code: 0, assert: (o) => expect(o.out.length).toBeGreaterThan(0) },
  { name: 'mcp install without a target prints usage', argv: ['mcp', 'install'], code: 1, assert: stderrIncludes('Usage: ak-docs mcp install') },
  { name: 'fix without arguments is rejected', argv: ['fix'], code: 2, assert: stderrIncludes('Usage: ak-docs fix') },
  { name: 'enrich list reports the overlay as JSON', argv: ['enrich', 'list'], code: 0, assert: (o) => expect(json(o.out)).toMatchObject({ ok: true }) },
  { name: 'enrich approve without a proposal is rejected', argv: ['enrich', 'approve'], code: 2, assert: stderrIncludes('Usage: ak-docs enrich approve') },
  { name: 'enrich with an unknown action is rejected', argv: ['enrich', 'nope'], code: 2, assert: stderrIncludes('Usage: ak-docs enrich') },
  { name: 'study without an artifact prints usage', argv: ['study'], code: 1, assert: stderrIncludes('Usage: ak-docs study') },
  { name: 'study protocol with a missing artifact is an error', argv: ['study', 'protocol', 'missing.json'], code: 2, assert: (o) => expect(o.err).not.toBe('') },
]

describe('ak-docs parser parity', () => {
  let workdir = ''

  beforeEach(async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'ak-docs-parity-'))
    workdir = join(scratch, 'sample-project')
    sideDir = join(scratch, 'side')
    mkdirSync(sideDir)
    cpSync(fixtureRoot, workdir, { recursive: true })
    process.chdir(workdir)
    writeFileSync(join(sideDir, 'bad-config.json'), '{"schemaVersion":1,"corpus":{"agent":{}}}\n')
    writeFileSync(join(sideDir, 'handoff.bad.json'), '{"type":"agent-handoff"}\n')
    writeFileSync(join(sideDir, 'fixture.json'), JSON.stringify({ schemaVersion: 1, supported: { entities: ['entity'], relations: [], findings: [] } }))
    writeFileSync(join(sideDir, 'observation.json'), JSON.stringify({ entities: ['entity'], relations: [], findings: [], evidenced: ['entity'] }))
    // The retrieval and diff cases read an index and a discovery snapshot from the fixture.
    expect((await run(['index'])).code).toBe(0)
    const snapshot = json((await run(['discover'])).out)
    writeFileSync(join(sideDir, 'base.json'), JSON.stringify(snapshot.snapshot))
  })

  afterEach(() => {
    process.chdir(originalCwd)
  })

  for (const parity of CASES) {
    it(parity.name, async () => {
      const outcome = await run(parity.argv)
      expect(outcome.code).toBe(parity.code)
      parity.assert?.(outcome)
    })
  }
})
