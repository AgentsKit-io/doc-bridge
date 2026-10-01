import assert from 'node:assert/strict'
import test from 'node:test'
import { aliases } from './lib/aliases.mjs'

test('aliases ignores missing optional values and keeps unique strings', () => {
  assert.deepEqual(aliases(['AgentsKit', undefined, 'agentskit', null]), ['AgentsKit'])
})
