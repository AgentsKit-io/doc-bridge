import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'

import type { DoctorReport } from '../src/doctor/run-doctor.js'
import type { GateResult } from '../src/gates/run-gates.js'
import type { AskResult } from '../src/cli/ui/ask.js'
import { UiApp } from '../src/cli/ui/app.js'
import type { UiServices } from '../src/cli/ui/services.js'

const RIGHT = '\u001B[C'
const LEFT = '\u001B[D'
const DOWN = '\u001B[B'
const ENTER = '\r'
const BACKSPACE = '\u007F'

const blocked: GateResult = {
  id: 'reference-findings',
  ok: false,
  message: 'Publication blocked: 2 pending reference finding(s) since base abc.',
  findings: [
    { code: 'CHANGED_REFERENCE', document: 'docs/guide.md', line: 4, target: 'src/a.ts#a', diagnostic: {} as never },
    { code: 'BROKEN_REFERENCE', document: 'docs/other.md', line: 2, target: 'src/b.ts#b', diagnostic: {} as never },
  ],
}

const doctorReport = {
  ok: true,
  score: 95,
  grade: 'A',
  grading: { reachability: true, connectivity: true, benchmark: true, unmet: [] },
  coverage: {
    reachability: { documentsTotal: 1, documentsReachable: 1, unreachable: [], pct: 100 },
    connectivity: { areasTotal: 1, areasDocumented: 1, documentsLinked: 1, documentsTotal: 1, pct: 100 },
    benchmark: { status: 'not-analyzed', suite: 's', reason: 'r' },
    packages: { total: 1, withAgentDoc: 1, withHumanDoc: 1, missingAgentDoc: [], missingHumanDoc: [] },
    agentDocs: { total: 1, indexed: 1, unindexed: [] },
    freshness: { ok: true, message: 'fresh', hasIndex: true },
    gates: { ok: true, results: [] },
  },
  issues: [],
  nextActions: [],
} as unknown as DoctorReport

const services = (overrides: Partial<UiServices> = {}): UiServices => ({
  name: 'demo-repo',
  ask: (question): AskResult => ({
    question,
    best: { type: 'ownership', id: 'cli', path: 'docs/cli.md', score: 3 },
    matches: [{ type: 'ownership', id: 'cli', path: 'docs/cli.md', score: 3 }],
    nextCommands: ['ak-docs doctor --text'],
  }),
  findings: () => blocked,
  publicationGate: () => blocked,
  publish: ({ allowPendingFindings }) =>
    allowPendingFindings
      ? { ok: true, indexPath: '.doc-bridge/index.json', contentHash: 'h', knowledgeCount: 1, packageCount: 0, handoffCount: 0, nextCommands: [] }
      : { ok: false, blockedBy: 'reference-findings', gate: blocked },
  doctor: () => doctorReport,
  freshness: () => 'fresh',
  context: (_document, line) => ({ start: 1, focus: line ?? 1, lines: ['# Guide', 'intro', '', 'cites src/a.ts#a', 'tail'] }),
  ...overrides,
})

// Ink attaches its input listener in an effect and applies each key on the next tick; yielding
// once per step keeps these tests deterministic without timers.
const flush = (): Promise<void> => new Promise((done) => setImmediate(done))

const press = async (app: ReturnType<typeof render>, ...keys: string[]): Promise<void> => {
  await flush()
  for (const key of keys) {
    app.stdin.write(key)
    await flush()
  }
}

describe('ak-docs ui', () => {
  it('shows the status bar and moves between tabs with the arrow keys', async () => {
    const app = render(<UiApp services={services()} />)
    expect(app.lastFrame()).toContain('demo-repo')
    expect(app.lastFrame()).toContain('index fresh')
    expect(app.lastFrame()).toContain('q quit')

    await press(app, RIGHT)
    expect(app.lastFrame()).toContain('pending reference finding(s)')
    expect(app.lastFrame()).toContain('CHANGED_REFERENCE')

    await press(app, RIGHT)
    expect(app.lastFrame()).toContain('reference-findings')
    expect(app.lastFrame()).toContain('p publish')

    await press(app, RIGHT)
    expect(app.lastFrame()).toContain('Grade')
    expect(app.lastFrame()).toContain('95/100')

    await press(app, RIGHT, LEFT)
    expect(app.lastFrame()).toContain('Grade')
    await press(app, RIGHT)
    expect(app.lastFrame()).toContain('Press Enter, then type a question')
    app.unmount()
  })

  it('asks a question and shows the answer', async () => {
    const ask = vi.fn(services().ask)
    const app = render(<UiApp services={services({ ask })} />)
    await press(app, ENTER)
    expect(app.lastFrame()).toContain('type a question')
    await press(app, 'w', 'h', 'o', 'x', BACKSPACE, ENTER)
    expect(ask).toHaveBeenCalledWith('who')
    expect(app.lastFrame()).toContain('Best match')
    expect(app.lastFrame()).toContain('docs/cli.md')
    app.unmount()
  })

  it('does not quit while typing, and an empty question returns to navigation', async () => {
    const ask = vi.fn(services().ask)
    const app = render(<UiApp services={services({ ask })} />)
    await press(app, ENTER, 'q')
    expect(app.lastFrame()).toContain('type a question')
    expect(app.lastFrame()).toContain('❯ q')
    await press(app, BACKSPACE, ENTER)
    expect(ask).not.toHaveBeenCalled()
    expect(app.lastFrame()).toContain('q quit')
    app.unmount()
  })

  it('opens the lines around a finding with Enter', async () => {
    const app = render(<UiApp services={services()} />)
    await press(app, RIGHT, ENTER)
    expect(app.lastFrame()).toContain('cites src/a.ts#a')
    expect(app.lastFrame()).toContain('▸')
    await press(app, DOWN)
    expect(app.lastFrame()).toContain('docs/other.md:2')
    app.unmount()
  })

  it('publishes through the gate, and past it only after confirmation', async () => {
    const publish = vi.fn(services().publish)
    const app = render(<UiApp services={services({ publish })} />)
    await press(app, RIGHT, RIGHT, 'p')
    expect(publish).toHaveBeenLastCalledWith({ allowPendingFindings: false })
    expect(app.lastFrame()).toContain('Nothing was written')

    await press(app, 'P')
    expect(app.lastFrame()).toContain('y to confirm')
    await press(app, 'n')
    expect(publish).toHaveBeenCalledTimes(1)

    await press(app, 'P', 'y')
    expect(publish).toHaveBeenLastCalledWith({ allowPendingFindings: true })
    expect(app.lastFrame()).toContain('published')
    app.unmount()
  })

  it('shows an error from a service instead of crashing', async () => {
    const app = render(
      <UiApp
        services={services({
          findings: () => {
            throw new Error('no base configured')
          },
        })}
      />,
    )
    await press(app, RIGHT)
    expect(app.lastFrame()).toContain('no base configured')
    app.unmount()
  })

  it('quits on q', async () => {
    const app = render(<UiApp services={services()} />)
    await press(app, 'q')
    const frame = app.lastFrame()
    await press(app, RIGHT)
    // Ink stopped listening, so the arrow key no longer moves to the Findings tab.
    expect(app.lastFrame()).toBe(frame)
    expect(app.lastFrame()).not.toContain('CHANGED_REFERENCE')
    app.unmount()
  })
})
