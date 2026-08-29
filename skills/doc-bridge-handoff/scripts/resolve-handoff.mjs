#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { isAbsolute } from 'node:path'

const VERSION = '1.7.45'
const kinds = new Set(['package', 'ownership'])
const args = process.argv.slice(2)
const id = args[0]
const kindFlag = args.indexOf('--kind')
const configFlag = args.indexOf('--config')
const kind = kindFlag === -1 ? 'package' : args[kindFlag + 1]
const config = configFlag === -1 ? undefined : args[configFlag + 1]

const fail = (message) => {
  process.stderr.write(`Doc Bridge handoff blocked: ${message}\n`)
  process.exit(1)
}

if (!id || id.startsWith('--') || /[\u0000-\u001f\u007f]/u.test(id)) {
  fail('provide a package or ownership id')
}
if (!kind || !kinds.has(kind)) fail('--kind must be package or ownership')
if (configFlag !== -1 && (!config || config.startsWith('--'))) fail('--config requires a path')

const queryArgs = ['query', kind, id, '--agent']
if (config) queryArgs.push('--config', config)

const localBin = process.env.DOC_BRIDGE_BIN
const command = localBin ? process.execPath : 'npx'
const commandArgs = localBin
  ? [localBin, ...queryArgs]
  : ['-y', `@agentskit/doc-bridge@${VERSION}`, ...queryArgs]
const result = spawnSync(command, commandArgs, {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 60_000,
  maxBuffer: 1024 * 1024,
})

if (result.error) fail(result.error.message)
if (result.status !== 0) fail(result.stderr.trim() || `resolver exited with status ${result.status}`)

let handoff
try {
  handoff = JSON.parse(result.stdout)
} catch {
  fail('resolver returned invalid JSON')
}

const nonEmptyStrings = (value) =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim())
const safeRelativePath = (value) => {
  if (typeof value !== 'string' || !value.trim() || isAbsolute(value)) return false
  if (/^(?:[a-z]:[\\/]|\\\\)/iu.test(value)) return false
  return !value.split(/[\\/]+/u).includes('..')
}

if (handoff?.target?.id !== id) fail('resolver returned a different target')
if (!safeRelativePath(handoff.startHere)) fail('startHere is missing or unsafe')
if (!nonEmptyStrings(handoff.readBeforeEditing) || !handoff.readBeforeEditing.every(safeRelativePath)) {
  fail('readBeforeEditing is missing or unsafe')
}
if (!handoff.readBeforeEditing.includes(handoff.startHere)) fail('readBeforeEditing omits startHere')
if (!nonEmptyStrings(handoff.editRoots) || !handoff.editRoots.every(safeRelativePath)) {
  fail('editRoots is missing or unsafe')
}
if (!nonEmptyStrings(handoff.checks)) fail('checks are missing')

process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`)
