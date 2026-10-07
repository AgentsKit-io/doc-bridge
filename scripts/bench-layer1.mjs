#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createSymlink, runCommand, splitLines } from '@agentskit/cross-platform'
import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hash = text => createHash('sha256').update(text).digest('hex')
const key = item => JSON.stringify([item.channel, item.kind, item.op ?? '', item.name, item.path])
export const score = (expected, observed) => {
  const wanted = new Map(expected.map(item => [key(item), item]))
  const got = new Map(observed.map(item => [key(item), item]))
  const tp = [...wanted.keys()].filter(id => got.has(id)).length
  const fp = [...got].filter(([id]) => !wanted.has(id)).map(([, item]) => item)
  const fn = [...wanted].filter(([id]) => !got.has(id)).map(([, item]) => item)
  return { tp, fp, fn, precision: tp + fp.length ? tp / (tp + fp.length) : null, coverage: tp + fn.length ? tp / (tp + fn.length) : null }
}
const safePath = (directory, path) => {
  const target = resolve(directory, path)
  const rel = relative(directory, target)
  assert(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`), 'Path escapes checkout')
  let current = target
  while (current !== directory) {
    try { assert(!lstatSync(current).isSymbolicLink(), 'Symlink path denied') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    current = dirname(current)
  }
  return target
}
const git = async (directory, ...args) => {
  const result = await runCommand('git', args, { cwd: directory, timeoutMs: 120_000, maxOutputBytes: 4 * 1024 * 1024 })
  if (result.code !== 0) throw new Error('Git operation failed')
  return result.stdout.trim()
}
const write = (directory, path, content) => {
  const target = safePath(directory, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}
const apply = (directory, edits) => {
  for (const edit of edits) {
    if (edit.content !== undefined) { write(directory, edit.path, edit.content); continue }
    const target = safePath(directory, edit.path)
    const text = readFileSync(target, 'utf8')
    assert(typeof edit.from === 'string' && edit.from.length > 0, 'Empty mutation denied')
    const occurrences = text.split(edit.from).length - 1
    assert.equal(occurrences, edit.count ?? 1, `Mutation precondition: ${edit.path}`)
    writeFileSync(target, text.replaceAll(edit.from, edit.to))
  }
}
const observations = (result, base, head) => {
  const items = result.changeSet.changes.filter(change => ['symbol', 'signature', 'cli-command', 'cli-flag', 'config-key'].includes(change.kind)).map(change => {
    const side = change.before ?? change.after
    return { channel: 'fact', kind: change.kind, op: change.op, name: side.name, path: side.evidence[0]?.path ?? '' }
  })
  for (const finding of result.findings) {
    const relations = (finding.relationIds ?? []).map(id => base.relations.find(relation => relation.id === id)).filter(Boolean)
    const relation = relations[0]
    const document = head.entities.find(entity => entity.id === relation?.from)
    const name = relation?.metadata?.symbol ?? relation?.metadata?.factName ?? ''
    items.push({ channel: 'finding', kind: finding.code, name, path: document?.path ?? '', status: finding.status,
      lines: [...new Set(finding.evidence.filter(item => item.path === document?.path && item.context === 'Head citation').map(item => item.lineStart))].sort((a, b) => a - b) })
  }
  return [...new Map(items.map(item => [key(item), item])).values()].sort((a, b) => key(a).localeCompare(key(b)))
}
const percent = number => number === null ? 'n/a' : `${(100 * number).toFixed(2)}%`
const totals = results => {
  const passed = results.filter(result => result.status === 'measured')
  const tp = passed.reduce((sum, item) => sum + item.score.tp, 0)
  const fp = passed.flatMap(item => item.score.fp)
  const fn = passed.flatMap(item => item.score.fn)
  return { tp, fp: fp.length, fn: fn.length, precision: tp + fp.length ? tp / (tp + fp.length) : null, coverage: tp + fn.length ? tp / (tp + fn.length) : null }
}
const cause = (result, unit, label) => {
  if (unit.channel === 'finding') {
    if (unit.kind === 'FACT_CHANGE') return 'Fact deltas are not documentation divergence diagnostics: diff only checks removed/ambiguous targets.'
    if (label === 'fp' && result.id.includes('negative-')) return 'Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.'
    if (label === 'fp' && unit.name.startsWith('--') && result.expected.some(item => item.channel === 'fact' && item.kind === 'cli-command')) return 'A command rename also removes the old flag owner: this secondary flag diagnostic was not annotated in the command-only ground truth. This is an annotation limit, not established engine error.'
    if (label === 'fp') return 'Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.'
    const related = result.citations?.some(item => item.from === `document:${unit.path}` && (item.symbol === unit.name || item.factName === unit.name))
    if (related === false) {
      const target = result.expected.find(item => item.channel === 'fact' && item.name === unit.name)
      if (target?.kind === 'cli-command' || target?.kind === 'cli-flag') return 'No base citation relation: owned CLI extraction is unavailable under the custom handler or native workspace boundary.'
      if (target?.kind === 'config-key') return 'No base citation relation: the bare configuration token remains unresolved under configuration owner scoping.'
      return 'No base citation relation: TypeScript code fences are not symbol-tokenized.'
    }
    const unchangedDeclaration = result.targets?.[0]?.find(target => target.name === unit.name && result.targets[1].some(next => next.id === target.id))
    if (unchangedDeclaration?.path?.endsWith('/usage.ts')) return 'Extraction follows the unchanged usage text instead of the mutated command/flag implementation; no removed target is recorded.'
    return result.findingCause
  }
  if (unit.kind === 'config-key' && result.id.endsWith('default-change')) return 'Operational defaults are assigned outside declarative schema extraction; no default-value fact delta is observed.'
  const capability = unit.kind === 'cli-command' ? 'cli-commands' : unit.kind === 'cli-flag' ? 'cli-flags' : undefined
  if (capability) {
    if (result.targets?.[0]?.some(target => target.name === unit.name && target.path?.endsWith('/usage.ts'))) return 'Extraction follows unchanged usage text instead of the mutated implementation; the declared command/flag fact persists.'
    const unsupported = result.coverage.find(item => (item.scope === capability || item.scope === `head:${capability}`) && item.status !== 'complete' && item.status !== 'not-applicable')
    if (unsupported) return `Extraction ${unsupported.status}: ${unsupported.reason ?? 'unsupported declarations'}.`
    return 'The added fixture package is outside the native workspace manifest; no owned CLI fact is extracted for it.'
  }
  return result.factCause
}
export const renderReport = report => {
  const headline = totals(report.results.filter(item => item.origin === 'native').map(item => item.status === 'measured' ? { ...item, score: score(item.expected.filter(unit => unit.channel === 'finding'), item.observed.filter(unit => unit.channel === 'finding')) } : item))
  const nativeFindings = report.results.filter(item => item.origin === 'native' && item.status === 'measured').flatMap(item => item.observed.filter(unit => unit.channel === 'finding'))
  const lines = ['---', 'owner: maintainers', 'lifecycle: active', 'sourceOfTruth: docs/bench/layer1-cases-v1.json', 'validationPath: node scripts/bench-layer1.mjs --self-check', '---', '', '# Layer-1 benchmark results v1', '',
    `Native documentation findings: precision **${percent(headline.precision)}**, coverage **${percent(headline.coverage)}** (TP ${headline.tp}, FP ${headline.fp}, FN ${headline.fn}). Targets: precision ≥95%, coverage ≥90%.`, '',
    `These are emitted diagnostic candidates: ${nativeFindings.filter(item => item.status === 'conflict').length} conflict, ${nativeFindings.filter(item => item.status === 'stale-or-unverified').length} stale-or-unverified, ${nativeFindings.filter(item => item.status === 'unresolved').length} unresolved. Candidate precision does not establish confirmed-finding precision.`, '',
    `Engine revision: \`${report.engineRevision}\`. Engine bundle SHA-256: \`${report.engineHash}\`.`, `Frozen case SHA-256: \`${report.caseHash}\`.`, '',
    'Coverage is recall: TP / (TP + FN). Precision is TP / (TP + FP). Units are distinct (case, channel, kind, operation, token, path); repeated citations in one document count once.', '',
    '| Channel / kind | TP | FP | FN | Precision | Coverage |', '| --- | ---: | ---: | ---: | ---: | ---: |']
  const measured = report.results.filter(item => item.status === 'measured')
  const kinds = [...new Set(measured.flatMap(item => [...item.expected, ...item.observed].map(unit => `${unit.channel}/${unit.kind}`)))].sort()
  for (const origin of ['native', 'fixture-backed', 'historical']) for (const kind of [...kinds, 'finding-overall', 'fact-overall']) {
    const matches = unit => kind.endsWith('-overall') ? unit.channel === kind.split('-')[0] : `${unit.channel}/${unit.kind}` === kind
    const selected = measured.filter(item => item.origin === origin).map(item => ({ ...item, score: score(item.expected.filter(matches), item.observed.filter(matches)) }))
    const total = totals(selected)
    if (kind.endsWith('-overall') || total.tp + total.fp + total.fn) lines.push(`| ${origin}: ${kind} | ${total.tp} | ${total.fp} | ${total.fn} | ${percent(total.precision)} | ${percent(total.coverage)} |`)
  }
  lines.push('', 'Fact deltas establish extraction/change detection only. They do not establish that a stale document was diagnosed. Raw diff findings are scored separately; classification/version routing is not applied by this API.', '',
    `Measured cases: ${measured.length}; unavailable: ${report.results.filter(item => item.status === 'unavailable').length}; invalid: ${report.results.filter(item => item.status === 'invalid').length}.`,
    `Confirmed historical cases: ${report.historicalCount}. ${report.historyLimit}`, 'Historical recall is not analyzed. Future real cases will come from advisory dogfood in these repositories.', '', '## Case results', '', '| Case | Origin | State | TP / FP / FN (all units) |', '| --- | --- | --- | --- |')
  for (const result of report.results) lines.push(`| ${result.id} | ${result.origin} | ${result.status} | ${result.score ? `${result.score.tp} / ${result.score.fp.length} / ${result.score.fn.length}` : result.reason} |`)
  lines.push('', '## False positives and false negatives', '')
  for (const result of measured) {
    for (const label of ['fp', 'fn']) for (const item of result.score[label]) lines.push(`- ${result.id} ${label.toUpperCase()}: \`${key(item)}\`. ${cause(result, item, label)}`)
  }
  if (!measured.some(item => item.score.fp.length || item.score.fn.length)) lines.push('None.')
  lines.push('', '## Limits', '', report.limits, '', 'No engine tuning or expectation changes were made in response to the measurements. An unavailable corpus is omitted from the denominator and prevents a three-repository acceptance claim.', '')
  return lines.join('\n')
}
async function main() {
  if (process.argv.includes('--self-check')) {
    const one = { channel: 'finding', kind: 'BROKEN_REFERENCE', name: 'sample', path: 'docs/api.md' }
    assert.deepEqual(score([one], [one, one]), { tp: 1, fp: [], fn: [], precision: 1, coverage: 1 })
    assert.equal(score([one], []).coverage, 0)
    assert.equal(score([], [one]).precision, 0)
    assert.throws(() => safePath(root, '../escape'))
    const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-path-check-'))
    try {
      await createSymlink(join(directory, 'missing'), join(directory, 'alias'))
      assert.throws(() => safePath(directory, 'alias'), /Symlink path denied/)
    } finally { rmSync(directory, { recursive: true, force: true }) }
    console.log('Layer-1 scoring and path checks passed')
    return
  }
  const { discoverRepository, diffSnapshots } = await import('../dist/index.js')
  const suiteText = readFileSync(join(root, 'docs/bench/layer1-cases-v1.json'), 'utf8')
  const suite = JSON.parse(suiteText)
  assert.equal(suite.schemaVersion, 1)
  assert.equal(new Set(suite.cases.map(item => item.id)).size, suite.cases.length)
  const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-layer1-'))
  const results = []
  try {
    for (const repository of suite.repositories) {
      const checkout = join(directory, repository.id)
      let available = true
      try {
        assert.match(repository.url, /^https:\/\/github\.com\/AgentsKit-io\/[a-z-]+\.git$/)
        assert.match(repository.sha, /^[a-f0-9]{40}$/)
        await git(directory, 'clone', '--quiet', '--no-checkout', '--depth=150', repository.url, checkout)
        try { await git(checkout, 'cat-file', '-e', repository.sha) } catch { await git(checkout, 'fetch', '--quiet', '--depth=150', 'origin', repository.sha) }
      } catch { available = false }
      for (const item of suite.cases.filter(item => item.repository === repository.id)) {
        if (!available) { results.push({ id: item.id, origin: item.origin, status: 'unavailable', reason: 'Pinned public checkout unavailable' }); continue }
        try {
          console.error(`Measuring ${item.id}`)
          await git(checkout, 'reset', '--hard', item.base ?? repository.sha)
          await git(checkout, 'clean', '-fdx')
          apply(checkout, item.setup ?? [])
          // Ground truth is checked before either engine invocation, never derived from relations.
          for (const citation of item.citations ?? []) {
            const lines = splitLines(readFileSync(safePath(checkout, citation.path), 'utf8'))
            for (const line of citation.lines) assert(lines[line - 1]?.includes(citation.token), `Ground truth citation: ${citation.path}:${line}`)
          }
          const base = discoverRepository({ root: checkout })
          if (item.head) await git(checkout, 'reset', '--hard', item.head)
          else apply(checkout, item.mutations)
          const head = discoverRepository({ root: checkout, previous: base })
          const diff = diffSnapshots(base, head, { headRoot: checkout })
          const observed = observations(diff, base, head).filter(unit => unit.channel === 'finding'
            ? !item.scope.documents.length || item.scope.documents.includes(unit.path)
            : item.scope.facts.some(target => target.kind === unit.kind && target.names.includes(unit.name)))
          results.push({ id: item.id, origin: item.origin, status: 'measured', expected: item.expected, observed,
            score: score(item.expected, observed), findingCause: item.findingCause, factCause: item.factCause,
            targets: [base, head].map(snapshot => snapshot.entities.filter(entity => item.scope.facts.some(target => target.kind === entity.kind && target.names.includes(entity.name))).map(entity => ({ id: entity.id, kind: entity.kind, name: entity.name, owner: entity.metadata?.ownerId, path: entity.evidence[0]?.path }))),
            citations: base.relations.filter(relation => item.scope.documents.includes(base.entities.find(entity => entity.id === relation.from)?.path) && (relation.metadata?.symbol || relation.metadata?.factName)).map(relation => ({ from: relation.from, to: relation.to, symbol: relation.metadata?.symbol, factKind: relation.metadata?.factKind, factName: relation.metadata?.factName })),
            coverage: diff.changeSet.coverage.map(({ analyzer, scope, status, reason }) => ({ analyzer, scope, status, ...(reason ? { reason } : {}) })) })
        } catch (error) {
          // Never include subprocess output or local paths in a public artifact.
          results.push({ id: item.id, origin: item.origin, status: 'invalid', reason: error.code ? `Execution error ${error.code}` : 'Mutation, citation or engine precondition failed' })
        }
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
  const report = { schemaVersion: 1, engineRevision: await git(root, 'rev-parse', 'HEAD'), engineHash: hash(readFileSync(join(root, 'dist/index.js'))), caseHash: hash(suiteText),
    historicalCount: suite.cases.filter(item => item.origin === 'historical').length, historyLimit: suite.history.limit, limits: suite.limits, results }
  const outputFlag = process.argv.indexOf('--output')
  assert(outputFlag >= 0 && process.argv[outputFlag + 1], 'Supply --output outside the checkout for raw results')
  const output = resolve(process.argv[outputFlag + 1])
  const outputRel = relative(root, output)
  assert(outputRel === '..' || outputRel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(outputRel), 'Raw report must be outside the worktree')
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  const markdownFlag = process.argv.indexOf('--markdown')
  if (markdownFlag >= 0) writeFileSync(resolve(process.argv[markdownFlag + 1]), renderReport(report))
  const native = results.filter(item => item.origin === 'native')
  const total = totals(native.map(item => item.status === 'measured' ? { ...item, score: score(item.expected.filter(unit => unit.channel === 'finding'), item.observed.filter(unit => unit.channel === 'finding')) } : item))
  console.log(JSON.stringify({ measured: results.filter(item => item.status === 'measured').length, unavailable: results.filter(item => item.status === 'unavailable').length, invalid: results.filter(item => item.status === 'invalid').length, ...total }))
  if (results.some(item => item.status !== 'measured')) process.exitCode = 2
  else if (total.precision === null || total.coverage === null || total.precision < suite.targets.precision || total.coverage < suite.targets.coverage) process.exitCode = 1
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
