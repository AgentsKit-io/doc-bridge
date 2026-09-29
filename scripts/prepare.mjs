#!/usr/bin/env node
/**
 * Ensure dist/ exists for git installs and local clones.
 * Published npm tarballs already include dist/ — this is a no-op then.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { moduleDir, spawnProcess } from '@agentskit/cross-platform'

const root = join(moduleDir(import.meta.url), '..')
const marker = join(root, 'dist', 'cli', 'program.js')

if (existsSync(marker)) {
  process.exit(0)
}

const attempts = [
  ['pnpm', ['exec', 'tsup']],
  ['npx', ['--yes', 'tsup@8.5.1']],
  ['npm', ['exec', '--', 'tsup']],
]

let ok = false
for (const [cmd, args] of attempts) {
  // Resolves the pnpm/npx/npm .cmd shims on Windows without a shell.
  const status = await spawnProcess(cmd, args, {
    cwd: root,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  }).exited.catch(() => ({ code: null }))
  if (status.code === 0 && existsSync(marker)) {
    ok = true
    break
  }
}

if (!ok) {
  process.stderr.write(
    '[@agentskit/doc-bridge] prepare: could not build dist/. Run: pnpm build (or npm run build)\n',
  )
  // Don't fail install of dependents hard when used as file: link with prebuilt dist elsewhere
  process.exit(0)
}
