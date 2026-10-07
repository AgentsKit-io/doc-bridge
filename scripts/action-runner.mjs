import { createRequire } from 'node:module'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const shaPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u
const sourceMode = value => { if (!['committed', 'ci-built'].includes(value)) throw new Error('Invalid index-source'); return value }
const exactRevision = value => { if (!shaPattern.test(value ?? '')) throw new Error('Exact base/head Git hashes are required; checkout must provide both objects'); return value }
const boolean = value => { if (!['true', 'false'].includes(value ?? 'false')) throw new Error('Boolean input must be true or false'); return value === 'true' }
const output = (name, value, env) => { if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${name}=${String(value).replace(/[\r\n]/gu, '')}\n`) }
// Resolve the existing process helpers from the trusted engine installation, not the PR.
const helpers = async cli => import(createRequire(resolve(cli)).resolve('@agentskit/cross-platform'))
const filtersFor = async (root, cli) => {
  const { runCommand } = await helpers(cli)
  const configured = await runCommand('git', ['config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|smudge|process|required)$'], { cwd: root, maxOutputBytes: 65536, timeoutMs: 60000 })
  if (![0, 1].includes(configured.code) || configured.truncated) throw new Error('Git filter inventory unavailable')
  const filters = [...new Set(configured.stdout.split('\0').filter(Boolean))]
  if (filters.length > 128) throw new Error('Git filter inventory exceeds budget')
  return filters
}
const git = async (root, args, cli) => {
  const { runCommand } = await helpers(cli)
  const filters = args[0] === 'status' ? await filtersFor(root, cli) : []
  const disabled = filters.flatMap(key => ['-c', `${key}=${key.endsWith('.required') ? 'false' : ''}`])
  const result = await runCommand('git', ['-c', 'core.hooksPath=', '-c', 'core.fsmonitor=false', ...disabled, ...args], { cwd: root, timeoutMs: 60000, maxOutputBytes: 64 * 1024 * 1024 })
  if (result.code !== 0 || result.truncated) throw new Error(`Git ${args[0]} evidence unavailable${args[0] === 'worktree' ? ': exact revision object missing or capture unavailable' : ''}${result.truncated ? ': output limit exceeded' : ''}`)
  return result.stdout
}
const blob = async (root, hash, bytes, cli) => {
  const { spawnProcess } = await helpers(cli)
  const child = spawnProcess('git', ['-c', 'core.fsmonitor=false', 'cat-file', 'blob', hash], { cwd: root, stdin: 'ignore', stdout: 'pipe', stderr: 'ignore', timeoutMs: 60000 })
  const chunks = []; let size = 0
  for await (const chunk of child.stdout) {
    size += chunk.length
    if (size > bytes) { await child.kill(); throw new Error('Git blob exceeds declared size') }
    chunks.push(Buffer.from(chunk))
  }
  const status = await child.exited
  if (status.code !== 0 || size !== bytes) throw new Error('Git blob size mismatch')
  return Buffer.concat(chunks)
}
const annotation = message => `::notice title=Doc Bridge advisory::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`

/** Materialize Git blobs without checkout filters, hooks, submodules or head scripts. */
export const withRevision = async (root, revision, run, cli = resolve(import.meta.dirname, '../bin/ak-docs.js')) => {
  exactRevision(revision)
  const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-revision-'))
  const checkout = join(directory, 'checkout')
  let added = false
  const started = performance.now()
  try {
    await git(root, ['worktree', 'add', '--detach', '--no-checkout', checkout, revision], cli); added = true
    const entries = (await git(root, ['ls-tree', '-rz', '--long', revision], cli)).split('\0').filter(Boolean)
    if (entries.length > 100000) throw new Error('Revision exceeds file budget')
    let total = 0
    for (const entry of entries) {
      if (performance.now() - started > 60000) throw new Error('Revision capture exceeds time budget')
      const match = /^(\d+) (\w+) ([0-9a-f]+)\s+(\d+|-)\t([\s\S]+)$/u.exec(entry)
      if (!match) throw new Error('Invalid Git tree entry')
      const [, mode, kind, hash, size, path] = match
      if (path.startsWith('/') || path.includes('\\') || path.includes(':') || path.split('/').some(part => part === '..' || part.toLowerCase() === '.git')) throw new Error('Unsafe Git path')
      if (kind !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error('Symlinks and submodules require a separately authorized capture')
      const bytes = Number(size)
      total += bytes
      if (bytes > 64 * 1024 * 1024 || total > 512 * 1024 * 1024) throw new Error('Revision exceeds byte budget')
      const contents = await blob(root, hash, bytes, cli)
      if (contents.length !== bytes) throw new Error('Git blob size mismatch')
      const target = join(checkout, path)
      mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, contents, { mode: mode === '100755' ? 0o755 : 0o644 })
    }
    await git(checkout, ['read-tree', revision], cli)
    return await run(realpathSync(checkout))
  } finally {
    try { if (added) await git(root, ['worktree', 'remove', '--force', checkout], cli) }
    finally { rmSync(directory, { recursive: true, force: true }) }
  }
}
const engine = async (env, args) => {
  const { runCommand } = await helpers(env.DOC_BRIDGE_CLI_PATH)
  // Even Git status can invoke a configured clean/process filter. Neutralize every filter.
  const filters = await filtersFor(env.GITHUB_WORKSPACE, env.DOC_BRIDGE_CLI_PATH)
  const childEnv = { ...Object.fromEntries(Object.entries(env).filter(([key]) => !/(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|^GIT_CONFIG)/iu.test(key))), GIT_CONFIG_COUNT: String(filters.length + 2), GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false', GIT_CONFIG_KEY_1: 'core.hooksPath', GIT_CONFIG_VALUE_1: '' }
  for (const [index, key] of filters.entries()) { childEnv[`GIT_CONFIG_KEY_${index + 2}`] = key; childEnv[`GIT_CONFIG_VALUE_${index + 2}`] = key.endsWith('.required') ? 'false' : '' }
  const result = await runCommand(process.execPath, [resolve(env.DOC_BRIDGE_CLI_PATH), ...args], {
    // The analyzer never receives write credentials, even if its caller has them.
    env: childEnv,
    maxOutputBytes: 64 * 1024 * 1024, timeoutMs: 180000,
  })
  if (result.code !== 0 || result.truncated) {
    let cause = result.timedOut ? 'engine analysis time limit exceeded' : result.truncated ? 'engine output limit exceeded' : `${args[0] === 'action' ? args[1] : args[0]} evidence unavailable (engine exit ${result.code})`
    if (/No doc-bridge config found/u.test(result.stderr ?? '')) cause = 'No doc-bridge config found — run ak-docs init or pass config-path'
    else if (args[0] === 'action' && args[1] === 'index' && args.includes('--report')) {
      const path = args[args.indexOf('--report') + 1]
      if (statSafe(path)) {
        const report = JSON.parse(readFileSync(path, 'utf8'))
        const failed = report.results?.filter(item => item.ok === false).map(item => item.id).slice(0, 5)
        if (failed?.length) cause = `Blocking gates failed: ${failed.join(', ')}`
      }
    } else {
      // Only known diagnostics leave the child-output boundary; never log arbitrary PR text.
      const known = ['HEAD_PARTITION_MISMATCH', 'INCOMPATIBLE_RESOURCE_LIMITS', 'Analysis requires a clean checkout', 'Revision exceeds', 'exceeds byte budget', 'exceeds time budget', 'Advisory Markdown exceeds', 'Artifact destination must be outside', 'Service configuration path escapes', 'Invalid permitted service configuration']
      cause = /(?:Repository scan exceeded the \d+ (?:ms time|MiB memory|file|byte) limit|Documentation (?:file|corpus) exceeds the \d+ byte (?:limit|read budget))/u.exec(result.stderr ?? '')?.[0] ?? known.find(message => (result.stderr ?? '').includes(message)) ?? cause
    }
    throw new Error(cause)
  }
  return result.stdout
}
const configArgs = env => env.DOC_BRIDGE_CONFIG_PATH ? ['--config', env.DOC_BRIDGE_CONFIG_PATH] : []
const artifacts = env => mkdtempSync(join(env.RUNNER_TEMP ?? tmpdir(), 'doc-bridge-action-'))

export const analyzeIndex = async env => {
  const source = sourceMode(env.DOC_BRIDGE_INDEX_SOURCE ?? 'committed')
  const head = exactRevision(env.DOC_BRIDGE_HEAD_REVISION)
  const directory = artifacts(env)
  const report = join(directory, 'index-report.json')
  output('report', report, env); output('source', source, env); output('revision', head, env)
  try {
    const analyze = root => engine(env, ['action', 'index', '--root', root, '--revision', head, '--index-source', source, '--output', join(directory, 'index.json'), '--report', report, ...configArgs(env), ...(env.DOC_BRIDGE_GATE_ID ? ['--gate', env.DOC_BRIDGE_GATE_ID] : [])])
    const workspace = realpathSync(env.GITHUB_WORKSPACE)
    const matches = (await git(workspace, ['rev-parse', 'HEAD'], env.DOC_BRIDGE_CLI_PATH)).trim() === head
    const clean = matches && !(await git(workspace, ['status', '--porcelain', '--untracked-files=all'], env.DOC_BRIDGE_CLI_PATH)).trim()
    // Preserve CI-prepared ignored conformance artifacts only in the verified exact checkout.
    if (clean) await analyze(workspace)
    else await withRevision(workspace, head, analyze, env.DOC_BRIDGE_CLI_PATH)
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### Doc Bridge blocking gates\n\nIndex source: ${source}; revision: ${head}.\n\n${summaryCode(readFileSync(report, 'utf8'))}\n`)
    return 0
  } catch (error) {
    const cause = error instanceof Error ? error.message.slice(0, 1000) : 'Blocking validation failed'
    if (!statSafe(report)) writeFileSync(report, JSON.stringify({ ok: false, error: cause }, null, 2))
    console.log(`::error title=Doc Bridge gates::${cause.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}; see index-report output (advisory delivery does not clear this result)`)
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### Doc Bridge blocking gates failed\n\nIndex source: ${source}; revision: ${head}.\n\n${statSafe(report) ? summaryCode(readFileSync(report, 'utf8')) : 'Analysis did not produce a report; check exact revision/configuration availability.'}\n`)
    return 1
  }
}
const summaryCode = text => `<pre>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('@', '&#64;')}</pre>`
const statSafe = path => { try { return statSync(path).size <= 4 * 1024 * 1024 } catch { return false } }
export const analyzeAdvisory = async env => {
  if (!boolean(env.DOC_BRIDGE_ADVISORY)) { output('status', 'disabled', env); return 0 }
  const directory = artifacts(env)
  const report = join(directory, 'advisory.json')
  const base = exactRevision(env.DOC_BRIDGE_BASE_REVISION)
  const head = exactRevision(env.DOC_BRIDGE_HEAD_REVISION)
  const source = sourceMode(env.DOC_BRIDGE_INDEX_SOURCE ?? 'committed')
  output('report', report, env)
  let exit = 0
  let phase = `base object ${base}`
  try {
    const baseFile = join(directory, 'base.json'), headFile = join(directory, 'head.json')
    await withRevision(env.GITHUB_WORKSPACE, base, root => engine(env, ['action', 'snapshot', '--root', root, '--revision', base, '--output', baseFile, ...configArgs(env)]), env.DOC_BRIDGE_CLI_PATH)
    phase = `head object ${head}`
    await withRevision(env.GITHUB_WORKSPACE, head, async root => {
      await engine(env, ['action', 'snapshot', '--root', root, '--revision', head, '--output', headFile, ...configArgs(env)])
      phase = 'base/head diff evidence'
      await engine(env, ['diff', '--advisory', '--base', baseFile, '--head', headFile, '--root', root, '--repository', env.GITHUB_REPOSITORY, '--pr', env.DOC_BRIDGE_PR_NUMBER, '--index-source', source, '--output', report, ...configArgs(env)])
    }, env.DOC_BRIDGE_CLI_PATH)
    const artifact = validateAdvisory(JSON.parse(readFileSync(report, 'utf8')), env)
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, artifact.markdown)
    console.log(annotation(`Advisory findings: ${artifact.findingCount}. The full report is in the job summary.`))
    if (boolean(env.DOC_BRIDGE_FAIL_ON_FINDINGS) && artifact.findingCount > 0) exit = 1
    output('status', 'analyzed', env)
  } catch (error) {
    output('status', 'unavailable', env)
    const message = `Advisory unavailable (${phase}): ${error instanceof Error ? error.message.slice(0, 1000) : 'analysis evidence unavailable'}. Blocking gate results are unchanged.`
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### Doc Bridge advisory unavailable\n\n${message}\n`)
    console.log(annotation(message))
  }
  return exit
}

