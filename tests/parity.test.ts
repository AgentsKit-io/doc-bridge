import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'
import {
  PARITY_EXCERPT_LIMIT,
  checkPublicParity,
  formatPublicParityText,
  parsePublicParityReport,
  type PublicParityReportV1,
} from '../src/parity/check.js'
import { claimPattern, createPublicClaims, parsePublicClaims, type PublicClaimsV1 } from '../src/parity/claims.js'
import { resolveClaim } from '../src/parity/resolve.js'

const temporary: string[] = []
afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const write = (root: string, path: string, content: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content, 'utf8')
}

const ARTIFACT = 'measurements.json'

/** A repository whose public surfaces state four figures, two of them in two places. */
const fixture = (overrides: { readonly readme?: string; readonly page?: string; readonly artifact?: unknown } = {}): {
  root: string
  config: DocBridgeConfigV1
  configPath: string
} => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-parity-'))
  temporary.push(root)
  write(root, 'package.json', JSON.stringify({ name: 'fixture', version: '2.3.4' }))
  write(root, 'src/widget/build.ts', 'export const buildWidget = (): number => 1\n')
  write(root, 'docs/for-agents/INDEX.md', '# Agent index\n\n- [notes](./notes.md)\n')
  write(root, 'docs/for-agents/notes.md', '# Notes\n\nThe assembly step.\n')
  write(
    root,
    ARTIFACT,
    JSON.stringify(
      overrides.artifact ?? {
        arms: [{ observationCount: 48, completedRate: 0.75 }, { observationCount: 48, completedRate: 0.875 }],
        deltas: { tokensRelative: -0.18459, latencyP95Ms: -39753, pairs: 46 },
      },
    ),
  )
  write(
    root,
    'README.md',
    overrides.readme ??
      '# Fixture\n\nThe round showed **18.46% fewer tokens** across 46 pairs.\nCompletion was 87.5% for the bridge arm.\n',
  )
  write(root, 'docs/page.md', overrides.page ?? '# Page\n\nTokens fell by 18.46% fewer tokens in the round.\n')
  const configuration = { schemaVersion: 1, corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } } }
  write(root, 'doc-bridge.config.json', JSON.stringify(configuration))
  return { root, config: applyConfigDefaults(DocBridgeConfigV1Schema.parse(configuration)), configPath: join(root, 'doc-bridge.config.json') }
}

type ClaimOverrides = Partial<Record<string, unknown>>

const claim = (overrides: ClaimOverrides = {}): Record<string, unknown> => ({
  claimId: 'tokens',
  statement: 'The round measured fewer tokens for the bridge arm',
  owner: 'platform',
  valueType: 'percent',
  template: '{value}% fewer tokens',
  evidence: { kind: 'artifact-field', path: ARTIFACT, field: 'deltas.tokensRelative', transform: 'negative-percent-2dp' },
  required: ['README.md'],
  severity: 'error',
  remediation: 'Restate the figure from deltas.tokensRelative.',
  ...overrides,
})

const registryOf = (...claims: readonly Record<string, unknown>[]): PublicClaimsV1 =>
  createPublicClaims({ type: 'public-claims', schemaVersion: 1, registryVersion: 'test', claims, exceptions: [] })

const check = (root: string, config: DocBridgeConfigV1, registry: PublicClaimsV1): PublicParityReportV1 => {
  const snapshot = discoverRepository({ root, config })
  return checkPublicParity({
    root,
    config,
    registry,
    snapshot,
    project: { name: snapshot.project.name },
    sourceRevision: snapshot.sourceRevision,
    sourceRevisionKind: snapshot.sourceRevisionKind,
  })
}

