import { runCommand } from '@agentskit/cross-platform'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { discoverRepository } from '../src/discovery/repository.js'
import { diffSnapshots } from '../src/diff/change-set.js'
import { FindingV1Schema } from '../src/schemas/findings.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const put = (root: string, path: string, content: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content) }
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-policy-')); roots.push(root)
  put(root, 'package.json', JSON.stringify({ name: 'doc-bridge-fixture', version: '1.0.0', bin: { 'doc-bridge': 'cli.ts' } }))
  put(root, 'api.ts', 'export function removed(): void {}\nexport function changed(value: string): void {}\n')
  put(root, 'cli.ts', "import { parseArgs } from 'node:util'; parseArgs({ options: { brief: { type: 'boolean', default: false } } });\n")
  put(root, 'config-schema.json', JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { output: { type: 'object', properties: { mode: { type: 'string', default: 'short' } } } } }))
  return root
}

it('changed signatures, config defaults and flag values retain hash pairs, stable locators and review routing', () => {
  const root = fixture()
  put(root, 'docs/guide.md', '# Guide\n\nCall `changed` with a string.\n\nThe default `output.mode` is short.\n\nThe default for `doc-bridge --brief` is false.\n')
  const base = discoverRepository({ root })
  put(root, 'api.ts', 'export function removed(): void {}\nexport function changed(value: string, enabled: boolean): void {}\n')
  put(root, 'cli.ts', "import { parseArgs } from 'node:util'; parseArgs({ options: { brief: { type: 'boolean', default: true } } });\n")
  put(root, 'config-schema.json', JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { output: { type: 'object', properties: { mode: { type: 'number', default: 2 } } } } }))
  const head = discoverRepository({ root })
  const result = diffSnapshots(base, head, { headRoot: root })
  expect(result.findings).toHaveLength(3)
  for (const diagnostic of result.findings) {
    expect(diagnostic).toMatchObject({ code: 'CHANGED_REFERENCE', status: 'stale-or-unverified' })
    expect(diagnostic).not.toHaveProperty('remediation')
    expect(diagnostic.evidence).toContainEqual(expect.objectContaining({ context: expect.stringMatching(/^Base target valueHash: [a-f0-9]{64}$/) }))
    expect(diagnostic.evidence).toContainEqual(expect.objectContaining({ context: expect.stringMatching(/^Head target valueHash: [a-f0-9]{64}$/) }))
  }
  expect(result.policy.findings.every(item => FindingV1Schema.safeParse(item).success && item.routing === 'routed-to-L2')).toBe(true)
  put(root, 'docs/guide.md', '# Guide\n\nIntroduction.\n\nCall `changed` with a string.\n\nThe default `output.mode` is short.\n\nThe default for `doc-bridge --brief` is false.\n')
  const moved = discoverRepository({ root })
  expect(diffSnapshots(base, moved, { headRoot: root }).findings.map(item => item.id)).toEqual(result.findings.map(item => item.id))
  put(root, 'api.ts', 'export function removed(): void {}\nexport function changed(value: number): void {}\n')
  const altered = diffSnapshots(base, discoverRepository({ root }), { headRoot: root })
  expect(altered.findings.find(item => item.message.includes('changed, whose'))?.id).not.toBe(result.findings.find(item => item.message.includes('changed, whose'))?.id)
})

