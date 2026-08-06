import { describe, expect, it } from 'vitest'
import {
  docBridgeStructuredData,
  serializedDocBridgeStructuredData,
} from '../apps/docs/lib/structured-data.js'

describe('documentation site structured data', () => {
  it('publishes canonical website, source, and organization identities', () => {
    expect(JSON.parse(serializedDocBridgeStructuredData)).toEqual(docBridgeStructuredData)
    expect(docBridgeStructuredData['@graph']).toContainEqual(expect.objectContaining({
      '@type': 'WebSite',
      '@id': 'https://doc-bridge.agentskit.io/#website',
      url: 'https://doc-bridge.agentskit.io/',
    }))
    expect(docBridgeStructuredData['@graph']).toContainEqual(expect.objectContaining({
      '@type': 'SoftwareSourceCode',
      codeRepository: 'https://github.com/AgentsKit-io/doc-bridge',
      license: 'https://github.com/AgentsKit-io/doc-bridge/blob/master/LICENSE',
      programmingLanguage: 'TypeScript',
    }))
  })
})
