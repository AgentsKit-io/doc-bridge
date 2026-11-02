import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { reviewRevision } from '../examples/service-embed/review-revision.js'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
const repo = (api: string) => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-service-embed-')); roots.push(root)
  mkdirSync(join(root, 'src')); mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'src/api.ts'), api)
  writeFileSync(join(root, 'docs/guide.md'), '# Guide\n\nCall `sendEmail` from `src/api.ts`.\n')
  return root
}
const base = () => repo('export function sendEmail(): void {}\n')
const head = () => repo('export function sendMail(): void {}\n')

it('shows the example in the guide verbatim', () => {
  const guide = readFileSync('docs/guides/embed-layer1-in-a-service.md', 'utf8')
  const source = readFileSync('examples/service-embed/review-revision.ts', 'utf8').replace("'../../src/index.js'", "'@agentskit/doc-bridge'")
  expect(guide).toContain('```ts\n' + source + '```')
})

it('reads the ChangeSetV1 under the service profile', async () => {
  const review = await reviewRevision(base(), head(), new AbortController().signal)
  expect(review.status).toBe('complete')
  expect(review.changes).toBeGreaterThan(0)
  expect(review.findings.map(finding => finding.code)).toEqual(['BROKEN_REFERENCE'])
})

it('reports partial coverage when a limit is hit, instead of a clean result', async () => {
  const review = await reviewRevision(base(), head(), new AbortController().signal, 2)
  expect(review.status).toBe('partial')
  expect(review.notAnalyzed.some(entry => entry.scope.includes('limits:'))).toBe(true)
})

it('reports cancellation and surfaces errors', async () => {
  const controller = new AbortController(); controller.abort()
  expect((await reviewRevision(base(), head(), controller.signal)).status).toBe('cancelled')
  await expect(reviewRevision('/nonexistent-doc-bridge-root', head(), new AbortController().signal)).rejects.toThrow('layer-1 review failed')
})
