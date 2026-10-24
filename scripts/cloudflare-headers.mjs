#!/usr/bin/env node
// Writes Cloudflare `_headers` into the static export so the docs site serves the security headers.
// Runs only for the Cloudflare deploy (cf:deploy).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = 'apps/docs/out'
// HSTS is sent on every response (custom domain is HTTPS-only).
const rules = [
  {
    source: '/*',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
    ],
  },
]
const blocks = rules.map(({ source, headers }) =>
  [source, ...headers.map(({ key, value }) => `  ${key}: ${value}`)].join('\n'))
writeFileSync(join(out, '_headers'), `${blocks.join('\n\n')}\n`)
console.log(`wrote ${join(out, '_headers')} (${blocks.length} rule${blocks.length === 1 ? '' : 's'})`)
