import { describe, expect, it } from 'vitest'

import { PeerMissingError, importPeer, isPeerResolutionFailure } from '../src/intelligence/peers.js'

describe('peer resolution', () => {
  it('classifies common missing-module errors', () => {
    expect(isPeerResolutionFailure(new Error('Cannot find package @agentskit/rag'))).toBe(true)
    expect(isPeerResolutionFailure(Object.assign(new Error('x'), { code: 'ERR_MODULE_NOT_FOUND' }))).toBe(
      true,
    )
    expect(isPeerResolutionFailure(new Error('fetch failed'))).toBe(true)
    expect(isPeerResolutionFailure(new Error('Connection refused to localhost:11434'))).toBe(false)
  })

  it('importPeer maps missing packages to PeerMissingError', async () => {
    await expect(importPeer('@agentskit/this-package-does-not-exist-ever')).rejects.toBeInstanceOf(
      PeerMissingError,
    )
    await expect(importPeer('@agentskit/this-package-does-not-exist-ever')).rejects.toThrow(/Install Layer 1/)
  })
})