describe('the claim registry', () => {
  it('seals itself, refuses a tampered hash, and rejects a registry that contradicts itself', () => {
    const registry = registryOf(claim())
    expect(parsePublicClaims(registry)).toEqual(registry)
    expect(() => parsePublicClaims({ ...registry, registryVersion: 'other' })).toThrow('content hash')

    expect(() => registryOf(claim(), claim())).toThrow('duplicate claim ids')
    expect(() => registryOf(claim({ required: ['README.md'], optional: ['README.md'] }))).toThrow('both required and optional')
    expect(() => registryOf(claim({ templates: { 'docs/absent.md': 'x {value}' } }))).toThrow('which it does not declare')
    expect(() =>
      createPublicClaims({
        type: 'public-claims',
        schemaVersion: 1,
        registryVersion: 'test',
        claims: [claim()],
        exceptions: [{ claimId: 'other', surface: 'README.md', reason: 'a reason long enough', acceptedBy: 'maintainer' }],
      }),
    ).toThrow('unknown claim')
    expect(() =>
      createPublicClaims({
        type: 'public-claims',
        schemaVersion: 1,
        registryVersion: 'test',
        claims: [claim()],
        exceptions: [{ claimId: 'tokens', surface: 'docs/page.md', reason: 'a reason long enough', acceptedBy: 'maintainer' }],
      }),
    ).toThrow('which the claim does not declare')

    // A surface is a repository-relative path: the report must not carry an operator's home directory.
    expect(() => registryOf(claim({ required: ['/etc/passwd'] }))).toThrow()
    expect(() => registryOf(claim({ required: ['../secrets.md'] }))).toThrow()
    // A value claim needs a template; a presence claim must not carry one.
    expect(() => registryOf(claim({ template: undefined }))).toThrow('needs a template')
    expect(() => registryOf(claim({ evidence: { kind: 'cli-command', command: 'ak-docs parity' } }))).toThrow('presence check')
  })

  it('escapes the literal half of a template, so a registry cannot smuggle a pattern into the checker', () => {
    const pattern = claimPattern(parsePublicClaims(registryOf(claim({ template: 'cost (USD): {value}+' }))).claims[0]!)
    expect(pattern.source).toContain('cost \\(USD\\): ')
    expect(pattern.source).toContain('\\+')
    expect('cost (USD): 12.5+'.match(pattern)?.[0]).toBe('cost (USD): 12.5+')
    // The regex-shaped template matches literally and nothing else.
    expect('cost USD 12.5'.match(claimPattern(parsePublicClaims(registryOf(claim({ template: 'cost (USD): {value}+' }))).claims[0]!))).toBeNull()
  })
})

describe('public parity: the four outcomes stay apart', () => {
  it('passes when every surface states what the repository proves', () => {
    const { root, config } = fixture()
    const report = check(root, config, registryOf(claim({ required: ['README.md'], optional: ['docs/page.md'] })))
    expect(report.status).toBe('pass')
    expect(report.findings).toEqual([])
    expect(report.metrics).toMatchObject({ claims: 1, surfaces: 2, matched: 2, blocking: 0 })
    expect(formatPublicParityText(report).join('\n')).toContain('Public parity: pass')
  })

  it('reports a stale claim with the file, the line, both values and a remediation', () => {
    const { root, config } = fixture({ readme: '# Fixture\n\nThe round showed **11.10% fewer tokens** across 46 pairs.\n' })
    const report = check(root, config, registryOf(claim()))

    expect(report.status).toBe('blocked')
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]).toMatchObject({
      code: 'PARITY_STALE',
      claimId: 'tokens',
      owner: 'platform',
      severity: 'error',
      blocking: true,
      surface: 'README.md',
      line: 3,
      stated: '11.10',
      canonical: '18.46',
      remediation: 'Restate the figure from deltas.tokensRelative.',
    })
    expect(report.findings[0]?.excerpt).toContain('11.10% fewer tokens')
    expect(report.metrics).toMatchObject({ stale: 1, blocking: 1 })
  })

  it('reports a required surface that does not state the claim at all', () => {
    const { root, config } = fixture({ readme: '# Fixture\n\nNothing quantitative here.\n' })
    const report = check(root, config, registryOf(claim()))
    expect(report.findings[0]).toMatchObject({ code: 'PARITY_MISSING', surface: 'README.md', blocking: true, canonical: '18.46' })
    expect(report.findings[0]?.remediation).toContain('Add "18.46% fewer tokens" to README.md')
    expect(report.findings[0]?.line).toBeUndefined()
  })

  it('reports two public surfaces that disagree with each other, whichever one is right', () => {
    const { root, config } = fixture({ page: '# Page\n\nTokens fell by 12.00% fewer tokens in the round.\n' })
    const report = check(root, config, registryOf(claim({ required: ['README.md', 'docs/page.md'] })))

    const contradiction = report.findings.find((finding) => finding.code === 'PARITY_CONTRADICTION')
    expect(contradiction).toMatchObject({ severity: 'error', blocking: true, canonical: '18.46' })
    expect(contradiction?.message).toContain('12.00 and 18.46')
    // And the surface that is actually wrong is still named on its own line.
    expect(report.findings.find((finding) => finding.code === 'PARITY_STALE')).toMatchObject({ surface: 'docs/page.md', stated: '12.00' })
    expect(report.status).toBe('blocked')
  })

  it('reports a claim it could not resolve rather than counting it as a pass', () => {
    const { root, config } = fixture()
    const absent = check(root, config, registryOf(claim({ evidence: { kind: 'artifact-field', path: 'missing.json', field: 'a' } })))
    expect(absent.findings[0]).toMatchObject({ code: 'PARITY_NOT_ANALYZED', blocking: false, severity: 'warn' })
    expect(absent.status).toBe('needs-review')
    expect(absent.limitations[0]).toContain('missing.json is not present')
    expect(absent.metrics).toMatchObject({ matched: 0, notAnalyzed: 1 })
  })

  it('stops resolving a signed claim when the measurement turns, instead of matching the same digits', () => {
    /*
     * "18.46% fewer" carries its direction in a word. If the next round measures 18.46% *more*, the
     * digits would still match the prose — so the transform refuses to render a positive value, and
     * the claim becomes not-analyzed with the reason.
     */
    const { root, config } = fixture({
      artifact: { arms: [{ observationCount: 1, completedRate: 1 }], deltas: { tokensRelative: 0.18459, latencyP95Ms: 1, pairs: 46 } },
    })
    const report = check(root, config, registryOf(claim()))
    expect(report.findings[0]).toMatchObject({ code: 'PARITY_NOT_ANALYZED', claimId: 'tokens' })
    expect(report.findings[0]?.message).toContain('renders under negative-percent-2dp')
  })

  it('accepts a finding only with a reason, and says so in the report', () => {
    const { root, config } = fixture({ readme: '# Fixture\n\nThe round showed **11.10% fewer tokens** across 46 pairs.\n' })
    const registry = createPublicClaims({
      type: 'public-claims',
      schemaVersion: 1,
      registryVersion: 'test',
      claims: [claim()],
      exceptions: [{ claimId: 'tokens', surface: 'README.md', reason: 'Pinned to the published round until the next one is approved.', acceptedBy: 'maintainer' }],
    })
    const report = check(root, config, registry)

    expect(report.status).toBe('needs-review')
    expect(report.metrics).toMatchObject({ stale: 1, blocking: 0, accepted: 1 })
    expect(report.findings[0]).toMatchObject({ blocking: false, severity: 'info' })
    expect(report.findings[0]?.acceptedReason).toContain('Pinned to the published round')
    expect(formatPublicParityText(report).join('\n')).toContain('accepted: Pinned to the published round')
  })
})

