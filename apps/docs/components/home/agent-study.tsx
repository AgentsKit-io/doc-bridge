import { ArrowRight } from 'lucide-react'

const report = 'https://github.com/AgentsKit-io/doc-bridge/blob/main/docs/study/minimal-study-results-v1.md'

const run2Stats = [
  ['18/18', 'attempts used doc-bridge tools'],
  ['0.83 vs 0.61', 'mean correctness, doc-bridge vs repository-only'],
  ['12 vs 4', 'fully correct answers, doc-bridge vs repository-only'],
  ['204 vs 233', 'turns, doc-bridge vs repository-only'],
  ['0.129 vs 0.142 USD', 'list-price cost, doc-bridge vs repository-only'],
] as const

export function AgentStudySection() {
  return (
    <section id="measured-with-agents" className="bridge-study" aria-labelledby="study-title">
      <div className="bridge-study-inner">
        <div className="bridge-section-heading">
          <p className="bridge-eyebrow">MEASURED WITH AGENTS</p>
          <h2 id="study-title">A minimal agent-efficiency study, with its limits stated.</h2>
          <p>Six pinned tasks in three public repositories, 18 attempts per scenario per run, claude-haiku-5-5 through Claude Code CLI 2.1.296. Answers were adjudicated by an agent that did not know the scenario; no human reviewed them.</p>
        </div>
        <div className="bridge-study-grid">
          <div className="bridge-study-run">
            <p className="bridge-eyebrow">RUN 2 · AFTER THE MCP SERVER STARTED SENDING INITIALIZE INSTRUCTIONS</p>
            <dl className="bridge-study-stats">
              {run2Stats.map(([value, label]) => (
                <div key={label}>
                  <dt>{value}</dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="bridge-study-run">
            <p className="bridge-eyebrow">RUN 1 · BEFORE THAT CHANGE</p>
            <p className="bridge-study-note">The model never called doc-bridge tools and showed no gain (mean correctness 0.61 with doc-bridge vs 0.72 repository-only).</p>
          </div>
        </div>
        <p className="bridge-study-limits">
          Limits: small sample (18 attempts per scenario per run), one model, agent adjudication without human review. The repository-only arm moved by about 0.1 between runs.
        </p>
        <a href={report} className="bridge-text-link" rel="noopener noreferrer">Read the full study report <ArrowRight aria-hidden className="size-4" /></a>
      </div>
    </section>
  )
}
