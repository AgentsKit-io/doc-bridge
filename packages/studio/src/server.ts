import { createServer, type Server } from 'node:http'
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { constants, openSync, closeSync, fstatSync, readFileSync, writeSync, fsyncSync, mkdirSync, realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadConfig, loadFreshDocBridgeIndex, discoverRepository, readEnrichmentOverlay,
  exportStudioGraph, searchStudioGraph, whyStudioNode, StudioGraphV1Schema,
  decideEnrichment, entityContentHash, writePromotionDraft,
  type StudioGraphV1, type StudioSearchV1, type StudioWhyV1,
} from '@agentskit/doc-bridge'

export type StudioAction = { requestId: string; action: 'approve' | 'reject' | 'prepare-draft'; proposalId: string; evidenceHash: string; indexHash: string; by: string; reason: string }
export type StudioBackend = { root?: string; graph(): StudioGraphV1; search(query: string): StudioSearchV1; why(id: string): StudioWhyV1; act(action: StudioAction): Promise<unknown> }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Studio operation failed'
const readJson = (path: string, max = 16_000_000): unknown => {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try { const stat = fstatSync(fd); if (!stat.isFile() || stat.size > max) throw new Error('Artifact exceeds read bounds'); return JSON.parse(readFileSync(fd, 'utf8')) }
  finally { closeSync(fd) }
}

export function createStudioBackend(options: { cwd: string; configPath?: string; findingsPath?: string }): StudioBackend {
  const loaded = loadConfig({ cwd: options.cwd, ...(options.configPath ? { explicitPath: options.configPath } : {}) })
  const root = resolve(dirname(loaded.path), loaded.config.project?.root ?? '.')
  const current = () => {
    const index = loadFreshDocBridgeIndex(root, loaded.config)
    const overlay = readEnrichmentOverlay(root)
    const findings = options.findingsPath ? readJson(resolve(root, options.findingsPath)) : undefined
    const graph = exportStudioGraph(index, { ...(overlay ? { overlay } : {}), ...(findings ? { findings: findings as NonNullable<Parameters<typeof exportStudioGraph>[1]>['findings'] } : {}) })
    return { index, overlay, graph }
  }
  return {
    root,
    graph: () => current().graph,
    search: query => { const { index, graph } = current(); return searchStudioGraph(index, graph, query) },
    why: id => whyStudioNode(current().graph, id),
    act: async action => {
      const { index, overlay, graph } = current()
      if (index.contentHash !== action.indexHash) throw new Error('Stale index binding. Refresh the graph before reviewing.')
      const shown = graph.proposals.find(item => item.id === action.proposalId)
      const pending = overlay?.pending.find(item => item.proposal.proposalId === action.proposalId)
      if (!shown || !pending || shown.evidenceHash !== action.evidenceHash) throw new Error('Proposal is unavailable or evidence changed. Refresh before reviewing.')
      const snapshot = discoverRepository({ root, config: loaded.config })
      if (overlay!.baseSnapshotHash !== snapshot.contentHash || overlay!.configurationHash !== snapshot.configurationHash || overlay!.sourceRevision !== snapshot.sourceRevision) throw new Error('Proposal revision/configuration is stale. Re-run enrichment or vault diff.')
      const entity = snapshot.entities.find(item => item.id === pending.proposal.entity)
      if (!entity || entityContentHash(entity) !== pending.proposal.targetContentHash) throw new Error('Proposal target is stale. Re-run enrichment or vault diff.')
      if (action.action === 'prepare-draft') {
        const branch = `doc-bridge/review-${action.requestId}`
        const path = join(root, '.doc-bridge', 'drafts', `studio-review-${action.requestId}.md`)
        const draftPath = writePromotionDraft(root, { ok: true, title: 'Review doc-bridge proposal', body: `Proposal: ${pending.proposal.proposalId}\n\n${pending.proposal.reason}\n\nEvidence: ${JSON.stringify(pending.proposal.evidence, null, 2)}\n\nReviewer: ${action.by}\nReason: ${action.reason}`, findings: [], classifications: [] }, path)
        const localPath = relative(root, draftPath).split(sep).join('/')
        return { ok: true, dryRun: true, draftPath: localPath, branch, commands: [`git checkout -b ${branch}`, `git add ${localPath}`, 'git commit -m "draft: doc-bridge proposal review"', `git push -u origin ${branch}`, `gh pr create --draft --title "Review doc-bridge proposal" --body-file ${localPath}`], message: 'Local preview only. Review before explicitly running any suggested command.' }
      }
      const result = await decideEnrichment({ root, proposalId: action.proposalId, decision: action.action === 'approve' ? 'approved' : 'rejected', by: action.by, reason: action.reason, snapshot })
      return { ok: true, approvalId: result.approvalId, overlayHash: result.overlay.contentHash, decision: action.action }
    },
  }
}

