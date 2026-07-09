import { optionString, scanMarkdownDocs, type HumanAdapter } from './core.js'

export const plainMarkdownAdapter: HumanAdapter = {
  plugin: 'plain-markdown',
  scan: ({ root, config }) => {
    const humanRoot =
      optionString(config.options, ['contentDir', 'root', 'docsDir']) ?? 'docs'
    return scanMarkdownDocs(root, humanRoot, { urlPrefix: config.options?.urlPrefix })
  },
}
