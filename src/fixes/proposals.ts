import { existsSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'

import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { FixProposalV1Schema, type FixProposalV1 } from '../schemas/knowledge.js'
import { containedPath } from '../safety/repository.js'

export type FixProposalOptions = {
  readonly baseRevision: string
  readonly configurationHash: string
  readonly projectName?: string
  readonly toolVersion?: string
}

export type FixApplyOptions = {
  readonly currentRevision?: string
  readonly verify?: (changedPaths: readonly string[]) => void
}

type FixChange = { readonly path: string; readonly before: string; readonly after: string }

const hash = (value: unknown): string => sha256NormalizedV1(value)

const artifactMetadata = (root: string, options: FixProposalOptions) => ({
  schemaVersion: 1 as const,
  contentHash: '0'.repeat(64),
  contentHashAlgo: 'sha256-normalized-v1' as const,
  project: { name: options.projectName ?? basename(resolve(root)), root: '.' },
  sourceRevision: options.baseRevision,
  sourceRevisionKind: options.baseRevision.length === 40 ? 'git' as const : 'content' as const,
  configurationHash: options.configurationHash,
  pipelineVersion: '1.0.0',
  analyzerVersions: { fixes: options.toolVersion ?? '1.0.0' },
})

const unifiedDiff = (changes: readonly FixChange[]): string => changes.map((change) => {
  const before = change.before.split('\n').map((line) => `-${line}`).join('\n')
  const after = change.after.split('\n').map((line) => `+${line}`).join('\n')
  return `--- a/${change.path}\n+++ b/${change.path}\n@@\n${before}\n${after}`
}).join('\n')

const makeProposal = (root: string, options: FixProposalOptions, changes: readonly FixChange[], preconditions: readonly string[], postconditions: readonly string[]): FixProposalV1 => {
  const draft = {
    ...artifactMetadata(root, options),
    type: 'fix-proposal' as const,
    proposalId: `fix-${hash(changes).slice(0, 20)}`,
    baseRevision: options.baseRevision,
    affectedFiles: changes.map(({ path, before }) => ({ path, contentHash: sha256NormalizedV1(before) })),
    changes,
    preconditions,
    diff: unifiedDiff(changes),
    postconditions,
    status: 'proposed' as const,
  }
  return FixProposalV1Schema.parse({ ...draft, contentHash: contentHashForArtifactV1(draft) })
}

const walkMarkdown = (root: string, directory = root): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') return []
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return walkMarkdown(root, path)
  return entry.isFile() && ['.md', '.mdx'].includes(extname(entry.name).toLowerCase()) ? [relative(root, path).split(sep).join('/')] : []
})

const localLink = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g

const sortJson = (value: unknown): unknown => Array.isArray(value)
  ? value.map(sortJson)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortJson(item)]))
    : value

