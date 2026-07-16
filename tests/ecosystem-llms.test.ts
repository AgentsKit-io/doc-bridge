import { describe, expect, it } from 'vitest'
import { formatEcosystemLlmsBlock } from '../src/federation/ecosystem-llms.js'

describe('formatEcosystemLlmsBlock', () => {
  it('renders a stable seven-product mesh with current marker', () => {
    const lines = formatEcosystemLlmsBlock({
      currentProductId: 'doc-bridge',
      products: [
        {
          id: 'agentskit',
          name: 'AgentsKit',
          role: 'foundation',
          promise: 'Build agents without gluing many libraries together.',
          maturity: 'beta',
          surfaces: { home: 'https://www.agentskit.io', llms: 'https://www.agentskit.io/llms.txt' },
        },
        {
          id: 'doc-bridge',
          name: 'Doc Bridge',
          role: 'understanding',
          promise: 'Turn repository documentation into executable agent handoffs.',
          maturity: 'stable',
          surfaces: { home: 'https://doc-bridge.agentskit.io/', docs: 'https://doc-bridge.agentskit.io/' },
        },
      ],
    })
    expect(lines[0]).toBe('## AgentsKit ecosystem')
    expect(lines.some((line) => line.includes('**(current)**') && line.includes('Doc Bridge'))).toBe(true)
    expect(lines.some((line) => line.includes('Role: `foundation`'))).toBe(true)
    expect(lines.some((line) => line.includes('Machine index: https://www.agentskit.io/llms.txt'))).toBe(true)
    expect(lines.join('\n')).not.toContain('..')
  })
})
