import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error The generator is a plain ES module under scripts/.
import { generateLargeFixture } from '../scripts/generate-large-fixture.mjs'

const temporary: string[] = []
afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const scratch = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-fixture-guard-'))
  temporary.push(directory)
  return directory
}

describe('generateLargeFixture output guard', () => {
  it('refuses a non-empty directory that is not a generated fixture and leaves it intact', () => {
    const root = scratch()
    writeFileSync(join(root, 'keep.txt'), 'precious')
    mkdirSync(join(root, 'nested'))
    writeFileSync(join(root, 'nested', 'also.txt'), 'precious')
    expect(() => generateLargeFixture(root, 1, 1)).toThrow(/refusing to delete/)
    expect(existsSync(join(root, 'keep.txt'))).toBe(true)
    expect(existsSync(join(root, 'nested', 'also.txt'))).toBe(true)
  })

  it('refuses a directory whose package.json is not the fixture marker', () => {
    const root = scratch()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'something-else' }))
    expect(() => generateLargeFixture(root, 1, 1)).toThrow(/refusing to delete/)
    expect(existsSync(join(root, 'package.json'))).toBe(true)
  })

  it('generates into an empty or missing directory', () => {
    const empty = scratch()
    generateLargeFixture(empty, 1, 1)
    expect(existsSync(join(empty, 'package.json'))).toBe(true)
    const missing = join(scratch(), 'out')
    generateLargeFixture(missing, 1, 1)
    expect(existsSync(join(missing, 'package.json'))).toBe(true)
  })

  it('regenerates a previously generated fixture, dropping stale files', () => {
    const root = scratch()
    generateLargeFixture(root, 2, 1)
    expect(existsSync(join(root, 'packages', 'pkg-0001'))).toBe(true)
    generateLargeFixture(root, 1, 1)
    expect(existsSync(join(root, 'packages', 'pkg-0000'))).toBe(true)
    expect(existsSync(join(root, 'packages', 'pkg-0001'))).toBe(false)
  })
})
