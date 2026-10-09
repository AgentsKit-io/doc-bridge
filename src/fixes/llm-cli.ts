import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import type { DocBridgeConfigV1 } from '../config/schema.js'
import { denyServiceOperation } from '../execution/profile.js'
import { readBoundedText } from '../lib/bounded-text.js'
import { parseDiscoverySnapshot } from '../validate.js'
import { proposeL2Remediations } from './llm.js'
import { regionProviderFromAdapter, scriptedRegionProvider } from './llm-provider.js'
import type { AdapterFactory } from '@agentskit/core'
import { promoteMemoryToGithubPr } from '../memory/github-pr.js'

export { proposeL2Remediations } from './llm.js'
export { regionProviderFromAdapter, scriptedRegionProvider } from './llm-provider.js'
export type { RegionProvider, L2Result } from './llm.js'

export const runL2Fix = async (root: string, config: DocBridgeConfigV1, argv: readonly string[]) => {
  denyServiceOperation('L2 remediation')
  const value = (name: string) => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1] }
  const basePath = value('--base')
  if (!basePath) throw new Error('Usage: ak-docs fix --llm --base <snapshot.json> [--responses <script.json>] [--max-findings <n>] [--max-tokens <n>] [--dry-run] [--pr] [--output <file>]')
  const base = parseDiscoverySnapshot(JSON.parse(readBoundedText(resolve(root, basePath), { used: 0 }, { maxFileBytes: 64 * 1024 * 1024 })))
  const dryRun = argv.includes('--dry-run'), scriptPath = value('--responses')
  let provider
  if (!dryRun) {
    if (scriptPath) provider = scriptedRegionProvider(z.array(z.unknown()).max(100).parse(JSON.parse(readBoundedText(resolve(root, scriptPath), { used: 0 }, { maxFileBytes: 1_000_000 }))))
    else {
      const { resolveIntelligenceRuntime } = await import('../intelligence/adapter.js')
      provider = regionProviderFromAdapter((await resolveIntelligenceRuntime(config)).adapter as AdapterFactory)
    }
  }
  const result = await proposeL2Remediations({ root, config, base, dryRun, ...(provider ? { provider } : {}), ...(value('--max-findings') === undefined ? {} : { maxFindings: Number(value('--max-findings')) }), ...(value('--max-tokens') === undefined ? {} : { maxTokens: Number(value('--max-tokens')) }) })
  const output = value('--output')
  if (output) { const path = resolve(root, output); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`) }
  const pr = argv.includes('--pr') && result.remediations.length ? promoteMemoryToGithubPr(root, { ok: true, title: 'Review doc-bridge region remediations', body: `Human review required. Each proposal was checked independently; verify the combined edits before applying.\n\n${result.remediations.map(item => `\`\`\`diff\n${item.diff}\n\`\`\``).join('\n\n')}`, findings: [], classifications: [] }, { dryRun: true }) : undefined
  return { ok: true, dryRun, ...result, ...(pr ? { pr } : {}) }
}
