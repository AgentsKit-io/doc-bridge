import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { source } from '@/lib/source'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{ title: 'Doc Bridge', url: '/' }}
      links={[
        { text: 'AgentsKit', url: 'https://www.agentskit.io', external: true },
        { text: 'Registry', url: 'https://registry.agentskit.io', external: true },
        { text: 'Playbook', url: 'https://playbook.agentskit.io', external: true },
        { text: 'GitHub', url: 'https://github.com/AgentsKit-io/doc-bridge', external: true },
      ]}
    >{children}</DocsLayout>
  )
}
