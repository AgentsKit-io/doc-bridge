import { ask, agentAnswerFixed } from './demo-recordings'

export function CitedAnswers() {
  return (
    <section id="ask" className="bridge-section" aria-labelledby="ask-title">
      <div className="bridge-section-inner bridge-section-split">
        <div className="bridge-section-copy">
          <p className="bridge-eyebrow">CITED ANSWERS</p>
          <h2 id="ask-title">Ask the repository.<br />Get the line.</h2>
          <p>Agents query the same docs your team reads, from the terminal or over MCP. Every answer names the file and line it came from, so you can check it in one click.</p>
          <p className="bridge-stat"><strong>88.3%</strong><span>hit@3 on the retrieval benchmark</span></p>
        </div>
        <div className="bridge-card bridge-answer-card">
          <header className="bridge-card-header"><span>RECORDED QUERY</span><span>exit {ask.exitCode}</span></header>
          <div className="bridge-recording"><p><span className="bridge-terminal-prompt">$ </span>{ask.command}</p><pre>{ask.output}</pre></div>
          <div className="bridge-agent-answer">
            <p className="bridge-eyebrow">AGENT ANSWER · {agentAnswerFixed.model}</p>
            <pre><code>{agentAnswerFixed.code}</code></pre>
            <p>{agentAnswerFixed.note} · <a href="/docs/guides/sending-notifications#send">{agentAnswerFixed.citations[0]}</a></p>
          </div>
        </div>
      </div>
    </section>
  )
}
