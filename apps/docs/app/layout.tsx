import type { Metadata, Viewport } from 'next'
import { RootProvider } from 'fumadocs-ui/provider'
import './globals.css'
import { ChatLauncher } from '@/components/chat-launcher'
import { EcosystemBar } from '@/components/ecosystem'

const siteUrl = 'https://agentskit-io.github.io/doc-bridge'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Doc Bridge — one repository, two audiences', template: '%s · Doc Bridge' },
  description: 'Deterministic documentation handoffs for humans and coding agents, with MCP, gates, memory promotion, and optional AgentsKit chat.',
  alternates: { canonical: `${siteUrl}/` },
  openGraph: { type: 'website', siteName: 'AgentsKit Doc Bridge', title: 'Doc Bridge', description: 'Turn repository documentation into deterministic human↔agent handoffs.', url: siteUrl },
  twitter: { card: 'summary_large_image', title: 'AgentsKit Doc Bridge', description: 'One repository, two audiences, zero duplicated truth.' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = { colorScheme: 'light dark', themeColor: '#111714' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><RootProvider search={{ enabled: false }}><EcosystemBar />{children}<ChatLauncher /></RootProvider></body>
    </html>
  )
}
