import type { MetadataRoute } from 'next'
import { source } from '@/lib/source'
import { SITE_URL } from '@/lib/site'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/for-agents`, changeFrequency: 'weekly', priority: 0.9 },
    ...source.getPages().map(page => ({
      url: `${SITE_URL}${page.url}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}
