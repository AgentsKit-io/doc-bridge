import { docs } from '@/.source/server'
import { getSlugs, loader } from 'fumadocs-core/source'
import { isPublicDocPath } from './public-docs'

const base = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  slugs: info =>
    ['README', 'index'].includes(info.path.split('/').pop()?.replace(/\.[^.]+$/u, '') ?? '')
      ? info.path.split('/').slice(0, -1).filter(Boolean)
      : getSlugs(info.path),
})

function filterTree(node: any): any {
  if (!node) return node
  if (node.type === 'page') {
    const url: string = node.url ?? ''
    const slugPath = url.replace(/^\/docs\/?/, '')
    if (!slugPath) return node
    const asFile = `${slugPath}.md`
    if (isPublicDocPath(asFile) || isPublicDocPath(`${slugPath}/index.md`)) return node
    return null
  }
  if (node.children) {
    const children = node.children.map(filterTree).filter(Boolean)
    if (children.length === 0 && node.type === 'folder') return null
    return { ...node, children }
  }
  return node
}

export const source = {
  ...base,
  get pageTree() {
    return filterTree(base.pageTree) ?? base.pageTree
  },
  getPage(slug?: string[]) {
    const page = base.getPage(slug)
    if (!page) return page
    const filePath = page.path ?? `${(slug ?? []).join('/')}.md`
    if (!isPublicDocPath(filePath)) {
      const joined = (slug ?? []).join('/')
      if (
        !isPublicDocPath(`${joined}.md`)
        && !isPublicDocPath(`${joined}/index.md`)
      ) {
        return undefined as any
      }
    }
    return page
  },
  getPages(language?: string) {
    return base.getPages(language).filter(page =>
    isPublicDocPath(page.path),
    )
  },
  generateParams() {
    return base.generateParams().filter((p: { slug?: string[] }) => {
      const slug = p.slug ?? []
      if (slug.length === 0) return true
      const joined = slug.join('/')
      return isPublicDocPath(`${joined}.md`) || isPublicDocPath(`${joined}/index.md`)
    })
  },
} as typeof base
