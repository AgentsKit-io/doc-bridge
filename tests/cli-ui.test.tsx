import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'

import type { DoctorReport } from '../src/doctor/run-doctor.js'
import type { GateResult } from '../src/gates/run-gates.js'
import type { KnowledgeDiagnostic } from '../src/schemas/knowledge.js'
import type { AskResult } from '../src/cli/ui/ask.js'
import { richOutput } from '../src/cli/ui/mode.js'
import { AskView, DiffView, DoctorView, GateView, IndexView, RICH_VIEWS, VaultExportView, printRich } from '../src/cli/ui/render.js'

const finding = { code: 'CHANGED_REFERENCE', document: 'docs/guide.md', line: 8, target: 'src/run.ts#run' }

const referenceGate: GateResult = {
  id: 'reference-findings',
  ok: false,
  message: 'Publication blocked: 1 pending reference finding(s) since base abc123.',
  pendingCount: 1,
  findings: [{ ...finding, diagnostic: {} as never }],
}

const askResult: AskResult = {
  question: 'who owns the cli',
  best: { type: 'ownership', id: 'cli', path: 'docs/for-agents/cli.md', score: 9.5, summary: 'Command line owner' },
  handoff: { startHere: 'docs/for-agents/cli.md', editRoots: ['src/cli'], checks: ['pnpm test'] },
  matches: [
    { type: 'ownership', id: 'cli', path: 'docs/for-agents/cli.md', score: 9.5 },
    { type: 'knowledge', id: 'readme', path: 'README.md', score: 1.25 },
  ],
  nextCommands: ['ak-docs query ownership cli --agent'],
}

const doctorReport = {
  ok: false,
  score: 72,
  grade: 'C',
  grading: { reachability: true, connectivity: false, benchmark: false, unmet: ['connectivity below 80%'] },
  coverage: {
    reachability: { documentsTotal: 10, documentsReachable: 10, unreachable: [], pct: 100 },
    connectivity: { areasTotal: 4, areasDocumented: 2, documentsLinked: 3, documentsTotal: 10, pct: 50 },
    benchmark: { status: 'not-analyzed', suite: 'x', reason: 'none' },
    packages: { total: 4, withAgentDoc: 2, withHumanDoc: 1, missingAgentDoc: [], missingHumanDoc: [] },
    agentDocs: { total: 5, indexed: 5, unindexed: [] },
    freshness: { ok: true, message: 'fresh', hasIndex: true },
    gates: { ok: true, results: [{ id: 'index-freshness', ok: true, message: 'Index is fresh' }] },
  },
  issues: [{ severity: 'warn', code: 'NO_HUMAN_DOC', message: 'cli has no human guide' }],
  nextActions: ['ak-docs bootstrap agent-docs'],
} as unknown as DoctorReport

const out = (element: Parameters<typeof render>[0]): string => render(element).lastFrame() ?? ''