export const validateAdvisory = (data, env) => {
  const repository = env.GITHUB_REPOSITORY, pr = Number(env.DOC_BRIDGE_PR_NUMBER)
  const base = exactRevision(env.DOC_BRIDGE_BASE_REVISION), head = exactRevision(env.DOC_BRIDGE_HEAD_REVISION)
  const source = sourceMode(env.DOC_BRIDGE_INDEX_SOURCE ?? 'committed')
  const marker = `<!-- doc-bridge:advisory:v1:${repository}:${pr} -->`
  const binding = `<!-- doc-bridge:revisions:${base}:${head}:${source} -->`
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? '') || repository.length > 256 || !Number.isSafeInteger(pr) || pr < 1 || data?.schemaVersion !== 1 || data.repository !== repository || data.pr !== pr || data.base !== base || data.head !== head || data.source !== source || data.marker !== marker || typeof data.markdown !== 'string' || Buffer.byteLength(data.markdown) > 60000 || !data.markdown.startsWith(`${marker}\n${binding}\n`) || !Number.isSafeInteger(data.findingCount) || data.findingCount < 0) throw new Error('Advisory artifact binding/size invalid')
  // Publisher accepts generated Markdown only, never raw HTML, mentions or workflow commands.
  const content = data.markdown.slice(marker.length + binding.length + 2)
  if (/<|>|@[A-Za-z0-9]|::(?:error|warning|notice|add-mask|set-output)/iu.test(content)) throw new Error('Unsafe advisory content')
  return data
}

