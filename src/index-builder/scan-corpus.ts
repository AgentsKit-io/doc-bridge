import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import {
  firstHeading,
  firstParagraph,
  frontmatterString,
  frontmatterStringList,
  parseFrontmatter,
  slugFromPath,
  type FrontmatterData,
} from '../lib/markdown.js'
import { toPosix } from '../lib/paths.js'
import { walkFiles } from '../lib/walk.js'
import type { KnowledgeEntry } from '../schemas/doc-bridge-index.js'

export type CorpusDoc = KnowledgeEntry & {
  readonly absPath: string
  readonly relPath: string
  readonly frontmatter: FrontmatterData
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
    const { data: frontmatter } = parseFrontmatter(raw)
    const id =
      frontmatterString(frontmatter, 'id') ??
      frontmatterString(frontmatter, 'package') ??
      slugFromPath(relToCorpus)
    const title = firstHeading(raw) ?? id
    const description = firstParagraph(raw)
    return {
      id,
      type: 'agent-doc',
      title,
      path: relPath,
      absPath: abs,
      relPath,
      frontmatter,
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
      frontmatterString(doc.frontmatter, 'package') === packageId ||
      doc.relPath.endsWith(`/packages/${packageId}.md`) ||
      doc.relPath.endsWith(`/${packageId}.md`) ||
      doc.id === packageId,
  )
  return exact?.path
}

/** Ownership seeds from agent-doc frontmatter (`package` + `editRoot`). */
export const ownershipFromFrontmatter = (
  corpus: readonly CorpusDoc[],
): ReadonlyArray<{
  readonly id: string
  readonly path: string
  readonly purpose?: string
  readonly checks?: readonly string[]
  readonly agentDoc: string
  readonly humanDoc?: string
}> => {
  const out: Array<{
    id: string
    path: string
    purpose?: string
    checks?: readonly string[]
    agentDoc: string
    humanDoc?: string
  }> = []

  for (const doc of corpus) {
    const id =
      frontmatterString(doc.frontmatter, 'package') ??
      (frontmatterString(doc.frontmatter, 'type') === 'package'
        ? frontmatterString(doc.frontmatter, 'id') ?? doc.id
        : undefined)
    const path =
      frontmatterString(doc.frontmatter, 'editRoot') ??
      frontmatterString(doc.frontmatter, 'path')
    if (!id || !path) continue
    const purpose =
      frontmatterString(doc.frontmatter, 'purpose') ?? doc.description
    const checks = frontmatterStringList(doc.frontmatter, 'checks')
    const humanDoc = frontmatterString(doc.frontmatter, 'humanDoc')
    out.push({
      id,
      path,
      agentDoc: doc.path,
      ...(purpose ? { purpose } : {}),
      ...(checks ? { checks } : {}),
      ...(humanDoc ? { humanDoc } : {}),
    })
  }

  return out
}

export { relFromRoot }
