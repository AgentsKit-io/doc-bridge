import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { containedPath, redactSecrets, safeWalkFiles } from '../src/safety/repository.js'

const root = () => mkdtempSync(join(tmpdir(), 'doc-bridge-safety-'))

describe('repository safety primitives', () => {
  it('enforces the root boundary and skips secret/generated paths by default', () => {
    const project = root()
    mkdirSync(join(project, 'src'))
    mkdirSync(join(project, 'dist'))
    writeFileSync(join(project, 'src', 'ok.ts'), 'export {}')
    writeFileSync(join(project, 'dist', 'generated.ts'), 'export {}')
    writeFileSync(join(project, '.env'), 'TOKEN=hidden')
    expect(containedPath(project, 'src/ok.ts')).toBe(join(realpathSync.native(project), 'src', 'ok.ts'))
    expect(containedPath(project, '../outside.ts')).toBeUndefined()
    expect(safeWalkFiles(project, { extensions: ['.ts'] }).files).toEqual([join(project, 'src', 'ok.ts')])
  })

  it('skips symlinks and reports explicit resource limits as incomplete', () => {
    const project = root()
    writeFileSync(join(project, 'a.ts'), 'a')
    writeFileSync(join(project, 'b.ts'), 'b')
    symlinkSync(join(project, 'a.ts'), join(project, 'link.ts'))
    const result = safeWalkFiles(project, { extensions: ['.ts'], maxFiles: 1 })
    expect(result.files).toHaveLength(1)
    expect(result.incomplete).toBe(true)
    expect(result.reason).toContain('file limit')
    expect(safeWalkFiles(project, { extensions: ['.ts'] }).files.join('\n')).not.toContain('link.ts')
  })

  it('redacts common secret-shaped values for persisted and agent-facing context', () => {
    expect(redactSecrets('token=abc123 password: super-secret sk-live_123456789012')).toBe('[REDACTED] [REDACTED] [REDACTED]')
  })
})
