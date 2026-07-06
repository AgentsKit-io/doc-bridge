import { defineConfig } from '@agentskit/doc-bridge'

/** Assisted profile: Docusaurus + memory ingest + classification (opt-in, HITL) */
export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: { root: '.agent-docs' },
    human: {
      plugin: 'docusaurus',
      options: {
        docsDir: 'website/docs',
        sidebarsFile: 'website/sidebars.js',
        urlPrefix: '/docs',
      },
    },
  },
  intelligence: {
    enabled: true,
    adapter: {
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      apiKeyEnv: 'OPENROUTER_API_KEY',
    },
    chat: { enabled: true, sources: ['agent', 'human'] },
    memory: {
      enabled: true,
      adapters: ['cursor-rules', 'playbook-memory'],
      classify: true,
      promote: {
        enabled: true,
        targets: ['agent', 'human'],
        requireApproval: true,
      },
    },
    runtime: 'agentskit',
  },
})