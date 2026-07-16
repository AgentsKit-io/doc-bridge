import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const action = readFileSync(resolve(root, 'action.yml'), 'utf8')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')

test('Marketplace metadata is complete and release-aligned', () => {
  assert.match(action, /^name: doc-bridge-gate$/mu)
  assert.match(action, /^description: .+$/mu)
  assert.match(action, /^branding:\n\s+icon: book\n\s+color: blue$/mu)
  assert.match(action, new RegExp(`package-version:[\\s\\S]*?default: '${pkg.version.replaceAll('.', '\\.')}'`, 'u'))
  assert.equal([...action.matchAll(/^\s*uses:\s+.+$/gmu)].length, 1)
  assert.match(action, /uses: actions\/setup-node@[0-9a-f]{40}/u)
})

test('untrusted inputs never interpolate directly into Bash', () => {
  for (const block of action.matchAll(/run:\s*\|([\s\S]*?)(?=\n\s+- name:|$)/gu)) {
    assert.doesNotMatch(block[1], /\$\{\{\s*inputs\./u)
  }
  assert.match(action, /DOC_BRIDGE_CONFIG_PATH: \$\{\{ inputs\.config-path \}\}/u)
  assert.match(action, /DOC_BRIDGE_GATE_ID: \$\{\{ inputs\.gate \}\}/u)
  assert.match(action, /DOC_BRIDGE_PACKAGE_VERSION: \$\{\{ inputs\.package-version \}\}/u)
})

test('the gate observes committed state and install is deterministic', () => {
  assert.doesNotMatch(action, /ak-docs index/u)
  assert.match(action, /ak-docs gate run/u)
  assert.match(action, /npm install -g "@agentskit\/doc-bridge@\$\{DOC_BRIDGE_PACKAGE_VERSION\}"/u)
  assert.match(action, /\^\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+/u)
})

test('pre-release CI smokes the composite with an already-published runtime', () => {
  assert.match(ci, /npm view @agentskit\/doc-bridge version/u)
  assert.match(ci, /uses: \.\/[\s\S]*?package-version: \$\{\{ steps\.published-doc-bridge\.outputs\.version \}\}/u)
})
