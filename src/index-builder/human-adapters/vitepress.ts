import { minimatch } from 'minimatch'

import { optionString, routeSlug, scanMarkdownDocs, type HumanAdapter } from './core.js'

const isVitePressPage = (relPath: string): boolean =>
  !relPath.split('/').some((part) => part === '.vitepress' || part.startsWith('.'))

const srcExcludePatterns = (value: unknown): readonly string[] => {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 64) {
    throw new Error('VitePress srcExclude must be an array of at most 64 glob patterns.')
  }
  return value.map((pattern) => {
    if (typeof pattern !== 'string' || !pattern || pattern.length > 256 || pattern.includes('\0')) {
      throw new Error('Each VitePress srcExclude pattern must be a non-empty string up to 256 characters.')
    }
    return pattern
  })
}

const isExcluded = (relPath: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => minimatch(relPath, pattern, { dot: true }))

const vitepressSlug = (relPath: string, cleanUrls: boolean): string => {
  const slug = routeSlug(relPath)
  if (cleanUrls || /(?:^|\/)index\.mdx?$/.test(relPath)) return slug
  return `${slug}.html`
}

export const vitepressAdapter: HumanAdapter = {
  plugin: 'vitepress',
  scan: ({ root, config }) => {
    const docsDir = optionString(config.options, ['docsDir', 'root', 'srcDir'])
    if (!docsDir) return []
    const srcExclude = srcExcludePatterns(config.options?.srcExclude)

    return scanMarkdownDocs(root, docsDir, {
      includeRelPath: (relPath) => isVitePressPage(relPath) && !isExcluded(relPath, srcExclude),
      slugForDoc: (relPath) => vitepressSlug(relPath, config.options?.cleanUrls === true),
      urlPrefix: config.options?.urlPrefix,
    })
  },
}
