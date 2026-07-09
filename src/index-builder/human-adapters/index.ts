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

export const scanHumanDocRecords = (
  root: string,
  config: DocBridgeConfigV1,
): HumanDocRecord[] => {
  const out: HumanDocRecord[] = []
  const seen = new Set<string>()

  for (const human of humanConfigs(config)) {
    const adapter = ADAPTERS.find((candidate) => candidate.plugin === human.plugin)
    if (!adapter) continue
    for (const record of adapter.scan({ root, config: human })) {
      if (seen.has(record.id)) continue
      seen.add(record.id)
      out.push(record)
    }
  }

  return out
}

export const scanHumanDocs = (root: string, config: DocBridgeConfigV1): HumanDocMap =>
  Object.fromEntries(scanHumanDocRecords(root, config).map((doc) => [doc.id, doc.url]))
