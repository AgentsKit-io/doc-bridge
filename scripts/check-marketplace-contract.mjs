import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const action = readFileSync(resolve(root, 'action.yml'), 'utf8')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const failures = []

for (const field of ['name:', 'description:', 'branding:', 'runs:', 'using: composite']) {
  if (!action.includes(field)) failures.push(`action.yml is missing ${field}`)
}
if (!action.includes(`default: '${pkg.version}'`)) failures.push('package-version default must match package.json')
if (/uses:\s+[^\n]+@(v|main|master)(?:\d+)?\s*$/mu.test(action)) failures.push('third-party actions must use immutable SHAs')
for (const block of action.matchAll(/run:\s*\|([\s\S]*?)(?=\n\s+- name:|$)/gu)) {
  if (/\$\{\{\s*inputs\./u.test(block[1])) failures.push('inputs must enter shell steps through env, not direct interpolation')
}
if (!action.includes('ak-docs gate run') || action.includes('ak-docs index')) failures.push('the Action must validate committed freshness without rebuilding the index')
if (!action.includes('^[0-9]+\\.[0-9]+\\.[0-9]+')) failures.push('package-version must be constrained to exact semver')
for (const file of readdirSync(resolve(root, '.github/workflows')).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))) {
  const workflow = readFileSync(resolve(root, '.github/workflows', file), 'utf8')
  if (/uses:\s+(?!\.\/)[^\s]+@(?![0-9a-f]{40}(?:\s|$))[^\s#]+/mu.test(workflow)) failures.push(`${file} contains a mutable Action reference`)
}

if (failures.length > 0) {
  console.error(`Marketplace contract failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`Marketplace contract: PASS (Action and package ${pkg.version})`)
