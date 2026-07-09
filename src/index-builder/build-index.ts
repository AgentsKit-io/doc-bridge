import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { toPosix } from '../lib/paths.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { buildLookup, collectPackages } from './build-handoffs.js'
import { renderCapabilitiesJson } from './capabilities.js'
import { sha256NormalizedV1 } from './content-hash.js'
import { renderLlmsTxt } from './llms-txt.js'
import { scanHumanDocs } from './human-adapters/index.js'
import { discoverPnpmPackages } from './plugins/pnpm-monorepo.js'
import { scanAgentCorpus } from './scan-corpus.js'

export type BuildIndexOptions = {
  readonly root?: string
  readonly config: DocBridgeConfigV1
  readonly write?: boolean
}

export type BuildIndexResult = {
  readonly index: DocBridgeIndexV1
  readonly indexPath: string
  readonly llmsTxtPath?: string
  readonly capabilitiesPath?: string
}

const projectName = (root: string, config: DocBridgeConfigV1): string => {
  if (config.project?.name) return config.project.name
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: string }
    if (pkg.name) return pkg.name
  } catch {
    // ignore
  }
  return toPosix(root.split('/').pop() ?? 'project')
}

const existingGeneratedAt = (indexPath: string, contentHash: string): string | undefined => {
  try {
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
      contentHash?: unknown
      generatedAt?: unknown
    }
    return index.contentHash === contentHash && typeof index.generatedAt === 'string'
      ? index.generatedAt
      : undefined
  } catch {
    return undefined
  }
}

export const buildDocBridgeIndex = (opts: BuildIndexOptions): BuildIndexResult => {
  const root = opts.root ?? process.cwd()
  const config = opts.config
  const write = opts.write ?? true
  const outFile = config.index?.outFile ?? '.doc-bridge/index.json'
  const indexPath = join(root, outFile)

  const corpus = scanAgentCorpus(root, config)
  const knowledge = corpus.map(({ absPath: _a, relPath: _r, frontmatter: _f, ...entry }) => entry)

  const shouldDiscover =
    config.routing?.plugin === 'pnpm-monorepo' ||
    Boolean(config.routing?.options?.packages?.length) ||
    config.routing?.plugin === 'npm-workspaces' ||
    config.routing?.plugin === 'yarn-workspaces'

  const discovered = shouldDiscover ? discoverPnpmPackages(root, config) : []
  const packages = collectPackages(config, discovered, corpus)
  const humanDocs = scanHumanDocs(root, config)

  const { lookup, handoffs } = buildLookup(config, packages, corpus, outFile, humanDocs)

  const hashPayload = {
    schemaVersion: 1,
    knowledge,
    handoffs,
    lookup,
  }

  const contentHash = sha256NormalizedV1(hashPayload)
  const index: DocBridgeIndexV1 = {
    schemaVersion: 1,
    contentHash,
    contentHashAlgo: 'sha256-normalized-v1',
    generatedAt: existingGeneratedAt(indexPath, contentHash) ?? new Date().toISOString(),
    project: { name: projectName(root, config), root: '.' },
    knowledge,
    handoffs,
    lookup,
  }

  if (write) {
    mkdirSync(dirname(indexPath), { recursive: true })
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  }

  let llmsTxtPath: string | undefined
  let llmsTxtRelPath: string | undefined
  if (config.index?.llmsTxt?.enabled !== false) {
    const llmsOut = config.index?.llmsTxt?.outFile ?? 'llms.txt'
    llmsTxtRelPath = toPosix(llmsOut)
    llmsTxtPath = join(root, llmsOut)
    if (write) {
      writeFileSync(
        llmsTxtPath,
        renderLlmsTxt(config, knowledge, index.project?.name ?? 'project'),
        'utf8',
      )
    }
  }

  let capabilitiesPath: string | undefined
  if (config.index?.capabilities?.enabled !== false) {
    const capabilitiesOut = config.index?.capabilities?.outFile ?? '.doc-bridge/capabilities.json'
    capabilitiesPath = join(root, capabilitiesOut)
    if (write) {
      mkdirSync(dirname(capabilitiesPath), { recursive: true })
      writeFileSync(
        capabilitiesPath,
        renderCapabilitiesJson(config, index, {
          index: toPosix(outFile),
          ...(llmsTxtRelPath ? { llmsTxt: llmsTxtRelPath } : {}),
        }),
        'utf8',
      )
    }
  }

  return {
    index,
    indexPath: toPosix(indexPath),
    ...(llmsTxtPath ? { llmsTxtPath: toPosix(llmsTxtPath) } : {}),
    ...(capabilitiesPath ? { capabilitiesPath: toPosix(capabilitiesPath) } : {}),
  }
}
