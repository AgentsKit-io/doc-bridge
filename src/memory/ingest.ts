import { relative, resolve } from 'node:path'

import { firstHeading, firstParagraph, slugFromPath } from '../lib/markdown.js'
import { memoryPathDefaults } from '../config/defaults.js'
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

export const ingestCursorRules = (root: string, directory = memoryPathDefaults(undefined).rulesDir): MemoryCandidateV1[] =>
  ingestMemoryCandidates(root, { memory: { adapters: ['cursor-rules'], rulesDir: directory } })

export const ingestAgentMemory = (root: string, directory = memoryPathDefaults(undefined).ingestDir): MemoryCandidateV1[] =>
  ingestMemoryCandidates(root, { memory: { adapters: ['playbook-memory'], ingestDir: directory } })

const SUPPORTED_MEMORY_ADAPTERS = ['playbook-memory', 'cursor-rules'] as const
type SupportedMemoryAdapter = typeof SUPPORTED_MEMORY_ADAPTERS[number]
const isSupportedMemoryAdapter = (adapter: string): adapter is SupportedMemoryAdapter =>
  (SUPPORTED_MEMORY_ADAPTERS as readonly string[]).includes(adapter)

/** Unsupported adapters supplied by untyped callers; configuration validation rejects them. */
export const unsupportedMemoryAdapters = (intelligence?: DocBridgeConfigV1['intelligence']): string[] =>
  [...new Set((intelligence?.memory?.adapters ?? []).filter(adapter => !isSupportedMemoryAdapter(adapter)))]

/** Human-readable warning for ignored memory adapters, or undefined when there are none. */
export const unsupportedMemoryAdapterWarning = (intelligence?: DocBridgeConfigV1['intelligence']): string | undefined => {
  const ignored = unsupportedMemoryAdapters(intelligence)
  return ignored.length ? `Ignoring unsupported memory adapter(s): ${ignored.join(', ')}. Supported: playbook-memory, cursor-rules.` : undefined
}

export const ingestMemoryCandidates = (
  root: string,
  intelligence?: DocBridgeConfigV1['intelligence'],
): MemoryCandidateV1[] => {
  const memory = intelligence?.memory
  const adapters = memory?.adapters ?? ['playbook-memory', 'cursor-rules']
  for (const adapter of adapters) {
    if (!isSupportedMemoryAdapter(adapter)) throw new Error(`Unsupported deterministic memory adapter: ${adapter}`)
  }
  if (memory?.enabled === false) return []
  const budget: TextReadBudget = { used: 0 }
  const directories = memoryPathDefaults(memory)
  const candidates = [...new Set(adapters)].flatMap(adapter => {
    const configured = adapter === 'playbook-memory' ? directories.ingestDir : directories.rulesDir
    const paths = typeof configured === 'string' ? [configured] : configured
    return [...new Set(paths)].flatMap(path => {
      if (!containedProjectPath(root, path)) throw new Error('Memory ingestDir must remain inside the repository.')
      return ingestMarkdownDir(root, resolve(root, path), adapter === 'playbook-memory' ? 'agent-memory' : 'cursor', adapter === 'playbook-memory' ? 0.7 : 0.6, budget)
    })
  })
  return [...new Map(candidates.map(candidate => [`${candidate.source}:${candidate.rawPath}`, candidate])).values()]
}
