import { describe, expect, it } from 'vitest'
// The landing page's bridge-conveyor figure runs this model in the browser (the build inlines it).
import { ask, fixDoc, initial, MODEL, reset, toggleCode, tourStep, verdict } from '../scripts/figures/bridge-conveyor/model.mjs'

describe('bridge conveyor figure model', () => {
  it('starts published, with the guide citing the code signature', () => {
    const v = verdict(initial())
    expect(v).toMatchObject({ phase: 'baseline', findings: 0, published: true, lamp: true, barrier: 'up', belt: 'running', flag: false, slip: null })
    expect(v.code).toBe('send(to, text)')
    expect(v.cites).toBe('send(to, text)')
    expect(v.readout).toBe('index current · published')
  })

  it('an ask delivers the guide slip while publication is allowed', () => {
    const v = verdict(ask(initial()))
    expect(v.phase).toBe('asked')
    expect(v.slip).toBe('docs/guides/sending-notifications.md:8')
    expect(v.readout).toBe('asked · docs/guides/sending-notifications.md:8')
  })

  it('a signature change is one CHANGED_REFERENCE finding that drops the barrier and holds the belt', () => {
    const drifted = toggleCode(initial())
    const v = verdict(drifted)
    expect(v).toMatchObject({ phase: 'drift', findings: 1, published: false, lamp: false, barrier: 'down', belt: 'held', flag: true, stale: true })
    expect(v.code).toBe('send({ to, text, channel })')
    expect(v.cites).toBe('send(to, text)')
    expect(v.readout).toBe(`1 finding · ${MODEL.finding} · publish blocked`)
    expect(verdict(ask(drifted)).slip).toBeNull()
  })

  it('fixing the guide clears the finding and publishes again', () => {
    const v = verdict(fixDoc(toggleCode(initial())))
    expect(v).toMatchObject({ phase: 'fixed', findings: 0, published: true, lamp: true, barrier: 'up', belt: 'running' })
    expect(v.cites).toBe('send({ to, text, channel })')
    expect(v.readout).toBe('0 findings · published')
    expect(fixDoc(initial())).toEqual(initial())
  })

  it('toggling the code back needs no fix: the guide already cites it', () => {
    const v = verdict(toggleCode(toggleCode(initial())))
    expect(v).toMatchObject({ phase: 'fixed', findings: 0, published: true })
  })

  it('the idle tour loops ask, drift, fix, ask and back to the baseline', () => {
    const phases: string[] = []
    let state = initial()
    for (let step = 0; step < 6; step++) {
      state = tourStep(state)
      phases.push(verdict(state).phase)
    }
    expect(phases).toEqual(['asked', 'drift', 'fixed', 'asked', 'baseline', 'asked'])
    expect(reset()).toEqual(initial())
  })
})
