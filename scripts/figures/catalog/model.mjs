// The card-catalog figure's truth model: a small pure module, no DOM, no randomness.
//
// The cabinet is the index: one drawer per indexed document, and the lit label plates mean the
// documents are indexed and agree with the code. The PUBLISH lamp is the publication the opt-in
// `reference-findings` gate guards (docs/guides/publication-gate.md, ADR 0025): while a
// CHANGED_REFERENCE finding is pending, `ak-docs index` refuses to write llms.txt, the index and
// the capabilities file, so the lamp is out and the tube to the agent is shut.
//
// The names and values come from the small demo repository used in talks: the guide
// docs/guides/sending-notifications.md cites `send` on line 8, and the code change is
// send(to, text) -> send({ to, text, channel }).

export const MODEL = {
  drawers: { columns: 3, rows: 4 },
  guide: {
    doc: "docs/guides/sending-notifications.md",
    line: 8,
    symbol: "send",
    // The guide's drawer: row 1 (second from the top), column 1 (the middle one).
    drawer: { row: 1, column: 1 },
  },
  versions: ["send(to, text)", "send({ to, text, channel })"],
  finding: "CHANGED_REFERENCE",
};

export const PHASES = ["baseline", "asked", "drift", "fixed"];

/** Baseline: the guide cites the signature the code has; nothing has been asked. */
export function initial() {
  return { code: 0, doc: 0, asked: false, changed: false };
}

/** An agent asks where `send` is documented. While publication is blocked the tube is shut. */
export function ask(state) {
  return { ...state, asked: true };
}

/** The code tab flips the signature to its other version. The guide still cites the old one. */
export function toggleCode(state) {
  return { ...state, code: (state.code + 1) % MODEL.versions.length, asked: false, changed: true };
}

/** The guide is fixed: it now cites the signature the code has. */
export function fixDoc(state) {
  if (state.doc === state.code) return state;
  return { ...state, doc: state.code, asked: false };
}

/** Back to the baseline (the tour's quiet reset between loops). */
export function reset() {
  return initial();
}

export const slipOf = () => `${MODEL.guide.doc}:${MODEL.guide.line}`;

/** What the gate says about a state, and what the figure shows for it. */
export function verdict(state) {
  const findings = state.code === state.doc ? 0 : 1;
  const published = findings === 0;
  const delivered = state.asked && published;
  const phase = !published ? "drift" : delivered ? "asked" : state.changed ? "fixed" : "baseline";
  const readout = !published
    ? `${findings} finding · ${MODEL.finding} · publish blocked`
    : delivered
      ? `asked · ${slipOf()}`
      : phase === "fixed"
        ? "0 findings · published"
        : "index current · published";
  return {
    phase,
    findings,
    published,
    delivered,
    lamp: published,
    shutter: published ? "open" : "closed",
    stale: !published,
    code: MODEL.versions[state.code],
    cites: MODEL.versions[state.doc],
    slip: delivered ? slipOf() : null,
    readout,
  };
}

/** One step of the idle tour from a state: ask, then drift, then fix, then a quiet reset. */
export function tourStep(state) {
  const { phase } = verdict(state);
  if (phase === "baseline") return ask(state);
  if (phase === "asked") return state.changed ? reset() : toggleCode(state);
  if (phase === "drift") return fixDoc(state);
  return ask(state);
}
