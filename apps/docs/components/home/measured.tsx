import { ArrowRight, Gauge, KeyRound, ListChecks, Search, Users } from 'lucide-react'

const stats = [
  [Search, '88.3%', 'hit@3 on retrieval', 'retrieval-baseline-v1'],
  [ListChecks, '100%', 'precision on native reference findings', '15 TP · 0 FP · Layer-1 bench'],
  [Gauge, '83.3%', 'precision on historical changed references', '10 TP · 2 FP · Layer-1 bench'],
  [Users, '0.83 vs 0.61', 'mean correctness, with doc-bridge vs repository only', '12 vs 4 fully correct · 18/18 used the tools'],
  [KeyRound, '0', 'API keys for indexing, search, gates and MCP', 'Layer 0 is deterministic'],
] as const

export function Measured() {
  return (
    <section id="measured" className="bridge-section" aria-labelledby="measured-title">
      <div className="bridge-section-inner">
        <div className="bridge-section-copy bridge-section-copy-wide">
          <p className="bridge-eyebrow">MEASURED</p>
          <h2 id="measured-title">Real numbers.<br /><span>Limits attached.</span></h2>
        </div>
        <ul className="bridge-principle-list bridge-measured-list">
          {stats.map(([Icon, value, label, source], index) => (
            <li className="bridge-principle" key={label}>
              <span className="bridge-principle-index">0{index + 1}</span>
              <Icon aria-hidden className="bridge-principle-icon" />
              <p className="bridge-principle-value">{value}</p>
              <p className="bridge-principle-label">{label}</p>
              <p className="bridge-principle-source">{source}</p>
            </li>
          ))}
        </ul>
        <p className="bridge-measured-limits">The Layer-1 benchmark uses purposive controls, not general semantic accuracy. The agent study is minimal: 6 tasks, 3 public repos, claude-haiku-5-5, and 18 attempts per scenario per run. An agent adjudicated answers without human review; the repository-only arm moved by about 0.1 between runs. In the run where the model never called doc-bridge tools, there was no gain (0.61 vs 0.72).</p>
        <a href="https://github.com/AgentsKit-io/doc-bridge/blob/main/docs/study/minimal-study-results-v1.md" rel="noopener noreferrer" className="bridge-text-link">Read the study <ArrowRight aria-hidden className="size-4" /></a>
      </div>
    </section>
  )
}