describe('the resolvers', () => {
  it('read a package field, an artifact field, a sum over an array, a snapshot count and a CLI command', () => {
    const { root, config } = fixture()
    const snapshot = discoverRepository({ root, config })
    const context = { root, config, snapshot }
    const resolved = (evidence: { readonly kind: string } & Record<string, unknown>): string | undefined => {
      // A presence claim carries no template, which the registry enforces; everything else keeps one.
      const built = claim(evidence.kind === 'cli-command' ? { evidence, template: undefined } : { evidence })
      const outcome = resolveClaim(parsePublicClaims(registryOf(built)).claims[0]!, context)
      return outcome.status === 'resolved' ? outcome.value : undefined
    }

    expect(resolved({ kind: 'package-field', field: 'version' })).toBe('2.3.4')
    expect(resolved({ kind: 'artifact-field', path: ARTIFACT, field: 'arms.1.completedRate', transform: 'percent-1dp' })).toBe('87.5')
    expect(resolved({ kind: 'artifact-field', path: ARTIFACT, field: 'deltas.pairs' })).toBe('46')
    expect(resolved({ kind: 'artifact-field', path: ARTIFACT, field: 'deltas.latencyP95Ms', transform: 'negative-seconds-2dp' })).toBe('39.75')
    expect(resolved({ kind: 'artifact-sum', path: ARTIFACT, arrayField: 'arms', field: 'observationCount' })).toBe('96')
    expect(resolved({ kind: 'snapshot-count', entityKind: 'document' })).toBe(String(snapshot.entities.filter((entity) => entity.kind === 'document').length))
    expect(resolved({ kind: 'cli-command', command: 'ak-docs parity' })).toBe('ak-docs parity')
    expect(resolved({ kind: 'cli-command', command: 'ak-docs teleport' })).toBeUndefined()
    // A sum over something that is not an array of numbers is unresolved, not zero.
    expect(resolved({ kind: 'artifact-sum', path: ARTIFACT, arrayField: 'deltas', field: 'pairs' })).toBeUndefined()
    expect(resolved({ kind: 'artifact-sum', path: ARTIFACT, arrayField: 'arms', field: 'absent' })).toBeUndefined()
    // The doctor is only consulted when a claim asks for it; without one the claim is unchecked.
    expect(resolved({ kind: 'doctor-metric', metric: 'grade' })).toBeUndefined()
  })
})

