import { SITE_URL } from './site'

export const docBridgeStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://www.agentskit.io/#organization',
      name: 'AgentsKit',
      url: 'https://www.agentskit.io',
      sameAs: ['https://github.com/AgentsKit-io'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'AgentsKit Doc Bridge',
      description: 'Documentation handoffs that route coding agents to the right context, edit boundaries, checks, and human guides.',
      url: `${SITE_URL}/`,
      publisher: { '@id': 'https://www.agentskit.io/#organization' },
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareSourceCode',
      '@id': `${SITE_URL}/#source`,
      name: 'AgentsKit Doc Bridge',
      description: 'An open-source CLI, MCP server, and CI gate for deterministic human-to-agent documentation handoffs.',
      codeRepository: 'https://github.com/AgentsKit-io/doc-bridge',
      license: 'https://github.com/AgentsKit-io/doc-bridge/blob/master/LICENSE',
      programmingLanguage: 'TypeScript',
      runtimePlatform: 'Node.js 22 or newer',
      author: { '@id': 'https://www.agentskit.io/#organization' },
      mainEntityOfPage: { '@id': `${SITE_URL}/#website` },
      sameAs: ['https://www.npmjs.com/package/@agentskit/doc-bridge'],
    },
  ],
} as const

export const serializedDocBridgeStructuredData = JSON.stringify(docBridgeStructuredData).replaceAll('<', '\\u003c')
