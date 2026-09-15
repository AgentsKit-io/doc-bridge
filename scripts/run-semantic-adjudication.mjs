#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const writeArtifact = process.argv.includes('--write')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const verification = JSON.parse(read('.codex/verification.json'))
const outputDir = resolve(root, verification.stateDir, 'semantic-adjudication')
const packageJson = JSON.parse(read('package.json'))
const readme = read('README.md')
const ci = read('.github/workflows/ci.yml')
const cliSpec = read('docs/spec/cli.md')
const installGuide = read('docs/guides/install-and-run.md')
const corpusOverview = read('docs/agent-corpus/OVERVIEW.md')
const priorReview = JSON.parse(read(`${verification.stateDir}/semantic-review/report.json`))

const publishedVersion = JSON.parse(execFileSync('npm', ['view', '@agentskit/doc-bridge', 'version', '--json'], {
  cwd: root,
  encoding: 'utf8',
})).replace(/^v/, '')
const readmeVersion = readme.match(/(?:Current npm package: v|Published npm package: v)([^ ]+)/)?.[1]
if (!readmeVersion || publishedVersion !== readmeVersion) {
  throw new Error(`Published version ${publishedVersion} does not match README version ${readmeVersion ?? 'missing'}.`)
}

const readmeCheck = spawnSync('pnpm', ['check:readme-standard'], { cwd: root, encoding: 'utf8' })
const staleSourceHashes = readmeCheck.status !== 0
if (staleSourceHashes) throw new Error('The README Standard gate still fails after the source-hash repair.')

const ciRunsReadmeGateOnPullRequest = /on:\s*\n\s+pull_request:/.test(ci) && ci.includes('pnpm check:readme-standard')
if (!ciRunsReadmeGateOnPullRequest) throw new Error('CI evidence does not prove the README gate runs on pull requests.')
const dogfoodBeforeAction = ci.indexOf('Dogfood gate (doc-bridge on itself)') < ci.indexOf('Run the public composite Action contract')

const duplicateDemo = readme.includes('## 60-second proof') && read('docs/getting-started.md').includes('60-second demo (zero setup)')
if (duplicateDemo) throw new Error('The legacy onboarding duplication is still present.')
const semanticFindings = priorReview.results.flatMap((result) => result.findings)
const quickstartOverlap = semanticFindings.some((finding) => finding.id === 'quickstart-duplication-001')
const remediation = {
  binarySurface: /publishes two executables[\s\S]*`ak-docs`[\s\S]*`ak-verify`/.test(cliSpec),
  ciClaim: readme.includes('verifies the committed index and configured') && ciRunsReadmeGateOnPullRequest && dogfoodBeforeAction,
  platformClaim: !readme.includes('portable, fail-closed handoffs for Cursor, Pi, Hermes, and ClawHub-compatible clients'),
  onboardingCanonical: installGuide.includes('[Getting started guide](../getting-started.md)') && !installGuide.includes('npx ak-docs demo') && !installGuide.includes('ak-docs init'),
  corpusExample: corpusOverview.includes('The command returns a bounded handoff similar to:') && corpusOverview.includes('"startHere": "docs/agent-corpus/doc-bridge.md"'),
}
const unresolvedRemediation = Object.entries(remediation).filter(([, resolved]) => !resolved).map(([id]) => id)
if (unresolvedRemediation.length) throw new Error(`Semantic remediation is incomplete: ${unresolvedRemediation.join(', ')}`)

const adjudications = [
  { id: 'version-mismatch', status: 'not-a-contradiction', reason: 'README matches the published npm version; package.json is a newer local version.' },
  { id: 'readme-gate-claim', status: 'substantiated', reason: 'The pull_request workflow invokes pnpm check:readme-standard.' },
  { id: 'quickstart-overlap', status: quickstartOverlap ? 'candidate' : 'resolved', reason: quickstartOverlap ? 'The bounded semantic review still found broader workflow repetition; the canonical guide link and duplicate command removal are verified separately.' : 'The bounded semantic review found no remaining onboarding redundancy candidate.' },
  { id: 'semantic-remediation', status: 'resolved', reason: 'The previously reported binary, README-claim, onboarding-redundancy, and corpus-example candidates have deterministic repository evidence.' },
  { id: 'stale-source-hashes', status: 'resolved', reason: 'The deterministic README gate passes after refreshing all three sourceHash values.' },
]

const result = {
  type: 'doc-bridge-semantic-adjudication',
  schemaVersion: 1,
  status: 'passed',
  criteria: ['semantic-adjudication', 'semantic-remediation'],
  requiresReview: true,
  evidence: {
    publishedVersion,
    localPackageVersion: packageJson.version,
    readmeVersion,
    ciRunsReadmeGateOnPullRequest,
    readmeCheckExitCode: readmeCheck.status,
    staleSourceHashes,
    duplicateDemo,
    remediation,
    priorReviewPath: `${verification.stateDir}/semantic-review/report.json`,
  },
  adjudications,
  metrics: {
    candidatesReviewed: semanticFindings.length,
    resolvedAsNotContradiction: adjudications.filter(({ status }) => status === 'not-a-contradiction').length,
    substantiatedClaims: adjudications.filter(({ status }) => status === 'substantiated').length,
    openCandidates: adjudications.filter(({ status }) => status === 'candidate').length,
    openDeterministicGaps: 0,
  },
}

if (writeArtifact) {
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(resolve(outputDir, 'report.json'), `${JSON.stringify(result, null, 2)}\n`)
}
console.log(JSON.stringify({ ...result, outputDir: writeArtifact ? outputDir.replace(`${root}/`, '') : undefined }))