it('policy defaults include same-repository removals and summarize historical, generated and version exclusions', () => {
  const root = fixture()
  const citation = '# Guide\n\nCall `removed`.\n'
  for (const path of ['docs/guide.md', 'docs/adr/decision.md', 'CHANGELOG.md', 'docs/generated.md']) put(root, path, citation)
  put(root, 'docs/archived.md', '---\nlifecycle: archived\n---\n' + citation)
  put(root, 'docs/migration.md', '# Migration\n\nPreviously call `removed`.\n')
  put(root, 'docs/consumer.md', '---\ndocbridge:\n  targets:\n    "pkg:npm/other": ">=2.0.0"\n---\n' + citation)
  const base = discoverRepository({ root })
  put(root, 'api.ts', 'export function changed(value: string): void {}\n')
  put(root, 'docs/generated.md', '# Guide\n\n<!-- doc-bridge:generated -->\nCall `removed`.\n<!-- /doc-bridge:generated -->\n')
  const head = discoverRepository({ root })
  const result = diffSnapshots(base, head, { headRoot: root })
  expect(result.findings).toHaveLength(2)
  expect(result.findings.every(item => item.code === 'BROKEN_REFERENCE' && item.status === 'conflict')).toBe(true)
  expect(result.policy.counts).toEqual({ proposed: 1, excluded: 4, 'routed-to-L2': 1, 'pending-version': 1, generator: 1 })
  expect(result.policy.findings.find(item => item.assertion.document === 'docs/guide.md')).toMatchObject({ routing: 'proposed' })
  expect(result.policy.findings.find(item => item.assertion.document === 'docs/generated.md')).toMatchObject({ routing: 'excluded', generator: 'ak-docs render' })
  expect(result.policy.findings.find(item => item.assertion.document === 'docs/consumer.md')).toMatchObject({ routing: 'pending-version' })
  const missingTarget = structuredClone(head)
  delete missingTarget.entities.find(item => item.path === 'docs/consumer.md')!.metadata!.targets
  expect(diffSnapshots(base, missingTarget, { headRoot: root }).policy.findings.find(item => item.assertion.document === 'docs/consumer.md')).toMatchObject({ routing: 'pending-version' })
  const raw = diffSnapshots(base, head, { headRoot: root, policy: false })
  expect(raw.findings).toHaveLength(7)
  expect(raw.policy.enabled).toBe(false)
  expect(new Set(result.policy.findings.map(item => item.id))).toEqual(new Set(raw.findings.map(item => item.id)))
})


it('built CLI routes by default and restores raw output for snapshot and reader modes', async () => {
  const root = fixture()
  put(root, 'docs/adr/decision.md', '# Decision\n\nCall `removed`.\n')
  const base = discoverRepository({ root })
  put(root, 'api.ts', 'export function changed(value: string): void {}\n')
  const head = discoverRepository({ root })
  const artifacts = mkdtempSync(join(tmpdir(), 'doc-bridge-policy-cli-')); roots.push(artifacts)
  const basePath = join(artifacts, 'base.json'), headPath = join(artifacts, 'head.json')
  writeFileSync(basePath, JSON.stringify(base)); writeFileSync(headPath, JSON.stringify(head))
  for (const readerArgs of [[], ['--root', root], ['--root', root, '--progress']]) {
    const args = [resolve('bin/ak-docs.js'), 'diff', '--base', basePath, '--head', headPath, ...readerArgs]
    const filtered = await runCommand(process.execPath, args, { cwd: root, timeoutMs: 15000 })
    expect(filtered.code).toBe(0)
    expect(JSON.parse(filtered.stdout).findings).toEqual([])
    expect(JSON.parse(filtered.stdout).policy.counts.excluded).toBe(1)
    const raw = await runCommand(process.execPath, [...args, '--no-policy'], { cwd: root, timeoutMs: 15000 })
    expect(raw.code).toBe(0)
    expect(JSON.parse(raw.stdout).findings).toHaveLength(1)
    expect(JSON.parse(raw.stdout).policy.enabled).toBe(false)
  }
}, 30_000)


it('resolved dependency targets remain consumer targets even when both packages belong to this repository', () => {
  const root = fixture()
  put(root, 'package.json', JSON.stringify({ name: 'doc-bridge-fixture', version: '1.0.0', workspaces: ['packages/*'], dependencies: { 'doc-bridge-other': '^2.0.0' } }))
  put(root, 'packages/other/package.json', JSON.stringify({ name: 'doc-bridge-other', version: '2.0.0' }))
  put(root, 'docs/consumer.md', '---\ndocbridge:\n  targets:\n    "pkg:npm/doc-bridge-other": null\n---\n# Consumer\n\nCall `removed`.\n')
  const base = discoverRepository({ root })
  put(root, 'api.ts', 'export function changed(value: string): void {}\n')
  const head = discoverRepository({ root })
  const doc = head.entities.find(item => item.path === 'docs/consumer.md')!
  expect(doc.metadata?.targets).toContainEqual(expect.objectContaining({ purl: 'pkg:npm/doc-bridge-other', source: 'manifest', state: 'resolved' }))
  const result = diffSnapshots(base, head, { headRoot: root })
  expect(result.changeSet.packages.some(item => item.purl === 'pkg:npm/doc-bridge-other')).toBe(true)
  expect(result.findings).toEqual([])
  expect(result.policy.findings).toMatchObject([{ status: 'conflict', routing: 'pending-version' }])
})
