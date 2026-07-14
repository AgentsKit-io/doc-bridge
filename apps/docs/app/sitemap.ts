import type { MetadataRoute } from 'next'
import { source } from '@/lib/source'

const origin = 'https://agentskit-io.github.io/doc-bridge'
export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${origin}/`, priority: 1 }, ...source.getPages().map((page) => ({ url: `${origin}/docs/${page.slugs.join('/')}/`, priority: 0.8 }))]
}
