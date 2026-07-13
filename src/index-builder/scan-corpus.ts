import type { DocBridgeConfigV1 } from '../config/schema.js'
import { readBoundedText } from '../lib/bounded-text.js'
import {
  extractSearchBody,
  firstHeading,
  firstParagraph,
  frontmatterString,
  frontmatterStringList,
  parseFrontmatter,
  slugFromPath,
  type FrontmatterData,
} from '../lib/markdown.js'
import { containedProjectPath, toPosix } from '../lib/paths.js'
import { walkFiles } from '../lib/walk.js'
import type { KnowledgeEntry } from '../schemas/doc-bridge-index.js'

export type CorpusDoc = KnowledgeEntry & {
  readonly absPath: string
  readonly relPath: string
  readonly frontmatter: FrontmatterData
}

export type OwnershipSeed = {
  readonly id: string
  readonly path: string
  readonly purpose?: string
  readonly checks?: readonly string[]
  readonly agentDoc: string
  readonly humanDoc?: string
}

const relFromRoot = (root: string, abs: string): string => toPosix(abs.replace(`${toPosix(root)}/`, ''))

export const scanAgentCorpus = (root: string, config: DocBridgeConfigV1): CorpusDoc[] => {
  const agentRoot = containedProjectPath(root, config.corpus.agent.root)
  if (!agentRoot) throw new Error('Agent corpus root escapes the project root.')
  const files = walkFiles(agentRoot, { extensions: ['.md', '.mdx'] })
  const corpusRelRoot = toPosix(config.corpus.agent.root)

  const budget = { used: 0 }
  return files.map((abs) => {
    const relToCorpus = toPosix(abs.replace(`${toPosix(agentRoot)}/`, ''))
    const relPath = `${corpusRelRoot}/${relToCorpus}`
    const raw = readBoundedText(abs, budget)
    const { data: frontmatter } = parseFrontmatter(raw)
    const id =
      frontmatterString(frontmatter, 'id') ??
      frontmatterString(frontmatter, 'package') ??
      slugFromPath(relToCorpus)
    const title = firstHeading(raw) ?? id
    const purpose = frontmatterString(frontmatter, 'purpose')
    const description = purpose ?? firstParagraph(raw, 400)
    const body = extractSearchBody(raw)
    return {
      id,
      type: 'agent-doc',
      title,
      path: relPath,
      absPath: abs,
      relPath,
      frontmatter,
      ...(description ? { description } : {}),
      ...(body ? { body } : {}),
    }
  })
}

export const guessAgentDocForPackage = (
  corpus: readonly CorpusDoc[],
  packageId: string,
): string | undefined => {
  const candidates = [
    (doc: CorpusDoc) => frontmatterString(doc.frontmatter, 'package') === packageId,
    (doc: CorpusDoc) => doc.id === packageId,
    (doc: CorpusDoc) => doc.relPath.endsWith(`/packages/${packageId}.md`),
    (doc: CorpusDoc) => doc.relPath.endsWith(`/packages/${packageId}.mdx`),
    (doc: CorpusDoc) => doc.relPath.endsWith(`/packages/${packageId}/index.md`),
    (doc: CorpusDoc) => doc.relPath.endsWith(`/packages/${packageId}/index.mdx`),
    (doc: CorpusDoc) => doc.relPath.endsWith(`/${packageId}.md`),
    (doc: CorpusDoc) => doc.relPath.endsWith(`/${packageId}.mdx`),
    (doc: CorpusDoc) => doc.relPath.includes(`/packages/${packageId}/`),
  ]
  for (const match of candidates) {
    const hit = corpus.find(match)
    if (hit) return hit.path
  }
  return undefined
}

/** Ownership seeds from agent-doc frontmatter (`package` + `editRoot`). */
export const ownershipFromFrontmatter = (corpus: readonly CorpusDoc[]): readonly OwnershipSeed[] => {
  const out: OwnershipSeed[] = []

  for (const doc of corpus) {
    const type = frontmatterString(doc.frontmatter, 'type')
    const id =
      frontmatterString(doc.frontmatter, 'package') ??
      (type === 'package' || type === 'module' || type === 'pattern'
        ? frontmatterString(doc.frontmatter, 'id') ?? doc.id
        : undefined)
    const path =
      frontmatterString(doc.frontmatter, 'editRoot') ??
      frontmatterString(doc.frontmatter, 'path') ??
      (type === 'package' || type === 'module' ? `packages/${id}` : undefined)
    if (!id || !path) continue
    const purpose = frontmatterString(doc.frontmatter, 'purpose') ?? doc.description
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

/**
 * Path-based ownership when frontmatter is incomplete:
 * - packages/id.md(x) → package path packages/id
 * - pillars/.../name-pattern.md → pattern ownership (edit root = file)
 * - registry/id/README.md → registry agent
 */
export const ownershipFromCorpus = (corpus: readonly CorpusDoc[]): readonly OwnershipSeed[] => {
  const out: OwnershipSeed[] = []
  const seen = new Set<string>()

  for (const doc of corpus) {
    // already handled if package+editRoot present
    if (frontmatterString(doc.frontmatter, 'package') && frontmatterString(doc.frontmatter, 'editRoot')) {
      continue
    }

    let id: string | undefined
    let path: string | undefined
    let purpose = frontmatterString(doc.frontmatter, 'purpose') ?? doc.description

    const packagesFile = /(?:^|\/)packages\/([^/]+)\.(?:md|mdx)$/.exec(doc.relPath)
    const packagesIndex = /(?:^|\/)packages\/([^/]+)\/index\.(?:md|mdx)$/.exec(doc.relPath)
    const registryReadme = /(?:^|\/)registry\/([^/]+)\/README\.(?:md|mdx)$/i.exec(doc.relPath)
    const patternFile = /(?:^|\/)pillars\/[^/]+\/([^/]+(?:-pattern)?)\.(?:md|mdx)$/.exec(doc.relPath)
    const topLevelPkg = /(?:^|\/)for-agents\/([^/]+)\.(?:md|mdx)$/.exec(doc.relPath)

    if (packagesFile?.[1] && packagesFile[1] !== 'index') {
      id = packagesFile[1]
      path = `packages/${id}`
    } else if (packagesIndex?.[1]) {
      id = packagesIndex[1]
      path = `packages/${id}`
    } else if (registryReadme?.[1]) {
      id = registryReadme[1]
      path = `registry/${id}`
    } else if (patternFile?.[1] && patternFile[1] !== 'index' && patternFile[1] !== 'universal') {
      id = patternFile[1]
      path = doc.path
      purpose = purpose ?? `Playbook pattern: ${id}`
    } else if (topLevelPkg?.[1] && topLevelPkg[1] !== 'index' && topLevelPkg[1] !== 'INDEX') {
      // agentskit for-agents/core.mdx style
      id = topLevelPkg[1]
      path = `packages/${id}`
    }

    if (!id || !path || seen.has(id)) continue
    seen.add(id)

    const humanDoc = frontmatterString(doc.frontmatter, 'humanDoc')
    const checks = frontmatterStringList(doc.frontmatter, 'checks')
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
