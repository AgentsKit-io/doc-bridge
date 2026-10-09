import { join, relative, resolve } from 'node:path'

import { firstHeading, firstParagraph, slugFromPath } from '../lib/markdown.js'
import type { DocBridgeConfigV1 } from '../config/schema.js'
import { readBoundedText, type TextReadBudget } from '../lib/bounded-text.js'
import { containedProjectPath, toPosix } from '../lib/paths.js'
import { walkFiles } from '../lib/walk.js'
import type { MemoryCandidateV1 } from '../schemas/memory-candidate.js'

const memoryFact = (raw: string, id: string): string =>
  firstParagraph(raw) ?? firstHeading(raw) ?? id

const relativePath = (root: string, abs: string): string =>
  toPosix(relative(root, abs))

const ingestMarkdownDir = (
  root: string,
  dir: string,
  source: MemoryCandidateV1['source'],
  confidence: number,
  budget: TextReadBudget = { used: 0 },
): MemoryCandidateV1[] => {
  return walkFiles(dir, { extensions: ['.md', '.mdc'], respectIgnore: false }).map((abs) => {
    const rel = relativePath(root, abs)
    const safePath = containedProjectPath(root, rel)
    if (!safePath) throw new Error('Memory file must remain inside the repository.')
    const raw = readBoundedText(safePath, budget)
    const id = slugFromPath(rel)
    return {
      schemaVersion: 1,
      id,
      source,
      rawPath: rel,
      fact: memoryFact(raw, id),
      suggestedType: 'project',
      confidence,
      references: [],
    }
  })
}

export const ingestCursorRules = (root: string): MemoryCandidateV1[] => {
  const dir = join(root, '.cursor', 'rules')
  return ingestMarkdownDir(root, dir, 'cursor', 0.6)
}

export const ingestAgentMemory = (root: string): MemoryCandidateV1[] =>
  ingestMarkdownDir(root, join(root, '.agent-memory'), 'agent-memory', 0.7)

export const ingestMemoryCandidates = (
  root: string,
  intelligence?: DocBridgeConfigV1['intelligence'],
): MemoryCandidateV1[] => {
  const memory = intelligence?.memory
  const adapters = memory?.adapters ?? ['playbook-memory', 'cursor-rules']
  for (const adapter of adapters) {
    if (adapter !== 'playbook-memory' && adapter !== 'cursor-rules') {
      throw new Error(`Unsupported deterministic memory adapter: ${adapter}. Use playbook-memory or cursor-rules.`)
    }
  }
  if (memory?.enabled === false) return []
  const budget: TextReadBudget = { used: 0 }
  const configured = memory?.ingestDir
  const dirs = configured === undefined ? undefined : typeof configured === 'string' ? [configured] : configured
  const candidates = [...new Set(adapters)].flatMap(adapter => {
    const paths = adapter === 'playbook-memory' ? dirs ?? ['.agent-memory'] : ['.cursor/rules']
    return [...new Set(paths)].flatMap(path => {
      if (!containedProjectPath(root, path)) throw new Error('Memory ingestDir must remain inside the repository.')
      return ingestMarkdownDir(root, resolve(root, path), adapter === 'playbook-memory' ? 'agent-memory' : 'cursor', adapter === 'playbook-memory' ? 0.7 : 0.6, budget)
    })
  })
  return [...new Map(candidates.map(candidate => [`${candidate.source}:${candidate.rawPath}`, candidate])).values()]
}