export const STUDIO_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
type RecordEntry = { request: StudioAction; hash: string; state: 'started' | 'done' | 'failed'; result?: unknown; error?: string }

export async function serveStudio(options: { backend: StudioBackend; stateDir: string; assetsDir?: string; port?: number; readOnly?: boolean }): Promise<{ server: Server; url: string; close(): Promise<void> }> {
  const token = randomBytes(32).toString('hex')
  mkdirSync(options.stateDir, { recursive: true })
  const fd = openSync(join(options.stateDir, 'actions.jsonl'), constants.O_RDWR | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600)
  const records = new Map<string, RecordEntry>()
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 8_000_000) throw new Error('Action journal is invalid or full')
    for (const line of readFileSync(fd, 'utf8').split('\n').filter(Boolean)) { const entry = JSON.parse(line) as RecordEntry; records.set(entry.request.requestId, entry) }
  } catch (error) { closeSync(fd); throw error }
  let journalBytes = fstatSync(fd).size
  const log = (entry: RecordEntry) => {
    const bytes = Buffer.from(JSON.stringify(entry) + '\n')
    if (journalBytes + bytes.length > 8_000_000) throw new Error('Action journal is full; archive it before reviewing.')
    writeSync(fd, bytes); fsyncSync(fd); journalBytes += bytes.length; records.set(entry.request.requestId, entry)
  }
  let queue = Promise.resolve()
  const assets = options.assetsDir ?? fileURLToPath(new URL('.', import.meta.url))
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', STUDIO_CSP)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    const reply = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) }
    try {
      const address = server.address()
      const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
      if (req.headers.host !== origin.slice(7) || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return reply(403, { error: 'Local same-origin requests only' })
      const url = new URL(req.url ?? '/', origin)
      const supplied = req.headers.authorization?.replace(/^Bearer /, '') ?? url.searchParams.get('token') ?? ''
      if (Buffer.byteLength(supplied) !== token.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) return reply(401, { error: 'Session token required; reopen the printed URL.' })
      if (req.method === 'GET') {
        if (url.pathname === '/api/graph') return reply(200, options.backend.graph())
        if (url.pathname === '/api/search') { const q = url.searchParams.get('q') ?? ''; if (q.length > 1024) return reply(400, { error: 'Query exceeds 1024 characters' }); return reply(200, options.backend.search(q)) }
        if (url.pathname === '/api/why') return reply(200, options.backend.why(url.searchParams.get('id') ?? ''))
        const files: Record<string, [string, string]> = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript'], '/app.css': ['app.css', 'text/css'] }
        const file = files[url.pathname]
        if (!file) return reply(404, { error: 'Route unavailable' })
        const content = await readFile(join(assets, file[0]), 'utf8')
        res.writeHead(200, { 'Content-Type': file[1] }); res.end(file[0] === 'index.html' ? content.replaceAll('SESSION_TOKEN', token).replace('SAMPLE_MODE', options.readOnly ? 'true' : 'false') : content); return
      }
      if (req.method !== 'POST' || url.pathname !== '/api/actions') return reply(405, { error: 'Method unavailable' })
      if (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') return reply(403, { error: 'Same-origin JSON actions required' })
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of req) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 8192) { reply(413, { error: 'Action exceeds byte limit' }); return }; chunks.push(bytes) }
      let action: StudioAction
      try {
        action = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks)))
        if (!action || typeof action !== 'object' || Array.isArray(action) || Object.keys(action).sort().join(',') !== 'action,by,evidenceHash,indexHash,proposalId,reason,requestId') throw new Error('Invalid fields')
        if (Object.values(action).some(value => typeof value === 'string' && value.includes(token))) throw new Error('Session token cannot enter action records')
        if (!['approve', 'reject', 'prepare-draft'].includes(action.action) || !/^[a-zA-Z0-9_-]{16,80}$/.test(action.requestId) || !/^[a-f0-9]{64}$/.test(action.evidenceHash) || !/^[a-f0-9]{64}$/.test(action.indexHash)) throw new Error('Invalid binding')
        for (const key of ['proposalId', 'by', 'reason'] as const) if (typeof action[key] !== 'string' || !action[key].trim() || action[key].length > 1024 || /[\x00-\x1f]/.test(action[key])) throw new Error('Invalid reviewer, proposal or reason')
      } catch { return reply(400, { error: 'Invalid action. Supply exact bindings, reviewer, reason and request ID.' }) }
      const hash = createHash('sha256').update(JSON.stringify(Object.entries(action).sort())).digest('hex')
      const run = queue.then(async () => {
        const previous = records.get(action.requestId)
        if (previous) {
          if (previous.hash !== hash) return reply(409, { error: 'Request ID already binds a different action' })
          if (previous.state === 'done') return reply(200, previous.result)
          return reply(409, { error: previous.error ?? 'Prior action interrupted; inspect engine records before a new review.' })
        }
        // Reserve room for completion before an operation changes engine state.
        if (journalBytes > 7_900_000) return reply(409, { error: 'Action journal is full; archive it before reviewing.' })
        log({ request: action, hash, state: 'started' })
        try { if (options.readOnly) throw new Error('Sample mode is read-only; synthetic evidence cannot authorize actions.'); const result = await options.backend.act(action); log({ request: action, hash, state: 'done', result }); reply(200, result) }
        catch (error) { const message = errorText(error); log({ request: action, hash, state: 'failed', error: message }); reply(409, { error: message }) }
      })
      queue = run.catch(() => {})
      await run
    } catch (error) { if (!res.headersSent) reply(409, { error: errorText(error) }); else res.end() }
  })
  server.requestTimeout = 15_000; server.headersTimeout = 10_000
  try { await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', () => { server.off('error', reject); accept() }) }) }
  catch (error) { closeSync(fd); throw error }
  server.once('close', () => closeSync(fd))
  const address = server.address() as { port: number }
  return { server, url: `http://127.0.0.1:${address.port}/?token=${token}`, close: async () => {
    const stopped = new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()))
    await queue
    server.closeAllConnections()
    await stopped
  } }
}

