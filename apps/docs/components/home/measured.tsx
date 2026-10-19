import { ArrowRight } from 'lucide-react'

const stats = [
  ['88.3%', 'hit@3 on retrieval', 'retrieval-baseline-v1'],
  ['100%', 'precision on native reference findings', '15 TP · 0 FP · Layer-1 bench'],
  ['83.3%', 'precision on historical changed references', '10 TP · 2 FP · Layer-1 bench'],
  ['0.83 vs 0.61', 'mean correctness, with doc-bridge vs repository only', '12 vs 4 fully correct · 18/18 used the tools'],
  ['0', 'API keys for indexing, search, gates and MCP', 'Layer 0 is deterministic'],
] as const

export function Measured() {
  return (
    <section id="measured" className="bridge-section bridge-section-ruled" aria-labelledby="measured-title">
      <div className="bridge-section-inner">
        <div className="bridge-section-copy"><p className="bridge-eyebrow">MEASURED</p><h2 id="measured-title">Real numbers.<br />Limits attached.</h2></div>
        <dl className="bridge-measured-grid">{stats.map(([value, label, source]) => <div className="bridge-card bridge-measured-card" key={label}><dt>{value}</dt><dd>{label}</dd><small>{source}</small></div>)}</dl>
        <p className="bridge-measured-limits">The Layer-1 benchmark uses purposive controls, not general semantic accuracy. The agent study is minimal: 6 tasks, 3 public repos, claude-haiku-5-5, and 18 attempts per scenario per run. An agent adjudicated answers without human review; the repository-only arm moved by about 0.1 between runs. In the run where the model never called doc-bridge tools, there was no gain (0.61 vs 0.72).</p>
        <a href="/docs/study/minimal-study-results-v1" className="bridge-text-link">Read the study <ArrowRight aria-hidden className="size-4" /></a>
      </div>
    </section>
  )
}
