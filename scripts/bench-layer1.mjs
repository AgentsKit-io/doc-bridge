#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createSymlink, runCommand, spawnProcess, splitLines } from '@agentskit/cross-platform'
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
  if (result.code !== 0) throw new Error(`Git ${args[0]} failed (exit ${result.code})`)
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
    items.push({ channel: 'finding', kind: finding.code, name, path: document?.path ?? '', status: finding.status, ...(finding.documentationUpdate ? { documentationUpdate: finding.documentationUpdate } : {}),
      lines: [...new Set(finding.evidence.filter(item => item.path === document?.path && item.context === 'Head citation').map(item => item.lineStart))].sort((a, b) => a - b) })
  }
  return [...new Map(items.map(item => [key(item), item])).values()].sort((a, b) => key(a).localeCompare(key(b)))
}
export const assertAcquisition = snapshot => {
  assert(snapshot.entities.some(entity => entity.kind === 'module'), 'Invalid acquisition: no source modules')
  assert(!snapshot.coverage.some(entry => entry.scope.startsWith('limits:') && entry.status !== 'complete'), 'Invalid acquisition: repository resource limit reached')
}
const safeFailure = error => {
  const message = splitLines(String(error.message))[0]
  // Only benchmark-owned messages contain public relative paths; never publish engine/subprocess output.
  if (/^(Invalid acquisition: |Mutation precondition: |Ground truth citation: |Git (init|remote|fetch|reset|clean|cat-file) failed)/.test(message)) return message
  if (error.code === 'ERR_ASSERTION') return 'Assertion failed outside mutation/citation preconditions'
  return `Engine execution failed (${error.name === 'TypeError' ? 'TypeError' : 'error'}); requires investigation`
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
  if (result.review?.mismatch) return result.review.mismatch

  if (result.id === 'doc-bridge-default-change' && unit.channel === 'finding') return 'The native documentation uses bin?: string with a default comment. The strict-context matcher deliberately leaves this property signature unresolved: no owned base citation links it to surfaces.cli.bin, despite the extracted default delta. This remains an explicit native limitation.'
  if (!result.review && unit.channel === 'finding' && unit.name === 'benchLimit' && result.id.includes('-fixture-')) return 'Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.'
  if (result.id === 'doc-bridge-symbol-rename' && unit.channel === 'finding') return 'Historical head-citation revalidation sees the declaration plus two re-export modules as competing defineConfig owners. Base discovery resolved the citation, but this historical resolver emits no matching head edge despite the recorded declaration removal.'
  if (!result.review && (result.id.startsWith('doc-bridge-fixture-') && ['cli-command', 'cli-flag'].includes(unit.kind) || result.id.startsWith('doc-bridge-fixture-') && unit.channel === 'finding' && (unit.name.startsWith('--') || unit.name.startsWith('ak-bench-fixture')))) return 'The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.'
  if (unit.channel === 'finding') {
    if (unit.kind === 'CHANGED_REFERENCE' && !result.citations?.some(item => item.from === `document:${unit.path}` && (item.symbol === unit.name || item.factName === unit.name))) return 'No owned base citation relation for the changed fact; no documentation review candidate can be emitted.'
    if (label === 'fp' && result.id.includes('negative-')) return 'The diagnostic remains included in this scoring mode; inspect the policy sidecar for exclusion or pending-version routing.'
    if (label === 'fp' && unit.name.startsWith('--') && result.expected.some(item => item.channel === 'fact' && item.kind === 'cli-command')) return 'A command rename also removes the old flag owner: this secondary flag diagnostic was not annotated in the command-only ground truth. This is an annotation limit, not established engine error.'
    if (label === 'fp') return 'Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.'
    const related = result.citations?.some(item => item.from === `document:${unit.path}` && (item.symbol === unit.name || item.factName === unit.name))
    if (related === false) {
      const target = result.expected.find(item => item.channel === 'fact' && item.name === unit.name)
      if (target?.kind === 'cli-command' || target?.kind === 'cli-flag') return result.targets[0].some(item => item.name === unit.name) ? 'CLI facts are extracted, but the documentation syntax/owner matching produces no owned base CLI citation relation. The fact delta cannot substitute for a missing documentation diagnosis.' : 'No owned base CLI fact or citation relation under the native workspace boundary.'
      if (target?.kind === 'config-key') return 'No base citation relation: the bare configuration token remains unresolved under configuration owner scoping.'
      return 'No owned base symbol citation relation under the shipped syntax-aware citation rules.'
    }
    const unchangedDeclaration = result.targets?.[0]?.find(target => target.name === unit.name && result.targets[1].some(next => next.id === target.id))
    if (unchangedDeclaration?.path?.endsWith('/usage.ts')) return 'The scoped declaration remains unchanged or unsupported; inspect target and extraction coverage evidence.'
    return 'The owned citation and delta do not produce a surviving head diagnostic under the shipped citation rules; see raw targets, citations and coverage.'
  }
  if (unit.kind === 'config-key' && result.id === 'doc-bridge-default-change') return 'Operational defaults are assigned outside declarative schema extraction; no default-value fact delta is observed.'
  const capability = unit.kind === 'cli-command' ? 'cli-commands' : unit.kind === 'cli-flag' ? 'cli-flags' : undefined
  if (capability) {
    if (result.targets?.[0]?.some(target => target.name === unit.name && target.path?.endsWith('/usage.ts'))) return 'Extraction follows unchanged usage text instead of the mutated implementation; the declared command/flag fact persists.'
    const unsupported = result.coverage.find(item => (item.scope === capability || item.scope === `head:${capability}`) && item.status !== 'complete' && item.status !== 'not-applicable')
    if (unsupported) return `Extraction ${unsupported.status}: ${unsupported.reason ?? 'unsupported declarations'}`
    return 'The added fixture package is outside the native workspace manifest; no owned CLI fact is extracted for it.'
  }
  return 'Expected fact delta absent under the shipped extraction/ownership rules; see raw targets and coverage.'
}
export const renderReport = report => {
  const measured = report.results.filter(item => item.status === 'measured')
  const findingScore = (items, raw = false) => totals(items.map(item => ({ ...item, score: score((raw ? item.rawExpected ?? item.expected : item.expected).filter(unit => unit.channel === 'finding'), (raw ? item.rawObserved : item.observed).filter(unit => unit.channel === 'finding')) })))
  const headline = findingScore(measured.filter(item => item.origin === 'native'))
  const version = report.suiteVersion ?? 1
  const lines = ['---', 'owner: maintainers', 'lifecycle: active', `sourceOfTruth: docs/bench/layer1-cases-v${version}.json`, 'validationPath: node scripts/bench-layer1.mjs --self-check', '---', '', `# Layer-1 benchmark results v${version}`, '',
    `Native included documentation findings: precision **${percent(headline.precision)}**, coverage **${percent(headline.coverage)}** (TP ${headline.tp}, FP ${headline.fp}, FN ${headline.fn}). Targets: native precision ≥95% ${headline.precision !== null && headline.precision >= 0.95 ? 'met' : 'not met'}; native coverage ≥90% ${headline.coverage !== null && headline.coverage >= 0.9 ? 'met' : 'not met'}.`, '',
    'The headline uses shipped default policy routing. Included means proposed or routed-to-L2; excluded and pending-version candidates are reported separately. Review candidates, including CHANGED_REFERENCE (stale-or-unverified, routed-to-L2), are not confirmed divergences.', '',
    version === 1 ? 'Vocabulary alignment: frozen FACT_CHANGE expectations now use the shipped CHANGED_REFERENCE code. All 53 cases, expected locations, operations and tokens remain unchanged. Frozen gold is retained; this run measures the recorded engine bundle.' : 'V2 retains v1 native cases and repairs authored fixture ownership, configuration anchors and raw policy gold. Historical cases compare unmodified public first-parent revisions; their reasoning is recorded in the case file.', '',
    `Engine revision: \`${report.engineRevision}\`. Engine bundle SHA-256: \`${report.engineHash}\`.`, `Case SHA-256: \`${report.caseHash}\`.`, ...(report.harnessHash ? [`Harness SHA-256: \`${report.harnessHash}\`.`] : []), '',
    'Coverage is recall: TP / (TP + FN). Precision is TP / (TP + FP). Units are distinct (case, channel, kind, operation, token, path); repeated citations in one document count once. Facts measure extraction/change detection separately from documentation findings.', '',
    `Measured cases: ${measured.length}; unavailable: ${report.results.filter(item => item.status === 'unavailable').length}; invalid: ${report.results.filter(item => item.status === 'invalid').length}.`, '',
    '## Policy dispositions in frozen document scopes', '', 'Policy counts use diagnostic identities; scores deduplicate assertion units, so totals can differ.', '', '| Origin | Proposed | Routed to L2 | Excluded | Pending version |', '| --- | ---: | ---: | ---: | ---: |']
  for (const origin of ['native', 'fixture-backed', 'historical']) {
    const candidates = measured.filter(item => item.origin === origin).flatMap(item => item.policy)
    lines.push(`| ${origin} | ${['proposed', 'routed-to-L2', 'excluded', 'pending-version'].map(routing => candidates.filter(item => item.routing === routing).length).join(' | ')} |`)
  }
  const kinds = [...new Set(measured.flatMap(item => [...item.expected, ...item.observed, ...item.rawObserved].map(unit => `${unit.channel}/${unit.kind}`)))].sort()
  for (const raw of [false, true]) {
    lines.push('', raw ? '## Secondary raw scores (--no-policy equivalent)' : '## Default included scores', '', '| Origin / channel / kind | TP | FP | FN | Precision | Coverage |', '| --- | ---: | ---: | ---: | ---: | ---: |')
    for (const origin of ['native', 'fixture-backed', 'historical']) for (const kind of [...kinds, 'finding-overall', 'fact-overall']) {
      const matches = unit => kind.endsWith('-overall') ? unit.channel === kind.split('-')[0] : `${unit.channel}/${unit.kind}` === kind
      const selected = measured.filter(item => item.origin === origin).map(item => ({ ...item, score: score((raw ? item.rawExpected ?? item.expected : item.expected).filter(matches), (raw ? item.rawObserved : item.observed).filter(matches)) }))
      const total = totals(selected)
      if (kind.endsWith('-overall') || total.tp + total.fp + total.fn) lines.push(`| ${origin}: ${kind} | ${total.tp} | ${total.fp} | ${total.fn} | ${percent(total.precision)} | ${percent(total.coverage)} |`)
    }
  }
  if (version === 2) {
    lines.push('', '## Historical assertion controls', '', '| Label | Cases | Finding TP | FP | FN |', '| --- | ---: | ---: | ---: | ---: |')
    for (const label of ['positive', 'negative']) {
      const selected = measured.filter(item => item.origin === 'historical' && item.review?.label === label)
      const total = findingScore(selected)
      lines.push(`| ${label} | ${selected.length} | ${total.tp} | ${total.fp} | ${total.fn} |`)
    }
  }
  lines.push('', '## Case results', '', '| Case | Origin | State | Default TP / FP / FN | Raw TP / FP / FN |', '| --- | --- | --- | --- | --- |')
  for (const result of report.results) lines.push(`| ${result.id} | ${result.origin} | ${result.status} | ${result.score ? `${result.score.tp} / ${result.score.fp.length} / ${result.score.fn.length}` : result.reason} | ${result.rawScore ? `${result.rawScore.tp} / ${result.rawScore.fp.length} / ${result.rawScore.fn.length}` : 'n/a'} |`)
  for (const raw of [false, true]) {
    lines.push('', raw ? '## Raw false positives and false negatives' : '## Default false positives and false negatives', '')
    let count = 0
    for (const result of measured) for (const label of ['fp', 'fn']) for (const item of (raw ? result.rawScore : result.score)[label]) {
      const disposition = result.policy.find(finding => finding.assertion.document === item.path && finding.assertion.key === item.name)
      const reason = disposition && ['excluded', 'pending-version'].includes(disposition.routing) && ((!raw && label === 'fn') || (raw && label === 'fp'))
        ? `${raw ? 'Raw includes policy' : 'Policy'} ${disposition.routing}: ${disposition.coverage.map(item => item.reason).filter(Boolean).join('; ')}.` : cause(result, item, label)
      lines.push(`- ${result.id} ${label.toUpperCase()}: \`${key(item)}\`. ${reason}`)
      count++
    }
    if (!count) lines.push('None.')
  }
  lines.push('', '## Limits and maintenance', '',
    version === 1 ? 'Acquisition fetches exact pinned commits directly, rather than relying on a moving shallow default-branch history. All 53 cases now execute; the earlier preview failures are not reproduced on this pinned corpus and engine bundle. No fixture precondition repair was needed or claimed; fixture mutations remain unchanged. No case or expected location was removed. The runner records concrete mutation/citation/acquisition failures and never publishes subprocess output.' : 'V1 case bytes are unchanged. V2 adds workspace membership, schema-owner anchors, secondary command-owner flag gold and separate raw expectations for policy-excluded documents. Acquisition and measurement failures remain visible; the recorded engine bundle measures citation attribution and region-update behavior without changing existing gold.', '',
    `Confirmed historical cases: ${report.historicalCount}. ${report.historyLimit}`, version === 1 ? 'Historical recall is not analyzed.' : 'Historical positives and correctly updated negatives are scored separately from authored and native mutations; purposive sampling does not establish historical prevalence.', '', report.limits.replace('No engine changes are included.', 'Existing corpus gold is retained; this run measures the recorded engine bundle.'), '',
    version === 1 ? 'The two included finding-overall fixture FPs are secondary flag-removal findings missing from command-only gold annotations. They remain scored as FPs; the frozen v1 set is kept for comparability. Raw-only negative-control FPs reflect intentionally disabled exclusions/version routing and are listed individually above. Fixture misses and annotation limits are accepted measurement limits, not reasons to loosen the engine matchers.' : 'Raw policy-excluded findings have explicit gold and are not mislabeled as engine false positives. Every remaining mismatch above requires the recorded evidence and cause; updated citation regions remain review candidates, never confirmed corrections.', '',
    'Unavailable or invalid cases are excluded from score denominators, remain visible, and prevent a complete-corpus measurement claim. Scores below target are benchmark failures, not execution failures or release-readiness evidence.', '')
  return lines.join('\n')
}
async function main() {
  if (process.argv.includes('--self-check')) {
    const one = { channel: 'finding', kind: 'BROKEN_REFERENCE', name: 'sample', path: 'docs/api.md' }
    assert.deepEqual(score([one], [one, one]), { tp: 1, fp: [], fn: [], precision: 1, coverage: 1 })
    assert.equal(score([one], []).coverage, 0)
    assert.throws(() => assertAcquisition({ entities: [], coverage: [] }), /Invalid acquisition/)
    assert.throws(() => assertAcquisition({ entities: [{ kind: 'module' }], coverage: [{ scope: 'limits:source', status: 'partial' }] }), /resource limit/)
    assertAcquisition({ entities: [{ kind: 'module' }], coverage: [] })
    assert.equal(score([], [one]).precision, 0)
    const report = { engineRevision: 'test', engineHash: 'test', caseHash: 'test', historicalCount: 0, historyLimit: 'Not analyzed.', limits: 'Test.', results: [{ id: 'negative', origin: 'native', status: 'measured', expected: [], observed: [], rawObserved: [one], score: score([], []), rawScore: score([], [one]), policy: [{ assertion: { document: one.path, key: one.name }, routing: 'excluded', coverage: [{ reason: 'Historical documentation' }] }] }] }
    const rendered = renderReport(report)
    assert(rendered.includes('| native | 0 | 0 | 1 | 0 |'))
    assert(rendered.includes('| native: finding-overall | 0 | 1 | 0 | 0.00% | n/a |'))
    assert.equal(rendered, renderReport(JSON.parse(JSON.stringify(report))))
    const v2 = { ...report, suiteVersion: 2, results: report.results.map(item => ({ ...item, rawExpected: [one], rawScore: score([one], [one]) })) }
    const v2Text = renderReport(v2)
    assert(v2Text.includes('# Layer-1 benchmark results v2'))
    assert(v2Text.includes('| native: finding-overall | 1 | 0 | 0 | 100.00% | 100.00% |'))
    assert(!v2Text.includes('Historical recall is not analyzed.'))
    const frozen = readFileSync(join(root, 'docs/bench/layer1-cases-v1.json'))
    assert.equal(hash(frozen), '0264264d3b390b8dc0cbf48b1d721ea336abcf26c51e9dab1bead42543e5ff0f')
    const suite = JSON.parse(readFileSync(join(root, 'docs/bench/layer1-cases-v2.json'), 'utf8'))
    const history = suite.cases.filter(item => item.origin === 'historical')
    assert(history.length >= 20)
    assert(history.some(item => item.review.label === 'positive'))
    assert(history.some(item => item.review.label === 'negative'))
    for (const item of history) {
      assert.match(item.base, /^[a-f0-9]{40}$/)
      assert.match(item.head, /^[a-f0-9]{40}$/)
      assert(!item.setup && !item.mutations, 'Historical cases cannot contain authored edits')
      assert(item.review.reasoning && item.citations.length)
    }
    for (const item of suite.cases.filter(item => item.origin === 'fixture-backed')) assert(Array.isArray(item.rawExpected), 'V2 fixtures require complete raw gold')
    assert.equal(safeFailure(new Error('Git fetch failed (exit 128)')), 'Git fetch failed (exit 128)')
    assert(!safeFailure(new Error('untrusted subprocess output')).includes('untrusted'))
    assert.throws(() => safePath(root, '../escape'))
    const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-path-check-'))
    try {
      await createSymlink(join(directory, 'missing'), join(directory, 'alias'))
      assert.throws(() => safePath(directory, 'alias'), /Symlink path denied/)
    } finally { rmSync(directory, { recursive: true, force: true }) }
    console.log('Layer-1 scoring and path checks passed')
    return
  }
  if (!globalThis.gc) {
    const child = spawnProcess(process.execPath, [...process.execArgv, '--expose-gc', ...process.argv.slice(1)], { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
    process.exitCode = (await child.exited).code ?? 2
    return
  }
  const { discoverRepository, diffSnapshots } = await import('../dist/index.js')
  const casesFlag = process.argv.indexOf('--cases')
  const suitePath = casesFlag < 0 ? 'docs/bench/layer1-cases-v1.json' : process.argv[casesFlag + 1]
  assert(suitePath, 'Supply --cases path')
  const suiteText = readFileSync(safePath(root, suitePath), 'utf8')
  const suite = JSON.parse(suiteText)
  assert.equal(suite.schemaVersion, 1)
  assert.equal(new Set(suite.cases.map(item => item.id)).size, suite.cases.length)
  const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-layer1-'))
  const results = []
  try {
    for (const repository of suite.repositories) {
      const checkout = join(directory, repository.id)
      let unavailableReason
      try {
        assert.match(repository.url, /^https:\/\/github\.com\/AgentsKit-io\/[a-z-]+\.git$/)
        assert.match(repository.sha, /^[a-f0-9]{40}$/)
        await git(directory, 'init', '--quiet', checkout)
        await git(checkout, 'remote', 'add', 'origin', repository.url)
        for (const sha of new Set([repository.sha, ...suite.cases.filter(item => item.repository === repository.id).flatMap(item => [item.base, item.head].filter(Boolean))])) {
          try { await git(checkout, 'cat-file', '-e', `${sha}^{commit}`) } catch { await git(checkout, 'fetch', '--quiet', '--depth=1', 'origin', sha) }
        }
      } catch (error) { unavailableReason = safeFailure(error) }
      for (const item of suite.cases.filter(item => item.repository === repository.id)) {
        if (unavailableReason) { results.push({ id: item.id, origin: item.origin, status: 'unavailable', reason: `Pinned public checkout unavailable: ${unavailableReason}` }); continue }
        try {
          globalThis.gc()
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
          assertAcquisition(base)
          if (item.head) {
            assert.equal(splitLines(await git(checkout, 'cat-file', '-p', item.head)).find(line => line.startsWith('parent '))?.slice(7), item.base, 'Historical base must be first parent')
            await git(checkout, 'reset', '--hard', item.head)
          }
          else apply(checkout, item.mutations)
          const head = discoverRepository({ root: checkout, previous: base })
          assertAcquisition(head)
          const diff = diffSnapshots(base, head, { headRoot: checkout, policy: true })
          if (item.expectedDocumentationUpdate) {
            assert(diff.groups.updatedInThisChange.some(finding => finding.documentationUpdate === item.expectedDocumentationUpdate), 'Same-change citation update missing')
            assert(!diff.groups.pending.some(finding => finding.evidence.some(proof => item.scope.documents.includes(proof.path))), 'Updated citation counted as pending')
          }
          const raw = diffSnapshots(base, head, { headRoot: checkout, policy: false })
          const inScope = unit => unit.channel === 'finding'
            ? !item.scope.documents.length || item.scope.documents.includes(unit.path)
            : item.scope.facts.some(target => target.kind === unit.kind && target.names.includes(unit.name))
          const rawObserved = observations(raw, base, head).filter(inScope)
          const observed = observations(diff, base, head).filter(inScope)
          results.push({ id: item.id, origin: item.origin, status: 'measured', expected: item.expected, observed,
            score: score(item.expected, observed), rawObserved, rawExpected: item.rawExpected ?? item.expected, rawScore: score(item.rawExpected ?? item.expected, rawObserved),
            policy: diff.policy.findings.filter(finding => !item.scope.documents.length || item.scope.documents.includes(finding.assertion.document)).map(({ id, routing, assertion, coverage }) => ({ id, routing, assertion, coverage })),
            findingCause: item.findingCause, factCause: item.factCause, review: item.review,
            targets: [base, head].map(snapshot => snapshot.entities.filter(entity => item.scope.facts.some(target => target.kind === entity.kind && target.names.includes(entity.name))).map(entity => ({ id: entity.id, kind: entity.kind, name: entity.name, owner: entity.metadata?.ownerId, path: entity.evidence[0]?.path }))),
            citations: base.relations.filter(relation => item.scope.documents.includes(base.entities.find(entity => entity.id === relation.from)?.path) && (relation.metadata?.symbol || relation.metadata?.factName)).map(relation => ({ from: relation.from, to: relation.to, symbol: relation.metadata?.symbol, factKind: relation.metadata?.factKind, factName: relation.metadata?.factName })),
            coverage: diff.changeSet.coverage.map(({ analyzer, scope, status, reason }) => ({ analyzer, scope, status, ...(reason ? { reason } : {}) })) })
        } catch (error) {
          // Never include subprocess output or local paths in a public artifact.
          results.push({ id: item.id, origin: item.origin, status: 'invalid', reason: safeFailure(error) })
        }
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
  const report = { schemaVersion: 1, suiteVersion: suite.suiteVersion ?? 1, engineRevision: await git(root, 'rev-parse', 'HEAD'), engineHash: hash(readFileSync(join(root, 'dist/index.js'))), harnessHash: hash(readFileSync(fileURLToPath(import.meta.url))), caseHash: hash(suiteText),
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
  if (results.some(item => item.status !== 'measured')) {
    console.error('Benchmark failed: unavailable or invalid acquisition/case; inspect reported reasons')
    process.exitCode = 2
  }
  else if (total.precision === null || total.coverage === null || total.precision < suite.targets.precision || total.coverage < suite.targets.coverage) process.exitCode = 1
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
