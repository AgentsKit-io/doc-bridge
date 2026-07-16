import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DocsBody, DocsDescription, DocsPage } from 'fumadocs-ui/page'
import { EcosystemPeers } from '@/components/ecosystem'
import { source } from '@/lib/source'
import { BASE_PATH, SITE_URL } from '@/lib/site'

type Props = { params: Promise<{ slug?: string[] }> }

export default async function Page({ params }: Props) {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) notFound()
  const MDX = page.data.body
  const rawPath = `${BASE_PATH}/raw/${page.file.path}`

  return (
    <DocsPage
      toc={page.data.toc}
      editOnGithub={{
        owner: 'AgentsKit-io',
        repo: 'doc-bridge',
        sha: 'master',
        path: `docs/${page.file.path}`,
      }}
    >
      {page.data.description ? <DocsDescription>{page.data.description}</DocsDescription> : null}
      <p className="mb-6 text-sm text-fd-muted-foreground">
        <a href={rawPath}>View raw Markdown</a>
        {' · '}
        <a href={`${BASE_PATH}/llms.txt`}>llms.txt</a>
        {' · '}
        <a href={`${BASE_PATH}/for-agents`}>For agents</a>
      </p>
      <DocsBody>
        <MDX />
      </DocsBody>
      <EcosystemPeers compact />
    </DocsPage>
  )
}

export function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) return {}
  const path = slug?.join('/') ?? ''
  const url = path ? `${SITE_URL}/docs/${path}/` : `${SITE_URL}/docs/`
  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: url },
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      type: 'article',
      url,
    },
  }
}
