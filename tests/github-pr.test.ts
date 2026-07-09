import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const childProcess = vi.hoisted(() => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: 'ok\n', stderr: '' })),
  execFileSync: vi.fn(() => 'https://github.com/acme/repo/pull/1\n'),
}))

vi.mock('node:child_process', () => childProcess)

const { promoteMemoryToGithubPr } = await import('../src/memory/github-pr.js')

const draft = {
  ok: true,
  title: 'Promote memory',
  body: '# Promote memory\n\nUseful project fact.',
  findings: [],
} as const

describe('github PR memory promotion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    childProcess.spawnSync.mockReturnValue({ status: 0, stdout: 'ok\n', stderr: '' })
    childProcess.execFileSync.mockReturnValue('https://github.com/acme/repo/pull/1\n')
  })

  it('returns manual guidance outside git repositories', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-gh-no-git-'))

    const result = promoteMemoryToGithubPr(root, draft)

    expect(result.ok).toBe(false)
    expect(result.message).toContain('Not a git repository')
    expect(result.commands).toContain('git push -u origin ' + result.branch)
  })

  it('opens a draft PR when git and gh commands succeed', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-gh-success-'))
    mkdirSync(join(root, '.git'))

    const result = promoteMemoryToGithubPr(root, draft, { branch: 'doc-bridge/test', base: 'main' })

    expect(result).toMatchObject({
      ok: true,
      dryRun: false,
      branch: 'doc-bridge/test',
      prUrl: 'https://github.com/acme/repo/pull/1',
      previewUrl: 'https://github.com/acme/repo/pull/1',
    })
    expect(childProcess.spawnSync).toHaveBeenCalledWith('git', ['push', '-u', 'origin', 'doc-bridge/test'], expect.any(Object))
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--base', 'main']),
      expect.objectContaining({ cwd: root, encoding: 'utf8' }),
    )
  })

  it('reports gh auth and git operation failures clearly', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-gh-fail-'))
    mkdirSync(join(root, '.git'))

    childProcess.spawnSync.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === 'gh' && args[0] === 'auth') return { status: 1, stdout: '', stderr: 'not logged in' }
      return { status: 0, stdout: 'ok', stderr: '' }
    })
    expect(promoteMemoryToGithubPr(root, draft).message).toContain('gh is not authenticated')

    childProcess.spawnSync.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === 'git' && args[0] === 'checkout') return { status: 1, stdout: '', stderr: 'branch exists' }
      return { status: 0, stdout: 'ok', stderr: '' }
    })
    expect(promoteMemoryToGithubPr(root, draft).message).toContain('git checkout failed')

    childProcess.spawnSync.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === 'git' && args[0] === 'commit') return { status: 1, stdout: '', stderr: 'nothing to commit' }
      return { status: 0, stdout: 'ok', stderr: '' }
    })
    expect(promoteMemoryToGithubPr(root, draft).message).toContain('git commit failed')

    childProcess.spawnSync.mockImplementation((cmd: string, args: readonly string[]) => {
      if (cmd === 'git' && args[0] === 'push') return { status: 1, stdout: '', stderr: 'rejected' }
      return { status: 0, stdout: 'ok', stderr: '' }
    })
    expect(promoteMemoryToGithubPr(root, draft).message).toContain('git push failed')
  })

  it('reports gh pr create failures after push succeeds', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-gh-pr-fail-'))
    mkdirSync(join(root, '.git'))
    childProcess.execFileSync.mockImplementation(() => {
      throw new Error('network failed')
    })

    const result = promoteMemoryToGithubPr(root, draft)

    expect(result.ok).toBe(false)
    expect(result.message).toContain('gh pr create failed')
  })
})
