import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()
const basePath = process.env.DOCS_BASE_PATH ?? ''

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

export default withMDX(config)
