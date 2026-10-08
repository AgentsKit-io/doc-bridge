import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkEcosystemUpstream } from './check-ecosystem-upstream.mjs'

const pinned = 'a'.repeat(40)
const head = 'b'.repeat(40)
const files = ['ecosystem.json', 'ecosystem-claims.json']
const digest = (value) => createHash('sha256').update(value).digest('hex')
function fixture(t, ref = pinned) {
  const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-ecosystem-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const content = Buffer.from('{"canonical":true}\r\n')
  const metadata = { schemaVersion: 1, repository: 'example/upstream', ref, files: {} }
  for (const file of files) {
    writeFileSync(join(directory, file), content)
    metadata.files[file] = digest(content)
  }
  writeFileSync(join(directory, 'ecosystem-upstream.json'), JSON.stringify(metadata))
  return { directory, content }
}

test('pinned verification never reads main and passes with an offline mock', async (t) => {
  const { directory, content } = fixture(t)
  const urls = []
  await checkEcosystemUpstream({ directory, fetchImpl: async (url) => {
    urls.push(url)
    assert.ok(url.includes(`/${pinned}/`))
    return new Response(content)
  } })
  assert.equal(urls.length, 2)
})

test('invalid pinned refs fail before fetching', async (t) => {
  for (const ref of ['main', 'abc123', 'a'.repeat(39), 'z'.repeat(40)]) {
    const { directory } = fixture(t, ref)
    await assert.rejects(checkEcosystemUpstream({ directory, fetchImpl: () => assert.fail('unexpected fetch') }), /40-character commit SHA/)
  }
})

test('tracking mode detects stale main content without mutating files', async (t) => {
  const { directory, content } = fixture(t)
  await assert.rejects(checkEcosystemUpstream({ directory, againstUpstreamHead: true, fetchImpl: async (url) => {
    if (url.endsWith('/commits/main')) return Response.json({ sha: head })
    assert.ok(url.includes(`/${head}/`))
    return new Response('changed')
  } }), /is stale/)
  assert.deepEqual(readFileSync(join(directory, files[0])), content)
})

test('sync copies exact bytes and digests from one resolved head', async (t) => {
  const { directory } = fixture(t)
  const content = Buffer.from('{"updated":true}\r\n')
  await checkEcosystemUpstream({ directory, sync: true, fetchImpl: async (url) => {
    if (url.endsWith('/commits/main')) return Response.json({ sha: head })
    assert.ok(url.includes(`/${head}/`))
    return new Response(content)
  } })
  const metadata = JSON.parse(readFileSync(join(directory, 'ecosystem-upstream.json')))
  assert.equal(metadata.ref, head)
  for (const file of files) {
    assert.deepEqual(readFileSync(join(directory, file)), content)
    assert.equal(metadata.files[file], digest(content))
  }
})

test('a failed fetch leaves the whole snapshot unchanged', async (t) => {
  const { directory, content } = fixture(t)
  await assert.rejects(checkEcosystemUpstream({ directory, sync: true, fetchImpl: async (url) => {
    if (url.endsWith('/commits/main')) return Response.json({ sha: head })
    if (url.endsWith('/ecosystem.json')) return new Response('changed')
    return new Response('', { status: 503 })
  } }), /Unable to verify/)
  for (const file of files) assert.deepEqual(readFileSync(join(directory, file)), content)
  assert.equal(JSON.parse(readFileSync(join(directory, 'ecosystem-upstream.json'))).ref, pinned)
})

test('sync retries the head endpoint and preserves bytes through the contents API fallback', async (t) => {
  const { directory, content } = fixture(t)
  let headAttempts = 0
  await checkEcosystemUpstream({ directory, sync: true, fetchImpl: async (url) => {
    if (url.endsWith('/commits/main')) {
      headAttempts += 1
      return headAttempts < 4 ? new Response('', { status: 503 }) : Response.json({ sha: head })
    }
    if (url.startsWith('https://raw.githubusercontent.com/')) return new Response('', { status: 503 })
    assert.ok(url.includes(`ref=${head}`))
    return Response.json({ encoding: 'base64', content: content.toString('base64') })
  } })
  assert.equal(headAttempts, 4)
  for (const file of files) assert.deepEqual(readFileSync(join(directory, file)), content)
})
