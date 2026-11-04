import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  doctorBadgeMetrics,
  formatDoctorBadgeJson,
  formatDoctorBadgeMarkdown,
  type DoctorBadgeMetrics,
} from '../src/doctor/badge.js'
import type { DoctorReport } from '../src/doctor/run-doctor.js'

const report = (
  packages: { total: number; withAgentDoc: number; withHumanDoc: number },
  score = 80,
  grade: DoctorReport['grade'] = 'B',
): DoctorReport => ({ score, grade, coverage: { packages } }) as unknown as DoctorReport

const metrics = (overrides: Partial<DoctorBadgeMetrics> = {}): DoctorBadgeMetrics => ({
  handoffPct: 100,
  bridgePct: 100,
  score: 100,
  grade: 'A',
  packages: 4,
  ...overrides,
})

afterEach(() => {
  vi.useRealTimers()
})

describe('doctorBadgeMetrics', () => {
  it('derives rounded percentages, score, grade and package count', () => {
    expect(doctorBadgeMetrics(report({ total: 3, withAgentDoc: 2, withHumanDoc: 1 }, 72, 'C'))).toEqual({
      handoffPct: 67,
      bridgePct: 33,
      score: 72,
      grade: 'C',
      packages: 3,
    })
  })

  it('reports 100% when every package is covered', () => {
    const result = doctorBadgeMetrics(report({ total: 5, withAgentDoc: 5, withHumanDoc: 5 }))
    expect(result.handoffPct).toBe(100)
    expect(result.bridgePct).toBe(100)
  })

  it('reports 0% instead of NaN when there are no packages', () => {
    const result = doctorBadgeMetrics(report({ total: 0, withAgentDoc: 0, withHumanDoc: 0 }, 10, 'F'))
    expect(result).toEqual({ handoffPct: 0, bridgePct: 0, score: 10, grade: 'F', packages: 0 })
  })

  it('throws when the report carries no coverage', () => {
    expect(() => doctorBadgeMetrics({ score: 1, grade: 'F' } as unknown as DoctorReport)).toThrow(TypeError)
  })
})

describe('formatDoctorBadgeMarkdown', () => {
  it('renders three shields.io badges joined by spaces', () => {
    const markdown = formatDoctorBadgeMarkdown(metrics({ handoffPct: 90, bridgePct: 60, score: 30 }))
    expect(markdown).toBe(
      [
        '![handoff coverage](https://img.shields.io/badge/handoff_coverage-90%25-2ea44f?style=flat-square)',
        '![human bridge](https://img.shields.io/badge/human_bridge-60%25-dbab09?style=flat-square)',
        '![doc-bridge score](https://img.shields.io/badge/doc--bridge_score-30%2F100-cb2431?style=flat-square)',
      ].join(' '),
    )
  })

  it.each([
    [100, '2ea44f'],
    [80, '2ea44f'],
    [79, 'dbab09'],
    [50, 'dbab09'],
    [49, 'cb2431'],
    [0, 'cb2431'],
  ])('colours %i%% as %s', (pct, color) => {
    expect(formatDoctorBadgeMarkdown(metrics({ handoffPct: pct }))).toContain(`handoff_coverage-${pct}%25-${color}`)
  })
})

describe('formatDoctorBadgeJson', () => {
  it('serialises metrics with schema version, markdown and timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'))
    const input = metrics({ handoffPct: 50, bridgePct: 25, score: 61, grade: 'C', packages: 8 })

    const raw = formatDoctorBadgeJson(input)

    expect(raw).toContain('\n  "schemaVersion": 1')
    expect(JSON.parse(raw)).toEqual({
      schemaVersion: 1,
      ...input,
      markdown: formatDoctorBadgeMarkdown(input),
      updatedAt: '2026-01-02T03:04:05.000Z',
    })
  })
})
