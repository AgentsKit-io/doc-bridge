import type { MetadataRoute } from 'next'
import { source } from '@/lib/source'

const origin = 'https://agentskit-io.github.io/doc-bridge'
export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${origin}/`, priority: 1 },
    { url: `${origin}/for-agents/`, priority: 0.9 },
    { url: `${origin}/llms.txt`, priority: 0.7 },
    { url: `${origin}/llms-full.txt`, priority: 0.6 },
    ...source.getPages().map((page) => ({ url: `${origin}/docs/${page.slugs.join('/')}/`, priority: 0.8 })),
  ]
}
