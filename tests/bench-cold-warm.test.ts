import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { parseRetrievalSuite, runRetrievalBench } from '../src/bench/retrieval.js'

const SUITE_PATH = 'docs/bench/retrieval-suite-v1.json'

/*
 * The index build keeps module-level caches (compiled globs, fuzzy resolutions, markdown lookups).
 * They are an optimisation only: the first build in a process, with every cache empty, and a later
 * one, with them full, must rank every case identically. This file runs in its own worker, so the
 * first build here really is cold.
 */
describe('retrieval bench, cold then warm in one process', () => {
  it('ranks every case identically', () => {
    const config = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse(JSON.parse(readFileSync('doc-bridge.config.json', 'utf8')) as unknown),
    )
    const suite = parseRetrievalSuite(JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as unknown)
    const measure = () => runRetrievalBench({ index: buildDocBridgeIndex({ root: process.cwd(), config, write: false }).index, suite })

    const cold = measure()
    const warm = measure()

    expect(warm.metrics.hitAt1).toBe(cold.metrics.hitAt1)
    expect(warm.metrics.hitAt3).toBe(cold.metrics.hitAt3)
    expect(warm.cases.map((entry) => entry.id)).toEqual(cold.cases.map((entry) => entry.id))
    for (const [position, entry] of cold.cases.entries()) {
      const again = warm.cases[position]
      expect(again?.hitAt1, entry.id).toBe(entry.hitAt1)
      expect(again?.hitAt3, entry.id).toBe(entry.hitAt3)
      expect(again?.rank, entry.id).toBe(entry.rank)
      expect(again?.rankedTargets, entry.id).toEqual(entry.rankedTargets)
    }
    expect(warm.contentHash).toBe(cold.contentHash)
  }, 180_000)
})
