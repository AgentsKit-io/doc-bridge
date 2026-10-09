import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { proposeL2Remediations } from '../src/fixes/llm.js'
import { regionProviderFromAdapter, scriptedRegionProvider } from '../src/fixes/llm-provider.js'
import { runL2Fix } from '../src/fixes/llm-cli.js'
import { RemediationV1Schema } from '../src/schemas/findings.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const fixture = (doc = '# API\n\nPreviously use `first`.\n') => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-l2-')); roots.push(root)
  const write = (path: string, text: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
  write('package.json', '{"name":"fixture","version":"1.0.0"}')
  write('src/api.ts', 'export const first = 1; export const second = 2;')
  write('docs/api.md', doc)
  const config = applyConfigDefaults({ schemaVersion: 1, corpus: { agent: { root: 'docs/agent' } }, reconciliation: { requiredRelationKinds: [] } })
  const base = discoverRepository({ root, config })
  write('src/api.ts', 'export const second = 2;')
  return { root, config, base, write, doc }
}

describe('optional L2 deterministic real-engine acceptance', () => {
  it('retains a bad patch with a reason and accepts a valid region without writing docs', async () => {
    const input = fixture()
    const bad = await proposeL2Remediations({ ...input, provider: scriptedRegionProvider([{ replacement: 'Still use `first`.' }]) })
    expect(bad.remediations).toEqual([])
    expect(bad.rejected).toMatchObject([{ reason: 'ORIGINAL_FINDING_REMAINS', remediation: { status: 'rejected' } }])
    const good = await proposeL2Remediations({ ...input, provider: scriptedRegionProvider([{ replacement: 'Use `second`.' }]) })
    expect(good.rejected).toEqual([])
    expect(good.remediations).toHaveLength(1)
    expect(RemediationV1Schema.parse(good.remediations[0])).toMatchObject({ status: 'proposed', edits: [{ path: 'docs/api.md', original: 'Previously use `first`.', replacement: 'Use `second`.' }] })
    expect(readFileSync(join(input.root, 'docs/api.md'), 'utf8')).toBe(input.doc)
  })

  it('rejects a patch that clears the original but introduces a documentation-quality finding', async () => {
    const input = fixture('# API Previously use `first`.\n')
    const result = await proposeL2Remediations({ ...input, provider: scriptedRegionProvider([{ replacement: 'Use `second`.' }]) })
    expect(result.remediations).toEqual([])
    expect(result.rejected).toMatchObject([{ reason: 'NEW_FINDING' }])
  })

  it('dry-run builds a plan without invoking the provider or reading keys', async () => {
    const input = fixture()
    const result = await proposeL2Remediations({ ...input, dryRun: true, provider: async () => { throw new Error('must not run') } })
    expect(result.planned).toHaveLength(1)
    expect(result.remediations).toEqual([])
    expect(result.rejected).toEqual([])
  })

  it('binds UTF-8 byte offsets and preserves CRLF region bytes', async () => {
    const input = fixture('# API é\r\n\r\nPreviously use `first`.\r\n')
    const result = await proposeL2Remediations({ ...input, provider: scriptedRegionProvider([{ replacement: 'Use `second`.\r' }]) })
    expect(result.rejected).toEqual([])
    const edit = result.remediations[0]!.edits[0]!
    expect(Buffer.from(input.doc).subarray(edit.range.start, edit.range.end).toString('utf8')).toBe(edit.original)
    expect(edit.original).toBe('Previously use `first`.\r')
  })

  it('bounds requests, rejects malformed responses and leaves excluded findings alone', async () => {
    const input = fixture()
    const small = await proposeL2Remediations({ ...input, maxTokens: 256, provider: async () => { throw new Error('must not run') } })
    expect(small.rejected).toMatchObject([{ reason: 'PROMPT_BUDGET' }])
    const invalid = await proposeL2Remediations({ ...input, provider: scriptedRegionProvider([{ replacement: 'Use `second`.', path: 'src/api.ts' }]) })
    expect(invalid.rejected).toMatchObject([{ reason: 'INVALID_RESPONSE' }])
    const historical = fixture('---\nlifecycle: archived\n---\n# API\nPreviously use `first`.\n')
    expect(await proposeL2Remediations({ ...historical, provider: async () => { throw new Error('must not run') } })).toEqual({ remediations: [], rejected: [], planned: [] })
    await expect(proposeL2Remediations({ ...input, maxFindings: 0 })).rejects.toThrow()
  })

  it('uses the ecosystem stream contract with a bounded, terminal response', async () => {
    let aborted = false
    const provider = regionProviderFromAdapter({ createSource(request) {
      expect(request.context.maxTokens).toBe(256)
      return { async *stream() { yield { type: 'text', content: '{"replacement":"Use second."}' }; yield { type: 'done' } }, abort() { aborted = true } }
    } })
    expect(await provider({ prompt: 'region', maxTokens: 256, signal: new AbortController().signal })).toEqual({ replacement: 'Use second.' })
    expect(aborted).toBe(true)
  })

  it('bounds total calls and handles changed references without assuming removal', async () => {
    const input = fixture()
    input.write('src/api.ts', 'export const first = (): number => 1; export const second = 2;')
    input.write('docs/api.md', '# API\n```ts\nfirst();\n```\n')
    input.write('docs/other.md', '# API\n```ts\nfirst();\n```\n')
    const base = discoverRepository(input)
    input.write('src/api.ts', 'export const first = (value: string): number => value.length; export const second = 2;')
    let calls = 0
    const result = await proposeL2Remediations({ ...input, base, maxFindings: 1, provider: async () => { calls++; return { replacement: 'second;' } } })
    expect(calls).toBe(1)
    expect(result.remediations).toHaveLength(1)
  })

  it('keeps generated citations away from providers and rejects failed streams', async () => {
    const input = fixture('# API\n<!-- doc-bridge:generated -->\nPreviously use `first`.\n<!-- /doc-bridge:generated -->\n')
    expect(await proposeL2Remediations({ ...input, provider: async () => { throw new Error('must not run') } })).toEqual({ remediations: [], rejected: [], planned: [] })
    const provider = regionProviderFromAdapter({ createSource() { return { async *stream() { yield { type: 'tool_call' } }, abort() {} } } })
    await expect(provider({ prompt: 'region', maxTokens: 256, signal: new AbortController().signal })).rejects.toThrow('PROVIDER_FAILED')
  })

  it('CLI writes reviewable records and previews a draft PR without applying patches', async () => {
    const input = fixture()
    input.write('base.snapshot.json', JSON.stringify(input.base))
    input.write('responses.json', JSON.stringify([{ replacement: 'Use `second`.' }]))
    const result = await runL2Fix(input.root, input.config, ['fix', '--llm', '--base', 'base.snapshot.json', '--responses', 'responses.json', '--pr', '--output', '.doc-bridge/l2.json'])
    expect(result.remediations).toHaveLength(1)
    expect(result.pr?.dryRun).toBe(true)
    expect(JSON.parse(readFileSync(join(input.root, '.doc-bridge/l2.json'), 'utf8')).remediations).toHaveLength(1)
    expect(readFileSync(join(input.root, 'docs/api.md'), 'utf8')).toBe(input.doc)
  })
})
