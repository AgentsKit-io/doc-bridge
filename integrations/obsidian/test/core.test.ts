import { describe, expect, it } from 'vitest'
import { buildGraphQuery, childPath, customStatusText, extractFindings, GRAPH_MARKER, mergeGraphJson, parseCustomJson, parseExportJson, splitCommand, staleToFindings, statusText } from '../src/core'

const own = (graph: { colorGroups: { query: string }[] }) => graph.colorGroups.filter(group => group.query.includes(GRAPH_MARKER))

describe('custom command freshness', () => {
  it('parses a valid result', () => {
    const result = parseCustomJson('{"ok":true,"notes":5,"findings":1,"stale":[{"file":"a/b.md","paths":["x.ts"],"repo":"r","recorded":"abc","current":"def"},{"file":"c.md","paths":[]},{"paths":["no-file"]}]}')
    expect(result.notes).toBe(5)
    expect(result.stale).toEqual([{ file: 'a/b.md', paths: ['x.ts'], repo: 'r', recorded: 'abc', current: 'def' }, { file: 'c.md', paths: [] }])
  })
  it('throws the command error when ok is false', () => {
    expect(() => parseCustomJson('{"ok":false,"error":"brain is locked"}')).toThrow('brain is locked')
    expect(() => parseCustomJson('{"ok":false}')).toThrow('ok: false')
  })
  it('tolerates missing fields and rejects a missing ok', () => {
    expect(parseCustomJson('{"ok":true}')).toEqual({ ok: true, notes: 0, findings: 0, stale: [] })
    expect(() => parseCustomJson('{"notes":1}')).toThrow('missing ok')
    expect(() => parseCustomJson('[]')).toThrow('invalid JSON')
  })
  it('lists paths and recorded → current per stale note', () => {
    expect(staleToFindings([{ file: 'repos/a.md', paths: ['x.ts'], repo: 'r', recorded: '1', current: '2' }])).toEqual([{ path: 'repos/a.md', title: 'a.md', items: ['x.ts', 'r: 1 → 2'] }])
  })
  it('builds a quoted graph query with a marker', () => {
    const { query, used, truncated } = buildGraphQuery(['a b.md', 'q"uote\\.md'])
    expect(query).toBe(`path:("a b.md" OR "q\\"uote\\\\.md" OR "${GRAPH_MARKER}")`)
    expect([used, truncated]).toEqual([2, false])
  })
  it('caps the query', () => {
    const files = Array.from({ length: 450 }, (_, i) => `n${i}.md`)
    const result = buildGraphQuery(files)
    expect([result.used, result.truncated]).toEqual([400, true])
    expect(result.query).not.toContain('"n400.md"')
  })
  it('creates a minimal graph.json and writes nothing when there is nothing to do', () => {
    expect(mergeGraphJson(undefined, [])).toBeUndefined()
    const graph = JSON.parse(mergeGraphJson(undefined, ['a.md'])!)
    expect(graph.colorGroups).toHaveLength(1)
    expect(graph.colorGroups[0].color).toEqual({ a: 1, rgb: 0xe3b341 })
  })
  it('keeps user groups and keys, puts its own group first and replaces it', () => {
    const user = { query: 'tag:#mine', color: { a: 1, rgb: 1 } }
    const existing = JSON.stringify({ search: 'x', scale: 2, colorGroups: [user] })
    const first = mergeGraphJson(existing, ['a.md'])!
    const second = JSON.parse(mergeGraphJson(first, ['b.md'])!)
    expect(second.search).toBe('x')
    expect(second.scale).toBe(2)
    expect(second.colorGroups).toHaveLength(2)
    expect(second.colorGroups[0].query).toContain('"b.md"')
    expect(second.colorGroups[0].query).not.toContain('"a.md"')
    expect(second.colorGroups[1]).toEqual(user)
  })
  it('removes its group when nothing is stale and refuses unparseable input', () => {
    const merged = mergeGraphJson(JSON.stringify({ colorGroups: [{ query: 'tag:#mine', color: { a: 1, rgb: 1 } }] }), ['a.md'])!
    const cleared = JSON.parse(mergeGraphJson(merged, [])!)
    expect(own(cleared)).toHaveLength(0)
    expect(cleared.colorGroups).toHaveLength(1)
    expect(() => mergeGraphJson('{not json', ['a.md'])).toThrow()
  })
  it('formats status for both modes', () => {
    expect(customStatusText(0)).toBe('doc-bridge · in sync')
    expect(customStatusText(3)).toBe('doc-bridge · 3 stale')
    expect(customStatusText(undefined)).toBe('doc-bridge · not checked')
    expect(statusText(3)).toBe('doc-bridge · 3 drift')
  })
})

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
