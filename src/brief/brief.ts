import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import { relativePosix, splitLines } from '@agentskit/cross-platform'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { handoffForEntity } from '../query/handoff.js'
import { searchIndex } from '../query/search.js'
import type { AgentHandoffV1 } from '../schemas/agent-handoff.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'

/**
 * The brief a production line attaches to an agent's ticket.
 *
 * Layer 0 only: the ticket text is searched in the index, the best matches become handoffs, and
 * product context files (a NoxCode repo keeps `docs/finalizacao/` and `docs/mvp.yaml`) are
 * quoted, bounded. No model is called, so the cost is zero tokens and the run record says so.
 */

/** Where a NoxCode product keeps its finishing docs and MVP scope. Used when no `--context` is given. */
export const DEFAULT_CONTEXT_PATHS = ['docs/finalizacao', 'docs/mvp.yaml'] as const

const MAX_HANDOFFS = 3
const MAX_CONTEXT_FILES = 12
const MAX_CONTEXT_CHARS = 4_000
const CONTEXT_EXTENSIONS = /\.(md|mdx|ya?ml|json|txt)$/i

export type BriefContextFile = { readonly path: string; readonly bytes: number; readonly truncated: boolean }

/** What the line records about the run: how long it took and what it cost. */
export type BriefRecord = {
  readonly type: 'doc-bridge-brief-record'
  readonly schemaVersion: 1
  readonly ticket: string
  readonly durationMs: number
  readonly cost: { readonly llmCalls: 0; readonly tokens: 0; readonly usd: 0 }
  readonly handoffs: readonly string[]
  readonly contextFiles: readonly BriefContextFile[]
  readonly briefBytes: number
}

export type BriefResult = { readonly markdown: string; readonly record: BriefRecord }

export type BriefOptions = {
  readonly root: string
  readonly ticket: string
  readonly title?: string
  /** Repository-relative files or directories to quote; defaults to {@link DEFAULT_CONTEXT_PATHS}. */
  readonly context?: readonly string[]
  /** A clock, so tests can measure without waiting. */
  readonly now?: () => number
}

const inside = (root: string, candidate: string): boolean => candidate === root || candidate.startsWith(root + sep)

const collect = (root: string, requested: readonly string[]): string[] => {
  const files: string[] = []
  const realRoot = realpathSync(root)
  for (const entry of requested) {
    const absolute = resolve(root, entry)
    if (!inside(root, absolute) || !existsSync(absolute)) continue
    // A symlink inside the repository must not lead the brief to quote files outside it.
    if (!inside(realRoot, realpathSync(absolute))) continue
    if (statSync(absolute).isDirectory()) {
      const names = readdirSync(absolute, { recursive: true, withFileTypes: true })
        .filter((item) => item.isFile() && CONTEXT_EXTENSIONS.test(item.name))
        .map((item) => join(item.parentPath, item.name))
        .filter((file) => inside(realRoot, realpathSync(file)))
        .sort()
      files.push(...names)
    } else files.push(absolute)
  }
  return [...new Set(files)].slice(0, MAX_CONTEXT_FILES).map((file) => relativePosix(root, file))
}

const handoffLines = (handoff: AgentHandoffV1): string[] => [
  `### ${handoff.target.id} (${handoff.target.type})`,
  `- Start here: ${handoff.startHere}`,
  ...(handoff.readBeforeEditing.length ? [`- Read before editing: ${handoff.readBeforeEditing.join(', ')}`] : []),
  `- Edit roots: ${handoff.editRoots.join(', ')}`,
  ...(handoff.checks.length ? [`- Checks: ${handoff.checks.join('; ')}`] : []),
]

export const buildBrief = (index: DocBridgeIndexV1, config: DocBridgeConfigV1, options: BriefOptions): BriefResult => {
  const now = options.now ?? Date.now
  const started = now()
  const root = resolve(options.root)

  const handoffs: AgentHandoffV1[] = []
  const seen = new Set<string>()
  for (const match of searchIndex(index, options.ticket, 20)) {
    if (handoffs.length >= MAX_HANDOFFS) break
    if (match.type === 'intent' || match.type === 'change') continue
    try {
      const handoff = handoffForEntity(index, match.entityId ?? match.id, config, { root })
      const key = `${handoff.target.type}:${handoff.target.id}`
      if (seen.has(key)) continue
      seen.add(key)
      handoffs.push(handoff)
    } catch {
      // A match that names no handoff target is skipped; the brief lists what could be resolved.
    }
  }

  const contextFiles: BriefContextFile[] = []
  const quoted: string[] = []
  for (const path of collect(root, options.context ?? DEFAULT_CONTEXT_PATHS)) {
    const text = readFileSync(join(root, path), 'utf8')
    const truncated = text.length > MAX_CONTEXT_CHARS
    contextFiles.push({ path, bytes: Buffer.byteLength(text), truncated })
    quoted.push(`### ${path}`, '```', truncated ? `${text.slice(0, MAX_CONTEXT_CHARS)}\n… (truncated)` : text.trimEnd(), '```', '')
  }

  const lines = [
    '## Repository context (doc-bridge)',
    '',
    `Ticket: ${options.title ?? splitLines(options.ticket)[0] ?? ''}`,
    '',
    '### Handoffs',
    ...(handoffs.length ? handoffs.flatMap((handoff) => [...handoffLines(handoff), '']) : ['No indexed unit matches this ticket; start from AGENTS.md.', '']),
    ...(quoted.length ? ['### Product context', '', ...quoted] : []),
  ]
  const markdown = `${lines.join('\n').trimEnd()}\n`

  return {
    markdown,
    record: {
      type: 'doc-bridge-brief-record',
      schemaVersion: 1,
      ticket: options.title ?? splitLines(options.ticket)[0] ?? '',
      durationMs: Math.max(0, now() - started),
      cost: { llmCalls: 0, tokens: 0, usd: 0 },
      handoffs: handoffs.map((handoff) => handoff.target.id),
      contextFiles,
      briefBytes: Buffer.byteLength(markdown),
    },
  }
}
