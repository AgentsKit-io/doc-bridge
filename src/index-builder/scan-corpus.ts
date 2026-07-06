import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { firstHeading, firstParagraph, slugFromPath } from '../lib/markdown.js'
import { toPosix } from '../lib/paths.js'
import { walkFiles } from '../lib/walk.js'
import type { KnowledgeEntry } from '../schemas/doc-bridge-index.js'

export type CorpusDoc = KnowledgeEntry & {
  readonly absPath: string
  readonly relPath: string
}

const relFromRoot = (root: string, abs: string): string => toPosix(abs.replace(`${toPosix(root)}/`, ''))

export const scanAgentCorpus = (root: string, config: DocBridgeConfigV1): CorpusDoc[] => {
  const agentRoot = join(root, config.corpus.agent.root)
  const files = walkFiles(agentRoot, { extensions: ['.md', '.mdx'] })
  const corpusRelRoot = toPosix(config.corpus.agent.root)

  return files.map((abs) => {
    const relToCorpus = toPosix(abs.replace(`${toPosix(agentRoot)}/`, ''))
    const relPath = `${corpusRelRoot}/${relToCorpus}`
    const raw = readFileSync(abs, 'utf8')
    const id = slugFromPath(relToCorpus)
    const title = firstHeading(raw) ?? id
    const description = firstParagraph(raw)
    return {
      id,
      type: 'agent-doc',
      title,
      path: relPath,
      absPath: abs,
      relPath,
      ...(description ? { description } : {}),
    }
  })
}

export const guessAgentDocForPackage = (
  corpus: readonly CorpusDoc[],
  packageId: string,
): string | undefined => {
  const exact = corpus.find(
    (doc) =>
      doc.relPath.endsWith(`/packages/${packageId}.md`) ||
      doc.relPath.endsWith(`/${packageId}.md`) ||
      doc.id === packageId,
  )
  return exact?.path
}