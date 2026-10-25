import { toPosix } from '@agentskit/cross-platform'
import { globMatch } from '../../lib/glob.js'

import { optionString, scanMarkdownDocs, type HumanAdapter } from './core.js'

const stringPatterns = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []

const matchesConfiguredPath = (relPath: string, options: Record<string, unknown> | undefined): boolean => {
  const normalize = (pattern: string): string => toPosix(pattern).replace(/^\.\//, '')
  const include = stringPatterns(options?.include).map(normalize)
  const exclude = stringPatterns(options?.exclude).map(normalize)
  if (exclude.some((pattern) => globMatch(relPath, pattern))) return false
  return include.length === 0 || include.some((pattern) => globMatch(relPath, pattern))
}

export const plainMarkdownAdapter: HumanAdapter = {
  plugin: 'plain-markdown',
  scan: ({ root, config, files }) => {
    const humanRoot =
      optionString(config.options, ['contentDir', 'root', 'docsDir']) ?? 'docs'
    return scanMarkdownDocs(root, humanRoot, {
      urlPrefix: config.options?.urlPrefix,
      includeRelPath: (relPath) => matchesConfiguredPath(relPath, config.options),
    }, files)
  },
}
