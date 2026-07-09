import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { slugFromPath } from '../lib/markdown.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import {
  retrieveDocBridgeChunks,
  type DocBridgeRetrievedChunk,
} from '../retriever/doc-bridge-retriever.js'

export type FetchText = (url: string) => Promise<string>

export type FederatedRetrieverOptions = {
  readonly fetchText?: FetchText
  readonly limit?: number
}

const tokenize = (value: string): string[] =>
  value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 2)

const scoreText = (query: string, text: string): number => {
  const hay = text.toLowerCase()
  return tokenize(query).reduce((score, token) => score + (hay.includes(token) ? token.length : 0), 0)
}

const defaultFetchText: FetchText = async (url) => {
  const signal = AbortSignal.timeout(5_000)
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.text()
}

const sourceText = async (
  root: string,
  source: string,
  fetchText: FetchText,
): Promise<string | null> => {
  try {
    if (/^https?:\/\//.test(source)) return await fetchText(source)
    const path = resolve(root, source)
    if (!existsSync(path)) return null
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const sameOrigin = (base: string, target: string): boolean => {
  if (!/^https?:\/\//.test(base) || !/^https?:\/\//.test(target)) return true
  return new URL(base).origin === new URL(target).origin
}

export const parseLlmsTxtLinks = (raw: string): { title: string; url: string; description?: string }[] => {
  const links = [...raw.matchAll(/\[([^\]]+)\]\(([^)]+)\)(?::\s*([^\n]+))?/g)].map((match) => ({
    title: match[1] ?? match[2] ?? 'link',
    url: match[2] ?? '',
    ...(match[3]?.trim() ? { description: match[3].trim() } : {}),
  })).filter((link) => link.url)

  for (const match of raw.matchAll(/(?:^|\s)(?:Raw|llms\.txt|Full bundle|ZIP bundle)?:?\s*(https?:\/\/\S+)/gi)) {
    const url = match[1]?.replace(/[),.;]+$/, '')
    if (url && !links.some((link) => link.url === url)) links.push({ title: slugFromPath(url), url })
  }
  return links
}

export const chunksFromMarkdown = (
  property: string,
  raw: string,
  sourceUrl: string,
): DocBridgeRetrievedChunk[] => {
  const searchable = raw.includes('\n==== ') ? raw : raw.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const sections = searchable.includes('\n==== ')
    ? searchable.split(/\n====\s+/).filter((section) => section.trim())
    : searchable.split(/\n(?=##?\s+)/)
  return sections.map((section, index) => {
    const title =
      /^title:\s*(.+)$/m.exec(section)?.[1]?.trim() ??
      /^https?:\/\/\S+\/([^/\s]+)$/m.exec(section)?.[1]?.trim() ??
      /^#+\s+(.+)$/m.exec(section)?.[1]?.trim() ??
      slugFromPath(sourceUrl)
    const id = slugFromPath(title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || `${index}`
    return {
      chunkKey: `${property}:federated:${id}`,
      property,
      type: 'federated',
      id,
      path: sourceUrl,
      title,
      summary: section.trim().slice(0, 500),
      score: 0,
    }
  })
}

export const loadFederatedChunks = async (
  root: string,
  config: DocBridgeConfigV1,
  options: FederatedRetrieverOptions = {},
): Promise<DocBridgeRetrievedChunk[]> => {
  const fetchText = options.fetchText ?? defaultFetchText
  const chunks: DocBridgeRetrievedChunk[] = []
  const warnings: string[] = []
  for (const source of config.federation?.sources ?? []) {
    if (source.includeInRetriever === false || !source.llmsTxt) continue
    const llms = await sourceText(root, source.llmsTxt, fetchText)
    if (!llms) {
      warnings.push(`federation source skipped (unavailable): ${source.id} → ${source.llmsTxt}`)
      continue
    }
    chunks.push(...chunksFromMarkdown(source.id, llms, source.llmsTxt))
    const links = parseLlmsTxtLinks(llms)
    for (const link of links) {
      const url = !/^https?:\/\//.test(link.url) && source.rawBaseUrl
        ? `${source.rawBaseUrl.replace(/\/$/, '')}/${link.url.replace(/^\//, '')}`
        : link.url
      if (!/\.(md|txt)(?:$|\?)/.test(url)) continue
      if (!sameOrigin(source.llmsTxt, url)) continue
      const raw = await sourceText(root, url, fetchText)
      if (raw) chunks.push(...chunksFromMarkdown(source.id, raw, url))
    }
  }
  // Soft-fail: never throw for missing remote sources; one-line warn for agents/humans.
  if (warnings.length && process.stderr.isTTY) {
    for (const w of warnings) process.stderr.write(`${w}\n`)
  }
  return chunks
}

export const retrieveHybridChunks = async (
  root: string,
  config: DocBridgeConfigV1,
  index: DocBridgeIndexV1,
  query: string,
  options: FederatedRetrieverOptions = {},
): Promise<DocBridgeRetrievedChunk[]> => {
  const limit = options.limit ?? 8
  const local = retrieveDocBridgeChunks(index, query, {
    property: config.project?.name ?? index.project?.name ?? 'local',
    limit,
  })
  const federated = (await loadFederatedChunks(root, config, options)).map((chunk) => ({
    ...chunk,
    score: scoreText(query, `${chunk.title ?? ''} ${chunk.summary ?? ''} ${chunk.path}`),
  })).filter((chunk) => chunk.score > 0)

  const byKey = new Map<string, DocBridgeRetrievedChunk>()
  for (const chunk of [...local, ...federated]) {
    const existing = byKey.get(chunk.chunkKey)
    if (!existing || chunk.score > existing.score) byKey.set(chunk.chunkKey, chunk)
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}
