import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { containedPath, containsSecret, redactSecrets, safeWalkFiles } from '../src/safety/repository.js'
import { canCreateSymlinks } from './helpers/symlink-support.js'

const root = () => mkdtempSync(join(tmpdir(), 'doc-bridge-safety-'))

describe('repository safety primitives', () => {
  it('enforces the root boundary and skips secret/generated paths by default', () => {
    const project = root()
    mkdirSync(join(project, 'src'))
    mkdirSync(join(project, 'dist'))
    mkdirSync(join(project, '.next'))
    mkdirSync(join(project, 'out'))
    mkdirSync(join(project, '.turbo'))
    mkdirSync(join(project, '.svelte-kit'))
    writeFileSync(join(project, 'src', 'ok.ts'), 'export {}')
    writeFileSync(join(project, 'dist', 'generated.ts'), 'export {}')
    writeFileSync(join(project, '.next', 'generated.ts'), 'export {}')
    writeFileSync(join(project, 'out', 'generated.ts'), 'export {}')
    writeFileSync(join(project, '.turbo', 'cache.ts'), 'export {}')
    writeFileSync(join(project, '.svelte-kit', 'generated.ts'), 'export {}')
    writeFileSync(join(project, '.env'), 'TOKEN=hidden')
    expect(containedPath(project, 'src/ok.ts')).toBe(join(realpathSync.native(project), 'src', 'ok.ts'))
    expect(containedPath(project, '../outside.ts')).toBeUndefined()
    expect(safeWalkFiles(project, { extensions: ['.ts'] }).files).toEqual([join(project, 'src', 'ok.ts')])
  })

  it.skipIf(!canCreateSymlinks())('skips symlinks and reports explicit resource limits as incomplete', () => {
    const project = root()
    writeFileSync(join(project, 'a.ts'), 'a')
    writeFileSync(join(project, 'b.ts'), 'b')
    symlinkSync(join(project, 'a.ts'), join(project, 'link.ts'))
    const result = safeWalkFiles(project, { extensions: ['.ts'], maxFiles: 1 })
    expect(result.files).toHaveLength(1)
    expect(result.incomplete).toBe(true)
    expect(result.reason).toContain('file limit')
    expect(safeWalkFiles(project, { extensions: ['.ts'] }).files.join('\n')).not.toContain('link.ts')
  })

  it('redacts common secret-shaped values for persisted and agent-facing context', () => {
    expect(redactSecrets('token=abc123 password: super-secret sk-live_123456789012')).toBe('[REDACTED] [REDACTED] [REDACTED]')
  })

  // Fake tokens are assembled at runtime so no literal credential shape lives in the repository.
  const fake = (prefix: string, body: string, length: number) => prefix + body.repeat(Math.ceil(length / body.length)).slice(0, length)
  const families: readonly (readonly [string, string])[] = [
    ['GitHub classic ghp', fake('gh' + 'p_', 'AbC123xYz9', 36)],
    ['GitHub OAuth gho', fake('gh' + 'o_', 'AbC123xYz9', 36)],
    ['GitHub user-to-server ghu', fake('gh' + 'u_', 'AbC123xYz9', 36)],
    ['GitHub server-to-server ghs', fake('gh' + 's_', 'AbC123xYz9', 36)],
    ['GitHub refresh ghr', fake('gh' + 'r_', 'AbC123xYz9', 36)],
    ['GitHub fine-grained', fake('github' + '_pat_', 'AbC123xYz9_', 82)],
    ['Slack bot xoxb', fake('xo' + 'xb-', '1234567890-', 40)],
    ['Slack user xoxp', fake('xo' + 'xp-', '1234567890-', 40)],
    ['Slack app xoxa', fake('xo' + 'xa-', '2-abcdefghij', 40)],
    ['Slack refresh xoxr', fake('xo' + 'xr-', 'abcdefghij', 40)],
    ['Slack legacy xoxs', fake('xo' + 'xs-', '1234567890-', 40)],
    ['Slack app-level xapp', fake('xa' + 'pp-', '1-A0B1C2D3E4-', 40)],
    ['OpenAI legacy', fake('s' + 'k-', 'AbCdEf123456', 48)],
    ['OpenAI project', fake('s' + 'k-proj-', 'AbC_dEf-1234', 60)],
    ['Anthropic', fake('s' + 'k-ant-', 'api03-AbC_dEf-1234', 90)],
    ['AWS long-term', fake('AK' + 'IA', 'FAKE0EXAMPLE', 16)],
    ['AWS temporary', fake('AS' + 'IA', 'FAKE0EXAMPLE', 16)],
    ['Google API', fake('AI' + 'za', 'SyFake-Key_0', 35)],
    ['Stripe live secret', fake('sk' + '_live_', 'FakeKey0123', 24)],
    ['Stripe restricted', fake('rk' + '_live_', 'FakeKey0123', 24)],
    ['npm', fake('np' + 'm_', 'FakeToken012', 36)],
  ]

  it.each(families)('redacts %s tokens', (_family, token) => {
    const text = `leaked ${token} in a log line`
    expect(redactSecrets(text)).toBe('leaked [REDACTED] in a log line')
    expect(containsSecret(text)).toBe(true)
  })

  it('redacts bearer credentials but keeps the scheme word', () => {
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJmYWtlIn0', 'ZmFrZS1zaWduYXR1cmU'].join('.')
    expect(redactSecrets(`Authorization: Bearer ${jwt}`)).toBe('Authorization: Bearer [REDACTED]')
    expect(redactSecrets(`curl -H "authorization: bearer ${jwt}"`)).toBe('curl -H "authorization: bearer [REDACTED]"')
  })

  it('redacts whole private key blocks, including unterminated ones', () => {
    const begin = '-----BEGIN ' + 'RSA PRIVATE KEY-----'
    const end = '-----END ' + 'RSA PRIVATE KEY-----'
    expect(redactSecrets(`before\n${begin}\nMIIEfakefakefake\nZmFrZQ==\n${end}\nafter`)).toBe('before\n[REDACTED]\nafter')
    expect(redactSecrets(`key: ${'-----BEGIN ' + 'OPENSSH PRIVATE KEY-----'}\nb3BlbnNzaC1rZXktdjEAAAA`)).toBe('key: [REDACTED]')
  })

  it('leaves prose, git SHAs, UUIDs and look-alike identifiers alone', () => {
    const safe = [
      'Bearer tokens are documented in the auth guide; ask the risk-assessment owner.',
      'commit 3138e23a9f0c4b1d2e5f60718293a4b5c6d7e8f9 fixed the build',
      'run 7c9e6679-7425-40de-944b-e07fc1f98736 finished',
      'use scikit-learn and the task-orientation gate; sk-learn is not a key',
      'the ghp_ prefix, the xoxb- prefix and AKIA are documented token families',
      'npm_config_registry and AIzaSy are short prefixes, not keys',
      '-----BEGIN PUBLIC KEY----- is not a secret',
    ]
    for (const text of safe) {
      expect(redactSecrets(text)).toBe(text)
      expect(containsSecret(text)).toBe(false)
    }
  })
})
