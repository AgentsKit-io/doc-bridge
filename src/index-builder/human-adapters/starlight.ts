import { slug as githubSlug } from 'github-slugger'

import {
  optionString,
  parseFrontmatter,
  routeSlug,
  scanMarkdownDocs,
  type HumanAdapter,
} from './core.js'

const isStarlightPage = (relPath: string, raw: string): boolean => {
  if (relPath.split('/').some((part) => part.startsWith('.') || part.startsWith('_'))) return false
  return parseFrontmatter(raw).draft !== 'true'
}

const starlightFileSlug = (relPath: string): string =>
  routeSlug(relPath)
    .split('/')
    .map((part) => githubSlug(part))
    .filter(Boolean)
    .join('/')

const starlightSlug = (relPath: string, raw: string): string => {
  const slug = parseFrontmatter(raw).slug
  return slug ? slug.replace(/^\/+|\/+$/g, '') : starlightFileSlug(relPath)
}

export const starlightAdapter: HumanAdapter = {
  plugin: 'starlight',
  scan: ({ root, config }) => {
    const contentDir = optionString(config.options, ['contentDir', 'docsDir', 'root'])
    if (!contentDir) return []

    return scanMarkdownDocs(root, contentDir, {
      includeRelPath: isStarlightPage,
      slugForDoc: starlightSlug,
      urlPrefix: config.options?.urlPrefix,
    })
  },
}