/** Publisher has no source checkout or child process calls; it consumes one bounded artifact. */
export const publishAdvisory = async (env, request = fetch) => {
  const fallback = reason => {
    const message = `Comment fallback: ${reason}; advisory remains in the job summary/artifact and annotations. Blocking gate results are unchanged.`
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `\n${message}\n`)
    console.log(annotation(message)); output('status', 'summary', env); return 'summary'
  }
  if (!boolean(env.DOC_BRIDGE_COMMENT)) return fallback('comment publishing disabled')
  if (!env.DOC_BRIDGE_ADVISORY_REPORT || !statSafe(env.DOC_BRIDGE_ADVISORY_REPORT)) return fallback('advisory artifact unavailable')
  try {
    const data = validateAdvisory(JSON.parse(readFileSync(env.DOC_BRIDGE_ADVISORY_REPORT, 'utf8')), env)
    // URLs and revision checks use only the runner's trusted environment; the artifact supplies the comment text.
    const trusted = { repository: env.GITHUB_REPOSITORY, pr: Number(env.DOC_BRIDGE_PR_NUMBER), base: exactRevision(env.DOC_BRIDGE_BASE_REVISION), head: exactRevision(env.DOC_BRIDGE_HEAD_REVISION) }
    if (!env.DOC_BRIDGE_TOKEN) return fallback('write token unavailable')
    // The endpoint is fixed; tokens are never sent to a caller-selected host.
    const endpoint = `https://api.github.com/repos/${trusted.repository}`
    const api = async (path, method = 'GET', body) => {
      const response = await request(path === '/user' ? 'https://api.github.com/user' : `${endpoint}${path}`, { method, headers: { Authorization: `Bearer ${env.DOC_BRIDGE_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error(`Endpoint status ${response.status}`)
      const bytes = await response.text()
      if (Buffer.byteLength(bytes) > 4 * 1024 * 1024) throw new Error('Endpoint response exceeds budget')
      return bytes ? JSON.parse(bytes) : undefined
    }
    const current = async () => {
      const pr = await api(`/pulls/${trusted.pr}`)
      return pr.head?.sha === trusted.head && pr.base?.sha === trusted.base && pr.head?.repo?.full_name === trusted.repository && pr.base?.repo?.full_name === trusted.repository
    }
    // Forks are summary-only, even if a privileged token was accidentally provided.
    if (!(await current())) return fallback('fork or superseded revision binding')
    const actor = await api('/user').catch(() => ({ id: 41898282, login: 'github-actions[bot]', type: 'Bot' }))
    if (!Number.isSafeInteger(actor?.id)) throw new Error('Token author unavailable')
    const comments = async () => {
      const found = []
      for (let page = 1; page <= 10; page++) {
        const list = await api(`/issues/${trusted.pr}/comments?per_page=100&page=${page}`)
        if (!Array.isArray(list)) throw new Error('Invalid comment listing')
        found.push(...list.filter(comment => comment.user?.id === actor.id && comment.user?.login === actor.login && typeof comment.body === 'string' && comment.body.startsWith(`${data.marker}\n`) && Number.isSafeInteger(comment.id)))
        if (list.length < 100) return found.sort((a,b) => a.id - b.id)
      }
      throw new Error('Comment inventory exceeds budget')
    }
    // Serialize Action runs with caller workflow concurrency; recheck before each bounded attempt.
    for (let attempt = 0; attempt < 2; attempt++) {
      const own = await comments()
      if (!(await current())) return fallback('superseded run')
      try {
        if (own.length) await api(`/issues/comments/${own[0].id}`, 'PATCH', { body: data.markdown })
        else await api(`/issues/${trusted.pr}/comments`, 'POST', { body: data.markdown })
        const observed = await comments()
        if (!(await current())) return fallback('superseded run after delivery')
        if (!observed.some(comment => comment.body === data.markdown)) throw new Error('Delivery not observed')
        for (const duplicate of observed.slice(1)) {
          if (!(await current())) return fallback('superseded run during deduplication')
          await api(`/issues/comments/${duplicate.id}`, 'DELETE')
        }
        output('status', 'comment', env); return 'comment'
      } catch {
        // Reconcile an uncertain write before attempting another create/update.
        const observed = await comments()
        if (observed.length === 1 && observed[0].body === data.markdown && await current()) { output('status', 'comment', env); return 'comment' }
        if (attempt === 1) throw new Error('Comment delivery unavailable')
      }
    }
  } catch { return fallback('permission denied, unsupported event/token, or delivery unavailable') }
  return fallback('delivery not confirmed')
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const mode = process.argv[2]
    process.exitCode = mode === 'index' ? await analyzeIndex(process.env) : mode === 'advisory' ? await analyzeAdvisory(process.env) : mode === 'publish' ? (await publishAdvisory(process.env), 0) : 2
  } catch { console.error('Doc Bridge Action input or artifact validation failed'); process.exitCode = 2 }
}
