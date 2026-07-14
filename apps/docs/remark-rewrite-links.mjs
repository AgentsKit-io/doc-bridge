import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

function unix(path) {
  return path.split(sep).join('/')
}

function isInside(parent, target) {
  const path = relative(parent, target)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..')
}

function findRepositoryRoot() {
  let directory = process.cwd()
  while (directory !== dirname(directory)) {
    if (existsSync(join(directory, 'doc-bridge.config.json'))) return directory
    directory = dirname(directory)
  }
  throw new Error('Unable to locate the Doc Bridge repository root')
}

function rewrite(url, sourcePath) {
  if (!url || url.startsWith('#') || /^(?:[a-z]+:|\/\/)/iu.test(url)) return url

  const match = url.match(/^([^?#]+)([?#].*)?$/u)
  if (!match) return url
  const [, pathname, suffix = ''] = match
  const repositoryRoot = findRepositoryRoot()
  const docsRoot = join(repositoryRoot, 'docs')
  const absoluteSourcePath = isAbsolute(sourcePath) ? sourcePath : resolve(docsRoot, sourcePath)
  const target = resolve(dirname(absoluteSourcePath), decodeURIComponent(pathname))

  if (isInside(docsRoot, target) && pathname.endsWith('.md')) {
    const slug = unix(relative(docsRoot, target)).replace(/\.md$/u, '')
    return `${process.env.DOCS_BASE_PATH ?? ''}/docs/${slug}/${suffix}`
  }

  if (isInside(repositoryRoot, target)) {
    const kind = pathname.endsWith('/') ? 'tree' : 'blob'
    return `https://github.com/AgentsKit-io/doc-bridge/${kind}/master/${unix(relative(repositoryRoot, target))}${suffix}`
  }

  return url
}

function visit(node, sourcePath) {
  if (node?.type === 'link' && typeof node.url === 'string') node.url = rewrite(node.url, sourcePath)
  if (Array.isArray(node?.children)) for (const child of node.children) visit(child, sourcePath)
}

export default function remarkRewriteLinks() {
  return (tree, file) => visit(tree, file.path)
}