describe('the report itself', () => {
  it('is deterministic, sorted, and carries no absolute path or secret', () => {
    const { root, config } = fixture({
      readme: `# Fixture\n\nThe round showed **11.10% fewer tokens**, api_key=sk-live-abcdefghijklmnopqrst, across ${'x'.repeat(400)} pairs.\n`,
    })
    const registry = registryOf(claim(), claim({ claimId: 'completion', template: 'Completion was {value}%', evidence: { kind: 'artifact-field', path: ARTIFACT, field: 'arms.1.completedRate', transform: 'percent-1dp' } }))
    const first = check(root, config, registry)
    const second = check(root, config, registry)

    expect(second.contentHash).toBe(first.contentHash)
    expect(parsePublicParityReport(first)).toEqual(first)
    expect(() => parsePublicParityReport({ ...first, status: 'pass' })).toThrow('content hash')
    expect(first.findings.map((finding) => finding.claimId)).toEqual([...first.findings.map((finding) => finding.claimId)].sort())

    const serialized = JSON.stringify(first)
    expect(serialized).not.toContain(root)
    expect(serialized).not.toContain('sk-live-abcdefghijklmnopqrst')
    expect(serialized).toContain('[REDACTED]')
    for (const finding of first.findings) expect((finding.excerpt ?? '').length).toBeLessThanOrEqual(PARITY_EXCERPT_LIMIT)
  })
})

describe('ak-docs parity', () => {
  const capture = (fn: () => number | undefined): { code: number | undefined; out: string; err: string } => {
    const stdout = process.stdout.write
    const stderr = process.stderr.write
    let out = ''
    let err = ''
    process.stdout.write = ((chunk: string | Uint8Array) => { out += String(chunk); return true }) as typeof process.stdout.write
    process.stderr.write = ((chunk: string | Uint8Array) => { err += String(chunk); return true }) as typeof process.stderr.write
    try {
      return { code: fn(), out, err }
    } finally {
      process.stdout.write = stdout
      process.stderr.write = stderr
    }
  }

  it('exits zero on a clean registry and non-zero on a blocking finding, in both modes', () => {
    const { root, configPath } = fixture()
    write(root, 'claims.json', JSON.stringify(registryOf(claim({ required: ['README.md'] }))))
    const clean = capture(() => runCli(['parity', '--claims', 'claims.json', '--config', configPath, '--json']))
    expect(clean.code, clean.err).toBe(0)
    const payload = JSON.parse(clean.out) as { ok: boolean; parity: { status: string; metrics: { matched: number } } }
    expect(payload.ok).toBe(true)
    expect(payload.parity.status).toBe('pass')

    const { root: broken, configPath: brokenConfig } = fixture({ readme: '# Fixture\n\nThe round showed **11.10% fewer tokens**.\n' })
    write(broken, 'claims.json', JSON.stringify(registryOf(claim({ required: ['README.md'] }))))
    const failed = capture(() => runCli(['parity', '--claims', 'claims.json', '--config', brokenConfig, '--text']))
    expect(failed.code).toBe(1)
    expect(failed.out).toContain('Public parity: blocked')
    expect(failed.out).toContain('PARITY_STALE README.md:3')

    const missingRegistry = capture(() => runCli(['parity', '--claims', 'absent.json', '--config', configPath, '--json']))
    expect(missingRegistry.code).toBe(2)
  })
})

describe('this repository', () => {
  it('keeps its committed registry valid and its public claims true', () => {
    const registry = parsePublicClaims(JSON.parse(readFileSync('docs/parity/public-claims-v1.json', 'utf8')) as unknown)
    expect(registry.claims.length).toBeGreaterThanOrEqual(5)
    // Every surface the registry names exists, so a claim cannot pass by addressing nothing.
    const report = check(process.cwd(), applyConfigDefaults(DocBridgeConfigV1Schema.parse(JSON.parse(readFileSync('doc-bridge.config.json', 'utf8')) as unknown)), registry)
    expect(report.missingSurfaces).toEqual([])
    expect(report.findings.filter((finding) => finding.blocking)).toEqual([])
    expect(report.metrics.matched).toBeGreaterThan(0)
  }, 180_000)
})
