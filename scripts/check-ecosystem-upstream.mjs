#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const metadata = JSON.parse(readFileSync(join(root, 'ecosystem-upstream.json'), 'utf8'))
if (
  metadata.schemaVersion !== 1 ||
  typeof metadata.repository !== 'string' ||
  !/^[^/]+\/[^/]+$/.test(metadata.repository) ||
  typeof metadata.ref !== 'string'
) {
  throw new Error('Invalid ecosystem-upstream.json metadata.')
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const requiredFiles = ['ecosystem.json', 'ecosystem-claims.json']
if (
  !metadata.files ||
  Object.keys(metadata.files).length !== requiredFiles.length ||
  requiredFiles.some((file) => !/^[a-f0-9]{64}$/.test(metadata.files[file] ?? ''))
) {
  throw new Error('Upstream metadata must contain SHA-256 digests for both canonical files.')
}

const fetchText = async (url, apiUrl) => {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'doc-bridge-ecosystem-check' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
    }
  }
  try {
    const response = await fetch(apiUrl, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'doc-bridge-ecosystem-check',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    if (payload?.encoding !== 'base64' || typeof payload.content !== 'string') {
      throw new Error('GitHub API response did not contain a base64 file.')
    }
    return Buffer.from(payload.content.replace(/\s+/g, ''), 'base64').toString('utf8')
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error)
    const primary = lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(`Unable to verify ${url}: ${primary}; API fallback: ${fallback}`)
  }
}

for (const file of requiredFiles) {
  const expectedDigest = metadata.files[file]
  const local = readFileSync(join(root, file), 'utf8')
  const localDigest = sha256(local)
  if (localDigest !== expectedDigest) {
    throw new Error(`${file} differs from its recorded upstream SHA-256 digest.`)
  }
  const url = new URL(`https://raw.githubusercontent.com/${metadata.repository}/${metadata.ref}/${file}`)
  if (url.hostname !== 'raw.githubusercontent.com') throw new Error('Unexpected upstream host.')
  const apiUrl = new URL(`https://api.github.com/repos/${metadata.repository}/contents/${file}`)
  apiUrl.searchParams.set('ref', metadata.ref)
  const upstream = await fetchText(url.href, apiUrl.href)
  if (sha256(upstream) !== expectedDigest || upstream !== local) {
    throw new Error(`${file} is stale against ${metadata.repository}@${metadata.ref}. Sync the canonical snapshot and digest.`)
  }
  process.stdout.write(`ecosystem upstream parity: ${file}\n`)
}
