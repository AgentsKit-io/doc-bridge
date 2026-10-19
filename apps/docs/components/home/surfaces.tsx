const inputs = ['Markdown', 'Fumadocs', 'Docusaurus']
const outputs = [
  ['ak-docs CLI', ''],
  ['MCP server', 'Claude Code · Codex · Cursor'],
  ['llms.txt', 'published with the index'],
  ['PR comment', 'advisory findings'],
]

export function Surfaces() {
  return (
    <section id="surfaces" className="bridge-section" aria-labelledby="surfaces-title">
      <div className="bridge-section-inner">
        <div className="bridge-section-copy">
          <p className="bridge-eyebrow">SURFACES</p><h2 id="surfaces-title">One index.<br />Every surface.</h2>
        </div>
        <div className="bridge-surface-diagram" aria-label="Documentation and code flow into one deterministic index and out to CLI, MCP, llms.txt and pull request comments">
          <div className="bridge-surface-row">
            <article className="bridge-card"><p className="bridge-eyebrow">DOCS</p><ul>{inputs.map((item) => <li key={item}>{item}</li>)}</ul></article>
            <article className="bridge-card"><p className="bridge-eyebrow">CODE</p><p>Symbols the docs reference</p></article>
          </div>
          <div className="bridge-surface-arrow" aria-hidden="true">↓</div>
          <article className="bridge-card bridge-surface-core"><p className="bridge-eyebrow">LAYER 0 · DETERMINISTIC INDEX</p><h3>No model, no API key.</h3><p>Same docs, same index, every run.</p></article>
          <div className="bridge-surface-arrow" aria-hidden="true">↓</div>
          <div className="bridge-surface-outputs">{outputs.map(([title, detail]) => <article className="bridge-card" key={title}><h3>{title}</h3>{detail && <p>{detail}</p>}</article>)}</div>
        </div>
      </div>
    </section>
  )
}
