import { defineConfig, defineDocs } from 'fumadocs-mdx/config'
import remarkRewriteLinks from './remark-rewrite-links.mjs'
import publicDocs from './public-docs.json'

export const docs = defineDocs({
  dir: '../../docs',
  docs: {
    files: publicDocs,
  },
  meta: { files: ['meta.json'] },
})

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkRewriteLinks],
    rehypeCodeOptions: {
      themes: {
        light: 'github-light-default',
        dark: 'github-dark-default',
      },
    },
  },
})
