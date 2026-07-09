import type { DocBridgeConfigV1 } from '../config/schema.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { PACKAGE_VERSION } from '../version.js'

export const renderCapabilitiesJson = (
  config: DocBridgeConfigV1,
  index: DocBridgeIndexV1,
  paths: { readonly index: string; readonly llmsTxt?: string },
): string => {
  const payload = {
    schemaVersion: 1,
    type: 'doc-bridge-capabilities',
    package: '@agentskit/doc-bridge',
    version: PACKAGE_VERSION,
    project: index.project,
    contentHash: index.contentHash,
    artifacts: {
      index: paths.index,
      ...(paths.llmsTxt ? { llmsTxt: paths.llmsTxt } : {}),
    },
    capabilities: [
      'index',
      'query',
      'search',
      'agent-handoff',
      'gates',
      ...(config.surfaces?.mcp?.enabled === false ? [] : ['mcp']),
      ...(config.corpus.human ? ['human-docs'] : []),
    ],
    surfaces: {
      cli: config.surfaces?.cli,
      mcp: config.surfaces?.mcp,
    },
  }

  return `${JSON.stringify(payload, null, 2)}\n`
}
