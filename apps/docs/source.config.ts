import { defineConfig, defineDocs } from 'fumadocs-mdx/config'
import remarkRewriteLinks from './remark-rewrite-links.mjs'

export const docs = defineDocs({
  dir: '../../docs',
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
