import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MultiDirectedGraph } from 'graphology'
import Sigma from 'sigma'
import type { StudioGraphV1, StudioNodeV1, StudioSearchV1, StudioWhyV1 } from '@agentskit/doc-bridge'
import { graphTheme, nodeKinds } from './theme.js'

const sampleMode = document.getElementById('root')?.dataset.sample === 'true'
const token = new URL(location.href).searchParams.get('token') ?? ''
async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), signal })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? 'Disconnected session; reopen the printed URL.')
  return value
}
const message = (error: unknown) => error instanceof Error ? error.message : 'Operation failed'
function GraphCanvas({ nodes, edges, selected, select, dark }: { dark: boolean; nodes: StudioNodeV1[]; edges: StudioGraphV1['edges']; selected: string; select(id: string): void }) {
  const container = useRef<HTMLDivElement>(null)
  const renderer = useRef<Sigma | null>(null)
  const [failure, setFailure] = useState('')
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const update = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!container.current || !nodes.length) return
    const palette = graphTheme(dark)
    const graph = new MultiDirectedGraph()
    const ids = new Set(nodes.map(node => node.id))
    // Stable ID-derived positions: filtering never starts a moving force layout.
    for (const node of nodes) {
      let hash = 2166136261; for (const char of node.id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
      const angle = (hash % 3600) * Math.PI / 1800; const radius = 1 + (hash % 97) / 35
      graph.addNode(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, label: `${node.kind}: ${node.label}`, size: 4 + Math.min(12, (node.metrics.canonicality ?? 0) * 80), color: node.id === selected ? palette.selected : palette.node })
    }
    for (const edge of edges) if (ids.has(edge.from) && ids.has(edge.to)) graph.addEdgeWithKey(edge.id, edge.from, edge.to, { color: palette.edge, label: `${edge.kind} →`, size: 1 })
    try {
      // Sigma divides by duration; 1ms avoids zero and finishes before an interpolated frame.
      const sigma = new Sigma(graph, container.current, { ...(reducedMotion ? { inertiaRatio: 0, inertiaDuration: 1, zoomDuration: 1, doubleClickZoomingDuration: 1 } : {}), renderEdgeLabels: true, labelColor: { color: palette.label }, enableEdgeEvents: true })
      renderer.current = sigma; setFailure('')
      sigma.on('clickNode', ({ node }) => select(node))
      sigma.on('clickEdge', ({ edge }) => { const source = graph.source(edge); select(source) })
      return () => { sigma.kill(); renderer.current = null }
    } catch { setFailure('WebGL unavailable. Use the accessible entity list below.') }
  }, [nodes, edges, selected, select, dark, reducedMotion])
  return <section aria-label="Knowledge graph"><p>Layout frozen · Node size: canonicality (review signal). Labels name each kind. Edge labels show direction; select a node to inspect its relationships.</p><div className="toolbar"><button onClick={() => renderer.current?.getCamera().setState({ ratio: (renderer.current?.getCamera().getState().ratio ?? 1) / 1.5 })}>Zoom in</button><button onClick={() => renderer.current?.getCamera().setState({ ratio: (renderer.current?.getCamera().getState().ratio ?? 1) * 1.5 })}>Zoom out</button><button onClick={() => renderer.current?.getCamera().setState({ x: .5, y: .5, ratio: 1 })}>Reset graph</button></div><div ref={container} className="canvas" aria-hidden="true" />{failure ? <p role="status">{failure}</p> : null}</section>
}
function App() {
  const [view, setView] = useState('graph')
  const [graph, setGraph] = useState<StudioGraphV1 | null>(null)
  const [kind, setKind] = useState(''); const [area, setArea] = useState(''); const [relation, setRelation] = useState(''); const [label, setLabel] = useState('')
  const [selected, setSelected] = useState(''); const [why, setWhy] = useState<StudioWhyV1 | null>(null); const [focus, setFocus] = useState(false)
  const [query, setQuery] = useState(''); const [results, setResults] = useState<StudioSearchV1 | null>(null)
  const [status, setStatus] = useState('Loading graph…'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [by, setBy] = useState(''); const [reason, setReason] = useState(''); const [draft, setDraft] = useState<unknown>(null)
  const [dark, setDark] = useState(false)
  const refreshButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null); const pane = useRef<HTMLElement>(null)
  const searchAbort = useRef<AbortController | null>(null)
  const actionIds = useRef(new Map<string, string>())
  async function refresh() {
    setStatus('Loading graph…'); setError('')
    try { setGraph(await api<StudioGraphV1>('/api/graph')); setStatus('Graph refreshed.'); actionIds.current.clear() } catch (e) { setError(message(e)); setStatus('Graph unavailable. Run ak-docs index and refresh.') }
  }
  useEffect(() => { void refresh(); return () => searchAbort.current?.abort() }, [])
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light' }, [dark])
  useEffect(() => {
    if (!selected) { setWhy(null); return }
    const controller = new AbortController()
    setStatus('Loading entity evidence…')
    api<StudioWhyV1>(`/api/why?id=${encodeURIComponent(selected)}`, undefined, controller.signal).then(value => { setWhy(value); setStatus('Entity evidence loaded.'); pane.current?.focus() }).catch(e => { if (!controller.signal.aborted) { setWhy(null); setError(message(e)) } })
    return () => controller.abort()
  }, [selected, graph?.source.indexHash])
  const select = React.useCallback((id: string) => { returnFocus.current = document.activeElement as HTMLElement; setSelected(id) }, [])
  function close() { setSelected(''); setFocus(false); if (returnFocus.current?.isConnected) returnFocus.current.focus(); else refreshButton.current?.focus() }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (selected && event.key === 'Escape') close() }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [selected])
  const edges = useMemo(() => graph?.edges.filter(edge => !relation || edge.kind === relation) ?? [], [graph, relation])
  const nodes = useMemo(() => {
    const neighbors = new Set([selected]); if (focus) for (const edge of edges) { if (edge.from === selected) neighbors.add(edge.to); if (edge.to === selected) neighbors.add(edge.from) }
    const linked = new Set(edges.flatMap(edge => [edge.from, edge.to]))
    return graph?.nodes.filter(node => (!kind || node.kind === kind) && (!area || node.areaId === area || node.id === area) && (!label || `${node.label} ${node.path ?? ''}`.toLowerCase().includes(label.toLowerCase())) && (!focus || neighbors.has(node.id)) && (!relation || linked.has(node.id))) ?? []
  }, [graph, edges, kind, area, label, focus, selected, relation])
  async function search(event: React.FormEvent) {
    event.preventDefault(); searchAbort.current?.abort()
    if (!query.trim()) { setStatus('Enter a query to search.'); return }
    const controller = new AbortController(); searchAbort.current = controller; setStatus('Searching…'); setError('')
    try { const found = await api<StudioSearchV1>(`/api/search?q=${encodeURIComponent(query)}`, undefined, controller.signal); setResults(found); setStatus(found.results.length ? `${found.results.length} ranked matches.` : 'No matches in this bounded graph.') } catch (e) { if (!controller.signal.aborted) { setError(message(e)); setStatus('Search failed; previous results retained.') } }
  }
  async function act(proposal: StudioGraphV1['proposals'][number], action: 'approve' | 'reject' | 'prepare-draft') {
    if (!graph) return
    const key = JSON.stringify([proposal.id, proposal.evidenceHash, graph.source.indexHash, action, by, reason])
    const requestId = actionIds.current.get(key) ?? crypto.randomUUID(); actionIds.current.set(key, requestId)
    setBusy(true); setStatus('Validating current evidence…'); setError('')
    try {
      const value = await api('/api/actions', { requestId, action, proposalId: proposal.id, evidenceHash: proposal.evidenceHash, indexHash: graph.source.indexHash, by, reason })
      if (action === 'prepare-draft') setDraft(value)
      else {
        setGraph(previous => previous ? { ...previous, proposals: previous.proposals.map((item): StudioGraphV1['proposals'][number] => item.id === proposal.id ? { ...item, status: action === 'approve' ? 'accepted' : 'rejected' } : item) } : previous)
        try { setGraph(await api('/api/graph')) } catch { setError('Decision recorded. Graph refresh failed; run ak-docs index, then Refresh.') }
      }
      setStatus(action === 'prepare-draft' ? 'Local draft prepared. No remote operation performed.' : 'Decision recorded. Source documents remain unchanged.')
    } catch (e) { setError(message(e)); setStatus('Review failed. Draft text retained; refresh before a new review.') } finally { setBusy(false) }
  }
  return <main><header><h1>doc-bridge <span>Studio</span></h1><div className="toolbar"><button ref={refreshButton} onClick={() => void refresh()} disabled={busy}>Refresh</button><button aria-pressed={dark} onClick={() => setDark(!dark)}>Dark theme</button></div></header><nav aria-label="Studio views">{['graph', 'inbox', 'search'].map(name => <button key={name} aria-current={view === name ? 'page' : undefined} onClick={() => setView(name)}>{name === 'graph' ? 'Knowledge graph' : name === 'inbox' ? 'Drift inbox' : 'Search and why'}</button>)}</nav><p role="status" aria-live="polite">{status}</p>{sampleMode ? <p role="note">Read-only sample. Browse the graph and evidence; decisions require a real indexed repository.</p> : null}{error ? <p role="alert" className="error">{error}</p> : null}
    {graph ? <><section aria-label="Coverage"><p>Index: <code>{graph.source.indexHash}</code></p><p>{Object.entries(graph.truncation).map(([name, count]) => `${name}: ${count.emitted}/${count.total} (${count.omitted} omitted)`).join(' · ')}</p><p>History entities: {graph.coverage.entities}. Findings: {graph.coverage.findings}. Proposals: {graph.coverage.proposals}.</p><details><summary>Coverage and limitations</summary><ul>{graph.coverage.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul><pre>{JSON.stringify(graph.coverage.entityAnalysis, null, 2)}</pre></details></section>
    {view === 'graph' ? <><div className="filters"><label>Kind<select value={kind} onChange={e => setKind(e.target.value)}><option value="">All kinds</option>{nodeKinds.map(value => <option key={value}>{value}</option>)}</select></label><label>Area<select value={area} onChange={e => setArea(e.target.value)}><option value="">All areas</option>{graph.nodes.filter(node => node.kind === 'area').map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label><label>Relation<select value={relation} onChange={e => setRelation(e.target.value)}><option value="">All relations</option>{[...new Set(graph.edges.map(edge => edge.kind))].sort().map(value => <option key={value}>{value}</option>)}</select></label><label>Label or path filter<input value={label} onChange={e => setLabel(e.target.value)} /></label><label><input type="checkbox" checked={focus} disabled={!selected} onChange={e => setFocus(e.target.checked)} />Focus on selection and neighbors</label></div><details><summary>Kind legend</summary><p>{nodeKinds.join(' · ')}. Kind text accompanies every node. Canonicality measures graph prominence, not correctness. Missing metrics are unavailable.</p></details>{selected && !nodes.some(node => node.id === selected) ? <p>Selected entity is hidden by filters; its evidence remains open.</p> : null}<GraphCanvas dark={dark} nodes={nodes} edges={edges} selected={selected} select={select} /><h2>Accessible entity list ({nodes.length})</h2>{!nodes.length ? <p>No entities match. Clear filters, or run ak-docs index in an empty repository.</p> : null}<ul className="entities">{nodes.map(node => <li key={node.id}><button aria-pressed={selected === node.id} onClick={() => select(node.id)}>{node.kind}: {node.label}</button>{node.path ? <small>{node.path}</small> : null}</li>)}</ul></> : null}
    {view === 'inbox' ? <><h2>Reference findings</h2>{graph.coverage.findings === 'not-analyzed' ? <p>Findings not analyzed. Supply a current finding artifact with --findings; this is not evidence of no drift.</p> : null}{[...graph.findings].sort((a, b) => `${a.finding.assertion.document}:${a.finding.routing}:${a.finding.severity}`.localeCompare(`${b.finding.assertion.document}:${b.finding.routing}:${b.finding.severity}`)).map(item => <article key={item.finding.id}><h3>{item.finding.assertion.document} · {item.code.replaceAll('_', ' ').toLowerCase()}</h3><p>{item.finding.status} · {item.finding.routing} · {item.finding.severity}{item.finding.documentationUpdate ? ' · Updated in this change (requires review)' : ''}</p><details><summary>Bound revision, configuration and evidence</summary><pre>{JSON.stringify(item.finding, null, 2)}</pre></details></article>)}<h2>Proposed corrections</h2><p>Decisions concern corrections; rejecting a correction preserves the finding. Accepted does not mean merged or verified.</p><div className="filters"><label>Reviewer identity<input disabled={sampleMode} value={by} onChange={e => setBy(e.target.value)} autoComplete="off" /></label><label>Review reason<textarea disabled={sampleMode} value={reason} onChange={e => setReason(e.target.value)} /></label></div>{graph.coverage.proposals === 'not-analyzed' ? <p>Proposals not analyzed. Run ak-docs enrich or ak-docs vault diff.</p> : null}{graph.proposals.map(proposal => <article key={proposal.id}><h3>{proposal.label}</h3><p>{proposal.kind} · {proposal.status}</p><code>{proposal.id}</code><p>Evidence: {proposal.evidenceHash}</p>{proposal.prUrl ? <p><a href={proposal.prUrl} target="_blank" rel="noreferrer">Open attached PR</a></p> : <p>No PR attached.</p>}{proposal.targetIds.map(id => <button key={id} onClick={() => select(id)}>Inspect {id}</button>)}<div className="toolbar">{(['approve', 'reject', 'prepare-draft'] as const).map(action => <button key={action} disabled={sampleMode || busy || proposal.status !== 'proposed' || !by.trim() || !reason.trim()} onClick={() => void act(proposal, action)}>{action === 'prepare-draft' ? 'Prepare draft PR preview' : action === 'approve' ? 'Approve correction' : 'Reject correction'}</button>)}</div></article>)}{draft ? <details open><summary>Local draft preview</summary><pre>{JSON.stringify(draft, null, 2)}</pre></details> : null}</> : null}
    {view === 'search' ? <><h2>Ranked search</h2>{sampleMode ? <p role="note">Ranked search is unavailable in sample mode because no matching index is supplied. Use the graph label filter, or open a real indexed repository.</p> : null}<form onSubmit={search}><label>Search indexed documents and modules<input disabled={sampleMode} value={query} maxLength={1024} onChange={e => setQuery(e.target.value)} /></label><button disabled={sampleMode}>Search</button><button type="button" disabled={sampleMode} onClick={() => { searchAbort.current?.abort(); setStatus('Search cancelled. Previous results retained.') }}>Cancel search</button></form><p>Decision, concept and change labels are available through the graph label filter.</p>{results ? <><p>Result index: <code>{results.indexHash}</code></p>{results.results.map(result => <article key={result.nodeId}><button onClick={() => select(result.nodeId)}>{result.label}</button><p>Score: {result.score}</p><details><summary>Why this match surfaced</summary><pre>{JSON.stringify(result.why ?? { limitation: 'Scoring explanation unavailable' }, null, 2)}</pre></details></article>)}</> : <p>Enter a query to see ranked matches and scoring evidence.</p>}</> : null}</> : null}
    {selected ? <aside ref={pane} tabIndex={-1} aria-label="Entity evidence" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}><button onClick={close}>Close entity</button><h2>{why?.node.label ?? selected}</h2>{why ? <><p>Entity index: <code>{why.indexHash}</code></p><p>{why.node.kind} · {why.node.path ?? 'No source path available'}</p><button onClick={() => void navigator.clipboard.writeText(why.node.path ?? why.node.id).catch(e => setError(message(e)))}>Copy source path</button><details open><summary>Metrics and provenance</summary><pre>{JSON.stringify(why.node, null, 2)}</pre></details><h3>Relationships</h3><p>Truncation may hide neighbors.</p><ul>{why.edges.map(edge => <li key={edge.id}>{edge.from} → {edge.kind} → {edge.to}{edge.sourceKind ? ` (original: ${edge.sourceKind})` : ''}<button onClick={() => select(edge.from === selected ? edge.to : edge.from)}>Inspect neighbor</button></li>)}</ul><p>Findings: {why.findingIds.join(', ') || 'None in supplied bounded view'}</p><p>Corrections: {why.proposalIds.join(', ') || 'None in supplied bounded view'}</p></> : <p>Entity missing, truncated, or loading. Refresh to recover.</p>}</aside> : null}
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
