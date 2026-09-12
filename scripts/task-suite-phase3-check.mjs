import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createHash } from 'node:crypto'

const root = resolve(import.meta.dirname, '..')
const readJson = (relativePath) => JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'))
const sortValue = (value) => Array.isArray(value)
  ? value.map(sortValue)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]))
    : value
const normalizedHash = (value) => createHash('sha256').update(JSON.stringify(sortValue(value))).digest('hex')

const suite = readJson('docs/study/task-suite-v1.json')
const coverage = readJson('docs/study/phase3-task-coverage-v1.json')
const taskById = new Map(suite.tasks.map((task) => [task.id, task]))
const requiredCoverage = new Set(coverage.requiredCoverage)
const failures = []

if (suite.contentHash !== coverage.suiteContentHash) failures.push('Coverage contract is bound to a stale task-suite hash.')
if (normalizedHash({ ...suite, contentHash: undefined }) !== suite.contentHash) failures.push('Task-suite content hash cannot be reproduced from its payload.')

for (const task of suite.tasks) {
  const category = task.category
  if (!task.expectedOutcome || task.evidenceRequirements.length === 0 || task.acceptanceChecks.length === 0) failures.push(`${task.id}: missing outcome, evidence, or acceptance check.`)
  if (Object.keys(task.rubric).length !== 5) failures.push(`${task.id}: incomplete outcome classification rubric.`)
  if (!coverage.recoveryByCategory[category]) failures.push(`${task.id}: missing bounded recovery path.`)
  if (!coverage.safeOutcomeByCategory[category]) failures.push(`${task.id}: missing safe outcome.`)
  if (!task.acceptanceChecks.every((check) => /^(ak-docs|pnpm|npm|node)\s/.test(check.command))) failures.push(`${task.id}: acceptance check is not an executable local command.`)
}

for (const category of ['discovery', 'architecture', 'implementation']) {
  if (!suite.tasks.some((task) => task.category === category)) failures.push(`Missing required ${category} task coverage.`)
  else requiredCoverage.delete(category)
}

for (const taskId of coverage.documentationTaskIds) {
  const task = taskById.get(taskId)
  if (!task || task.category !== 'documentation') failures.push(`${taskId}: documentation coverage must reference a documentation task.`)
}
if (coverage.documentationTaskIds.length !== 6) failures.push('Documentation coverage must include one task for every population repository.')
if (!coverage.documentationTaskIds.every((taskId) => taskById.has(taskId))) failures.push('Documentation coverage references an unknown task.')
for (const kind of ['documentation-freshness', 'documentation-contradiction', 'documentation-missing']) requiredCoverage.delete(kind)

const report = {
  status: failures.length === 0 ? 'passed' : 'failed',
  criteria: ['token-efficiency-phase3'],
  benchmark: 'task-suite-phase3-v1',
  suiteContentHash: suite.contentHash,
  taskCount: suite.tasks.length,
  tasksWithEvidence: suite.tasks.filter((task) => task.evidenceRequirements.length > 0).length,
  tasksWithAcceptanceChecks: suite.tasks.filter((task) => task.acceptanceChecks.length > 0).length,
  tasksWithOutcomeClassifications: suite.tasks.filter((task) => Object.keys(task.rubric).length === 5).length,
  tasksWithRecoveryPaths: suite.tasks.filter((task) => Boolean(coverage.recoveryByCategory[task.category])).length,
  coverage: ['discovery', 'architecture', 'documentation-freshness', 'documentation-contradiction', 'documentation-missing', 'implementation'],
  failures,
}
console.log(JSON.stringify(report))
if (failures.length > 0) process.exitCode = 1
