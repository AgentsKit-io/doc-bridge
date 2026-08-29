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

const httpUrl = (value: string): string | undefined => {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    if (parsed.username || parsed.password) return undefined
    return parsed.href
  } catch {
    return undefined
  }
}

const sourceText = async (
  root: string,
  source: string,
  fetchText: FetchText,
): Promise<string | null> => {
  try {
    const remote = httpUrl(source)
    if (remote) return await fetchText(remote)
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
  const links: { title: string; url: string; description?: string }[] = []
  for (const line of raw.split(/\r?\n/)) {
    let cursor = 0
    while (cursor < line.length) {
      const open = line.indexOf('[', cursor)
      if (open < 0) break
      const titleEnd = line.indexOf(']', open + 1)
      const urlStart = titleEnd < 0 ? -1 : line.indexOf('(', titleEnd + 1)
      const urlEnd = urlStart < 0 ? -1 : line.indexOf(')', urlStart + 1)
      if (titleEnd < 0 || urlStart !== titleEnd + 1 || urlEnd < 0) {
        cursor = open + 1
        continue
      }
      const title = line.slice(open + 1, titleEnd).trim()
      const url = line.slice(urlStart + 1, urlEnd).trim()
      const description = line.slice(urlEnd + 1).trim().replace(/^:\s*/, '')
      if (url) links.push({ title: title || url, url, ...(description ? { description } : {}) })
      cursor = urlEnd + 1
    }

    for (const token of line.split(/\s+/)) {
      let end = token.length
      while (end > 0 && '),.;:'.includes(token[end - 1] ?? '')) end -= 1
      const url = token.slice(0, end)
      if (!/^https?:\/\//i.test(url) || links.some((link) => link.url === url)) continue
      links.push({ title: slugFromPath(url), url })
    }
  }
  return links
}

const firstMatchingLine = (section: string, predicate: (line: string) => boolean): string | undefined =>
  section.split(/\r?\n/).find((line) => predicate(line.trim()))?.trim()

const sectionTitle = (section: string, sourceUrl: string): string => {
  const titleLine = firstMatchingLine(section, (line) => line.startsWith('title:'))
  if (titleLine) return titleLine.slice('title:'.length).trim()
  const urlLine = firstMatchingLine(section, (line) => /^https?:\/\//i.test(line))
  if (urlLine) {
    try {
      return new URL(urlLine).pathname.split('/').filter(Boolean).at(-1) ?? slugFromPath(sourceUrl)
    } catch {
      return slugFromPath(sourceUrl)
    }
  }
  const heading = firstMatchingLine(section, (line) => line.startsWith('#'))
  if (heading) return heading.replace(/^#+\s*/, '').trim()
  return slugFromPath(sourceUrl)
}

export const chunksFromMarkdown = (
  property: string,
  raw: string,
  sourceUrl: string,
): DocBridgeRetrievedChunk[] => {
  const frontmatterEnd = raw.startsWith('---\n') ? raw.indexOf('\n---', 4) : -1
  const searchable = raw.includes('\n==== ')
    ? raw
    : frontmatterEnd >= 0
      ? raw.slice(frontmatterEnd + '\n---'.length).replace(/^\n/, '')
      : raw
  const sections = searchable.includes('\n==== ')
    ? searchable.split(/\n====\s+/).filter((section) => section.trim())
    : searchable.split(/\n(?=##?\s+)/)
  return sections.map((section, index) => {
    const title = sectionTitle(section, sourceUrl)
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
      const linkUrl = httpUrl(link.url)
      const baseUrl = source.rawBaseUrl ? httpUrl(source.rawBaseUrl) : undefined
      const url = linkUrl ?? (baseUrl ? new URL(link.url, baseUrl).href : link.url)
      let pathname = url
      try { pathname = new URL(url).pathname } catch { /* local source */ }
      if (!/\.(md|txt)$/i.test(pathname)) continue
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
