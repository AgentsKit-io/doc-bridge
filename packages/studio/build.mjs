import { build } from 'esbuild'
import { mkdir, writeFile, cp } from 'node:fs/promises'
import { spawnProcess } from '@agentskit/cross-platform'
await mkdir('dist', { recursive: true })
await build({ entryPoints: ['src/server.ts'], outfile: 'dist/server.js', platform: 'node', format: 'esm', packages: 'external' })
const status = await spawnProcess('pnpm', ['exec', 'tsc', '--emitDeclarationOnly'], { cwd: process.cwd(), stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' }).exited
if (status.code !== 0) throw new Error('Studio declaration build failed')
await build({ entryPoints: ['src/app.tsx'], outfile: 'dist/app.js', bundle: true, format: 'esm', minify: true, define: { 'process.env.NODE_ENV': '"production"' } })
await writeFile('dist/index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>doc-bridge Studio</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/app.css?token=SESSION_TOKEN"></head><body><div id="root" data-sample="SAMPLE_MODE"></div><script type="module" src="/app.js?token=SESSION_TOKEN"></script></body></html>')

await cp('../../docs/design/studio-samples', 'dist/samples', { recursive: true })
