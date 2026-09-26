import type { Metadata, Viewport } from 'next'
import { RootProvider } from 'fumadocs-ui/provider/next'
import './globals.css'
import { ChatLauncher } from '@/components/chat-launcher'
import { inter, spaceGrotesk } from '@/lib/fonts'
import { SHELL_CSS_URL, SHELL_JS_URL, SHELL_ORIGIN, PRODUCT_ID, PRODUCT_REPO } from '@/lib/shell'
import { SITE_URL } from '@/lib/site'
import { serializedDocBridgeStructuredData } from '@/lib/structured-data'
import { AccessibleSearch } from '@/components/accessible-search'

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
    <html lang="en" className={`ak-self-fonts ${inter.variable} ${spaceGrotesk.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Open the shell connection before the render-blocking stylesheet is discovered. */}
        <link rel="preconnect" href={SHELL_ORIGIN} />
        <link rel="stylesheet" href={SHELL_CSS_URL} />
        <script src={SHELL_JS_URL} data-current={PRODUCT_ID} data-current-repo={PRODUCT_REPO} data-ak-fonts="self" defer />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedDocBridgeStructuredData }}
        />
      </head>
      <body>
        <RootProvider theme={{ defaultTheme: 'dark' }} search={{ enabled: true, preload: false, options: { type: 'static', api: `${basePath}/api/search/` } }}>
          <AccessibleSearch />
          {children}
          <ChatLauncher />
        </RootProvider>
      </body>
    </html>
  )
}
