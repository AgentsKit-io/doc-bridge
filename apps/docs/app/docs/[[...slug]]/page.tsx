import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page'
import { source } from '@/lib/source'

type Props = { params: Promise<{ slug?: string[] }> }
const siteUrl = 'https://agentskit-io.github.io/doc-bridge'
const basePath = process.env.GITHUB_ACTIONS === 'true' ? '/doc-bridge' : ''

export default async function Page({ params }: Props) {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) notFound()
  const MDX = page.data.body
  const rawPath = `${basePath}/raw/${page.file.path}`

  return (
    <DocsPage toc={page.data.toc} editOnGithub={{ owner: 'AgentsKit-io', repo: 'doc-bridge', sha: 'master', path: `docs/${page.file.path}` }}>
      <DocsTitle>{page.data.title}</DocsTitle>
      {page.data.description ? <DocsDescription>{page.data.description}</DocsDescription> : null}
      <p className="mb-6 text-sm"><a href={rawPath}>View raw Markdown</a> · <a href={`${basePath}/llms.txt`}>llms.txt</a></p>
      <DocsBody><MDX /></DocsBody>
    </DocsPage>
  )
}

export function generateStaticParams() { return source.generateParams() }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) return {}
  const path = slug?.join('/') ?? ''
  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: `${siteUrl}/docs/${path}/` },
    openGraph: { title: page.data.title, description: page.data.description, type: 'article', url: `${siteUrl}/docs/${path}/` },
  }
}
