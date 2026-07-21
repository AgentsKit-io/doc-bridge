import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { RootProvider } from 'fumadocs-ui/provider'
import './globals.css'
import { ChatLauncher } from '@/components/chat-launcher'
import { SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Doc Bridge — one repository, two audiences',
    template: '%s · Doc Bridge',
  },
  description:
    'Deterministic documentation handoffs for humans and coding agents — MCP, gates, memory promotion, and optional AgentsKit chat.',
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    type: 'website',
    siteName: 'AgentsKit Doc Bridge',
    title: 'Doc Bridge',
    description: 'Turn repository documentation into deterministic human↔agent handoffs.',
    url: SITE_URL,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Doc Bridge — one repository, two audiences' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentsKit Doc Bridge',
    description: 'One repository, two audiences, zero duplicated truth.',
    images: ['/opengraph-image'],
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = { colorScheme: 'light dark', themeColor: '#111714' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script src="https://www.agentskit.io/ecosystem-bar.js" strategy="afterInteractive" data-current="doc-bridge" />
        <RootProvider search={{ enabled: true, options: { type: 'static', api: `${basePath}/api/search/` } }}>
          {children}
          <ChatLauncher />
        </RootProvider>
      </body>
    </html>
  )
}
