import { describe, expect, it } from 'vitest'
import { childPath, extractFindings, parseExportJson, splitCommand, statusText } from '../src/core'

describe('pure plugin helpers', () => {
  it('splits executable arguments with quoting', () => { expect(splitCommand('npx --yes "ak-docs cli"')).toEqual(['npx', '--yes', 'ak-docs cli']) })
  it('parses export summary', () => { expect(parseExportJson('{"ok":true,"output":".doc-bridge/vault","notes":3,"removed":1,"findings":2}').findings).toBe(2) })
  it('extracts findings only for drift tagged notes', () => {
    expect(extractFindings('a.md', 'A', ['doc-bridge/document', 'drift/changed-reference'], '# A\n\n## Findings\n12 → [[target]]\n')).toEqual({ path: 'a.md', title: 'A', items: ['12 → [[target]]'] })
  })
  it('reads the Findings section exactly as vault export writes it', () => {
    const note = '# sending-notifications.md\n\n## Relations\n\n- observed links-to: [[a]] → [[b]]\n\n## Findings\n\n- 8 → send (CHANGED_REFERENCE) — [[modules/send-ts|send.ts]]\n'
    expect(extractFindings('docs/s.md', 'S', ['drift/changed-reference'], note)?.items).toEqual(['8 → send (CHANGED_REFERENCE) — [[modules/send-ts|send.ts]]'])
    expect(extractFindings('docs/s.md', 'S', ['doc-bridge/document'], note)).toBeUndefined()
  })
  it('treats a missing findings count as zero', () => { expect(parseExportJson('{"ok":true,"notes":3,"removed":0}').findings).toBe(0) })
  it('puts extra PATH folders first without duplicates', () => { expect(childPath('/usr/bin:/opt/homebrew/bin', '/opt/homebrew/bin:/usr/local/bin')).toBe('/opt/homebrew/bin:/usr/local/bin:/usr/bin') })
  it('formats status', () => { expect(statusText(0)).toBe('doc-bridge · in sync'); expect(statusText(2)).toBe('doc-bridge · 2 drift') })
})
