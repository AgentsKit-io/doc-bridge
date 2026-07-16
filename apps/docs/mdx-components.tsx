import defaultMdxComponents from 'fumadocs-ui/mdx'

/** Fumadocs MDX component map for product docs. */
export function getMDXComponents(components?: Record<string, unknown>) {
  return {
    ...defaultMdxComponents,
    ...components,
  }
}
