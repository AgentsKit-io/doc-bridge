import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { diffSnapshots } from '../src/diff/change-set.js'
import { discoverRepository } from '../src/discovery/repository.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const write = (root: string, path: string, text: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }

// Base and head are built from scratch in a fresh temp directory on every call.
const changeSetHash = () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-determinism-'))
  roots.push(root)
  write(root, 'package.json', '{"name":"fixture","version":"1.0.0","packageManager":"pnpm@10.0.0"}')
  write(root, 'src/api.ts', 'export const first = 1\nexport const second = 2\n')
  write(root, 'docs/api.md', '# API\n\nUse `first` and `second` in `src/api.ts`.\n')
  const base = discoverRepository({ root })
  write(root, 'src/api.ts', 'export const second = 2\n')
  const { changeSet } = diffSnapshots(base, discoverRepository({ root }), { headRoot: root })
  return changeSet.contentHash
}

// Pinned value: the same hash must come out on Linux and macOS (CI runs this file on both).
const GOLDEN = '006002a453eb20154cbf1279f2e2101c029d4d8215f08b00ea682d87bfcb3308'

describe('ChangeSetV1 deterministic contentHash (RF-05)', () => {
  it('is identical across two runs on different roots and matches the pinned cross-platform value', () => {
    const first = changeSetHash()
    expect(changeSetHash()).toBe(first)
    expect(first).toBe(GOLDEN)
  })
})
