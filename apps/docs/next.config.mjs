import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()
const isPages = process.env.GITHUB_ACTIONS === 'true'

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isPages ? '/doc-bridge' : '',
  assetPrefix: isPages ? '/doc-bridge/' : undefined,
  env: { NEXT_PUBLIC_BASE_PATH: isPages ? '/doc-bridge' : '' },
}

export default withMDX(config)
