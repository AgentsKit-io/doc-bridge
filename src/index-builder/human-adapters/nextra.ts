import {
  optionString,
  parseFrontmatter,
  routeSlug,
  scanMarkdownDocs,
  type HumanAdapter,
  type HumanDocRecord,
} from './core.js'

const nextraRecordId = (relPath: string, raw: string): string => {
  const frontmatter = parseFrontmatter(raw)
  return frontmatter.package ?? frontmatter.module ?? frontmatter.id ?? (routeSlug(relPath) || 'index')
}

const isIndexPage = (path: string): boolean => /(^|[/\\])index\.mdx?$/i.test(path)

const resolveRouteCollisions = (records: readonly HumanDocRecord[]): HumanDocRecord[] => {
  const byUrl = new Map<string, { readonly record: HumanDocRecord; readonly indexPage: boolean }>()
  for (const record of records) {
    const normalized = { ...record, url: record.url || '/' }
    const indexPage = isIndexPage(record.path)
    const existing = byUrl.get(normalized.url)
    if (!existing || indexPage || !existing.indexPage) {
      byUrl.set(normalized.url, { record: normalized, indexPage })
    }
  }
  return [...byUrl.values()].map(({ record }) => record)
}

export const nextraAdapter: HumanAdapter = {
  plugin: 'nextra',
  scan: ({ root, config }) => {
    const contentDir = optionString(config.options, ['contentDir', 'docsDir', 'root'])
    if (!contentDir) return []

    return resolveRouteCollisions(
      scanMarkdownDocs(root, contentDir, {
        idForDoc: nextraRecordId,
        urlPrefix: optionString(config.options, ['urlPrefix', 'contentDirBasePath']) ?? '/',
      }),
    )
  },
}
