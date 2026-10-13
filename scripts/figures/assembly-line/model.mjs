// The figure's own small model. Every number the figure shows comes from here, except the
// published results, which are copied from the repository reports and the study write-up.
export const MODEL = {
  cards: [
    { id: "parse", kind: "code", file: "src/parse.ts", symbol: "parse", params: ["input"], changed: ["input", "strict"] },
    { id: "parsing", kind: "doc", file: "docs/guide/parsing.md", line: 12, claims: "parse", params: ["input"] },
    { id: "run", kind: "code", file: "src/run.ts", symbol: "run", params: ["argv"] },
    { id: "cli", kind: "doc", file: "docs/cli.md", line: 8, claims: "run", params: ["argv"] },
    { id: "format", kind: "code", file: "src/format.ts", symbol: "format", params: ["node", "options"] },
    { id: "readme", kind: "doc", file: "README.md", line: 31, claims: "format", params: ["node", "options"] },
  ],
  // Cards already on the belt when the page opens, downstream first, and their x positions.
  initial: [
    ["run", 262],
    ["parsing", 165],
    ["readme", 70],
    ["cli", -30],
    ["parse", -125],
    ["format", -222],
  ],
  // Belt speed (units per second), card pitch, and how much faster the line runs while a change is in flight.
  speed: 34,
  pitch: 96,
  rush: 3.4,
  published: [
    { value: "88.3%", label: "retrieval hit@3" },
    { value: "100%", label: "Layer-1 finding precision, native and fixture suites" },
    { value: "83.33%", label: "historical CHANGED_REFERENCE precision (10 TP / 2 FP)" },
    { value: "18/18", label: "study run 2 attempts that used doc-bridge tools" },
  ],
};
