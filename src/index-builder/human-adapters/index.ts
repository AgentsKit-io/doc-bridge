import { realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import type { DocBridgeConfigV1, HumanCorpusConfig } from '../../config/schema.js'
import { docusaurusAdapter } from './docusaurus.js'
import { fumadocsAdapter } from './fumadocs.js'
import type { HumanAdapter, HumanDocMap, HumanDocRecord } from './core.js'
import { plainMarkdownAdapter } from './plain-markdown.js'

export type { HumanAdapter, HumanDocMap, HumanDocRecord } from './core.js'

const ADAPTERS: readonly HumanAdapter[] = [
  plainMarkdownAdapter,
  fumadocsAdapter,
  docusaurusAdapter,
]

const humanConfigs = (config: DocBridgeConfigV1): HumanCorpusConfig[] => {
  const human = config.corpus.human
  if (!human) return []
  return Array.isArray(human) ? human : [human]
}

const canonicalPath = (path: string): string => {
  try {
    return realpathSync.native(path)
  } catch {
    return resolve(path)
  }
}

export const scanHumanDocRecords = (
  root: string,
  config: DocBridgeConfigV1,
): HumanDocRecord[] => {
  const out: HumanDocRecord[] = []
  const seen = new Set<string>()
  const agentRoot = canonicalPath(resolve(root, config.corpus.agent.root))

  for (const human of humanConfigs(config)) {
    const adapter = ADAPTERS.find((candidate) => candidate.plugin === human.plugin)
    if (!adapter) continue
    for (const record of adapter.scan({ root, config: human })) {
      // Never treat agent-corpus files as human docs (nested for-agents, etc.)
      const recordPath = canonicalPath(record.path)
      if (
        recordPath === agentRoot ||
        recordPath.startsWith(`${agentRoot}${sep}`) ||
        record.path.includes('/for-agents/') ||
        record.path.endsWith('/for-agents')
      ) {
        continue
      }
      if (seen.has(record.id)) continue
      seen.add(record.id)
      out.push(record)
    }
  }

  return out
}

export const scanHumanDocs = (root: string, config: DocBridgeConfigV1): HumanDocMap =>
  Object.fromEntries(scanHumanDocRecords(root, config).map((doc) => [doc.id, doc.url]))
