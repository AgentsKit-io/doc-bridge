import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { toPosix } from '../lib/paths.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { buildLookup } from './build-handoffs.js'
import { sha256NormalizedV1 } from './content-hash.js'
import { renderLlmsTxt } from './llms-txt.js'
import { discoverPnpmPackages } from './plugins/pnpm-monorepo.js'
import { scanAgentCorpus } from './scan-corpus.js'

export type BuildIndexOptions = {
  readonly root?: string
  readonly config: DocBridgeConfigV1
}

export type BuildIndexResult = {
  readonly index: DocBridgeIndexV1
  readonly indexPath: string
  readonly llmsTxtPath?: string
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

export const buildDocBridgeIndex = (opts: BuildIndexOptions): BuildIndexResult => {
  const root = opts.root ?? process.cwd()
  const config = opts.config
  const outFile = config.index?.outFile ?? '.doc-bridge/index.json'
  const indexPath = join(root, outFile)

  const corpus = scanAgentCorpus(root, config)
  const knowledge = corpus.map(({ absPath: _a, relPath: _r, ...entry }) => entry)

  const packages =
    config.routing?.plugin === 'pnpm-monorepo' || config.routing?.options?.packages
      ? discoverPnpmPackages(root, config)
      : []

  const { lookup, handoffs } = buildLookup(config, packages, corpus, outFile)

  const hashPayload = {
    schemaVersion: 1,
    knowledge,
    handoffs,
    lookup,
  }

  const index: DocBridgeIndexV1 = {
    schemaVersion: 1,
    contentHash: sha256NormalizedV1(hashPayload),
    contentHashAlgo: 'sha256-normalized-v1',
    generatedAt: new Date().toISOString(),
    project: { name: projectName(root, config), root: '.' },
    knowledge,
    handoffs,
    lookup,
  }

  mkdirSync(dirname(indexPath), { recursive: true })
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')

  let llmsTxtPath: string | undefined
  if (config.index?.llmsTxt?.enabled !== false) {
    const llmsOut = config.index?.llmsTxt?.outFile ?? 'llms.txt'
    llmsTxtPath = join(root, llmsOut)
    writeFileSync(
      llmsTxtPath,
      renderLlmsTxt(config, knowledge, index.project?.name ?? 'project'),
      'utf8',
    )
  }

  return llmsTxtPath
    ? { index, indexPath: toPosix(indexPath), llmsTxtPath: toPosix(llmsTxtPath) }
    : { index, indexPath: toPosix(indexPath) }
}