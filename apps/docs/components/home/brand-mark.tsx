import { BRAND_PATHS } from './brand-paths'

/** A brand glyph in the current text colour, or a one-letter monogram when no glyph is available. */
export function BrandMark({ slug, label, size = 16 }: { slug?: string; label: string; size?: number }) {
  const path = slug ? BRAND_PATHS[slug] : undefined
  if (!path) {
    return <span className="bridge-brand-monogram" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.62 }}>{label.charAt(0)}</span>
  }
  return (
    <svg className="bridge-brand-mark" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={path} fill="currentColor" />
    </svg>
  )
}

/** The tools named on the landing, with the glyph each one uses. */
export const TOOLS = {
  fumadocs: { label: 'Fumadocs' },
  docusaurus: { label: 'Docusaurus', slug: 'docusaurus' },
  markdown: { label: 'Markdown', slug: 'markdown' },
  claudeCode: { label: 'Claude Code', slug: 'claude' },
  codex: { label: 'Codex' },
  cursor: { label: 'Cursor', slug: 'cursor' },
  githubActions: { label: 'GitHub Actions', slug: 'githubactions' },
  mcp: { label: 'MCP', slug: 'modelcontextprotocol' },
} as const
