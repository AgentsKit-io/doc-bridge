import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'
import { formatDoctorBadgeMarkdown, formatDoctorBadgeJson } from '../src/doctor/badge.js'
import { runDoctor } from '../src/doctor/run-doctor.js'
import { loadConfig } from '../src/config/load-config.js'
import { loadDocBridgeIndex } from '../src/query/load-index.js'
import { parseDocBridgeConfig } from '../src/validate.js'
import {
  promoteMemoryToGithubPr,
  writePromotionDraft,
} from '../src/memory/github-pr.js'
import { classifyMemoryCandidates, draftMemoryPromotion } from '../src/memory/pipeline.js'
import type { MemoryCandidateV1 } from '../src/schemas/memory-candidate.js'

const fixtureRoot = join(import.meta.dirname, 'fixtures', 'sample-project')

const captureStdout = (fn: () => number | undefined | Promise<number | undefined>) => {
  const write = process.stdout.write
  let out = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk)
    return true
  }) as typeof process.stdout.write
  try {
    return { code: fn(), out }
  } finally {
    process.stdout.write = write
  }
}

describe('Tier B — memory promote PR', () => {
  it('writes draft and returns dry-run gh commands', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-memory-pr-'))
    const { config } = loadConfig({ cwd: fixtureRoot })
    parseDocBridgeConfig(config)
    const index = loadDocBridgeIndex(fixtureRoot, config)
    const draft = draftMemoryPromotion(
      classifyMemoryCandidates(
        [
          {
            schemaVersion: 1,
            id: 'note',
            source: 'manual',
            fact: 'package os-core owns schema contracts',
            suggestedType: 'project',
            confidence: 0.9,
            references: [],
          } satisfies MemoryCandidateV1,
        ],
        index,
      ),
    )
    const pr = promoteMemoryToGithubPr(root, draft, { dryRun: true })
    expect(pr.ok).toBe(true)
    expect(pr.dryRun).toBe(true)
    expect(existsSync(pr.draftPath)).toBe(true)
    expect(pr.commands.join('\n')).toContain('gh pr create --draft')
    expect(readFileSync(pr.draftPath, 'utf8')).toContain('Draft doc-bridge memory promotion')
  })

  it('blocks unsafe promotion unless --force', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-memory-block-'))
    const draft = draftMemoryPromotion([
      {
        candidate: {
          schemaVersion: 1,
          id: 'secret',
          source: 'manual',
          fact: 'api_key=supersecret',
          suggestedType: 'project',
          confidence: 0.5,
          references: [],
        },
        route: 'agent',
        reason: 'test',
      },
    ])
    const pr = promoteMemoryToGithubPr(root, draft)
    expect(pr.ok).toBe(false)
    expect(writePromotionDraft(root, draft)).toMatch(/\.doc-bridge\/drafts\//)
  })
})

describe('Tier B — doctor badge', () => {
  it('computes handoff and bridge percentages', () => {
    const { config } = loadConfig({ cwd: fixtureRoot })
    parseDocBridgeConfig(config)
    const report = runDoctor(fixtureRoot, config)
    expect(report.badge.handoffPct).toBeGreaterThanOrEqual(0)
    expect(report.badge.bridgePct).toBeGreaterThanOrEqual(0)
    expect(formatDoctorBadgeMarkdown(report.badge)).toContain('handoff_coverage')
    expect(JSON.parse(formatDoctorBadgeJson(report.badge))).toMatchObject({
      handoffPct: report.badge.handoffPct,
      markdown: expect.stringContaining('shields.io'),
    })
  })

  it('prints badge from CLI', () => {
    const originalCwd = process.cwd()
    try {
      process.chdir(fixtureRoot)
      const result = captureStdout(() => runCli(['doctor', '--badge']))
      expect(result.code).toBe(0)
      expect(result.out).toContain('handoff_coverage')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('writes coverage badge file with --write-badge', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-badge-'))
    try {
      const { config } = loadConfig({ cwd: fixtureRoot })
      parseDocBridgeConfig(config)
      const originalCwd = process.cwd()
      process.chdir(fixtureRoot)
      try {
        expect(runCli(['doctor', '--write-badge'])).toBe(0)
        const badgePath = join(fixtureRoot, '.doc-bridge', 'coverage-badge.json')
        expect(existsSync(badgePath)).toBe(true)
        const badge = JSON.parse(readFileSync(badgePath, 'utf8')) as { handoffPct: number }
        expect(typeof badge.handoffPct).toBe('number')
      } finally {
        process.chdir(originalCwd)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('Tier B — memory promote CLI', () => {
  it('prints dry-run PR plan from CLI', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-cli-memory-pr-'))
    try {
      process.chdir(root)
      writeFileSync(
        join(root, 'doc-bridge.config.json'),
        JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs/for-agents' } } }),
      )
      mkdirSync(join(root, 'docs/for-agents'), { recursive: true })
      mkdirSync(join(root, '.agent-memory'), { recursive: true })
      writeFileSync(join(root, 'docs/for-agents/INDEX.md'), '# Index\n')
      writeFileSync(join(root, '.agent-memory/note.md'), '# Note\n\npackage auth owns sessions.\n')
      expect(runCli(['index'])).toBe(0)

      const result = captureStdout(() => runCli(['memory', 'promote', '--pr', '--dry-run', '--text']))
      expect(result.code).toBe(0)
      expect(result.out).toContain('gh pr create --draft')
    } finally {
      process.chdir(fixtureRoot)
      rmSync(root, { recursive: true, force: true })
    }
  })
})