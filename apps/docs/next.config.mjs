import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()
// Production (doc-bridge.agentskit.io) uses no base path.
// Only set DOCS_BASE_PATH for rare legacy GitHub Pages subpath previews.
const basePath = process.env.DOCS_BASE_PATH ?? ''

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://doc-bridge.agentskit.io',
  },
}

export default withMDX(config)
