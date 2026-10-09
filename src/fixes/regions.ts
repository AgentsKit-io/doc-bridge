import { createHash } from 'node:crypto'
import { closeSync, fstatSync, openSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { denyServiceOperation } from '../execution/profile.js'
import { parseMarkdownDocument } from '../discovery/markdown.js'
import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { MAX_DOCUMENT_BYTES } from '../lib/bounded-text.js'
import { containedPath } from '../safety/repository.js'
import { RemediationV1Schema, type RegionEdit, type RemediationV1 } from '../schemas/findings.js'
import { exactLines, unifiedDiff } from './diff.js'
import { replaceFiles } from './write.js'

export const regionHash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex')
export type RemediationValidation = {
  currentRevision: string; configurationHash: string; evidenceHash: string; allowedRoots: readonly string[]
  /** Fresh evidence check supplied by the trusted caller, before region validation. */
  validateEvidence: (remediation: RemediationV1) => boolean
  protectedRegions?: readonly { path: string; range: { start: number; end: number } }[]
}
export type ReviewBoundary = { root: string; revision: string; defaultBranch: string; reviewBranch: string; humanApprovalOnly: true }
export type RemediationApplyOptions = RemediationValidation & {
  mode?: 'ordinary' | 'review-presentation'
  reviewBoundary?: ReviewBoundary
  attestIsolation?: (boundary: ReviewBoundary) => boolean
  verify: (changedPaths: readonly string[]) => void
}
const inside = (root: string, file: string) => { const path = relative(root, file); return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`) }
const intersects = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start === a.end ? a.start >= b.start && a.start <= b.end : b.start === b.end ? b.start >= a.start && b.start <= a.end : a.start < b.end && b.start < a.end
const canonicalPath = (root: string, path: string): string => {
  if (isAbsolute(path) || path.includes('\n') || path.includes('\r') || path.includes('\t') || path.includes('\\') || path.split('/').includes('..')) throw new Error('Invalid edit path')
  const absolute = containedPath(root, path)
  if (!absolute) throw new Error('Edit path escapes containment or is not a file')
  return absolute
}
const utf8Boundary = (bytes: Buffer, offset: number) => offset <= bytes.length && (offset === bytes.length || (bytes[offset]! & 0xc0) !== 0x80)
const locate = (bytes: Buffer, edit: RegionEdit): { start: number; end: number } => {
  const original = Buffer.from(edit.original)
  if (regionHash(original) !== edit.expectedRegionHash || edit.range.end - edit.range.start !== original.length) throw new Error('Invalid region hash or range binding')
  const matches = (range: { start: number; end: number }) => utf8Boundary(bytes, range.start) && utf8Boundary(bytes, range.end) && bytes.subarray(range.start, range.end).equals(original)
  if (matches(edit.range)) return edit.range
  const anchors = edit.anchors
  if (!anchors || (!anchors.before && !anchors.after)) throw new Error('Stale region: no bounded anchors')
  const before = Buffer.from(anchors.before), after = Buffer.from(anchors.after)
  const needle = Buffer.concat([before, original, after])
  const hits: number[] = []
  const limit = Math.min(bytes.length, anchors.search.end)
  for (let i = bytes.indexOf(needle, anchors.search.start); i >= 0 && i + needle.length <= limit; i = bytes.indexOf(needle, i + 1)) hits.push(i + before.length)
  if (hits.length !== 1) throw new Error('Stale region: bounded anchors have zero or multiple matches')
  const range = { start: hits[0]!, end: hits[0]! + original.length }
  if (!matches(range)) throw new Error('Stale region: invalid byte boundary')
  return range
}
const generatedRanges = (path: string, text: string) => {
  if (!/\.mdx?$/i.test(path)) return []
  const lines = exactLines(text), offsets = [0]
  for (const line of lines) offsets.push(offsets.at(-1)! + Buffer.byteLength(line + '\n'))
  return parseMarkdownDocument(path, text).generatedRegions.map(region => ({ start: offsets[region.lineStart - 1]!, end: Math.min(Buffer.byteLength(text), offsets[region.lineEnd]!) }))
}
/** Legacy whole-file fixes must also leave generated regions byte-identical. */
export const assertGeneratedContentPreserved = (path: string, before: string, after: string): void => {
  const blocks = (text: string) => generatedRanges(path, text).map(range => Buffer.from(text).subarray(range.start, range.end).toString('utf8'))
  if (JSON.stringify(blocks(before)) !== JSON.stringify(blocks(after))) throw new Error('Protected/generated region changed')
}
const validate = (root: string, remediation: RemediationV1, options: RemediationValidation) => {
  if (options.configurationHash !== remediation.configurationHash || options.evidenceHash !== remediation.evidenceHash || !options.validateEvidence(remediation)) throw new Error('Fresh evidence/configuration validation failed')
  const project = realpathSync.native(resolve(root))
  const roots = options.allowedRoots.map(path => { const contained = containedPath(project, path); if (!contained) throw new Error('Allowed root escapes containment'); return realpathSync.native(contained) })
  if (!roots.length) throw new Error('Caller must supply allowed roots')
  const files = new Map<string, { path: string; before: string; edits: { edit: RegionEdit; range: { start: number; end: number } }[] }>()
  for (const edit of remediation.edits) {
    const absolute = canonicalPath(project, edit.path)
    if (!roots.some(root => inside(root, absolute))) throw new Error('Edit outside caller allowed roots')
    let file = files.get(absolute)
    if (!file) {
      const fd = openSync(absolute, 'r')
      try {
        const stat = fstatSync(fd)
        if (!stat.isFile() || stat.size > MAX_DOCUMENT_BYTES) throw new Error('Edit target must be a bounded regular file')
        const bytes = readFileSync(fd), text = bytes.toString('utf8')
        if (!bytes.equals(Buffer.from(text))) throw new Error('Target is not valid UTF-8')
        file = { path: edit.path, before: text, edits: [] }; files.set(absolute, file)
      } finally { closeSync(fd) }
    }
    const range = locate(Buffer.from(file.before), edit)
    const protectedRanges = [...generatedRanges(edit.path, file.before), ...(options.protectedRegions ?? []).filter(region => canonicalPath(project, region.path) === absolute).map(region => region.range)]
    if (protectedRanges.some(protectedRange => intersects(range, protectedRange))) throw new Error('Protected/generated region intersection')
    if (file.edits.some(existing => intersects(range, existing.range))) throw new Error('Overlapping, nested, duplicate edits or ambiguous insertion')
    file.edits.push({ edit, range })
  }
  return [...files].map(([absolute, file]) => {
    let bytes = Buffer.from(file.before)
    for (const { edit, range } of file.edits.sort((a, b) => b.range.start - a.range.start)) bytes = Buffer.concat([bytes.subarray(0, range.start), Buffer.from(edit.replacement), bytes.subarray(range.end)])
    return { absolute, path: file.path, before: file.before, after: bytes.toString('utf8') }
  })
}
const artifactHash = (remediation: RemediationV1, diff: string) => sha256NormalizedV1({ findingId: remediation.findingId, evidenceHash: remediation.evidenceHash, edits: remediation.edits, diff })
export const remediationBindingHash = (remediation: RemediationV1) => sha256NormalizedV1({ id: remediation.id, findingId: remediation.findingId, evidenceHash: remediation.evidenceHash, edits: remediation.edits, baseRevision: remediation.baseRevision, configurationHash: remediation.configurationHash, binding: remediation.binding, revalidation: remediation.revalidation ?? null })
/** Revalidation/rebinding always clears prior approval and presentation. */
export const revalidateRemediation = (root: string, input: unknown, options: RemediationValidation): RemediationV1 => {
  const remediation = RemediationV1Schema.parse(input)
  if (!['proposed', 'in-review', 'stale'].includes(remediation.status)) throw new Error('Terminal remediation cannot be rebound')
  const changes = validate(root, remediation, options), diff = unifiedDiff(changes)
  const { approval: _approval, presentation: _presentation, ...rest } = remediation
  return RemediationV1Schema.parse({ ...rest, status: 'proposed', diff,
    binding: { revision: options.currentRevision, evidenceHash: options.evidenceHash, configurationHash: options.configurationHash, artifactHash: artifactHash(remediation, diff) },
    ...(options.currentRevision !== remediation.baseRevision ? { revalidation: { fromRevision: remediation.baseRevision, toRevision: options.currentRevision, evidenceHash: options.evidenceHash, configurationHash: options.configurationHash } } : {}),
  })
}
export const createRemediation = (root: string, input: Pick<RemediationV1, 'findingId' | 'evidenceHash' | 'baseRevision' | 'configurationHash' | 'edits'>, options: RemediationValidation): RemediationV1 => {
  const id = `remediation-${sha256NormalizedV1(input).slice(0, 32)}`
  return revalidateRemediation(root, { ...input, type: 'remediation', schemaVersion: 1, id, regionHashAlgo: 'sha256-bytes-v1', coordinates: 'utf8-byte-half-open-v1', diff: '', status: 'proposed', binding: { revision: input.baseRevision, evidenceHash: input.evidenceHash, configurationHash: input.configurationHash, artifactHash: '0'.repeat(64) } }, options)
}
export const approveRemediation = (input: unknown, by: string, authenticateHuman: (by: string) => boolean): RemediationV1 => {
  const remediation = RemediationV1Schema.parse(input)
  if (remediation.status !== 'proposed' && remediation.status !== 'in-review') throw new Error('Remediation is not reviewable')
  if (!by.trim() || by === 'policy' || !authenticateHuman(by)) throw new Error('Authenticated human approval required')
  return RemediationV1Schema.parse({ ...remediation, approval: { by, bindingHash: remediationBindingHash(remediation) } })
}
export const applyRemediation = (root: string, input: unknown, options: RemediationApplyOptions): RemediationV1 => {
  denyServiceOperation('applyFixProposal')
  const remediation = RemediationV1Schema.parse(input)
  if (!['proposed', 'in-review'].includes(remediation.status)) throw new Error('Remediation cannot be applied in this lifecycle state')
  const changes = validate(root, remediation, options)
  const diff = unifiedDiff(changes)
  if (remediation.binding.evidenceHash !== options.evidenceHash || remediation.binding.configurationHash !== options.configurationHash || options.currentRevision !== remediation.binding.revision || (options.currentRevision !== remediation.baseRevision && (remediation.revalidation?.toRevision !== options.currentRevision || remediation.revalidation.evidenceHash !== options.evidenceHash || remediation.revalidation.configurationHash !== options.configurationHash))) throw new Error('Revision changed: explicit revalidation/rebinding required')
  if (diff !== remediation.diff || artifactHash(remediation, diff) !== remediation.binding.artifactHash) throw new Error('Review artifact changed: revalidation/rebinding required')
  const presentation = options.mode === 'review-presentation'
  if (presentation) {
    const boundary = options.reviewBoundary
    if (!boundary || realpathSync.native(boundary.root) !== realpathSync.native(root) || boundary.revision !== options.currentRevision || boundary.defaultBranch === boundary.reviewBranch || !boundary.humanApprovalOnly || !options.attestIsolation?.(boundary)) throw new Error('Review isolation boundary denied')
  } else if (!remediation.approval || remediation.approval.bindingHash !== remediationBindingHash(remediation)) throw new Error('Exact human approval required')
  if (typeof options.verify !== 'function') throw new Error('Post-apply verification required')
  replaceFiles(changes, () => options.verify(changes.map(change => change.path)))
  return RemediationV1Schema.parse({ ...remediation, status: 'in-review', ...(presentation ? { presentation: { revision: options.currentRevision, artifactHash: remediation.binding.artifactHash } } : {}) })
}
/** Review closure is intentionally absent: only explicit human acceptance plus fresh gates resolves. */
export const mergeRemediation = (input: unknown, options: { by: string; authenticateHuman: (by: string) => boolean; revision: string; verifyMerged: (remediation: RemediationV1, revision: string) => boolean }): RemediationV1 => {
  const remediation = RemediationV1Schema.parse(input)
  if (remediation.status !== 'in-review' || !remediation.approval || remediation.approval.bindingHash !== remediationBindingHash(remediation) || remediation.approval.by !== options.by || !options.authenticateHuman(options.by)) throw new Error('Human review/merge approval required')
  if (!options.revision || !options.verifyMerged(remediation, options.revision)) throw new Error('Fresh merged revision verification failed')
  return RemediationV1Schema.parse({ ...remediation, status: 'merged' })
}
