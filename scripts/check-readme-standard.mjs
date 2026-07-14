#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditReadme } from './lib/readme-standard.mjs'

const root = process.cwd()
const config = JSON.parse(readFileSync(resolve(root, 'readme-standard-v1.json'), 'utf8'))
const report = auditReadme(root, config)
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
else if (report.ok) console.log(`README Standard v1 — PASS (${config.surfaces.length} surfaces)`)
else for (const failure of report.failures) console.error(`✗ ${failure}`)
if (!report.ok) process.exit(1)
