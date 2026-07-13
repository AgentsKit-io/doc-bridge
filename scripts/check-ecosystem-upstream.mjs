#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const metadata = JSON.parse(readFileSync(join(root, 'ecosystem-upstream.json'), 'utf8'))
if (metadata.schemaVersion !== 1 || typeof metadata.repository !== 'string' || typeof metadata.ref !== 'string') {
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

const fetchText = async (url) => {
  let lastError
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`Unable to verify ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

for (const file of requiredFiles) {
  const expectedDigest = metadata.files[file]
  const local = readFileSync(join(root, file), 'utf8')
  const localDigest = sha256(local)
  if (localDigest !== expectedDigest) {
    throw new Error(`${file} differs from its recorded upstream SHA-256 digest.`)
  }
  const url = `https://raw.githubusercontent.com/${metadata.repository}/${metadata.ref}/${file}`
  const upstream = await fetchText(url)
  if (sha256(upstream) !== expectedDigest || upstream !== local) {
    throw new Error(`${file} is stale against ${metadata.repository}@${metadata.ref}. Sync the canonical snapshot and digest.`)
  }
  process.stdout.write(`ecosystem upstream parity: ${file}\n`)
}
