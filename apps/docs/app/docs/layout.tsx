import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type { ReactNode } from 'react'
import { ProductWordmark } from '@/components/product-wordmark'
import { SiteFooter } from '@/components/site-footer'
import { source } from '@/lib/source'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <DocsLayout
        tree={source.pageTree}
        nav={{ title: <ProductWordmark />, url: '/' }}
        searchToggle={{ enabled: true }}
        links={[{ text: 'For agents', url: '/for-agents' }]}
      >
        {children}
      </DocsLayout>
      <SiteFooter />
    </>
  )
}
