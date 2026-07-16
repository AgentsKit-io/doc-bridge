import type { Metadata, Viewport } from 'next'
import { RootProvider } from 'fumadocs-ui/provider'
import './globals.css'
import { ChatLauncher } from '@/components/chat-launcher'
import { EcosystemBar } from '@/components/ecosystem'
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
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentsKit Doc Bridge',
    description: 'One repository, two audiences, zero duplicated truth.',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = { colorScheme: 'light dark', themeColor: '#111714' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider search={{ enabled: false }}>
          <EcosystemBar />
          {children}
          <ChatLauncher />
        </RootProvider>
      </body>
    </html>
  )
}
