import assert from 'node:assert/strict'
import { runCommand } from '@agentskit/cross-platform'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { parse } from 'yaml'
import { analyzeAdvisory, analyzeIndex, publishAdvisory, validateAdvisory, withRevision } from './action-runner.mjs'

const root = resolve(import.meta.dirname, '..')
const actionText = readFileSync(resolve(root, 'action.yml'), 'utf8')
const action = parse(actionText)
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const cli = resolve(root, 'bin/ak-docs.js')
const command = async (bin, args, options = {}) => { const result = await runCommand(bin, args, options); if (result.code !== 0) throw new Error('Fixture command failed'); return result.stdout.trim() }
const git = (cwd, ...args) => command('git', args, { cwd })
const put = (root, path, content) => { mkdirSync(resolve(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), content) }
const commit = async root => { await git(root, 'add', '.'); await git(root, 'commit', '-qm', 'test: fixture'); return git(root, 'rev-parse', 'HEAD') }
const fixture = async run => {
  const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-action-test-'))
  const repo = join(directory, 'repository'); mkdirSync(repo)
  try {
    await git(repo, 'init', '-q'); await git(repo, 'config', 'user.name', 'Fixture'); await git(repo, 'config', 'user.email', 'fixture@example.test')
    put(repo, 'package.json', JSON.stringify({ name: 'doc-bridge-fixture', version: '1.0.0' }))
    put(repo, 'doc-bridge.config.json', JSON.stringify({ schemaVersion: 1, project: { name: 'doc-bridge-fixture' }, corpus: { agent: { root: 'docs' } }, index: { llmsTxt: { enabled: false }, capabilities: { enabled: false } }, retrieval: { corpus: { enabled: false } }, gates: { preset: 'minimal' } }))
    put(repo, 'src/api.ts', 'export const removed = 1;\nexport const shared = 2;\n')
    put(repo, 'docs/guide.md', '# Guide\n\nCall `removed` and `shared` to use the API.\n')
    put(repo, 'docs/guide@team.md', '# Guide\n\nCall `removed` and `shared` to use the API.\n')
    const base = await commit(repo)
    const env = { ...process.env, GITHUB_WORKSPACE: repo, GITHUB_REPOSITORY: 'fixture/doc-bridge', DOC_BRIDGE_PR_NUMBER: '7', DOC_BRIDGE_BASE_REVISION: base, DOC_BRIDGE_HEAD_REVISION: base, DOC_BRIDGE_CLI_PATH: cli, DOC_BRIDGE_INDEX_SOURCE: 'committed', DOC_BRIDGE_ADVISORY: 'true', DOC_BRIDGE_COMMENT: 'false', DOC_BRIDGE_FAIL_ON_FINDINGS: 'false', RUNNER_TEMP: directory, GITHUB_OUTPUT: join(directory, 'outputs'), GITHUB_STEP_SUMMARY: join(directory, 'summary') }
    await run({ directory, repo, base, env })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
const reportPath = env => [...readFileSync(env.GITHUB_OUTPUT, 'utf8').matchAll(/^report=(.+)$/gmu)].at(-1)[1]

test('Marketplace inputs, outputs, immutable install and shell env contract', () => {
  assert.equal(action.name, 'doc-bridge-gate'); assert.equal(action.branding.icon, 'book'); assert.equal(action.runs.using, 'composite')
  assert.equal(action.inputs['package-version'].default, pkg.version)
  assert.equal(action.inputs['index-source'].default, 'committed')
  assert.equal(action.inputs.engine.default, 'published')
  for (const input of ['advisory', 'comment', 'fail-on-findings']) assert.equal(action.inputs[input].default, 'false')
  for (const input of ['config-path', 'gate', 'base-revision', 'head-revision', 'pr-number', 'node-version']) assert.ok(action.inputs[input])
  for (const output of ['index-report', 'index-source', 'source-revision', 'advisory-report', 'comment-status']) assert.match(action.outputs[output].value, /steps\./u)
  for (const step of action.runs.steps) {
    if (step.uses) assert.match(step.uses, /@[0-9a-f]{40}$/u)
    if (step.run) assert.doesNotMatch(step.run, /\$\{\{\s*inputs\./u)
  }
  const install = action.runs.steps.find(step => step.id === 'install')
  assert.match(install.run, /DOC_BRIDGE_ENGINE" = checkout/u)
  assert.match(install.run, /GITHUB_REPOSITORY" != AgentsKit-io\/doc-bridge/u)
  assert.match(install.run, /DOC_BRIDGE_COMMENT" != false/u)
  assert.ok(install.run.indexOf('DOC_BRIDGE_ENGINE" != published') < install.run.indexOf('npm install'))
  assert.match(install.run, /--ignore-scripts/u); assert.doesNotMatch(install.run, /npm install -g \./u)
  const analysis = action.runs.steps.find(step => step.id === 'advisory')
  assert.ok(!Object.keys(analysis.env).some(key => /TOKEN/u.test(key)))
  assert.match(action.runs.steps.find(step => step.id === 'publish').env.DOC_BRIDGE_TOKEN, /github.token/u)
  assert.equal(action.runs.steps.find(step => step.id === 'index')['continue-on-error'], true)
})

test('installation defaults to a pinned engine; checkout is explicit, self-CI-only and cannot publish', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-install-test-'))
  try {
    const bin = join(directory, 'bin'); mkdirSync(bin)
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$RUNNER_TEMP/install-args"\n', { mode: 0o755 })
    const workspace = join(directory, 'checkout'); mkdirSync(join(workspace, 'dist/cli'), { recursive: true })
    put(workspace, 'dist/cli/program.js', '// prebuilt test engine')
    const run = (engine, repository = 'fixture/doc-bridge', comment = 'false') => command('bash', ['-c', action.runs.steps.find(step => step.id === 'install').run], { env: { PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: directory, GITHUB_WORKSPACE: workspace, GITHUB_OUTPUT: join(directory, 'outputs'), GITHUB_REPOSITORY: repository, DOC_BRIDGE_ENGINE: engine, DOC_BRIDGE_PACKAGE_VERSION: pkg.version, DOC_BRIDGE_ADVISORY: 'false', DOC_BRIDGE_FAIL_ON_FINDINGS: 'false', DOC_BRIDGE_COMMENT: comment } })
    await run(action.inputs.engine.default)
    const args = readFileSync(join(directory, 'install-args'), 'utf8')
    assert.ok(args.includes(`@agentskit/doc-bridge@${pkg.version}`)); assert.ok(!args.includes(workspace)); assert.match(args, /--ignore-scripts/u)
    rmSync(join(directory, 'install-args'))
    await assert.rejects(run('checkout'))
    await assert.rejects(run('checkout', 'AgentsKit-io/doc-bridge', 'true'))
    await run('checkout', 'AgentsKit-io/doc-bridge')
    assert.ok(!existsSync(join(directory, 'install-args')))
    assert.ok(readFileSync(join(directory, 'outputs'), 'utf8').includes(`cli-path=${workspace}/bin/ak-docs.js`))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('real index modes preserve committed bytes and independent drift policy', async () => fixture(async ({ repo, base, env }) => {
  assert.equal(await analyzeIndex(env), 1, 'missing committed index fails default mode')
  env.DOC_BRIDGE_INDEX_SOURCE = 'ci-built'
  assert.equal(await analyzeIndex(env), 0, 'missing committed index allowed explicitly')
  let report = JSON.parse(readFileSync(reportPath(env), 'utf8'))
  assert.equal(report.source, 'ci-built'); assert.equal(report.committed.present, false); assert.equal(report.generated.reproducible, true)
  assert.ok(existsSync(`${report.generated.path}.provenance.json`)); assert.ok(!existsSync(join(repo, '.doc-bridge/index.json')))
  await command(process.execPath, [cli, 'index'], { cwd: repo })
  env.DOC_BRIDGE_HEAD_REVISION = await commit(repo)
  const original = readFileSync(join(repo, '.doc-bridge/index.json'), 'utf8')
  env.DOC_BRIDGE_INDEX_SOURCE = 'committed'; assert.equal(await analyzeIndex(env), 0, 'fresh committed index passes')
  env.DOC_BRIDGE_INDEX_SOURCE = 'ci-built'; assert.equal(await analyzeIndex(env), 0, 'fresh present committed index passes CI-built')
  put(repo, 'docs/guide.md', '# Guide changed\n\nCall `removed` and `shared`.\n'); env.DOC_BRIDGE_HEAD_REVISION = await commit(repo)
  env.DOC_BRIDGE_INDEX_SOURCE = 'committed'; assert.equal(await analyzeIndex(env), 1, 'stale committed fails')
  env.DOC_BRIDGE_INDEX_SOURCE = 'ci-built'; assert.equal(await analyzeIndex(env), 1, 'CI-built does not clear stale committed gate')
  report = JSON.parse(readFileSync(reportPath(env), 'utf8'))
  assert.equal(report.committed.ok, false); assert.equal(report.generated.reproducible, true); assert.equal(report.ok, false)
  env.DOC_BRIDGE_GATE_ID = 'okf-type'; assert.equal(await analyzeIndex(env), 0, 'caller policy can select another gate while drift remains reported')
  report = JSON.parse(readFileSync(reportPath(env), 'utf8')); assert.equal(report.committed.ok, false)
  assert.equal(readFileSync(join(repo, '.doc-bridge/index.json'), 'utf8'), original)
  assert.equal(await git(repo, 'status', '--porcelain'), '')
  env.DOC_BRIDGE_HEAD_REVISION = base; delete env.DOC_BRIDGE_GATE_ID
  assert.equal(await analyzeIndex(env), 0, 'a different exact revision uses the isolated capture')
  assert.equal(JSON.parse(readFileSync(reportPath(env), 'utf8')).sourceRevision, base)
  put(repo, 'dirty.md', '# Uncommitted data\n')
  assert.equal(await analyzeIndex(env), 0, 'uncommitted workspace data never joins the requested capture')
}))

test('exact workspace preserves CI-prepared ignored conformance exports without repairing a missing export', async () => fixture(async ({ repo, env }) => {
  const config = JSON.parse(readFileSync(join(repo, 'doc-bridge.config.json'), 'utf8'))
  config.index.llmsTxt.enabled = true
  config.gates.include = ['documentation-standard-v1']
  config.conformance = { documentationStandardV1: { rawSources: ['docs/guide.md'] } }
  put(repo, 'doc-bridge.config.json', JSON.stringify(config)); put(repo, '.gitignore', 'llms.txt\n')
  await commit(repo)
  await command(process.execPath, [cli, 'index'], { cwd: repo })
  env.DOC_BRIDGE_HEAD_REVISION = await commit(repo)
  const prepared = readFileSync(join(repo, 'llms.txt'), 'utf8')
  for (const source of ['committed', 'ci-built']) {
    env.DOC_BRIDGE_INDEX_SOURCE = source
    assert.equal(await analyzeIndex(env), 1, 'other intentionally unconfigured conformance rules still block')
    const report = JSON.parse(readFileSync(reportPath(env), 'utf8'))
    const llms = report.results.find(item => item.id === 'documentation-standard-v1').details.results.find(item => item.id === 'llms-and-raw-source')
    assert.equal(llms.ok, true, 'prepared exact-revision export remains available to the real conformance rule')
    assert.equal(readFileSync(join(repo, 'llms.txt'), 'utf8'), prepared)
  }
  rmSync(join(repo, 'llms.txt'))
  assert.equal(await analyzeIndex(env), 1)
  const report = JSON.parse(readFileSync(reportPath(env), 'utf8'))
  assert.equal(report.results.find(item => item.id === 'documentation-standard-v1').details.results.find(item => item.id === 'llms-and-raw-source').ok, false)
  assert.ok(!existsSync(join(repo, 'llms.txt')), 'missing conformance evidence is never silently generated')
}))

test('CLI index preserves nested config roots and rejects dirty/revision/artifact escapes', async () => fixture(async ({ repo, env, directory }) => {
  put(repo, 'nested/doc-bridge.config.json', JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs' } }, index: { llmsTxt: { enabled: false }, capabilities: { enabled: false } }, retrieval: { corpus: { enabled: false } } }))
  put(repo, 'nested/docs/guide.md', '# Nested guide\n')
  env.DOC_BRIDGE_CONFIG_PATH = 'nested/doc-bridge.config.json'
  env.DOC_BRIDGE_HEAD_REVISION = await commit(repo)
  env.DOC_BRIDGE_INDEX_SOURCE = 'ci-built'
  assert.equal(await analyzeIndex(env), 0)
  const report = JSON.parse(readFileSync(reportPath(env), 'utf8'))
  assert.equal(JSON.parse(readFileSync(report.generated.path, 'utf8')).knowledge[0].path, 'docs/guide.md')
  const args = ['action', 'index', '--root', repo, '--revision', env.DOC_BRIDGE_HEAD_REVISION, '--index-source', 'ci-built', '--output', join(directory, 'index.json')]
  await assert.rejects(command(process.execPath, [cli, ...args.slice(0, -1), join(repo, 'bad.json')], { stdio: 'pipe' }))
  await assert.rejects(command(process.execPath, [cli, ...args, '--config', '../outside.json'], { stdio: 'pipe' }))
  symlinkSync(repo, join(directory, 'artifact-escape'), 'dir')
  await assert.rejects(command(process.execPath, [cli, ...args.slice(0, -1), join(directory, 'artifact-escape/index.json')], { stdio: 'pipe' }))
  await assert.rejects(command(process.execPath, [cli, ...args, '--profile', 'service'], { stdio: 'pipe' }))
  put(repo, 'untracked.md', '# Dirty capture\n')
  await assert.rejects(command(process.execPath, [cli, ...args], { stdio: 'pipe' }))
}))

test('real base/head advisory pipeline emits removal, ambiguity, marker and summary fallback without executing PR content', async () => fixture(async ({ repo, base, env, directory }) => {
  put(repo, 'src/api.ts', 'export const shared = 2;\n')
  put(repo, 'src/second.ts', 'export const shared = 3;\n')
  put(repo, '.gitattributes', '*.ts filter=unsafe\n')
  const sentinel = join(directory, 'must-not-exist')
  await git(repo, 'config', 'filter.unsafe.smudge', `touch '${sentinel}'`)
  await git(repo, 'config', 'filter.unsafe.clean', 'cat')
  put(repo, 'doc-bridge.config.json', JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs' } }, intelligence: { enabled: true, registry: { enabled: true, agents: { audit: { command: `touch '${sentinel}'` } } } } }))
  env.DOC_BRIDGE_HEAD_REVISION = await commit(repo)
  await git(repo, 'config', 'filter.unsafe.clean', `touch '${sentinel}'; cat`)
  await git(repo, 'config', 'core.fsmonitor', `touch '${sentinel}'`)
  assert.equal(await analyzeAdvisory(env), 0)
  const path = reportPath(env); const data = JSON.parse(readFileSync(path, 'utf8'))
  assert.ok(data.findingCount >= 2)
  assert.match(data.markdown, /BROKEN_REFERENCE/u); assert.match(data.markdown, /AMBIGUOUS_REFERENCE/u)
  assert.match(data.markdown, /<!-- doc-bridge:advisory:v1:fixture\/doc-bridge:7 -->/u)
  assert.ok(data.markdown.includes(base)); assert.ok(data.markdown.includes(env.DOC_BRIDGE_HEAD_REVISION))
  assert.match(data.markdown, /Coverage gaps \/ policy exclusions/u)
  assert.ok(data.markdown.includes('guide&#64;team.md')); assert.ok(!data.markdown.includes('guide@team.md'))
  assert.ok(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8').includes(data.markdown))
  env.DOC_BRIDGE_ADVISORY_REPORT = path; env.DOC_BRIDGE_COMMENT = 'true'; delete env.DOC_BRIDGE_TOKEN
  assert.equal(await publishAdvisory(env, () => assert.fail('no-token fallback must not call API')), 'summary')
  assert.match(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8'), /write token unavailable/u)
  assert.ok(!existsSync(sentinel)); await git(repo, 'config', 'filter.unsafe.clean', 'cat'); await git(repo, 'config', 'core.fsmonitor', 'false'); assert.equal((await git(repo, 'worktree', 'list', '--porcelain')).match(/^worktree /gmu).length, 1)
  env.DOC_BRIDGE_FAIL_ON_FINDINGS = 'true'; assert.equal(await analyzeAdvisory(env), 1)
}))

const publisherFixture = async run => fixture(async ({ env, directory }) => {
  const marker = '<!-- doc-bridge:advisory:v1:fixture/doc-bridge:7 -->'
  const data = { schemaVersion: 1, repository: env.GITHUB_REPOSITORY, pr: 7, base: env.DOC_BRIDGE_BASE_REVISION, head: env.DOC_BRIDGE_HEAD_REVISION, source: 'committed', marker, markdown: `${marker}\n<!-- doc-bridge:revisions:${env.DOC_BRIDGE_BASE_REVISION}:${env.DOC_BRIDGE_HEAD_REVISION}:committed -->\n## Doc Bridge advisory (Layer 1)\n\nFindings: 0.\n`, findingCount: 0 }
  env.DOC_BRIDGE_ADVISORY_REPORT = join(directory, 'advisory.json'); writeFileSync(env.DOC_BRIDGE_ADVISORY_REPORT, JSON.stringify(data))
  env.DOC_BRIDGE_COMMENT = 'true'; env.DOC_BRIDGE_TOKEN = 'synthetic-test-token'
  const state = { comments: [], calls: [], uncertain: false, stale: false, fork: false, denied: false }
  const request = async (url, options) => {
    state.calls.push({ url, method: options.method })
    let body
    if (state.denied) return new Response('{}', { status: 403 })
    if (url.endsWith('/user')) body = { id: 1, login: 'fixture-bot' }
    else if (url.includes('/pulls/')) body = { head: { sha: state.stale ? 'f'.repeat(40) : data.head, repo: { full_name: state.fork ? 'fork/doc-bridge' : data.repository } }, base: { sha: data.base, repo: { full_name: data.repository } } }
    else if (options.method === 'GET') body = state.comments
    else if (options.method === 'POST') {
      state.comments.push({ id: state.comments.length + 1, user: { id: 1, login: 'fixture-bot' }, body: JSON.parse(options.body).body })
      if (state.uncertain) { state.uncertain = false; throw new Error('synthetic disconnect after accepted write') }
      body = state.comments.at(-1)
    } else if (options.method === 'PATCH') { state.comments.find(comment => comment.id === Number(url.split('/').at(-1))).body = JSON.parse(options.body).body; body = {} }
    else if (options.method === 'DELETE') { state.comments = state.comments.filter(comment => comment.id !== Number(url.split('/').at(-1))); return new Response(null, { status: 204 }) }
    return new Response(JSON.stringify(body), { status: 200 })
  }
  await run({ env, data, state, request })
})

test('publisher contract creates, updates, deduplicates only its own author/marker, reconciles uncertain writes', async () => publisherFixture(async ({ env, data, state, request }) => {
  state.uncertain = true
  assert.equal(await publishAdvisory(env, request), 'comment')
  assert.equal(state.calls.filter(call => call.method === 'POST').length, 1)
  state.comments.push({ id: 2, user: { id: 1, login: 'fixture-bot' }, body: data.markdown })
  state.comments.push({ id: 3, user: { id: 9, login: 'human' }, body: data.markdown })
  assert.equal(await publishAdvisory(env, request), 'comment')
  assert.equal(state.comments.filter(comment => comment.user.id === 1).length, 1)
  assert.equal(state.comments.filter(comment => comment.user.id === 9).length, 1)
  assert.equal(state.calls.filter(call => call.method === 'POST').length, 1)
  assert.ok(state.calls.some(call => call.method === 'PATCH'))
}))

test('publisher contract falls back for no-write, forks and superseded runs; rejects unbound/unsafe artifact', async () => publisherFixture(async ({ env, data, state, request }) => {
  for (const reason of ['denied', 'stale', 'fork']) {
    state[reason] = true; assert.equal(await publishAdvisory(env, request), 'summary'); state[reason] = false
  }
  assert.ok(!state.calls.some(call => ['POST', 'PATCH', 'DELETE'].includes(call.method)))
  assert.throws(() => validateAdvisory({ ...data, head: 'a'.repeat(40) }, env))
  assert.throws(() => validateAdvisory({ ...data, markdown: data.markdown + '<script>unsafe</script>' }, env))
  assert.throws(() => validateAdvisory({ ...data, markdown: data.markdown + '@everyone' }, env))
}))

test('missing base object stays advisory-only; capture rejects ref names and cleans up failures', async () => fixture(async ({ repo, env }) => {
  env.DOC_BRIDGE_BASE_REVISION = 'a'.repeat(40)
  assert.equal(await analyzeAdvisory(env), 0)
  assert.match(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8'), /Advisory unavailable/u)
  await assert.rejects(withRevision(repo, 'HEAD', () => {}), /Exact base\/head/u)
  await assert.rejects(withRevision(repo, env.DOC_BRIDGE_HEAD_REVISION, () => { throw new Error('synthetic failure') }), /synthetic failure/u)
  assert.equal((await git(repo, 'worktree', 'list', '--porcelain')).match(/^worktree /gmu).length, 1)
}))

test('repository CI generates an ignored index before dogfood gates and Action smoke', () => {
  const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
  const ignore = readFileSync(resolve(root, '.gitignore'), 'utf8')
  assert.match(ignore, /\*\*\/\.doc-bridge\/\*/u)
  assert.doesNotMatch(ignore, /!\/\.doc-bridge\/index\.json/u)
  const build = ci.indexOf('name: Build deterministic repository index')
  const gates = ci.indexOf('name: Dogfood gate and documentation conformance')
  assert.ok(build >= 0 && gates > build)
  assert.match(ci.slice(build, gates), /node bin\/ak-docs\.js index[\s\S]*node bin\/ak-docs\.js index[\s\S]*cmp/u)
  assert.doesNotMatch(ci, /run: node bin\/ak-docs\.js gate run index-freshness/u)
})