export async function startStudio(options: { cwd: string; configPath?: string; sample?: string; findingsPath?: string }): Promise<void> {
  let backend: StudioBackend
  if (options.sample) {
    if (!['synthetic', 'doc-bridge', 'agentskit'].includes(options.sample)) throw new Error('Unknown committed Studio sample')
    const graph = StudioGraphV1Schema.parse(readJson(fileURLToPath(new URL(`./samples/${options.sample}.json`, import.meta.url))))
    backend = { graph: () => graph, why: id => whyStudioNode(graph, id), search: () => { throw new Error('Sample mode has no matching search index. Use label filters or open a real indexed repository.') }, act: async () => { throw new Error('Sample mode is read-only; synthetic evidence cannot authorize actions.') } }
  } else backend = createStudioBackend(options)
  const root = realpathSync(backend.root ?? options.cwd)
  const stateDir = join(root, '.doc-bridge', 'studio')
  mkdirSync(stateDir, { recursive: true })
  if (!realpathSync(stateDir).startsWith(root + sep)) throw new Error('Studio state path escapes repository')
  const running = await serveStudio({ backend, stateDir, readOnly: Boolean(options.sample) })
  // The URL is the capability: never log it to action records or include it in reports.
  process.stdout.write(`doc-bridge Studio: ${running.url}\nKeep this local session URL private. Press Ctrl-C to stop.\n`)
  const stop = () => { void running.close(); process.off('SIGINT', stop); process.off('SIGTERM', stop) }
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
}
