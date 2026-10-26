import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { generateLargeFixture } from '../scripts/generate-large-fixture.mjs'

const dirs: string[] = []
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'large-fixture-guard-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('generateLargeFixture destructive-delete guard', () => {
  it('generates into an empty directory and a missing one', () => {
    const empty = temp()
    generateLargeFixture(empty, 1, 1)
    expect(existsSync(join(empty, 'package.json'))).toBe(true)
    const missing = join(temp(), 'nested', 'out')
    generateLargeFixture(missing, 1, 1)
    expect(existsSync(join(missing, 'package.json'))).toBe(true)
  })

  it('regenerates over a previous fixture, dropping stale files', () => {
    const root = temp()
    generateLargeFixture(root, 2, 1)
    writeFileSync(join(root, 'stale.txt'), 'old')
    generateLargeFixture(root, 1, 1)
    expect(existsSync(join(root, 'stale.txt'))).toBe(false)
    expect(existsSync(join(root, 'packages', 'pkg-0001'))).toBe(false)
  })

  it('refuses a non-empty directory that is not a fixture and leaves it intact', () => {
    const root = temp()
    mkdirSync(join(root, 'keep'))
    writeFileSync(join(root, 'keep', 'precious.txt'), 'data')
    expect(() => generateLargeFixture(root, 1, 1)).toThrow(/refusing to replace/)
    expect(readFileSync(join(root, 'keep', 'precious.txt'), 'utf8')).toBe('data')
  })
})
