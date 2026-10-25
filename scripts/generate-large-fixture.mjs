#!/usr/bin/env node
// Deterministic large-repository fixture: N packages x M docs, no external inputs.
// Usage: node scripts/generate-large-fixture.mjs <outDir> [packages=100] [docsPerPackage=20]
// The same arguments always produce the same files (no clocks, no randomness).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const generateLargeFixture = (outDir, packages = 100, docsPerPackage = 20) => {
  const root = resolve(outDir)
  rmSync(root, { recursive: true, force: true })
  const write = (rel, text) => {
    const file = join(root, rel)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, text, 'utf8')
  }
  const pad = (n) => String(n).padStart(4, '0')
  write('package.json', `${JSON.stringify({ name: 'large-fixture', private: true, version: '0.0.0' }, null, 2)}\n`)
  write('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n")
  write('doc-bridge.config.json', `${JSON.stringify({
    schemaVersion: 1,
    corpus: { agent: { root: 'docs/agent-corpus', index: 'docs/agent-corpus/OVERVIEW.md' }, human: { plugin: 'plain-markdown', options: { root: 'docs', urlPrefix: '/docs' } } },
    routing: { plugin: 'pnpm-monorepo' },
  }, null, 2)}\n`)
  write('docs/agent-corpus/OVERVIEW.md', '# Overview\n\nGenerated large fixture.\n')
  for (let p = 0; p < packages; p++) {
    const name = `pkg-${pad(p)}`
    const dir = `packages/${name}`
    const deps = p > 0 ? { [`@fixture/pkg-${pad(p - 1)}`]: 'workspace:*' } : {}
    write(`${dir}/package.json`, `${JSON.stringify({ name: `@fixture/${name}`, version: '1.0.0', type: 'module', dependencies: deps }, null, 2)}\n`)
    write(`${dir}/README.md`, `# ${name}\n\nPackage ${p} of the generated fixture.\n`)
    const imports = p > 0 ? `import { value as prev } from '@fixture/pkg-${pad(p - 1)}'\n` : ''
    write(`${dir}/src/index.ts`, `${imports}export const value: number = ${p}${p > 0 ? ' + prev' : ''}\n`)
    // Eight source areas per package, two modules each, chained by relative imports.
    for (let a = 0; a < 8; a++) {
      for (let f = 0; f < 2; f++) {
        const from = f > 0 ? `import { v${a}x${f - 1} } from './m${f - 1}.js'\n` : ''
        write(`${dir}/src/area${a}/m${f}.ts`, `${from}export const v${a}x${f}: number = ${a * 2 + f}${f > 0 ? ` + v${a}x${f - 1}` : ''}\n`)
      }
    }
    for (let d = 0; d < docsPerPackage; d++) {
      const link = d > 0 ? `\nSee [previous](./doc-${pad(d - 1)}.md).\n` : ''
      write(`docs/${name}/doc-${pad(d)}.md`, `---\ntitle: ${name} guide ${d}\ncovers:\n  - ${dir}/src/index.ts\n---\n\n# ${name} guide ${d}\n\nTopic ${d} for package ${p}. Alpha${p % 7} beta${d % 5} gamma.\n${link}`)
    }
  }
  return root
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [out, n, m] = process.argv.slice(2)
  if (!out) { console.error('usage: generate-large-fixture.mjs <outDir> [packages] [docsPerPackage]'); process.exit(2) }
  console.log(generateLargeFixture(out, Number(n ?? 100), Number(m ?? 20)))
}
