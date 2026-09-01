import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;')

const historical = readJson('docs/study/historical-evidence-v1.json')
const contextRecord = historical.records.find((record) => record.id === 'validation-cycle-02')
if (!contextRecord || contextRecord.metrics?.['context-reduction'] !== 0.99) {
  throw new Error('Expected validation-cycle-02 context reduction evidence was not found')
}

const ab = readJson('docs/study/ab-baseline-result-v1.json')
const repositoryOnly = ab.arms.find((arm) => arm.scenarioId === 'repository-only')
const docBridge = ab.arms.find((arm) => arm.scenarioId === 'deterministic-doc-bridge')
if (!repositoryOnly || !docBridge) throw new Error('Expected A/B arms were not found')

const contextReduction = contextRecord.metrics['context-reduction']
const contextPayloadPercent = (1 - contextReduction) * 100
const formatPercent = (value, digits = 2) => `${value.toFixed(digits)}%`
const formatSigned = (value, digits = 2, suffix = '') => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}${suffix}`
const tokenDelta = ab.pairedDeltas.providerTokensRelative * 100
const latencyDeltaSeconds = ab.pairedDeltas.latencyP95Ms / 1000
const completionDeltaPoints = ab.pairedDeltas.completedRate * 100
const evidenceDeltaPoints = ab.pairedDeltas.evidenceQualityRate * 100
const contextBarWidth = Math.max(11, 1072 * contextPayloadPercent / 100)

const chart = ({ title, description, body, width = 1200, height = 560 }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(description)}</desc>
  <rect width="${width}" height="${height}" rx="24" fill="#0b0f14"/>
  <g font-family="Inter, ui-sans-serif, system-ui, sans-serif" fill="#e8eef6">
    <text x="64" y="76" font-size="32" font-weight="700">${escapeXml(title)}</text>
    <text x="64" y="112" font-size="18" fill="#8fa3b8">${escapeXml(description)}</text>
    ${body}
  </g>
</svg>
`

const contextChart = chart({
  title: 'Estimated context payload (not tokens)',
  description: 'Historical anonymized dogfooding · validation-cycle-02 · Doc Bridge 1.7.20',
  height: 520,
  body: `
    <text x="64" y="192" font-size="20" font-weight="600">Repository corpus</text>
    <text x="1136" y="192" text-anchor="end" font-size="24" font-weight="700">100%</text>
    <rect x="64" y="216" width="1072" height="38" rx="19" fill="#1e2a38"/>
    <rect x="64" y="216" width="1072" height="38" rx="19" fill="#3d9cf5"/>
    <text x="64" y="326" font-size="20" font-weight="600">Estimated P95 agent context payload</text>
    <text x="1136" y="326" text-anchor="end" font-size="24" font-weight="700">${formatPercent(contextPayloadPercent, 0)}</text>
    <rect x="64" y="350" width="1072" height="38" rx="19" fill="#1e2a38"/>
    <rect x="64" y="350" width="${contextBarWidth}" height="38" rx="19" fill="#3ecf8e"/>
    <text x="64" y="454" font-size="34" font-weight="700" fill="#3ecf8e">Up to ${formatPercent(contextReduction * 100, 0)} less context payload</text>
    <text x="64" y="486" font-size="16" fill="#8fa3b8">Estimated payload reduction; provider tokens and correctness are separate measures.</text>
  `,
})

const deltaRows = [
  ['Paired provider tokens', formatSigned(tokenDelta, 2, '%'), tokenDelta, '#3ecf8e'],
  ['P95 latency', formatSigned(latencyDeltaSeconds, 2, ' s'), latencyDeltaSeconds, '#3ecf8e'],
  ['Operational completion', formatSigned(completionDeltaPoints, 2, ' pp'), completionDeltaPoints, '#3ecf8e'],
  ['Evidence quality', formatSigned(evidenceDeltaPoints, 2, ' pp'), evidenceDeltaPoints, '#3ecf8e'],
]
const maxDelta = Math.max(...deltaRows.map(([, , value]) => Math.abs(value)), 1)
const deltaChart = chart({
  title: 'Controlled A/B signal (operational)',
  description: '96 anonymized executions · 24 tasks · 2 pinned models · one replicate',
  height: 620,
  body: `
    <line x1="600" y1="158" x2="600" y2="548" stroke="#526579" stroke-width="2"/>
    <text x="600" y="142" text-anchor="middle" font-size="16" fill="#8fa3b8">repository-only baseline</text>
    ${deltaRows.map(([label, value, width, color], index) => {
      const y = 214 + index * 84
      const barWidth = Math.max(20, Math.round(Math.abs(width) / maxDelta * 280))
      const x = width < 0 ? 600 - barWidth : 600
      return `<text x="64" y="${y}" font-size="20" font-weight="600">${label}</text>
    <text x="1136" y="${y}" text-anchor="end" font-size="24" font-weight="700" fill="${color}">${value}</text>
    <rect x="64" y="${y + 20}" width="1072" height="14" rx="7" fill="#1e2a38"/>
    <rect x="${x}" y="${y + 20}" width="${barWidth}" height="14" rx="7" fill="${color}"/>`
    }).join('\n')}
    <text x="64" y="584" font-size="16" fill="#8fa3b8">Directional signal; see the full study for denominators and limitations.</text>
  `,
})

const outputDir = path.join(root, 'docs/landing/assets')
fs.mkdirSync(outputDir, { recursive: true })
const outputs = {
  'context-payload-reduction.svg': contextChart,
  'controlled-ab-comparison.svg': deltaChart,
}
const check = process.argv.includes('--check')
for (const [filename, content] of Object.entries(outputs)) {
  const outputPath = path.join(outputDir, filename)
  if (check) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== content) {
      throw new Error(`Generated chart is stale: ${filename}`)
    }
  } else {
    fs.writeFileSync(outputPath, content)
  }
}

if (check) {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
  const studyReadme = fs.readFileSync(path.join(root, 'docs/study/README.md'), 'utf8')
  const readmeExpected = [
    formatPercent(Math.abs(tokenDelta), 2),
    `${Math.abs(latencyDeltaSeconds).toFixed(2)} seconds`,
    `${(docBridge.completedRate * 100).toFixed(1)}% operationally completed executions vs. ${(repositoryOnly.completedRate * 100).toFixed(1)}%`,
  ]
  const studyExpected = [
    formatPercent(Math.abs(tokenDelta), 2),
    `${Math.abs(latencyDeltaSeconds).toFixed(2)} seconds`,
    `${(docBridge.completedRate * 100).toFixed(1)}% with Doc Bridge versus ${(repositoryOnly.completedRate * 100).toFixed(1)}%`,
  ]
  for (const value of readmeExpected) if (!readme.includes(value)) throw new Error(`README study narrative is stale: ${value}`)
  for (const value of studyExpected) if (!studyReadme.includes(value)) throw new Error(`Study narrative is stale: ${value}`)
}

console.log(JSON.stringify({ status: 'passed', check, outputs: Object.keys(outputs) }))
