import defaultMdxComponents from 'fumadocs-ui/mdx'
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock'
import type { HTMLAttributes } from 'react'

/**
 * Fumadocs MDX map with explicit CodeBlock (Shiki highlight + copy button).
 * rehype themes are configured in source.config.ts (github-light / github-dark).
 */
export function getMDXComponents(components?: Record<string, unknown>) {
  return {
    ...defaultMdxComponents,
    pre: ({ children, ...props }: HTMLAttributes<HTMLPreElement>) => (
      <CodeBlock {...props} allowCopy keepBackground>
        <Pre>{children}</Pre>
      </CodeBlock>
    ),
    ...components,
  }
}
