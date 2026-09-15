import { createHash } from 'node:crypto'

/**
 * The marker every generated region carries.
 *
 * `<!-- doc-bridge:generated hash=… -->` … `<!-- /doc-bridge:generated -->` is what the Markdown
 * analyzer already recognises (`src/discovery/markdown.ts`): it skips mentions inside the region,
 * so Doc Bridge never reads its own output back in as evidence about the repository. The hash is
 * over the region's body, which is what lets the documentation audit tell a regenerated region
 * from one a person edited by hand: recompute the hash, compare it with the marker.
 */

export const GENERATED_REGION_HASH_LENGTH = 16

export const GENERATED_REGION_CLOSE = '<!-- /doc-bridge:generated -->'

export const generatedRegionOpen = (hash: string): string => `<!-- doc-bridge:generated hash=${hash} -->`

/**
 * The hash of a region body. Line endings are normalised first: an editor that converts a file
 * to CRLF has not changed what the generator wrote.
 */
export const generatedRegionHash = (body: string): string =>
  createHash('sha256').update(body.replace(/\r\n/g, '\n'), 'utf8').digest('hex').slice(0, GENERATED_REGION_HASH_LENGTH)

/** Wrap a body in markers. The body is stripped of surrounding blank lines so the hash covers exactly the lines between the markers. */
export const wrapGeneratedRegion = (body: string): string => {
  const inner = body.replace(/^\n+/, '').replace(/\n+$/, '')
  return `${generatedRegionOpen(generatedRegionHash(inner))}\n${inner}\n${GENERATED_REGION_CLOSE}\n`
}

export type GeneratedRegionRef = {
  readonly lineStart: number
  readonly lineEnd: number
  readonly hash?: string | undefined
}

export type GeneratedRegionMismatch = {
  readonly lineStart: number
  readonly lineEnd: number
  readonly expected: string
  readonly actual: string
}

/**
 * Which regions of a document no longer hash to what their marker claims.
 *
 * The regions come from the analyzer, which is the one detector of markers; this only recomputes
 * the hash of the lines strictly between the opening and closing marker lines. A region whose
 * marker carries no hash was written by an older generator and cannot be verified, so it is not
 * reported.
 */
export const verifyGeneratedRegions = (content: string, regions: readonly GeneratedRegionRef[]): GeneratedRegionMismatch[] => {
  const lines = content.replace(/^﻿/, '').split(/\r?\n/)
  const mismatches: GeneratedRegionMismatch[] = []
  for (const region of regions) {
    if (!region.hash) continue
    const body = lines.slice(region.lineStart, Math.max(region.lineStart, region.lineEnd - 1)).join('\n')
    const actual = generatedRegionHash(body)
    if (actual !== region.hash) mismatches.push({ lineStart: region.lineStart, lineEnd: region.lineEnd, expected: region.hash, actual })
  }
  return mismatches
}