describe('rich views', () => {
  it('AskView highlights the best match and lists the next commands', () => {
    const frame = out(<AskView result={askResult} />)
    expect(frame).toContain('who owns the cli')
    expect(frame).toContain('Best match')
    expect(frame).toContain('ownership cli')
    expect(frame).toContain('docs/for-agents/cli.md')
    expect(frame).toContain('9.50')
    expect(frame).toContain('src/cli')
    expect(frame).toContain('Next commands')
    expect(frame).toContain('ak-docs query ownership cli --agent')
  })

  it('AskView says so when nothing matches', () => {
    const frame = out(<AskView result={{ question: 'nothing', matches: [], nextCommands: ['ak-docs list knowledge --text'] }} />)
    expect(frame).toContain('Best match: none')
    expect(frame).toContain('No local matches')
  })

  it('GateView marks each gate and tabulates pending reference findings', () => {
    const frame = out(<GateView result={{ ok: false, results: [{ id: 'index-freshness', ok: true, message: 'Index is fresh' }, referenceGate] }} />)
    expect(frame).toContain('✓ index-freshness')
    expect(frame).toContain('✗ reference-findings')
    expect(frame).toContain('Publication blocked')
    expect(frame).toContain('CHANGED_REFERENCE')
    expect(frame).toContain('docs/guide.md:8')
    expect(frame).toContain('→ src/run.ts#run')
    expect(frame).toContain('--allow-pending-findings')
  })

  it('GateView reports ok when every gate passes', () => {
    const frame = out(<GateView result={{ ok: true, results: [{ id: 'index-freshness', ok: true, message: 'Index is fresh' }] }} />)
    expect(frame).toContain('ok')
    expect(frame).not.toContain('Publication blocked')
  })

  it('IndexView shows a published index with relative paths and notes', () => {
    const frame = out(
      <IndexView
        root="/project"
        result={{
          ok: true,
          indexPath: '/project/.doc-bridge/index.json',
          llmsTxtPath: '/project/llms.txt',
          contentHash: 'sha256:abc',
          knowledgeCount: 4,
          packageCount: 2,
          handoffCount: 0,
          diagnostics: ['No ownership handoffs yet.'],
          nextCommands: ['ak-docs index'],
        }}
      />,
    )
    expect(frame).toContain('published')
    expect(frame).toContain('4 documents')
    expect(frame).toContain('.doc-bridge/index.json')
    expect(frame).not.toContain('/project/')
    expect(frame).toContain('No ownership handoffs yet.')
    expect(frame).toContain('ak-docs index')
  })

  it('IndexView shows a blocked publication', () => {
    const frame = out(<IndexView result={{ ok: false, blockedBy: 'reference-findings', gate: referenceGate }} />)
    expect(frame).toContain('Publication blocked')
    expect(frame).toContain('docs/guide.md:8')
    expect(frame).toContain('Nothing was written')
  })

  it('DiffView groups findings by document', () => {
    const diagnostic = (id: string, code: string, path: string, lineStart: number): KnowledgeDiagnostic =>
      ({ id, code, status: 'conflict', severity: 'warning', message: `${code} message`, evidence: [{ source: 'documentation', path, lineStart }] }) as unknown as KnowledgeDiagnostic
    const frame = out(<DiffView result={{ findings: [diagnostic('a', 'CHANGED_REFERENCE', 'docs/a.md', 3), diagnostic('b', 'BROKEN_REFERENCE', 'docs/a.md', 9), diagnostic('c', 'CHANGED_REFERENCE', 'docs/b.md', 1)] }} />)
    expect(frame.match(/docs\/a\.md/g)).toHaveLength(1)
    expect(frame).toContain('docs/b.md')
    expect(frame).toContain('BROKEN_REFERENCE')
    expect(frame).toContain('3 finding(s) in 2 document(s)')
  })

  it('DiffView reports no findings', () => {
    expect(out(<DiffView result={{ findings: [] }} />)).toContain('no findings')
  })

  it('DoctorView shows the grade, score bars and unmet requirements', () => {
    const frame = out(<DoctorView report={doctorReport} />)
    expect(frame).toContain('Grade')
    expect(frame).toContain('C')
    expect(frame).toContain('72/100')
    expect(frame).toContain('Reachability')
    expect(frame).toContain('█')
    expect(frame).toContain('connectivity below 80%')
    expect(frame).toContain('NO_HUMAN_DOC')
  })

  it('VaultExportView shows notes, removed and findings', () => {
    const frame = out(<VaultExportView root="/project" result={{ ok: true, output: '/project/.doc-bridge/vault', notes: 12, removed: 2, findings: 3, warnings: ['skipped one note'] }} />)
    expect(frame).toContain('.doc-bridge/vault')
    expect(frame).toContain('notes    12')
    expect(frame).toContain('removed  2')
    expect(frame).toContain('findings 3')
    expect(frame).toContain('skipped one note')
  })

  it('RICH_VIEWS builds an element per command id', () => {
    expect(Object.keys(RICH_VIEWS).sort()).toEqual(['ask', 'diff', 'doctor', 'gate', 'index', 'vault'])
    expect(out(RICH_VIEWS.gate({ ok: true, results: [{ id: 'okf-type', ok: true, message: 'fine' }] }))).toContain('okf-type')
  })

  it('printRich renders once to the given stream and returns', async () => {
    let written = ''
    const stdout = { columns: 100, isTTY: false, write: (chunk: string) => ((written += chunk), true), on: () => stdout, off: () => stdout, removeListener: () => stdout, once: () => stdout, emit: () => true } as unknown as NodeJS.WriteStream
    await printRich(RICH_VIEWS.doctor(doctorReport), { stdout })
    expect(written).toContain('72/100')
  })
})

describe('richOutput', () => {
  const tty = { isTTY: true }
  const base = { stdout: tty, flags: new Set<string>(), env: {} }

  it('is on for an interactive terminal with no overrides', () => {
    expect(richOutput(base)).toBe(true)
  })

  it.each([
    ['a pipe', { stdout: { isTTY: false } }],
    ['no isTTY', { stdout: {} }],
    ['--json', { flags: new Set(['--json']) }],
    ['--text', { flags: new Set(['--text']) }],
    ['--agent', { flags: ['--agent'] }],
    ['CI', { env: { CI: 'true' } }],
    ['NO_COLOR', { env: { NO_COLOR: '1' } }],
    ['AK_DOCS_PLAIN', { env: { AK_DOCS_PLAIN: '1' } }],
  ])('stays plain for %s', (_name, override) => {
    expect(richOutput({ ...base, ...override })).toBe(false)
  })

  it('ignores CI=false, an empty NO_COLOR and AK_DOCS_PLAIN=0', () => {
    expect(richOutput({ ...base, env: { CI: 'false', NO_COLOR: '', AK_DOCS_PLAIN: '0' } })).toBe(true)
  })
})
