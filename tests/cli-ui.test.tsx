import React from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { AskView, DiffView, DoctorView, GateView, IndexView, VaultExportView } from '../src/cli/ui/render.js'
import { richOutput } from '../src/cli/ui/mode.js'
import type { DoctorReport } from '../src/doctor/run-doctor.js'

describe('rich output mode', () => {
  const base = { stdout: { isTTY: true }, flags: new Set<string>(), env: {} }
  it('enables only for an interactive plain-capable terminal', () => {
    expect(richOutput(base)).toBe(true)
    expect(richOutput({ ...base, stdout: { isTTY: false } })).toBe(false)
    for (const flag of ['--json', '--text']) expect(richOutput({ ...base, flags: new Set([flag]) })).toBe(false)
    for (const env of [{ CI: '1' }, { NO_COLOR: '1' }, { AK_DOCS_PLAIN: '1' }]) expect(richOutput({ ...base, env })).toBe(false)
  })
})

const output = (element: React.ReactElement) => render(element).lastFrame() ?? ''
describe('rich terminal views', () => {
  it('renders ask strings and paths', () => expect(output(<AskView result={{ question: 'find setup', matches: [{ type: 'document', id: 'setup', path: 'file.md:8', score: 0.9 }] }} />)).toContain('file.md:8'))
  it('renders gate results and pending findings', () => expect(output(<GateView result={{ ok: false, results: [{ id: 'reference-findings', ok: false, message: 'Publication blocked', findings: [{ code: 'CHANGED_REFERENCE', document: 'file.md', line: 8, target: 'src/a.ts', diagnostic: {} as never }] }] }} />)).toContain('CHANGED_REFERENCE'))
  it('renders index status and counts', () => expect(output(<IndexView result={{ ok: true, indexPath: '.doc-bridge/index.json', knowledgeCount: 12 }} />)).toContain('12 documents'))
  it('renders diff groups', () => expect(output(<DiffView result={{ findings: [{ code: 'CHANGED_REFERENCE', document: 'guide.md' }] }} />)).toContain('guide.md'))
  it('renders doctor grade and unmet requirements', () => {
    const report = { grade: 'B', score: 80, grading: { unmet: ['Reachability'] }, coverage: { reachability: { pct: 90 }, connectivity: { pct: 80 } }, issues: [] } as unknown as DoctorReport
    expect(output(<DoctorView result={report} />)).toContain('Reachability')
  })
  it('renders vault counts', () => expect(output(<VaultExportView result={{ notes: 4, removed: 1, findings: 2 }} />)).toContain('4 notes'))
})
