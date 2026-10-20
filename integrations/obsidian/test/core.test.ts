import { describe, expect, it } from 'vitest'
import { extractFindings, parseExportJson, splitCommand, statusText } from '../src/core'

describe('pure plugin helpers', () => {
  it('splits executable arguments with quoting', () => { expect(splitCommand('npx --yes "ak-docs cli"')).toEqual(['npx', '--yes', 'ak-docs cli']) })
  it('parses export summary', () => { expect(parseExportJson('{"ok":true,"output":".doc-bridge/vault","notes":3,"removed":1,"findings":2}').findings).toBe(2) })
  it('extracts findings only for drift tagged notes', () => {
    expect(extractFindings('a.md', 'A', ['doc-bridge/document', 'drift/changed-reference'], '# A\n\n## Findings\n12 → [[target]]\n')).toEqual({ path: 'a.md', title: 'A', items: ['12 → [[target]]'] })
  })
  it('formats status', () => { expect(statusText(0)).toBe('doc-bridge · in sync'); expect(statusText(2)).toBe('doc-bridge · 2 drift') })
})
