import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { runGate } from '../src/gates/run-gates.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { discoverNxProjects } from '../src/index-builder/plugins/nx.js'

const nxConfig = () =>
  applyConfigDefaults(
    DocBridgeConfigV1Schema.parse({
      schemaVersion: 1,
      corpus: { agent: { root: 'docs/for-agents' } },
      routing: { plugin: 'nx' },
      gates: { preset: 'standard' },
    }),
  )

const createWorkspace = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'ak-docs-nx-'))
  mkdirSync(join(root, 'docs/for-agents/packages'), { recursive: true })
  writeFileSync(join(root, 'docs/for-agents/INDEX.md'), '# Agent docs\n')
  writeFileSync(join(root, 'nx.json'), JSON.stringify({ targetDefaults: {} }))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.0.0' }))
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  return root
}

describe('Nx routing plugin', () => {
  it('discovers project.json and package.json Nx projects deterministically', () => {
    const root = createWorkspace()
    mkdirSync(join(root, 'apps/store'), { recursive: true })
    mkdirSync(join(root, 'libs/data'), { recursive: true })
    writeFileSync(
      join(root, 'apps/store/project.json'),
      JSON.stringify({ name: 'store', targets: { lint: {} } }),
    )
    writeFileSync(
      join(root, 'apps/store/package.json'),
      JSON.stringify({ name: 'store', nx: { targets: { test: {} } } }),
    )
    writeFileSync(
      join(root, 'libs/data/package.json'),
      JSON.stringify({ name: '@acme/data', nx: { targets: { test: {} } } }),
    )

    expect(discoverNxProjects(root, nxConfig())).toEqual([
      {
        id: 'data',
        name: '@acme/data',
        path: 'libs/data',
        checks: ['pnpm exec nx run @acme/data:test'],
      },
      {
        id: 'store',
        name: 'store',
        path: 'apps/store',
        checks: ['pnpm exec nx run store:test', 'pnpm exec nx run store:lint'],
      },
    ])
  })

  it('fails clearly when scoped Nx names collapse to the same Doc Bridge id', () => {
    const root = createWorkspace()
    mkdirSync(join(root, 'libs/team-a-utils'), { recursive: true })
    mkdirSync(join(root, 'libs/team-b-utils'), { recursive: true })
    writeFileSync(
      join(root, 'libs/team-a-utils/package.json'),
      JSON.stringify({ name: '@team-a/utils', nx: { targets: { test: {} } } }),
    )
    writeFileSync(
      join(root, 'libs/team-b-utils/package.json'),
      JSON.stringify({ name: '@team-b/utils', nx: { targets: { test: {} } } }),
    )

    expect(() => discoverNxProjects(root, nxConfig())).toThrow(
      /Nx project identity collision for "utils".*@team-a\/utils.*@team-b\/utils/,
    )
  })

  it('keeps the package name when a sibling project.json omits name', () => {
    const root = createWorkspace()
    mkdirSync(join(root, 'apps/store'), { recursive: true })
    writeFileSync(
      join(root, 'apps/store/package.json'),
      JSON.stringify({ name: '@acme/store', nx: { targets: { test: {} } } }),
    )
    writeFileSync(
      join(root, 'apps/store/project.json'),
      JSON.stringify({ targets: { lint: {} } }),
    )

    expect(discoverNxProjects(root, nxConfig())).toEqual([
      {
        id: 'store',
        name: '@acme/store',
        path: 'apps/store',
        checks: [
          'pnpm exec nx run @acme/store:test',
          'pnpm exec nx run @acme/store:lint',
        ],
      },
    ])
  })

  it('uses project.json identity for equivalent names on the same path', () => {
    const root = createWorkspace()
    mkdirSync(join(root, 'apps/store'), { recursive: true })
    writeFileSync(
      join(root, 'apps/store/package.json'),
      JSON.stringify({ name: '@acme/store', nx: { targets: { test: {} } } }),
    )
    writeFileSync(
      join(root, 'apps/store/project.json'),
      JSON.stringify({ name: 'store', targets: { lint: {} } }),
    )

    expect(discoverNxProjects(root, nxConfig())).toEqual([
      {
        id: 'store',
        name: 'store',
        path: 'apps/store',
        checks: ['pnpm exec nx run store:test', 'pnpm exec nx run store:lint'],
      },
    ])
  })

  it('uses a safe declared root and ignores malformed, external, and unmarked manifests', () => {
    const root = createWorkspace()
    mkdirSync(join(root, 'config'), { recursive: true })
    mkdirSync(join(root, 'services/api'), { recursive: true })
    mkdirSync(join(root, 'libs/plain'), { recursive: true })
    mkdirSync(join(root, 'libs/broken'), { recursive: true })
    mkdirSync(join(root, 'libs/lookalike'), { recursive: true })
    writeFileSync(
      join(root, 'config/project.json'),
      JSON.stringify({ name: 'api', root: 'services/api', targets: { test: {} } }),
    )
    writeFileSync(join(root, 'libs/plain/package.json'), JSON.stringify({ name: 'plain' }))
    writeFileSync(join(root, 'libs/broken/project.json'), '{broken')
    writeFileSync(
      join(root, 'libs/lookalike/not-package.json'),
      JSON.stringify({ name: 'lookalike', nx: {} }),
    )
    writeFileSync(
      join(root, 'project.json'),
      JSON.stringify({ name: 'escape', root: '../outside', targets: { test: {} } }),
    )

    expect(discoverNxProjects(root, nxConfig())).toEqual([
      {
        id: 'api',
        name: 'api',
        path: 'services/api',
        checks: ['pnpm exec nx run api:test'],
      },
    ])
  })

  it('feeds Nx ownership and checks into index freshness without overriding explicit ownership', () => {
    const root = createWorkspace()
    mkdirSync(join(root, 'apps/store'), { recursive: true })
    mkdirSync(join(root, 'custom/store'), { recursive: true })
    writeFileSync(
      join(root, 'apps/store/project.json'),
      JSON.stringify({ name: 'store', targets: { test: {}, lint: {} } }),
    )
    writeFileSync(join(root, 'docs/for-agents/packages/store.md'), '# Store\n')
    const config = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse({
        ...nxConfig(),
        routing: {
          plugin: 'nx',
          options: { ownership: { store: { path: 'custom/store', checks: ['pnpm verify:store'] } } },
        },
      }),
    )

    const result = buildDocBridgeIndex({ root, config })
    expect(result.index.lookup?.ownership?.store).toMatchObject({
      path: 'custom/store',
      checks: ['pnpm verify:store'],
    })
    expect(result.index.handoffs?.store?.editRoots).toEqual(['custom/store'])
    expect(runGate(root, config, 'index-freshness').ok).toBe(true)

    writeFileSync(
      join(root, 'apps/store/project.json'),
      JSON.stringify({ name: 'store-renamed', targets: { test: {} } }),
    )
    const stale = runGate(root, config, 'index-freshness')
    expect(stale.ok).toBe(false)
    expect(stale.message).toContain('Index is stale')
  })
})