export const createMarkdownLinkFixProposal = (root: string, options: FixProposalOptions): FixProposalV1 | undefined => {
  const projectRoot = realpathSync.native(resolve(root))
  const paths = walkMarkdown(projectRoot)
  const changes: FixChange[] = []
  for (const path of paths) {
    const content = readFileSync(join(projectRoot, path), 'utf8')
    let next = content
    for (const match of content.matchAll(localLink)) {
      const target = match[3]
      if (!target || match[1] === '!' || /^(?:[a-z]+:|\/|#)/i.test(target)) continue
      const targetPath = target.split('#')[0]?.split('?')[0]
      if (!targetPath || existsSync(resolve(projectRoot, dirname(path), targetPath))) continue
      const targetStem = basename(targetPath, extname(targetPath)).toLowerCase()
      const labelStem = (match[2] ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
      const candidates = paths.filter((candidate) => basename(candidate, extname(candidate)).toLowerCase() === targetStem || basename(candidate, extname(candidate)).toLowerCase().replace(/[^a-z0-9]+/g, '') === labelStem)
      if (candidates.length !== 1) continue
      let replacement = relative(dirname(path), candidates[0]!).split(sep).join('/')
      if (target.startsWith('./') && !replacement.startsWith('.')) replacement = `./${replacement}`
      next = next.replace(match[0], match[0].replace(target, replacement))
    }
    if (next !== content) changes.push({ path, before: content, after: next })
  }
  return changes.length ? makeProposal(projectRoot, options, changes, ['Each replacement has exactly one Markdown target.'], ['All corrected local Markdown links resolve.']) : undefined
}

export const createArtifactNormalizationProposal = (root: string, artifactPath: string, options: FixProposalOptions): FixProposalV1 | undefined => {
  const projectRoot = realpathSync.native(resolve(root))
  const path = artifactPath.split(sep).join('/')
  const absolute = containedPath(projectRoot, path)
  if (!absolute || !existsSync(absolute) || !statSync(absolute).isFile()) return undefined
  const before = readFileSync(absolute, 'utf8')
  let after: string
  try { after = `${JSON.stringify(sortJson(JSON.parse(before) as unknown), null, 2)}\n` } catch { return undefined }
  return after === before ? undefined : makeProposal(projectRoot, options, [{ path: relative(projectRoot, absolute).split(sep).join('/'), before, after }], ['The artifact contains valid JSON.'], ['The artifact is valid canonical JSON with one trailing newline.'])
}

export const approveFixProposal = (proposalInput: unknown, approvedBy: string, approvedAt = new Date().toISOString()): FixProposalV1 => {
  const proposal = FixProposalV1Schema.parse(proposalInput)
  if (proposal.status !== 'proposed') throw new Error(`Only proposed fixes can be approved; received "${proposal.status}".`)
  const approved = { ...proposal, status: 'approved' as const, approval: { proposalHash: proposal.contentHash, approvedAt, approvedBy }, contentHash: '0'.repeat(64) }
  return FixProposalV1Schema.parse({ ...approved, contentHash: contentHashForArtifactV1(approved) })
}

const bindingHash = (proposal: FixProposalV1): string => {
  const { approval: _approval, contentHash: _contentHash, status: _status, ...rest } = proposal
  return contentHashForArtifactV1({ ...rest, contentHash: '0'.repeat(64), status: 'proposed' as const })
}

export const applyFixProposal = (root: string, proposalInput: unknown, options: FixApplyOptions = {}): FixProposalV1 => {
  const proposal = FixProposalV1Schema.parse(proposalInput)
  if (proposal.status !== 'approved' || !proposal.approval) throw new Error('Only an explicitly approved fix proposal can be applied.')
  if (proposal.approval.proposalHash !== bindingHash(proposal)) throw new Error('Approval is not bound to the exact proposal content.')
  if (options.currentRevision && options.currentRevision !== proposal.baseRevision) throw new Error('The repository revision changed since this proposal was created.')
  if (!proposal.changes?.length) throw new Error('This proposal has no executable changes.')

  const projectRoot = realpathSync.native(resolve(root))
  const originals = new Map<string, string>()
  const affected = new Map(proposal.affectedFiles.map((file) => [file.path, file]))
  if (proposal.changes.some((change) => !affected.has(change.path) || affected.get(change.path)?.contentHash !== sha256NormalizedV1(change.before)) || affected.size !== proposal.changes.length) {
    throw new Error('Proposal changes do not match its affected-file hashes.')
  }
  for (const file of proposal.affectedFiles) {
    const absolute = containedPath(projectRoot, file.path)
    if (!absolute || !existsSync(absolute)) throw new Error(`Affected file is unavailable or escapes the repository root: ${file.path}`)
    const current = readFileSync(absolute, 'utf8')
    if (sha256NormalizedV1(current) !== file.contentHash) throw new Error(`Affected file changed since proposal creation: ${file.path}`)
    originals.set(absolute, current)
  }

  try {
    for (const change of proposal.changes) {
      const absolute = resolve(projectRoot, change.path)
      writeFileSync(`${absolute}.docbridge-${process.pid}.tmp`, change.after, 'utf8')
    }
    for (const change of proposal.changes) {
      const absolute = resolve(projectRoot, change.path)
      renameSync(`${absolute}.docbridge-${process.pid}.tmp`, absolute)
    }
    for (const change of proposal.changes) {
      if (readFileSync(resolve(projectRoot, change.path), 'utf8') !== change.after) throw new Error(`Postcondition failed for ${change.path}`)
    }
    options.verify?.(proposal.changes.map((change) => change.path))
  } catch (error) {
    for (const [absolute, content] of originals) writeFileSync(absolute, content, 'utf8')
    for (const change of proposal.changes) {
      const temp = `${resolve(projectRoot, change.path)}.docbridge-${process.pid}.tmp`
      if (existsSync(temp)) unlinkSync(temp)
    }
    throw error
  }
  const applied = { ...proposal, status: 'applied' as const, contentHash: '0'.repeat(64) }
  return FixProposalV1Schema.parse({ ...applied, contentHash: contentHashForArtifactV1(applied) })
}
