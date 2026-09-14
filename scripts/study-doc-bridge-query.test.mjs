import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveDocBridgeQueryId } from './study-doc-bridge-query.mjs'

const index = {
  lookup: {
    packages: ['pkg-a'],
    ownership: { 'owner-a': { id: 'owner-a' } },
    intents: { 'intent-a': { id: 'intent-a' } },
    changes: { 'change-a': { id: 'change-a' } },
  },
}

test('resolves auto queries against the canonical plural lookup keys', () => {
  assert.equal(resolveDocBridgeQueryId(index, 'package', 'auto'), 'pkg-a')
  assert.equal(resolveDocBridgeQueryId(index, 'ownership', 'auto'), 'owner-a')
  assert.equal(resolveDocBridgeQueryId(index, 'intent', 'auto'), 'intent-a')
  assert.equal(resolveDocBridgeQueryId(index, 'change', 'auto'), 'change-a')
})

test('preserves explicit ids and rejects unknown auto query types', () => {
  assert.equal(resolveDocBridgeQueryId(index, 'package', 'explicit-id'), 'explicit-id')
  assert.equal(resolveDocBridgeQueryId(index, 'unknown', 'auto'), undefined)
})
