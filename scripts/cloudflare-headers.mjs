#!/usr/bin/env node
// Writes the Cloudflare `_headers` file into the static export: one rule that applies the
// security headers to every path. Runs for the Cloudflare deploy (cf:deploy).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = 'apps/docs/out'
const headers = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // HSTS on every response (custom domain is HTTPS-only).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
]
const blocks = [['/*', ...headers.map(({ key, value }) => `  ${key}: ${value}`)].join('\n')]
writeFileSync(join(out, '_headers'), `${blocks.join('\n\n')}\n`)
console.log(`wrote ${join(out, '_headers')} (${blocks.length} rule${blocks.length === 1 ? '' : 's'})`)
