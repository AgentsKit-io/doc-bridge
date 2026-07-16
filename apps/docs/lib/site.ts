/** Canonical public product site — custom domain, no GitHub Pages subpath. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://doc-bridge.agentskit.io'

/** Optional subpath for legacy GitHub Pages previews only. Production custom domain uses "". */
export const BASE_PATH = process.env.DOCS_BASE_PATH ?? process.env.NEXT_PUBLIC_BASE_PATH ?? ''
