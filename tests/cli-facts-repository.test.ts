import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { FACT_EXTRACTORS, type FactExtractor } from '../src/discovery/facts/index.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { loadConfig } from '../src/config/load-config.js'
import { parseRetrievalSuite, runRetrievalBench } from '../src/bench/retrieval.js'
import { searchIndex } from '../src/query/search.js'

it('dogfoods CLI facts without changing legacy JS/TS extraction or retrieval ranking', () => {
  const root = resolve('.')
  const { config } = loadConfig({ cwd: root })
  const registry = FACT_EXTRACTORS as FactExtractor[]
  const saved = [...registry]
  let baseline
  try {
    registry.splice(0)
    baseline = discoverRepository({ root, config })
  } finally { registry.push(...saved) }
  const head = discoverRepository({ root, config })
  const legacy = (snapshot: typeof head) => ({
    entities: snapshot.entities.filter(entity => entity.kind === 'module' || entity.kind === 'package' || entity.kind === 'area'),
    relations: snapshot.relations.filter(relation => !relation.metadata?.factKind),
    coverage: snapshot.coverage.filter(entry => entry.analyzer === 'js-ts'),
  })
  expect(legacy(head)).toEqual(legacy(baseline))
  const before = buildDocBridgeIndex({ root, config, write: false, snapshot: baseline, overlay: 'ignore' }).index
  const after = buildDocBridgeIndex({ root, config, write: false, snapshot: head, overlay: 'ignore' }).index
  const suite = parseRetrievalSuite(JSON.parse(readFileSync(resolve('docs/bench/retrieval-suite-v1.json'), 'utf8')))
  const oldBench = runRetrievalBench({ index: before, suite })
  const newBench = runRetrievalBench({ index: after, suite })
  const cli = head.entities.filter(entity => entity.kind === 'cli-command' || entity.kind === 'cli-flag')
  const caps = (snapshot: typeof head) => snapshot.entities.filter(entity => entity.kind === 'document' && entity.metadata?.evidenceTruncated).length
  console.log(JSON.stringify({ cliFacts: cli.length, commands: cli.filter(entity => entity.kind === 'cli-command').length, flags: cli.filter(entity => entity.kind === 'cli-flag').length, newDocumentationRelations: head.relations.filter(relation => relation.metadata?.factKind === 'cli-command' || relation.metadata?.factKind === 'cli-flag').length, relationCapsBefore: caps(baseline), relationCapsAfter: caps(head), metricsBefore: oldBench.metrics, metricsAfter: newBench.metrics }))
  expect(cli.length).toBeGreaterThan(0)
  expect(newBench.metrics).toEqual(oldBench.metrics)
  expect(newBench.cases).toEqual(oldBench.cases)
  for (const entry of suite.cases) expect(searchIndex(after, entry.input)).toEqual(searchIndex(before, entry.input))
}, 60_000)
