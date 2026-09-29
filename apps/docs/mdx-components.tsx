import defaultMdxComponents from 'fumadocs-ui/mdx'
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock'
import type { AnchorHTMLAttributes, HTMLAttributes } from 'react'

/** Same-origin files (llms.txt, raw Markdown, JSON) are not app routes, so they must not be prefetched. */
const isStaticFile = (href: string | undefined): boolean => Boolean(href && /^\/(?!\/)[^?#]*\.[a-z0-9]+(?:[?#].*)?$/iu.test(href))
const DefaultLink = defaultMdxComponents.a

/**
 * Fumadocs MDX map with explicit CodeBlock (Shiki highlight + copy button).
 * rehype themes are configured in source.config.ts (github-light / github-dark).
 */
export function getMDXComponents(components?: Record<string, unknown>) {
  return {
    ...defaultMdxComponents,
    a: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => (isStaticFile(props.href) ? <a {...props} /> : <DefaultLink {...props} />),
    pre: ({ children, ...props }: HTMLAttributes<HTMLPreElement>) => (
      <CodeBlock {...props} allowCopy keepBackground>
        <Pre>{children}</Pre>
      </CodeBlock>
    ),
    ...components,
  }
}
