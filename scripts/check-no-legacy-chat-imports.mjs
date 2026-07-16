#!/usr/bin/env node
/**
 * Guard against regressing to AgentsKit Chat 0.2 package names.
 *
 * Doc Bridge dogfoods the consolidated 0.4.x surface:
 *   @agentskit/chat
 *   @agentskit/chat/protocol
 *   @agentskit/chat/react
 *
 * Legacy packages must not reappear as runtime imports or declared dependencies.
 * Prose may mention the migration history; this check targets code + lockfile usage.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const thisScript = relative(root, fileURLToPath(import.meta.url)).split(sep).join('/')

const LEGACY = ['@agentskit/chat-protocol', '@agentskit/chat-react']

const SKIP_DIR_NAMES = new Set([
  '.git',
  '.next',
  'node_modules',
  'coverage',
  'dist',
  'out',
  'playwright-report',
  'test-results',
  '.lighthouseci',
  '.doc-bridge',
])

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
])

/** Import / dependency declaration patterns (not free-form prose). */
const usagePatterns = (pkg) => {
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [
    new RegExp(`from\\s+['"]${escaped}['"]`),
    new RegExp(`import\\s*\\(\\s*['"]${escaped}['"]\\s*\\)`),
    new RegExp(`require\\s*\\(\\s*['"]${escaped}['"]\\s*\\)`),
    new RegExp(`['"]${escaped}['"]\\s*:`),
    new RegExp(`(?:^|[\\s"'])${escaped}(?:@|/|"|'|\\s|$)`),
  ]
}

function walk(directory, out = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue
    if (entry.name.startsWith('.') && entry.name !== '.github' && entry.isDirectory()) continue
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
      continue
    }
    if (!entry.isFile()) continue
    const rel = relative(root, full).split(sep).join('/')
    if (rel === thisScript) continue
    if (rel === 'pnpm-lock.yaml' || rel.endsWith('/package.json') || rel === 'package.json') {
      out.push(full)
      continue
    }
    const dot = entry.name.lastIndexOf('.')
    if (dot >= 0 && CODE_EXTENSIONS.has(entry.name.slice(dot))) out.push(full)
  }
  return out
}

const hits = []
for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(root, file).split(sep).join('/')
  const isLockfile = rel === 'pnpm-lock.yaml'
  for (const legacy of LEGACY) {
    const patterns = isLockfile
      ? [new RegExp(legacy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))]
      : usagePatterns(legacy)
    const lines = text.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (patterns.some((pattern) => pattern.test(line))) {
        hits.push({
          file: rel,
          line: index + 1,
          legacy,
          text: line.trim().slice(0, 200),
        })
      }
    })
  }
}

if (hits.length > 0) {
  process.stderr.write(
    `Legacy AgentsKit Chat 0.2 imports/package names found (${hits.length}):\n` +
      'Use @agentskit/chat, @agentskit/chat/protocol, and @agentskit/chat/react instead.\n\n',
  )
  for (const hit of hits) {
    process.stderr.write(`${hit.file}:${hit.line}: ${hit.legacy}\n  ${hit.text}\n`)
  }
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const allDeps = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
  ...(pkg.peerDependencies ?? {}),
  ...(pkg.optionalDependencies ?? {}),
}
for (const legacy of LEGACY) {
  if (legacy in allDeps) {
    process.stderr.write(`package.json still declares ${legacy}\n`)
    process.exit(1)
  }
}
if (!('@agentskit/chat' in allDeps)) {
  process.stderr.write('package.json must keep @agentskit/chat as the consolidated package.\n')
  process.exit(1)
}

process.stdout.write(
  'check-no-legacy-chat-imports: ok (no @agentskit/chat-protocol or @agentskit/chat-react)\n',
)
