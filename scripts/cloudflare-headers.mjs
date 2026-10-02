#!/usr/bin/env node
// Writes Cloudflare `_headers` into the static export, mirroring the `headers` of vercel.json,
// so both hosts serve the same security headers. Runs only for the Cloudflare deploy (cf:deploy);
// the Vercel build output is unchanged.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
const out = vercel.outputDirectory ?? 'apps/docs/out'
const toPattern = (source) => (source === '/(.*)' ? '/*' : source.replace(/\(\.\*\)/g, '*'))
// Vercel also sends HSTS on every response; keep it on Cloudflare (custom domain is HTTPS-only).
const HSTS = { key: 'Strict-Transport-Security', value: 'max-age=63072000' }
const blocks = (vercel.headers ?? []).map(({ source, headers }) =>
  [toPattern(source), ...[...headers, ...(source === '/(.*)' ? [HSTS] : [])].map(({ key, value }) => `  ${key}: ${value}`)].join('\n'))
writeFileSync(join(out, '_headers'), `${blocks.join('\n\n')}\n`)
console.log(`wrote ${join(out, '_headers')} (${blocks.length} rule${blocks.length === 1 ? '' : 's'})`)
