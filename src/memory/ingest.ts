import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { firstHeading, firstParagraph, slugFromPath } from '../lib/markdown.js'
import { toPosix } from '../lib/paths.js'
import { walkFiles } from '../lib/walk.js'
import type { MemoryCandidateV1 } from '../schemas/memory-candidate.js'

const memoryFact = (raw: string, id: string): string =>
  firstParagraph(raw) ?? firstHeading(raw) ?? id

const relativePath = (root: string, abs: string): string =>
  toPosix(abs).replace(`${toPosix(root)}/`, '')

const ingestMarkdownDir = (
  root: string,
  dir: string,
  source: MemoryCandidateV1['source'],
  confidence: number,
): MemoryCandidateV1[] => {
  if (!existsSync(dir)) return []

  return walkFiles(dir, { extensions: ['.md', '.mdc'] }).map((abs) => {
    const rel = relativePath(root, abs)
    const raw = readFileSync(abs, 'utf8')
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

export const ingestMemoryCandidates = (root: string): MemoryCandidateV1[] => [
  ...ingestAgentMemory(root),
  ...ingestCursorRules(root),
]
