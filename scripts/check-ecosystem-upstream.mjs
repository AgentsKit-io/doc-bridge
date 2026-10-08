#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const requiredFiles = ['ecosystem.json', 'ecosystem-claims.json']

const fetchText = async (url, apiUrl, fetchImpl) => {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { 'user-agent': 'doc-bridge-ecosystem-check' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error
    }
  }
  try {
    const response = await fetchImpl(apiUrl, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'doc-bridge-ecosystem-check',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (url === apiUrl) return Buffer.from(await response.arrayBuffer())
    const payload = await response.json()
    if (payload?.encoding !== 'base64' || typeof payload.content !== 'string') {
      throw new Error('GitHub API response did not contain a base64 file.')
    }
    return Buffer.from(payload.content.replace(/\s+/g, ''), 'base64')
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error)
    const primary = lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(`Unable to verify ${url}: ${primary}; API fallback: ${fallback}`)
  }
}

export async function checkEcosystemUpstream({ directory = root, fetchImpl = fetch, sync = false, againstUpstreamHead = false } = {}) {
  const metadata = JSON.parse(readFileSync(join(directory, 'ecosystem-upstream.json'), 'utf8'))
  if (metadata.schemaVersion !== 1 || typeof metadata.repository !== 'string' ||
      !/^[^/]+\/[^/]+$/.test(metadata.repository) || typeof metadata.ref !== 'string' ||
      (!sync && !againstUpstreamHead && !/^[a-f0-9]{40}$/.test(metadata.ref))) {
    throw new Error('Invalid ecosystem-upstream.json metadata: pinned ref must be a full 40-character commit SHA.')
  }
  if (!metadata.files || Object.keys(metadata.files).length !== requiredFiles.length ||
      requiredFiles.some((file) => !/^[a-f0-9]{64}$/.test(metadata.files[file] ?? ''))) {
    throw new Error('Upstream metadata must contain SHA-256 digests for both canonical files.')
  }
  let ref = metadata.ref
  if (sync || againstUpstreamHead) {
    const url = `https://api.github.com/repos/${metadata.repository}/commits/main`
    const head = JSON.parse((await fetchText(url, url, fetchImpl)).toString('utf8'))
    if (!/^[a-f0-9]{40}$/.test(head.sha ?? '')) throw new Error('Invalid upstream main commit SHA.')
    ref = head.sha
  }
  const snapshots = new Map()
  for (const file of requiredFiles) {
    const local = readFileSync(join(directory, file))
    const expectedDigest = metadata.files[file]
    if (!sync && sha256(local) !== expectedDigest) {
      throw new Error(`${file} differs from its recorded upstream SHA-256 digest.`)
    }
    const url = new URL(`https://raw.githubusercontent.com/${metadata.repository}/${ref}/${file}`)
    const apiUrl = new URL(`https://api.github.com/repos/${metadata.repository}/contents/${file}`)
    apiUrl.searchParams.set('ref', ref)
    const upstream = await fetchText(url.href, apiUrl.href, fetchImpl)
    if (!sync && (sha256(upstream) !== expectedDigest || !upstream.equals(local))) {
      throw new Error(`${file} is stale against ${metadata.repository}@${ref}. Run pnpm sync:ecosystem-upstream.`)
    }
    snapshots.set(file, upstream)
  }
  if (sync) {
    // Fetch both files successfully before changing the canonical snapshot.
    for (const [file, content] of snapshots) {
      writeFileSync(join(directory, file), content)
      metadata.files[file] = sha256(content)
    }
    metadata.ref = ref
    writeFileSync(join(directory, 'ecosystem-upstream.json'), `${JSON.stringify(metadata, null, 2)}\n`)
  }
  for (const file of requiredFiles) process.stdout.write(`ecosystem upstream ${sync ? 'sync' : 'parity'}: ${file}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.some((arg) => !['--sync', '--against-upstream-head'].includes(arg))) throw new Error('Unknown ecosystem check argument.')
  await checkEcosystemUpstream({ sync: args.includes('--sync'), againstUpstreamHead: args.includes('--against-upstream-head') })
}
