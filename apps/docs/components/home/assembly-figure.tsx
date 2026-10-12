export function AssemblyFigureSection() {
  return (
    <section id="assembly-figure" className="bridge-assembly" aria-labelledby="assembly-figure-title">
      <div className="bridge-assembly-inner">
        <div className="bridge-section-heading">
          <p className="bridge-eyebrow">THE ASSEMBLY LINE</p>
          <h2 id="assembly-figure-title">Change a signature. Watch the doc that claims it get flagged.</h2>
          <p>Code and documents enter the index. A sensor compares a changed signature with the documents that claim it, and the stamp prints an advisory comment for the reviewer.</p>
        </div>
        <figure className="bridge-assembly-figure">
          <div className="bridge-assembly-stage">
            <iframe
              className="bridge-assembly-frame"
              src="/figures/assembly-line.html"
              title="Interactive isometric figure of the doc-bridge assembly line: toggle a changed parse() signature and watch the sensor flag the document that claims the old signature, then the stamp prints an advisory comment."
              loading="lazy"
            />
            <picture className="bridge-assembly-static">
              <source media="(prefers-color-scheme: light)" srcSet="/figures/assembly-line-fallback-light.png" />
              <img
                src="/figures/assembly-line-fallback-dark.png"
                alt="Static view of the doc-bridge assembly line in its unchanged state: code and documents on a belt, a loom weaving the index, a sensor gate and a stamp."
                width={1100}
                height={760}
                loading="lazy"
              />
            </picture>
          </div>
          <figcaption className="bridge-assembly-caption">
            An illustrative model of the deterministic pipeline, not a benchmark. Its readout is computed from its own small model. The published results below come from the repository reports.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
