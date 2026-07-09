import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { MemoryPromotionDraft } from './pipeline.js'

export type GithubPrOptions = {
  readonly dryRun?: boolean
  readonly force?: boolean
  readonly branch?: string
  readonly base?: string
}

export type GithubPrResult = {
  readonly ok: boolean
  readonly dryRun: boolean
  readonly draftPath: string
  readonly branch: string
  readonly prUrl?: string
  readonly previewUrl?: string
  readonly commands: readonly string[]
  readonly message: string
}

const run = (cmd: string, args: readonly string[], cwd: string): { ok: boolean; out: string } => {
  const result = spawnSync(cmd, [...args], { cwd, encoding: 'utf8' })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return { ok: result.status === 0, out }
}

const hasGh = (): boolean => run('gh', ['--version'], process.cwd()).ok

const slug = (): string => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

export const defaultPromotionDraftPath = (root: string): string =>
  join(root, '.doc-bridge', 'drafts', `memory-promotion-${slug()}.md`)

export const writePromotionDraft = (root: string, draft: MemoryPromotionDraft, path?: string): string => {
  const draftPath = path ?? defaultPromotionDraftPath(root)
  mkdirSync(join(root, '.doc-bridge', 'drafts'), { recursive: true })
  writeFileSync(draftPath, `${draft.body}\n`, 'utf8')
  return draftPath
}

export const promoteMemoryToGithubPr = (
  root: string,
  draft: MemoryPromotionDraft,
  options: GithubPrOptions = {},
): GithubPrResult => {
  if (!draft.ok && !options.force) {
    return {
      ok: false,
      dryRun: Boolean(options.dryRun),
      draftPath: '',
      branch: '',
      commands: [],
      message: 'Safety scan blocked promotion. Fix findings or pass --force to draft anyway.',
    }
  }

  const branch = options.branch ?? `doc-bridge/memory-promotion-${slug()}`
  const draftPath = writePromotionDraft(root, draft)
  const relDraft = draftPath.startsWith(`${root}/`) ? draftPath.slice(root.length + 1) : draftPath

  const commands = [
    `git checkout -b ${branch}`,
    `git add ${relDraft}`,
    `git commit -m "draft: doc-bridge memory promotion"`,
    `git push -u origin ${branch}`,
    `gh pr create --draft --title "${draft.title}" --body-file ${relDraft}${options.base ? ` --base ${options.base}` : ''}`,
  ]

  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true,
      draftPath,
      branch,
      commands,
      message: `Wrote draft to ${relDraft}. Run the printed git/gh commands to open a draft PR.`,
    }
  }

  if (!existsSync(join(root, '.git'))) {
    return {
      ok: false,
      dryRun: false,
      draftPath,
      branch,
      commands,
      message: 'Not a git repository. Commit the draft manually or run with --dry-run.',
    }
  }

  if (!hasGh()) {
    return {
      ok: false,
      dryRun: false,
      draftPath,
      branch,
      commands,
      message: 'GitHub CLI (gh) not found. Install gh or use --dry-run for local draft + commands.',
    }
  }

  const auth = run('gh', ['auth', 'status'], root)
  if (!auth.ok) {
    return {
      ok: false,
      dryRun: false,
      draftPath,
      branch,
      commands,
      message: `gh is not authenticated. Run: gh auth login\n${auth.out}`,
    }
  }

  const checkout = run('git', ['checkout', '-b', branch], root)
  if (!checkout.ok) {
    return {
      ok: false,
      dryRun: false,
      draftPath,
      branch,
      commands,
      message: `git checkout failed: ${checkout.out}`,
    }
  }

  run('git', ['add', relDraft], root)
  const commit = run('git', ['commit', '-m', 'draft: doc-bridge memory promotion'], root)
  if (!commit.ok) {
    return {
      ok: false,
      dryRun: false,
      draftPath,
      branch,
      commands,
      message: `git commit failed: ${commit.out}`,
    }
  }

  const push = run('git', ['push', '-u', 'origin', branch], root)
  if (!push.ok) {
    return {
      ok: false,
      dryRun: false,
      draftPath,
      branch,
      commands,
      message: `git push failed: ${push.out}`,
    }
  }

  const prArgs = [
    'pr',
    'create',
    '--draft',
    '--title',
    draft.title,
    '--body-file',
    relDraft,
    ...(options.base ? ['--base', options.base] : []),
  ]
  let prUrl = ''
  try {
    prUrl = execFileSync('gh', prArgs, { cwd: root, encoding: 'utf8' }).trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      dryRun: false,
      draftPath,
      branch,
      commands,
      message: `gh pr create failed: ${message}`,
    }
  }

  return {
    ok: true,
    dryRun: false,
    draftPath,
    branch,
    prUrl,
    ...(prUrl ? { previewUrl: prUrl } : {}),
    commands,
    message: prUrl ? `Draft PR opened: ${prUrl}` : 'Draft PR created.',
  }
}