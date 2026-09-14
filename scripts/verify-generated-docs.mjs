import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const candidates = [
  resolve(root, 'apps/docs/node_modules/next/dist/server/lib/generate-agent-files.js'),
  resolve(root, 'node_modules/next/dist/server/lib/generate-agent-files.js'),
]
const generator = candidates.find((path) => existsSync(path))
if (!generator) {
  console.log(JSON.stringify({ status: 'blocked', criteria: ['generated-document-freshness'], reason: 'Next.js agent-file generator was not found.' }))
  process.exit(1)
}

const { hasCurrentAgentRules } = await import(pathToFileURL(generator).href)
const docsRoot = resolve(root, 'apps/docs')
const fresh = hasCurrentAgentRules(docsRoot)
console.log(JSON.stringify({
  status: fresh ? 'passed' : 'failed',
  criteria: ['maintainability-remediation', 'generated-document-freshness'],
  generatedPaths: ['apps/docs/AGENTS.md'],
  generator: generator.replace(`${root}/`, ''),
  fresh,
}))
if (!fresh) process.exit(1)
