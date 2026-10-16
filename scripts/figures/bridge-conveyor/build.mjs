// Builds apps/docs/public/figures/bridge-conveyor.html: an isometric bridge with a conveyor that carries
// loose pages across a river as neat index cards and files them into a card catalog (the doc-bridge
// index), with an inspection arch, a barrier and a PUBLISH lamp that stand for the opt-in publication
// gate. Drawn with the "anatomy" figure kit (MIT). The kit is not vendored here: point ANATOMY_DIR at a
// checkout of the skill (default: ~/.claude/skills/anatomy). The page it writes is self-contained: no
// network, no third-party scripts.
//
//   node scripts/figures/bridge-conveyor/build.mjs                  write the page
//   node scripts/figures/bridge-conveyor/build.mjs --audit          write it, then run the kit's geometry audit
//   node scripts/figures/bridge-conveyor/build.mjs --preview <dir>  also write <dir>/bridge-conveyor-{light,dark}.html
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const KIT_DIR = resolve(process.env.ANATOMY_DIR ?? join(homedir(), ".claude", "skills", "anatomy"));
const load = (file) => import(pathToFileURL(join(KIT_DIR, file)).href);
const k = await load("kit/iso-kit.mjs");
const G = await load("kit/lathe.mjs");
const A = await load("kit/audit.mjs");
const { kitScript } = await load("scripts/inline-kit.mjs");
const { MODEL, verdict, initial } = await import(pathToFileURL(join(HERE, "model.mjs")).href);

const W = 1200;
const H = 500;
// The camera looks from the near, upstream side: the bridge runs left to right and rises gently toward
// the catalog, whose drawer face turns toward the incoming belt.
const AZIMUTH = 112;

// ---------------------------------------------------------------- world plan (units ~ px, z up)
const PLINTH = { x: -266, y: -64, w: 532, d: 128, r: 10 };
const PLINTH_H = 8;
const FOOT_H = 5;
const BANK_TOP = 30;
const LEFT_BANK = { x: -260, y: -58, w: 148, d: 116, r: 3 };
const RIGHT_BANK = { x: 112, y: -58, w: 148, d: 116, r: 3 };
const WATER = { x: -112, y: -58, w: 224, d: 116, r: 0.5 };
const WATER_TOP = 2.5;
const DECK = { x: -112, y: -22, w: 224, d: 44, r: 0.5, z0: 24 };
const GIRDER = { z0: 15, y: 18, t: 4 };
const PIERS = [-44, 44];
const RAIL = { y: 20, z0: BANK_TOP, z1: 40, posts: [-96, -80, -64, -48, -32, -16, 0, 16, 32, 48, 64, 80, 96], newel: 110 };
// Conveyor
const BELT = { x0: -188, x1: 170, half: 7.6, z0: 35.6, top: 37 };
const STRINGER = { z0: 32, z1: 37.6, t: 2 };
const DRUM_R = BELT.top - 34.2;
const STANDS = [-180, -140, -100, -60, -20, 20, 60, 100, 140];
const HOOD = { x0: -178, x1: -154, y: 12, z0: STRINGER.z1, z1: 54 };
const HOPPER = { x0: -174, x1: -158, y: 9, z0: HOOD.z1, z1: 63 };
// The inspection arch at mid-span and the barrier at the entrance to the agent bank.
const ARCH = { x: 0, post: { w: 6, d: 4.5, y: 12 }, z1: 61, beam: { w: 9, y: 18, z1: 70 } };
const BARRIER = { x: 92, post: { w: 6, d: 4.5, y: 12 }, z1: 58, header: 62.5, bar: { w: 4, h: 5, up: 50, down: 39 } };
const STOP_X = BARRIER.x - BARRIER.bar.w / 2 - 3 - 8; // the centre of a card held at the barrier
// The catalog on the right bank: drawer face on its -x side, toward the bridge.
const CAB = { x0: 176, x1: 222, y0: -33, y1: 33, z0: BANK_TOP, z1: 97 };
const LID = { z0: CAB.z1, z1: CAB.z1 + 3.6, grow: 2.4 };
const GRID = { y0: -31, z1: 94, cell: { w: 19, h: 14.5 }, gap: { y: 2.5, z: 2.5 } };
const PROUD = 1.6;
const TRAVEL = 22;
const LIFT = 12;
const SLOT = { x: CAB.x0 - 0.8, y: 10, z0: 35.6, z1: 41 };
const { row: GUIDE_ROW, column: GUIDE_COL } = MODEL.guide.drawer;
const cellOf = (row, column) => {
  const y0 = GRID.y0 + column * (GRID.cell.w + GRID.gap.y);
  const z1 = GRID.z1 - row * (GRID.cell.h + GRID.gap.z);
  return { y0, y1: y0 + GRID.cell.w, z0: z1 - GRID.cell.h, z1, cy: y0 + GRID.cell.w / 2 };
};
const GUIDE = cellOf(GUIDE_ROW, GUIDE_COL);
const LAMP = { x: CAB.x0 + 10, y: -21, base: 4.6, collar: 3, globe: 4.2 };
const TERM = { x0: 186, x1: 226, y0: 38, y1: 55, z0: BANK_TOP, z1: 62 };
const SIGN = { x0: -248, x1: -204, y: 47, z0: BANK_TOP + 6, z1: BANK_TOP + 22, t: 1.4 };
const CARD = { l: 16, w: 11, t: 0.8 };

const P = k.fitProjection(
  [
    ...k.boxCorners(PLINTH, -PLINTH_H - FOOT_H, 0),
    [CAB.x0 - LID.grow, CAB.y0 - LID.grow, LID.z1 + 12],
    [CAB.x1 + LID.grow, CAB.y1 + LID.grow, LID.z1],
    [ARCH.x, 0, ARCH.beam.z1 + 12],
  ],
  W,
  H,
  { pad: 16, azimuth: AZIMUTH },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const r2 = (v) => Math.round(v * 100) / 100;
const vecOf = (d) => k.axisVector(P, d);
const matrix = (u, v, o) => `matrix(${[u[0], u[1], v[0], v[1], o[0], o[1]].map((n) => Math.round(n * 1000) / 1000).join(" ")})`;
// Face planes. On a +y face local (x, -z) maps to the face; on a -x face local (y, -z).
const planeY = (y) => k.sideMatrix([0, y], 0, P, "left");
const planeX = (x) => {
  const ey = vecOf([0, 1, 0]);
  const ez = vecOf([0, 0, 1]);
  return matrix(ey, [-ez[0], -ez[1]], at([x, 0, 0]));
};
const flat = (u0, z0, u1, z1, r, steps = 4) => k.pathOf(k.roundedPlan({ x: u0, y: z0, w: u1 - u0, d: z1 - z0, r }, steps).map(([u, z]) => [u, -z]), true);
const hull = (min, max) => {
  const pts = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) pts.push(at([x, y, z]));
  return k.pathOf(G.hullOf(pts), true);
};

// ---------------------------------------------------------------- recorder helpers
const R = A.recorder(P);
const record = R.solid;
const FRONT = new Set();
function put(name, ref, svg, shapes, { bias = 0, front = false, ...rest } = {}) {
  if (front) FRONT.add(name);
  return R.put({ name, at: ref, bias, svg, shapes, piece: "line", ...rest });
}
const planOf = ([x0, y0, z0], [x1, y1, z1], r = 0.6) => ({ plan: { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r }, z0, h: z1 - z0 });
function box(name, min, max, style = {}, { r = 0.6, steps = 3, bevel = 0, extra = "", inner = "", bias = 0, ground = false, className, front = false } = {}) {
  const { plan, z0, h } = planOf(min, max, r);
  const shape = record(A.slab(plan, z0, h, { name, ...(ground ? { ground } : {}) }, steps));
  const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const innerSvg = typeof inner === "function" ? inner(plan, z0, h) : inner;
  const extraSvg = typeof extra === "function" ? extra(plan, z0, h) : extra;
  put(name, centre, S(k.slabOf(plan, z0, h, P, steps, bevel), { tone: "mid", ...style, inner: innerSvg }) + extraSvg, [shape], { bias, className, front });
  return { plan, z0, h, shape };
}
function post(name, cx, cy, r, z0, z1, style = {}, { extra = "", bias = 0, steps = 24, bevel = 0, front = false } = {}) {
  const shape = record(A.cylinder(cx, cy, r, z0, z1 - z0, { name }));
  put(name, [cx, cy, (z0 + z1) / 2], S(k.cylinder(cx, cy, r, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style }) + extra, [shape], { bias, front });
  return shape;
}
function turned(name, F, s0, s1, r, style = {}, { extra = "", inner = "", bias = 0, front = false } = {}) {
  const shape = record(A.disc(F, s0, s1, r, { name }));
  const centre = G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2));
  put(name, centre, S(G.disc(s0, s1, r, F, P), { tone: "mid", ...style, inner }) + extra, [shape], { bias, front });
  return shape;
}
const sideSeam = (plan, z, steps = 3) => Ln(k.sideSeam(plan, z, P, steps), { tone: "faint" });
const screwDots = (points, z, size = 0.45, tone = "mid") => Dots(points.map(([x, y]) => at([x, y, z])), { size, tone });
const back = [];

// ---------------------------------------------------------------- plinth on feet, the river and its banks
back.push(`<path class="iso-halo" d="${k.haloOf(PLINTH, -PLINTH_H - FOOT_H, PLINTH_H, P)}"/>`);
const footSpots = [...k.corners(PLINTH, 22), [0, PLINTH.y + 22], [0, PLINTH.y + PLINTH.d - 22]].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
for (const [x, y] of footSpots) {
  back.push(S(k.cylinder(x, y, 7, -PLINTH_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 5.4, -PLINTH_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
}
back.push(S(k.slabOf(PLINTH, -PLINTH_H, PLINTH_H, P, 8, 1.4), { tone: "mid", inner: Ln(k.sideSeam(PLINTH, -3.5, P, 8), { tone: "faint" }) }));
back.push(screwDots(k.corners(PLINTH, 7), 0, 0.5));
record(A.slab(PLINTH, -PLINTH_H, PLINTH_H, { name: "stand.plinth", ground: true }, 8));

// The river: a shallow sheet of water between the banks, with flow lines that fade in and out.
{
  const flow = [];
  const lines = [
    [-100, -40, 34], [-70, -18, 26], [-96, 8, 22], [-76, 44, 30], [-20, -46, 30], [-12, 30, 26], [10, -8, 20], [22, 50, 24],
    [70, -34, 28], [74, 12, 22], [62, 40, 30], [-30, 52, 18],
  ];
  for (const [x, y, len] of lines) {
    const pts = Array.from({ length: 9 }, (_, i) => at([x + (len * i) / 8, y + Math.sin((i / 8) * Math.PI) * 1.2, WATER_TOP]));
    flow.push(k.fadeLineSvg(pts, { fade: [len * 0.35 * KS, len * 0.35 * KS], tone: "faint", className: "bc-flow" }));
  }
  box("river.water", [WATER.x, WATER.y, 0], [WATER.x + WATER.w, WATER.y + WATER.d, WATER_TOP], { tone: "lo", flat: true, className: "bc-water" }, { r: 0.5, steps: 2, extra: flow.join("") });
}

// A bank of dressed stone: courses on every visible face, staggered joints on the river face and the front.
function bank(name, plan, riverX) {
  const z = [10, 20];
  const inner = (p) => z.map((h) => sideSeam(p, h, 3)).join("");
  const joints = [];
  const front = plan.y + plan.d;
  for (let course = 0; course < 3; course++) {
    const z0 = course * 10;
    const z1 = z0 + 10;
    const shift = course % 2 ? 12 : 0;
    for (let x = plan.x + 14 + shift; x < plan.x + plan.w - 6; x += 24) joints.push(k.segment([x, front, z0], [x, front, z1], P));
    if (riverX !== null) {
      for (let y = plan.y + 10 + shift; y < plan.y + plan.d - 4; y += 24) {
        if (z0 >= 20 && Math.abs(y) < DECK.d / 2 + 1) continue;
        joints.push(k.segment([riverX, y, Math.max(z0, WATER_TOP)], [riverX, y, z1], P));
      }
    }
  }
  // The coping: a dressed edge inset on the top.
  const coping = Ln(k.planOutline(k.insetPlan(plan, 4), BANK_TOP, P, 3), { tone: "faint" });
  box(name, [plan.x, plan.y, 0], [plan.x + plan.w, plan.y + plan.d, BANK_TOP], { tone: "mid" }, { r: plan.r, steps: 3, bevel: 0.8, inner: (p) => inner(p) + Ln(joints.join(""), { tone: "faint" }), extra: coping });
}
bank("stand.bank.left", LEFT_BANK, null);
bank("stand.bank.right", RIGHT_BANK, RIGHT_BANK.x);

// ---------------------------------------------------------------- the bridge: piers, girders, deck and railings
for (const [i, px] of PIERS.entries()) {
  box(`pier${i}.footing`, [px - 16, -30, 0], [px + 16, 30, 4.5], { tone: "lo" }, { r: 3, steps: 4, bevel: 0.5, extra: screwDots([[px - 12, 26], [px + 12, 26], [px - 12, -26], [px + 12, -26]], 4.5, 0.42) });
  box(`pier${i}.column`, [px - 9, -25, 4.5], [px + 9, 25, 12], {}, { r: 9, steps: 10, bevel: 0.4, inner: (p) => sideSeam(p, 8.2, 10) });
  box(`pier${i}.cap`, [px - 12, -27, 12], [px + 12, 27, GIRDER.z0], {}, { r: 2, steps: 4, bevel: 0.6, extra: screwDots([[px - 8, 24], [px + 8, 24], [px - 8, -24], [px + 8, -24]], GIRDER.z0, 0.4) });
}
for (const [side, y0] of [["far", -DECK.d / 2], ["near", GIRDER.y]]) {
  const y1 = y0 + GIRDER.t;
  const face = y1;
  const stiff = [];
  for (let x = -104; x <= 104; x += 16) stiff.push(k.segment([x, face, GIRDER.z0], [x, face, DECK.z0], P));
  const rivets = [];
  for (let x = -108; x <= 108; x += 4) rivets.push(at([x, face, GIRDER.z0 + 1.1]), at([x, face, DECK.z0 - 1.1]));
  box(`girder.${side}`, [DECK.x, y0, GIRDER.z0], [DECK.x + DECK.w, y1, DECK.z0], {}, {
    r: 0.3,
    steps: 2,
    inner: (p) => sideSeam(p, GIRDER.z0 + 2.2, 2) + sideSeam(p, DECK.z0 - 2.2, 2) + Ln(stiff.join(""), { tone: "faint" }),
    extra: side === "near" ? Dots(rivets, { size: 0.3, tone: "lo" }) : "",
  });
}
box("deck", [DECK.x, DECK.y, DECK.z0], [DECK.x + DECK.w, DECK.y + DECK.d, BANK_TOP], {}, {
  r: 0.5,
  steps: 2,
  bevel: 0.5,
  inner: (p) => sideSeam(p, DECK.z0 + 3, 2),
  // Deck plates: joints across the deck, edge to edge, and a kerb line along each side.
  extra: Ln([-80, -48, -16, 16, 48, 80].map((x) => k.lineOnTop([x, DECK.y], [x, DECK.y + DECK.d], BANK_TOP, P)).join(""), { tone: "faint" }),
});
for (const [side, sy] of [["far", -RAIL.y], ["near", RAIL.y]]) {
  const front = side === "near";
  for (const x of RAIL.posts) post(`rail.${side}.post${x}`, x, sy, 0.9, RAIL.z0, RAIL.z1, { tone: "mid" }, { steps: 14, front });
  for (const x of [-RAIL.newel, RAIL.newel]) {
    box(`rail.${side}.newel${x}`, [x - 1.6, sy - 1.6, RAIL.z0], [x + 1.6, sy + 1.6, RAIL.z1 + 2.6], {}, { r: 0.4, bevel: 0.3, front, extra: screwDots([[x, sy]], RAIL.z1 + 2.6, 0.4) });
  }
  box(`rail.${side}.top`, [-RAIL.newel + 1.6, sy - 1, RAIL.z1], [RAIL.newel - 1.6, sy + 1, RAIL.z1 + 1.4], { tone: "hi" }, { r: 0.4, front });
}

// ---------------------------------------------------------------- the conveyor
for (const x of STANDS) {
  box(`belt.stand${x}`, [x - 2.5, -BELT.half - STRINGER.t - 1, BANK_TOP], [x + 2.5, BELT.half + STRINGER.t + 1, STRINGER.z0], { tone: "lo" }, { r: 0.6, extra: screwDots([[x, -BELT.half - STRINGER.t], [x, BELT.half + STRINGER.t]], STRINGER.z0, 0.36) });
}
for (const [side, y0] of [["far", -BELT.half - STRINGER.t], ["near", BELT.half]]) {
  const y1 = y0 + STRINGER.t;
  const bolts = STANDS.map((x) => at([x, y1, STRINGER.z0 + 1.6]));
  box(`belt.stringer.${side}`, [BELT.x0 - 3, y0, STRINGER.z0], [BELT.x1 + 3, y1, STRINGER.z1], {}, {
    r: 0.4,
    steps: 2,
    inner: (p) => sideSeam(p, STRINGER.z1 - 1.2, 2),
    extra: side === "near" ? Dots(bolts, { size: 0.4, tone: "mid" }) : "",
  });
}
// The belt: a static slab; its cleats ride a clipped group that live code slides along x.
const CLEAT = 6;
{
  const top = path3([[BELT.x0, -BELT.half, BELT.top], [BELT.x1, -BELT.half, BELT.top], [BELT.x1, BELT.half, BELT.top], [BELT.x0, BELT.half, BELT.top]], true);
  const cleats = [];
  for (let x = BELT.x0 - CLEAT; x <= BELT.x1; x += CLEAT) cleats.push(k.lineOnTop([x, -BELT.half], [x, BELT.half], BELT.top, P));
  // The arch's scan line across the belt: light on the belt where the curtain meets it.
  const scan = k.lineOnTop([ARCH.x, -BELT.half], [ARCH.x, BELT.half], BELT.top, P);
  const shape = record(A.slab({ x: BELT.x0, y: -BELT.half, w: BELT.x1 - BELT.x0, d: BELT.half * 2, r: 0 }, BELT.z0, BELT.top - BELT.z0, { name: "belt" }, 1));
  put(
    "belt",
    [0, 0, (BELT.z0 + BELT.top) / 2],
    S(k.slabOf({ x: BELT.x0, y: -BELT.half, w: BELT.x1 - BELT.x0, d: BELT.half * 2, r: 0 }, BELT.z0, BELT.top - BELT.z0, P, 1), { tone: "lo", className: "bc-belt" }) +
      `<clipPath id="bc-belt-clip"><path d="${top}"/></clipPath>` +
      `<g clip-path="url(#bc-belt-clip)"><g data-part="cleats">${Ln(cleats.join(""), { tone: "faint" })}</g></g>` +
      `<path class="bc-scanline" data-part="scanline" d="${scan}"/>`,
    [shape],
  );
}
// End drums, on axles along y between the stringers.
const ALONG_Y = (x) => G.frameOf([x, 0, BELT.top - DRUM_R], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
for (const [i, x] of [BELT.x0, BELT.x1].entries()) {
  turned(`belt.drum${i}`, ALONG_Y(x), -BELT.half, BELT.half, DRUM_R, { tone: "mid" }, { bias: -0.2 });
}
// The drive motor on the near side of the head end: coupling, ribbed can and an end cap, on a foot.
{
  const F = G.frameOf([BELT.x0 + 1, 0, 34.5], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  const s0 = BELT.half + STRINGER.t;
  turned("motor.coupling", F, s0, s0 + 1.6, 2.4, { tone: "mid" });
  const ribs = G.ribsOf(F, s0 + 3, s0 + 10.6, 4.5, 20, P, { fade: [0.1, 0.55], seams: true });
  turned("motor.can", F, s0 + 1.6, s0 + 12, 4.5, { tone: "mid" }, { inner: k.fadedSvg(ribs, { tone: "lo" }) });
  turned("motor.cap", F, s0 + 12, s0 + 13.2, 3.6, { tone: "lo" }, { extra: Dots(G.dotsOf(F, s0 + 13.2, 2.2, 4, P, { all: true }), { size: 0.38, tone: "mid" }) });
  box("motor.foot", [BELT.x0 - 3.5, s0 + 2.4, BANK_TOP], [BELT.x0 + 5.5, s0 + 10.6, BANK_TOP + 0.01], { tone: "lo" }, { r: 0.5 });
}
// The intake: a hood over the head end with a hopper on top. Pages drop in; cards leave on the far side.
box("intake.hood", [HOOD.x0, -HOOD.y, HOOD.z0], [HOOD.x1, HOOD.y, HOOD.z1], {}, {
  r: 1.2,
  steps: 4,
  bevel: 0.6,
  front: true,
  inner: (p) => sideSeam(p, HOOD.z0 + 4, 4),
  extra: (() => {
    // A raised access panel on the -x face, vent slots and a status lamp on the +y face.
    const panel = `<g transform="${planeX(HOOD.x0)}">${Ln(flat(-HOOD.y + 3, HOOD.z0 + 6, HOOD.y - 3, HOOD.z1 - 3, 1.2, 3), { tone: "faint" })}</g>`;
    const screws = Dots([[-HOOD.y + 4.6, HOOD.z0 + 7.6], [HOOD.y - 4.6, HOOD.z0 + 7.6], [-HOOD.y + 4.6, HOOD.z1 - 4.6], [HOOD.y - 4.6, HOOD.z1 - 4.6]].map(([y, z]) => at([HOOD.x0, y, z])), { size: 0.38, tone: "mid" });
    const vents = `<g transform="${planeY(HOOD.y)}">${Ln([0, 1, 2, 3].map((i) => flat(HOOD.x0 + 4 + i * 3.4, HOOD.z0 + 7, HOOD.x0 + 5.4 + i * 3.4, HOOD.z1 - 5, 0.7, 3)).join(""), { tone: "faint" })}</g>`;
    const led = at([HOOD.x1 - 4, HOOD.y, HOOD.z1 - 6]);
    return panel + screws + vents + `<circle class="bc-led" data-part="intake-led" cx="${r2(led[0])}" cy="${r2(led[1])}" r="${r2(0.9 * KS * 0.9)}"/>`;
  })(),
});
const MOUTH = { x0: HOPPER.x0 + 1.6, x1: HOPPER.x1 - 1.6, y: HOPPER.y - 1.6 };
box("intake.hopper", [HOPPER.x0, -HOPPER.y, HOPPER.z0], [HOPPER.x1, HOPPER.y, HOPPER.z1], {}, {
  r: 1,
  steps: 3,
  bevel: 0.4,
  front: true,
  inner: (p) => sideSeam(p, HOPPER.z0 + 2, 3),
  extra: `<path class="bc-hole" d="${k.pathOf(k.roundedPlan({ x: MOUTH.x0, y: -MOUTH.y, w: MOUTH.x1 - MOUTH.x0, d: MOUTH.y * 2, r: 0.6 }, 3).map(([x, y]) => at([x, y, HOPPER.z1])), true)}"/>` + Ln(k.planOutline({ x: MOUTH.x0, y: -MOUTH.y, w: MOUTH.x1 - MOUTH.x0, d: MOUTH.y * 2, r: 0.6 }, HOPPER.z1, P, 3), { tone: "lo" }),
});

// ---------------------------------------------------------------- the inspection arch
for (const [side, y0] of [["far", -ARCH.post.y - ARCH.post.d], ["near", ARCH.post.y]]) {
  const y1 = y0 + ARCH.post.d;
  box(`arch.post.${side}`, [ARCH.x - ARCH.post.w / 2, y0, BANK_TOP], [ARCH.x + ARCH.post.w / 2, y1, ARCH.z1], {}, {
    r: 0.6,
    bevel: 0.4,
    front: side === "near",
    inner: (p) => sideSeam(p, BANK_TOP + 4, 3),
    extra: Dots([[ARCH.x - ARCH.post.w / 2, (y0 + y1) / 2, BANK_TOP + 2]].map(at), { size: 0.4, tone: "mid" }),
  });
}
const BEAM = { x0: ARCH.x - ARCH.beam.w / 2, x1: ARCH.x + ARCH.beam.w / 2, y: ARCH.beam.y, z0: ARCH.z1, z1: ARCH.beam.z1 };
const PLATE = { x: BEAM.x0 - 0.6, y0: -15, y1: 15, z0: BEAM.z0 + 1.2, z1: BEAM.z1 - 1.2 };
const codeLines = (version) => (version === 0 ? ["send(to, text)"] : ["send({ to, text,", "  channel })"]);
{
  const slot = Ln(k.planOutline({ x: -0.9, y: 3, w: 1.8, d: 10, r: 0.6 }, BEAM.z1, P, 3), { tone: "lo" });
  box("arch.beam", [BEAM.x0, -BEAM.y, BEAM.z0], [BEAM.x1, BEAM.y, BEAM.z1], {}, {
    r: 1,
    steps: 3,
    bevel: 0.6,
    front: true,
    inner: (p) => sideSeam(p, BEAM.z0 + 0.6, 3),
    extra: slot + screwDots([[BEAM.x0 + 1.6, -BEAM.y + 1.6], [BEAM.x0 + 1.6, BEAM.y - 1.6], [BEAM.x1 - 1.6, -BEAM.y + 1.6], [BEAM.x1 - 1.6, BEAM.y - 1.6]], BEAM.z1, 0.4),
  });
  // The plate on the beam shows the signature the arch checks cards against.
  const text = (version) =>
    `<g data-archcode="${version}"${version ? ' style="display:none"' : ""}>${codeLines(version)
      .map((line, i, all) => `<text class="bc-code" x="${PLATE.y0 + 1.8}" y="${r2(-((PLATE.z0 + PLATE.z1) / 2 + (all.length === 1 ? -0.9 : 1.6 - i * 2.9)))}" font-size="2.4">${line.replace(/ /g, "&#160;")}</text>`)
      .join("")}</g>`;
  const window = flat(PLATE.y0 + 0.8, PLATE.z0 + 0.7, PLATE.y1 - 0.8, PLATE.z1 - 0.7, 0.6);
  box("arch.plate", [PLATE.x, PLATE.y0, PLATE.z0], [BEAM.x0, PLATE.y1, PLATE.z1], { tone: "hi" }, {
    r: 0.3,
    steps: 2,
    front: true,
    bias: 0.5,
    extra: `<g transform="${planeX(PLATE.x)}"><path class="bc-plate-face" d="${window}"/>${text(0)}${text(1)}<path class="iso-line" data-tone="lo" d="${window}"/></g>`,
  });
}
box("arch.scanner", [ARCH.x - 2.4, -9, ARCH.z1 - 3.5], [ARCH.x + 2.4, 9, ARCH.z1], { tone: "hi" }, { r: 0.8, front: true, bias: -0.6, inner: (p) => sideSeam(p, ARCH.z1 - 1.8, 3) });
// The arch's status lamp and the flag that rises out of the beam when a card does not match the code.
const ALAMP = { x: ARCH.x, y: -10, base: 3, collar: 2, globe: 2.6 };
post("arch.lamp.base", ALAMP.x, ALAMP.y, ALAMP.base, BEAM.z1, BEAM.z1 + 1.4, { tone: "lo" }, { steps: 28, front: true });
const ACOLLAR = post("arch.lamp.collar", ALAMP.x, ALAMP.y, ALAMP.collar, BEAM.z1 + 1.4, BEAM.z1 + 2.6, { tone: "mid" }, { steps: 24, front: true });
const AGLOBE_C = [ALAMP.x, ALAMP.y, BEAM.z1 + 2.6 + Math.sqrt(ALAMP.globe ** 2 - ALAMP.collar ** 2)];
function globe(name, C, r, collar, cls) {
  const shape = record(A.ball(C, r, { name, seated: true, cut: [collar] }));
  const c = at(C);
  const rr = r * KS;
  put(
    name,
    C,
    S(G.sphereOf(C, r, P, { steps: 36 }), { tone: "hi" }) +
      `<circle class="${cls} bc-globe" data-part="${name}" cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(rr - 0.3)}"/>` +
      `<circle class="${cls}-core bc-globe-core" data-part="${name}-core" cx="${r2(c[0] - rr * 0.28)}" cy="${r2(c[1] - rr * 0.32)}" r="${r2(rr * 0.34)}"/>`,
    [shape],
    { front: name.startsWith("arch") },
  );
}
globe("arch.lamp", AGLOBE_C, ALAMP.globe, ACOLLAR, "bc-alamp");
// The flag: a pole and a pennant, built raised and pushed down into the beam by live code; clipped to
// the space above the beam so it seems to come out of its slot.
const FLAG = { y: 4, rise: 11 };
{
  const pole = k.cylinder(0, FLAG.y, 0.5, BEAM.z1, 10, P, 12);
  const pennant = [[0, FLAG.y + 0.5, BEAM.z1 + 9.6], [0, FLAG.y + 9, BEAM.z1 + 7.6], [0, FLAG.y + 0.5, BEAM.z1 + 5.4]];
  const clip = hull([-12, -BEAM.y, BEAM.z1], [12, BEAM.y, BEAM.z1 + 30]);
  const svg =
    `<clipPath id="bc-flag-clip"><path d="${clip}"/></clipPath>` +
    `<g clip-path="url(#bc-flag-clip)"><g data-part="flag">${S(pole, { tone: "hi" })}<path class="bc-pennant" d="${path3(pennant, true)}"/></g></g>`;
  put("arch.flag", [0, FLAG.y + 3, BEAM.z1 + 5], svg, [record(A.cylinder(0, FLAG.y, 0.5, BEAM.z1, 10, { name: "arch.flag" }))], { front: true, bias: 0.3 });
}
// The light curtain from the scanner down to the belt: drawn in the plane of the arch.
const CURTAIN = path3([[ARCH.x, -BELT.half, ARCH.z1 - 3.5], [ARCH.x, BELT.half, ARCH.z1 - 3.5], [ARCH.x, BELT.half, BELT.top + 0.2], [ARCH.x, -BELT.half, BELT.top + 0.2]], true);

// ---------------------------------------------------------------- the barrier at the entrance to the agent bank
for (const [side, y0] of [["far", -BARRIER.post.y - BARRIER.post.d], ["near", BARRIER.post.y]]) {
  const y1 = y0 + BARRIER.post.d;
  const groove = side === "far" ? `<g transform="${planeY(y1)}">${Ln(flat(BARRIER.x - 1, BANK_TOP + 6, BARRIER.x + 1, BARRIER.z1 - 2, 0.9, 3), { tone: "lo" })}</g>` : "";
  box(`barrier.post.${side}`, [BARRIER.x - BARRIER.post.w / 2, y0, BANK_TOP], [BARRIER.x + BARRIER.post.w / 2, y1, BARRIER.z1], {}, {
    r: 0.6,
    bevel: 0.4,
    front: side === "near",
    inner: (p) => sideSeam(p, BANK_TOP + 4, 3),
    extra: groove,
  });
}
box("barrier.header", [BARRIER.x - 4, -BARRIER.post.y - BARRIER.post.d - 1.5, BARRIER.z1], [BARRIER.x + 4, BARRIER.post.y + BARRIER.post.d + 1.5, BARRIER.header], {}, {
  r: 0.8,
  bevel: 0.5,
  front: true,
  inner: (p) => sideSeam(p, BARRIER.z1 + 1.4, 3),
});
box("barrier.drive", [BARRIER.x - 3, -6, BARRIER.header], [BARRIER.x + 3, 6, BARRIER.header + 3.6], { tone: "mid" }, {
  r: 0.6,
  bevel: 0.3,
  front: true,
  extra: screwDots([[BARRIER.x - 1.8, -4.6], [BARRIER.x - 1.8, 4.6]], BARRIER.header + 3.6, 0.38),
});
// The bar, built up and lowered by live code. Stripes on its face stand for the painted warning bands.
{
  const { w, h, up } = BARRIER.bar;
  const x0 = BARRIER.x - w / 2;
  const y0 = -BARRIER.post.y;
  const y1 = BARRIER.post.y;
  const plan = { x: x0, y: y0, w, d: y1 - y0, r: 0.5 };
  const stripes = [];
  for (let u = y0 - h; u < y1; u += 6) stripes.push(`M${r2(u)} ${-up}L${r2(u + 3)} ${-up}L${r2(u + 3 + h)} ${-(up + h)}L${r2(u + h)} ${-(up + h)}Z`);
  const faceClip = flat(y0, up, y1, up + h, 0.01, 1);
  const svg =
    `<g data-part="bar">` +
    S(k.slabOf(plan, up, h, P, 2, 0.3), { tone: "hi" }) +
    `<g transform="${planeX(x0)}"><clipPath id="bc-bar-face"><path d="${faceClip}"/></clipPath><path class="bc-stripe" clip-path="url(#bc-bar-face)" d="${stripes.join("")}"/></g>` +
    `</g>`;
  put("barrier.bar", [BARRIER.x, 0, up + h / 2], svg, [record(A.slab(plan, up, h, { name: "barrier.bar" }, 2))], { front: true });
}

// ---------------------------------------------------------------- the catalog on the right bank
box("cab.kick", [CAB.x0 + 3, CAB.y0 + 3, BANK_TOP], [CAB.x1 - 3, CAB.y1 - 3, BANK_TOP + 4], { tone: "lo" }, { r: 1 });
const CARCASS_Z0 = BANK_TOP + 4;
const sideField = path3([[CAB.x0 + 6, CAB.y1, CARCASS_Z0 + 8], [CAB.x1 - 6, CAB.y1, CARCASS_Z0 + 8], [CAB.x1 - 6, CAB.y1, CAB.z1 - 6], [CAB.x0 + 6, CAB.y1, CAB.z1 - 6]], true);
box("cab.carcass", [CAB.x0, CAB.y0, CARCASS_Z0], [CAB.x1, CAB.y1, CAB.z1], {}, {
  r: 1.4,
  steps: 4,
  bevel: 0.6,
  inner: (p) => sideSeam(p, CARCASS_Z0 + 4, 4),
  extra:
    Ln(sideField, { tone: "faint" }) +
    // The feed slot in the lower panel, where the belt delivers each card.
    `<path class="bc-hole" d="${path3([[CAB.x0, -SLOT.y + 2, SLOT.z0 + 1.2], [CAB.x0, SLOT.y - 2, SLOT.z0 + 1.2], [CAB.x0, SLOT.y - 2, SLOT.z1 - 1.6], [CAB.x0, -SLOT.y + 2, SLOT.z1 - 1.6]], true)}"/>`,
});
box("cab.slot", [SLOT.x, -SLOT.y, SLOT.z0], [CAB.x0, SLOT.y, SLOT.z1], { tone: "hi" }, {
  r: 0.4,
  className: "bc-brass",
  bias: 0.4,
  extra:
    `<g transform="${planeX(SLOT.x)}"><path class="bc-hole" d="${flat(-SLOT.y + 2, SLOT.z0 + 1.2, SLOT.y - 2, SLOT.z1 - 1.6, 0.5, 2)}"/>${Ln(flat(-SLOT.y + 2, SLOT.z0 + 1.2, SLOT.y - 2, SLOT.z1 - 1.6, 0.5, 2), { tone: "lo" })}</g>` +
    Dots([at([SLOT.x, -SLOT.y + 0.9, (SLOT.z0 + SLOT.z1) / 2]), at([SLOT.x, SLOT.y - 0.9, (SLOT.z0 + SLOT.z1) / 2])], { size: 0.34, tone: "mid" }),
});
// The lip that carries each card off the belt into the slot.
box("cab.lip", [BELT.x1 + DRUM_R, -BELT.half + 0.6, BELT.top - 0.6], [SLOT.x, BELT.half - 0.6, BELT.top], { tone: "hi" }, { r: 0.3, className: "bc-brass", bias: 0.2 });
box("cab.lid", [CAB.x0 - LID.grow, CAB.y0 - LID.grow, LID.z0], [CAB.x1 + LID.grow, CAB.y1 + LID.grow, LID.z1], {}, {
  r: 2,
  steps: 5,
  bevel: 0.7,
  inner: (p) => sideSeam(p, LID.z0 + 1.4, 5),
  extra:
    Ln(k.planOutline({ x: CAB.x0 + 3, y: CAB.y0 + 3, w: CAB.x1 - CAB.x0 - 6, d: CAB.y1 - CAB.y0 - 6, r: 1.6 }, LID.z1, P, 4), { tone: "faint" }) +
    (() => {
      const c = at([LAMP.x, LAMP.y, LID.z1 + 7.5]);
      return `<circle class="bc-lamp-halo" data-part="lamp-halo" cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(LAMP.globe * 3 * KS)}"/>`;
    })(),
});
// A brass carrying handle on the +y side panel.
{
  const x0 = (CAB.x0 + CAB.x1) / 2 - 7;
  const z = 64;
  for (const [i, x] of [x0, x0 + 11].entries()) box(`cab.handle.foot${i}`, [x, CAB.y1, z], [x + 3, CAB.y1 + 2.2, z + 3], { tone: "hi" }, { r: 0.5, className: "bc-brass" });
  box("cab.handle.bar", [x0, CAB.y1 + 2.2, z + 0.4], [x0 + 14, CAB.y1 + 3.6, z + 2.6], { tone: "hi" }, { r: 0.6, bevel: 0.3, className: "bc-brass" });
}
// Drawers: a proud front, a brass label holder with a glowing label card, and a cup pull.
const DRAWERS = [];
for (let row = 0; row < MODEL.drawers.rows; row++) {
  for (let column = 0; column < MODEL.drawers.columns; column++) DRAWERS.push({ row, column, cell: cellOf(row, column), guide: row === GUIDE_ROW && column === GUIDE_COL });
}
const HOLDER = { w: 11, h: 4.4, top: 2.2, t: 0.5 };
const PULL = { w: 7, h: 2.4, bottom: 3, d: 2.2 };
function drawerFace(cell, index, x = CAB.x0) {
  const front = x - PROUD;
  const hy0 = cell.cy - HOLDER.w / 2;
  const hz1 = cell.z1 - HOLDER.top;
  const hz0 = hz1 - HOLDER.h;
  const hx = front - HOLDER.t;
  const plate = path3([[hx, hy0 + 1, hz0 + 0.9], [hx, hy0 + HOLDER.w - 1, hz0 + 0.9], [hx, hy0 + HOLDER.w - 1, hz1 - 0.9], [hx, hy0 + 1, hz1 - 0.9]], true);
  return {
    front: k.slabOf({ x: front, y: cell.y0, w: PROUD, d: GRID.cell.w, r: 0.5 }, cell.z0, GRID.cell.h, P, 3, 0.4),
    field: `<g transform="${planeX(front)}">${Ln(flat(cell.y0 + 1.5, cell.z0 + 1.3, cell.y1 - 1.5, cell.z1 - 1.3, 0.8, 3), { tone: "faint" })}</g>`,
    holder: k.slabOf({ x: hx, y: hy0, w: HOLDER.t, d: HOLDER.w, r: 0.3 }, hz0, HOLDER.h, P, 2),
    plate: `<path class="bc-glow" data-label="${index}" d="${plate}"/><path class="bc-label" data-label="${index}" d="${plate}"/>`,
    rivets:
      Dots([at([hx, hy0 + 0.55, (hz0 + hz1) / 2]), at([hx, hy0 + HOLDER.w - 0.55, (hz0 + hz1) / 2])], { size: 0.32, tone: "mid" }) +
      Dots([at([front, cell.cy, cell.z0 + 1.5])], { size: 0.42, tone: "mid" }),
    pull: k.slabOf({ x: front - PULL.d, y: cell.cy - PULL.w / 2, w: PULL.d, d: PULL.w, r: 1 }, cell.z0 + PULL.bottom, PULL.h, P, 4, 0.3),
    shapes: [
      [[front, cell.y0, cell.z0], [x, cell.y1, cell.z1]],
      [[hx, hy0, hz0], [front, hy0 + HOLDER.w, hz1]],
      [[front - PULL.d, cell.cy - PULL.w / 2, cell.z0 + PULL.bottom], [front, cell.cy + PULL.w / 2, cell.z0 + PULL.bottom + PULL.h]],
    ],
  };
}
const faceSvg = (face, lit) =>
  S(face.front, { tone: "mid", lit }) + face.field + S(face.holder, { tone: "hi", className: "bc-brass" }) + face.plate + face.rivets + S(face.pull, { tone: "hi", className: "bc-brass" });
DRAWERS.forEach((drawer, index) => {
  if (drawer.guide) return;
  const face = drawerFace(drawer.cell, index);
  const name = `cab.drawer.${drawer.row}.${drawer.column}`;
  const shapes = face.shapes.map(([min, max], part) => record(A.box(min, max, { name: `${name}.${part}` })));
  put(name, [CAB.x0 - 1, drawer.cell.cy, (drawer.cell.z0 + drawer.cell.z1) / 2], faceSvg(face, false), shapes);
});
// The guide's drawer: built closed, slid out along -x by live code. Its box is clipped to the opening
// and the space in front of it.
const GUIDE_INDEX = DRAWERS.findIndex((drawer) => drawer.guide);
const BOX = { depth: 38, wall: 0.9, floor: 1 };
const DCARD = { w: GRID.cell.w - 5, h: GRID.cell.h - 5.2, t: 0.5 };
const CARD_XS = [3.5, 6.5, 9.5, 12.5, 15.5, 18.5, 21.5].map((d) => CAB.x0 + d);
function standingCard(x, className = "") {
  const y0 = GUIDE.cy - DCARD.w / 2;
  const z0 = GUIDE.z0 + BOX.floor;
  const body = k.slabOf({ x, y: y0, w: DCARD.t, d: DCARD.w, r: 0.15 }, z0, DCARD.h, P, 2);
  const tabY = y0 + 2.5 + ((Math.round(x) * 7) % (DCARD.w - 9));
  const tab = k.slabOf({ x, y: tabY, w: DCARD.t, d: 5.5, r: 0.15 }, z0 + DCARD.h, 1.5, P, 2);
  return `<g class="bc-index${className}">${S(body, { tone: "hi", crease: "none" })}${S(tab, { tone: "hi", crease: "none" })}</g>`;
}
{
  const cell = GUIDE;
  const face = drawerFace(cell, GUIDE_INDEX);
  const z0 = cell.z0;
  const z1 = cell.z1 - 1.2;
  const xb = CAB.x0 + BOX.depth;
  const floor = k.slabOf({ x: CAB.x0, y: cell.y0 + 1, w: BOX.depth, d: GRID.cell.w - 2, r: 0.3 }, z0, BOX.floor, P, 2);
  const wallA = k.slabOf({ x: CAB.x0, y: cell.y0 + 1, w: BOX.depth, d: BOX.wall, r: 0.2 }, z0, z1 - z0, P, 2);
  const wallB = k.slabOf({ x: CAB.x0, y: cell.y1 - 1 - BOX.wall, w: BOX.depth, d: BOX.wall, r: 0.2 }, z0, z1 - z0, P, 2);
  const backWall = k.slabOf({ x: xb - BOX.wall, y: cell.y0 + 1, w: BOX.wall, d: GRID.cell.w - 2, r: 0.2 }, z0, z1 - z0, P, 2);
  const follower = k.slabOf({ x: CARD_XS[CARD_XS.length - 1] + 1, y: cell.cy - 6, w: 3, d: 12, r: 0.5 }, z0 + BOX.floor, 7, P, 3);
  const cards = CARD_XS.slice(1).reverse().map((x) => standingCard(x)).join("");
  const clip = hull([CAB.x0 - PROUD - TRAVEL, cell.y0, cell.z0 - 0.5], [CAB.x0, cell.y1, cell.z1]) + hull([CAB.x0 - TRAVEL, cell.cy - DCARD.w / 2, cell.z1 - 2], [CAB.x0 - TRAVEL + 6, cell.cy + DCARD.w / 2, cell.z1 + LIFT + 2]);
  const hole = path3([[CAB.x0, cell.y0, cell.z0], [CAB.x0, cell.y1, cell.z0], [CAB.x0, cell.y1, cell.z1], [CAB.x0, cell.y0, cell.z1]], true);
  const svg =
    `<path class="bc-hole" d="${hole}"/>` +
    `<g data-part="drawer">` +
    `<clipPath id="bc-drawer-clip"><path data-hold d="${clip}"/></clipPath>` +
    `<g clip-path="url(#bc-drawer-clip)"><g data-part="box" style="visibility:hidden">` +
    S(floor, { tone: "lo" }) + S(backWall, { tone: "lo" }) + S(wallA, { tone: "lo" }) + S(follower, { tone: "mid" }) + cards +
    `<g data-part="dcard">${standingCard(CARD_XS[0], " bc-live")}</g>` +
    S(wallB, { tone: "lo" }) +
    `</g></g>` +
    faceSvg(face, true) +
    `</g>`;
  const shapes = [
    record(A.box([CAB.x0 - PROUD - TRAVEL, cell.y0, cell.z0], [CAB.x0, cell.y1, cell.z1], { name: "cab.guide.drawer" })),
    record(A.box([CAB.x0 - PROUD - PULL.d - TRAVEL, cell.cy - PULL.w / 2, cell.z0 + PULL.bottom], [CAB.x0 - PROUD - TRAVEL, cell.cy + PULL.w / 2, cell.z0 + PULL.bottom + PULL.h], { name: "cab.guide.pull" })),
  ];
  put("cab.guide", [CAB.x0 - 1, cell.cy, (cell.z0 + cell.z1) / 2], svg, shapes, { front: true });
}
// The PUBLISH lamp on the lid.
post("lamp.base", LAMP.x, LAMP.y, LAMP.base, LID.z1, LID.z1 + 1.8, { tone: "lo" }, { steps: 32, bevel: 0.4, extra: screwDots([[LAMP.x, LAMP.y - 3.4], [LAMP.x, LAMP.y + 3.4]], LID.z1 + 1.8, 0.36) });
const COLLAR = post("lamp.collar", LAMP.x, LAMP.y, LAMP.collar, LID.z1 + 1.8, LID.z1 + 3.8, { tone: "mid" }, { steps: 28 });
const GLOBE_C = [LAMP.x, LAMP.y, LID.z1 + 3.8 + Math.sqrt(LAMP.globe ** 2 - LAMP.collar ** 2)];
globe("lamp.globe", GLOBE_C, LAMP.globe, COLLAR, "bc-lamp");
{
  const plate = { x: LAMP.x + 6, y: LAMP.y - 5, w: 4.4, d: 10, r: 0.6 };
  box("lid.plate", [plate.x, plate.y, LID.z1], [plate.x + plate.w, plate.y + plate.d, LID.z1 + 0.6], { tone: "hi" }, {
    r: 0.6,
    className: "bc-brass",
    extra:
      Ln([k.lineOnTop([plate.x + 1.6, plate.y + 2], [plate.x + 1.6, plate.y + 8.4], LID.z1 + 0.6, P), k.lineOnTop([plate.x + 2.9, plate.y + 2], [plate.x + 2.9, plate.y + 6.4], LID.z1 + 0.6, P)].join(""), { tone: "lo", free: true }),
  });
}

// ---------------------------------------------------------------- the agent terminal beside the catalog
box("term.pad", [TERM.x0 - 2, TERM.y0 - 2, BANK_TOP], [TERM.x1 + 2, TERM.y1 + 2, BANK_TOP + 1.4], { tone: "lo" }, { r: 1.5, steps: 4 });
const SCREEN = { x0: TERM.x0 + 4.5, x1: TERM.x1 - 4.5, z0: BANK_TOP + 10, z1: TERM.z1 - 5, r: 2.2, depth: 1.6 };
let clips = 0;
function recess({ x0, x1, z0, z1, r, depth }, y, backSvg = "", backClass = "bc-well") {
  const id = `bc-recess-${clips++}`;
  const ring = k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, 5);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const L = G.lightOf(P);
  const tops = [];
  const sides = [[], [], [], []];
  ring.forEach(([ax, az], index) => {
    const [bx, bz] = ring[(index + 1) % ring.length];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    let [nx, nz] = [(bz - az) / length, -(bx - ax) / length];
    if (nx * (cx - (ax + bx) / 2) + nz * (cz - (az + bz) / 2) < 0) [nx, nz] = [-nx, -nz];
    if (G.dot3([nx, 0, nz], V) <= 0) return;
    const quad = k.pathOf([at([ax, y, az]), at([bx, y, bz]), at([bx, y - depth, bz]), at([ax, y - depth, az])], true);
    if (nz >= Math.abs(nx)) tops.push(quad);
    else sides[Math.min(3, Math.max(0, Math.floor(((G.dot3([nx, 0, nz], L) + 1) / 2) * 4)))].push(quad);
  });
  const shape = flat(x0, z0, x1, z1, r, 5);
  return [
    `<clipPath id="${id}"><path transform="${planeY(y)}" d="${shape}"/></clipPath>`,
    `<g clip-path="url(#${id})">`,
    `<path class="iso-top" d="${tops.join("")}"/>`,
    ...sides.map((d, shade) => (d.length ? `<path class="iso-shade" data-shade="${shade}" d="${d.join("")}"/>` : "")),
    `<g transform="${planeY(y - depth)}"><path class="${backClass}" d="${shape}"/>${backSvg}<path class="iso-line" data-tone="faint" d="${shape}"/></g>`,
    `</g>`,
    `<g transform="${planeY(y)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}
const SCR = { x: SCREEN.x0 + 2.2, top: SCREEN.z1 - 2.6, size: 2.3, step: 3.3 };
const screenLines = (lines, className) =>
  lines.map((text, i) => `<text class="bc-text ${className}" x="${SCR.x}" y="${r2(-(SCR.top - SCR.size - i * SCR.step))}" font-size="${SCR.size}">${text}</text>`).join("");
const SLIP_LINES = ["docs/guides/", "sending-notifications", `.md:${MODEL.guide.line}`];
const screenSvg =
  `<path class="bc-screen-glow" data-part="screen-glow" d="${flat(SCREEN.x0 + 1, SCREEN.z0 + 1, SCREEN.x1 - 1, SCREEN.z1 - 1, 3)}"/>` +
  `<g data-screen="idle">${screenLines(["&gt; ask send()", "ready"], "bc-dim")}</g>` +
  `<g data-screen="slip" style="display:none">${screenLines(SLIP_LINES, "")}<path class="bc-slip-rule" d="M${SCR.x} ${r2(-(SCREEN.z0 + 2.6))}H${r2(SCREEN.x1 - 2.4)}"/></g>` +
  `<g data-screen="blocked" style="display:none">${screenLines(["publish", "blocked"], "bc-dim")}</g>`;
box("term.case", [TERM.x0, TERM.y0, BANK_TOP + 1.4], [TERM.x1, TERM.y1, TERM.z1], {}, {
  r: 2.2,
  steps: 5,
  bevel: 0.6,
  inner: (p) => sideSeam(p, BANK_TOP + 6, 5),
  extra:
    recess(SCREEN, TERM.y1, screenSvg, "bc-glass") +
    Ln(Array.from({ length: 5 }, (_, i) => k.planOutline({ x: TERM.x0 + 7 + i * 3.2, y: TERM.y0 + 4, w: 1.4, d: 10, r: 0.7 }, TERM.z1, P, 3)).join(""), { tone: "faint" }) +
    `<circle class="bc-led" data-part="led" cx="${r2(at([TERM.x1 - 5, TERM.y1, BANK_TOP + 5.5])[0])}" cy="${r2(at([TERM.x1 - 5, TERM.y1, BANK_TOP + 5.5])[1])}" r="0.85"/>`,
});
// Keys on the bank in front of the terminal's left side.
box("term.keys", [TERM.x0 - 18, TERM.y0 + 2, BANK_TOP], [TERM.x0 - 3, TERM.y1, BANK_TOP + 2.6], {}, {
  r: 1.4,
  steps: 4,
  bevel: 0.4,
  extra: (() => {
    const out = [];
    for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) out.push(k.planOutline({ x: TERM.x0 - 16 + c * 3.8, y: TERM.y0 + 4 + r * 3.4, w: 3, d: 2.7, r: 0.5 }, BANK_TOP + 2.6, P, 2));
    return Ln(out.join(""), { tone: "lo" });
  })(),
});

// Label plate on the right bank: the one engraved word in the drawing.
{
  const LABEL = { x: 124, y: 40, w: 40, d: 12, r: 1.2 };
  box("bank.label", [LABEL.x, LABEL.y, BANK_TOP], [LABEL.x + LABEL.w, LABEL.y + LABEL.d, BANK_TOP + 0.8], { tone: "lo" }, {
    r: 1.2,
    steps: 4,
    extra:
      Ln(k.planOutline(k.insetPlan(LABEL, 1.6), BANK_TOP + 0.8, P, 4), { tone: "faint" }) +
      k.faceTextSvg(k.topMatrix([LABEL.x + 4, LABEL.y + 6], BANK_TOP + 0.8, P, "x"), "doc-bridge", { size: 4.4, tone: "mid" }) +
      Ln(k.lineOnTop([LABEL.x + 4, LABEL.y + 8.8], [LABEL.x + 26, LABEL.y + 8.8], BANK_TOP + 0.8, P), { tone: "lo", free: true }) +
      screwDots([[LABEL.x + 36, LABEL.y + 3.4], [LABEL.x + 36, LABEL.y + 8.6]], BANK_TOP + 0.8, 0.42),
  });
}

// ---------------------------------------------------------------- the messy bank: loose pages, .md files and code sheets
const Z = BANK_TOP;
const rot = (cx, cy, deg) => {
  const a = (deg * Math.PI) / 180;
  return ([u, v]) => [cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a)];
};
// Rule lines that stand for text: a markdown page has a heading bar and paragraphs, a code sheet indented lines.
function textLines(kind, w, d) {
  const lines = [];
  const left = -w / 2 + 2;
  if (kind === "md") {
    lines.push([left, -d / 2 + 2.4, left + w * 0.42, 1]);
    for (let i = 0; i < 6; i++) {
      const v = -d / 2 + 5 + i * 2;
      if (v > d / 2 - 1.6) break;
      lines.push([left, v, left + (w - 4) * [0.92, 0.84, 0.95, 0.6, 0.88, 0.7][i], 0]);
    }
  } else {
    const indents = [0, 1, 2, 2, 1, 2, 3, 1, 0];
    const lens = [0.6, 0.5, 0.7, 0.45, 0.55, 0.62, 0.35, 0.3, 0.2];
    for (let i = 0; i < indents.length; i++) {
      const v = -d / 2 + 2 + i * 1.6;
      if (v > d / 2 - 1.4) break;
      lines.push([left + indents[i] * 1.6, v, left + indents[i] * 1.6 + (w - 4) * lens[i], 0]);
    }
  }
  return lines;
}
function sheetFlat(name, { cx, cy, deg, w, d, z = Z, kind = "md", t = 0.5, className, front = false }) {
  const map = rot(cx, cy, deg);
  const ring = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(map);
  const shape = record(A.extruded(ring, z, t, { name }));
  const top = z + t;
  const lines = textLines(kind, w, d);
  const heading = lines.filter((l) => l[3]).map(([u0, v, u1]) => k.onTop([map([u0, v]), map([u1, v])], top, P)).join("");
  const body = lines.filter((l) => !l[3]).map(([u0, v, u1]) => k.onTop([map([u0, v]), map([u1, v])], top, P)).join("");
  // A folded corner on markdown pages.
  const fold = kind === "md" ? Ln(k.onTop([map([w / 2 - 3, -d / 2]), map([w / 2 - 3, -d / 2 + 3]), map([w / 2, -d / 2 + 3])], top, P), { tone: "faint" }) : "";
  const svg = S(k.extrude(ring, z, t, P), { tone: "hi", className }) + (heading ? Ln(heading, { tone: "mid", free: true, className: "bc-heading" }) : "") + Ln(body, { tone: kind === "md" ? "lo" : "faint", free: true, className: kind === "code" ? "bc-codeline" : undefined }) + fold;
  put(name, [cx, cy, z + t / 2], svg, [shape], { front });
}
// A ream: a block of sheets, edges striped on its visible sides.
function ream(name, { cx, cy, deg, w, d, h }) {
  const map = rot(cx, cy, deg);
  const ring = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(map);
  const shape = record(A.extruded(ring, Z, h, { name }));
  const seams = [];
  for (let z = Z + 0.9; z < Z + h - 0.5; z += 0.9) seams.push(k.ringSeam(ring, z, P));
  put(name, [cx, cy, Z + h / 2], S(k.extrude(ring, Z, h, P), { tone: "hi", inner: Ln(seams.join(""), { tone: "faint" }) }), [shape]);
  return Z + h;
}
// A sheet leaning on the +y edge of a ream, its foot on the bank.
function leaning(name, { x, w, len, yEdge, zEdge, foot, kind }) {
  const dy = foot;
  const dz = zEdge - Z;
  const v = G.unit3([0, -dy, dz]);
  const u = [1, 0, 0];
  const a = G.cross3(u, v);
  const F = { o: [x, yEdge + dy, Z], a, u, v };
  const poly = [[-w / 2, 0], [w / 2, 0], [w / 2, len], [-w / 2, len]];
  const shape = record(A.prism(F, poly, -0.5, 0, { name }));
  const lift = (pu, pv) => G.add3(G.add3(F.o, G.add3(G.mul3(u, pu), G.mul3(v, pv))), G.mul3(a, -0.5));
  const lines = textLines(kind, w, len).map(([u0, vv, u1, head]) => [path3([lift(u0, vv + len / 2), lift(u1, vv + len / 2)]), head]);
  const svg = S(G.prismOf(F, poly, -0.5, 0, P), { tone: "hi" }) + Ln(lines.filter((l) => l[1]).map((l) => l[0]).join(""), { tone: "mid", free: true }) + Ln(lines.filter((l) => !l[1]).map((l) => l[0]).join(""), { tone: kind === "md" ? "lo" : "faint", free: true });
  put(name, lift(0, len / 2), svg, [shape]);
}
{
  const topA = ream("pile.ream.a", { cx: -238, cy: -30, deg: 0, w: 20, d: 26, h: 5.4 });
  sheetFlat("pile.a.sheet0", { cx: -237, cy: -29, deg: 14, w: 17, d: 22, z: topA, kind: "md" });
  sheetFlat("pile.a.sheet1", { cx: -239, cy: -31, deg: -9, w: 16, d: 21, z: topA + 0.5, kind: "code" });
  leaning("pile.a.lean", { x: -238, w: 16, len: 20, yEdge: -17, zEdge: topA, foot: 10, kind: "md" });
  const topB = ream("pile.ream.b", { cx: -214, cy: -26, deg: 0, w: 18, d: 22, h: 3.2 });
  sheetFlat("pile.b.sheet0", { cx: -213, cy: -24, deg: -24, w: 16, d: 20, z: topB, kind: "code" });
  sheetFlat("pile.loose0", { cx: -250, cy: 6, deg: 32, w: 16, d: 21, kind: "code" });
  sheetFlat("pile.loose1", { cx: -228, cy: 10, deg: -16, w: 16, d: 21, kind: "md" });
  sheetFlat("pile.loose2", { cx: -206, cy: 2, deg: 58, w: 15, d: 20, kind: "code" });
  sheetFlat("pile.loose3", { cx: -246, cy: 30, deg: -38, w: 16, d: 21, kind: "md" });
  sheetFlat("pile.loose4", { cx: -200, cy: -42, deg: 22, w: 15, d: 20, kind: "md" });
  // The guide itself: docs/guides/sending-notifications.md, lying nearest the belt.
  sheetFlat("pile.guide", { cx: -214, cy: 26, deg: 12, w: 16, d: 21, kind: "md", className: "bc-guide" });
}
// The code sheet: a page in a clip stand showing the code's signature for send.
box("sign.base", [SIGN.x0 - 2, SIGN.y - 5, Z], [SIGN.x1 + 2, SIGN.y + 5, Z + 2.2], { tone: "lo" }, {
  r: 1.4,
  steps: 4,
  bevel: 0.4,
  extra: screwDots([[SIGN.x0, SIGN.y + 3.2], [SIGN.x1, SIGN.y + 3.2]], Z + 2.2, 0.42),
});
for (const [i, x] of [SIGN.x0 + 1.9, SIGN.x1 - 1.9].entries()) post(`sign.post${i}`, x, SIGN.y, 1.1, Z + 2.2, SIGN.z1 + 1.5, { tone: "mid" }, { steps: 16 });
{
  const y = SIGN.y;
  const plan = { x: SIGN.x0 + 3, y: y - SIGN.t / 2, w: SIGN.x1 - SIGN.x0 - 6, d: SIGN.t, r: 0.3 };
  const shape = record(A.slab(plan, SIGN.z0, SIGN.z1 - SIGN.z0, { name: "sign.tab" }, 2));
  const tab = k.slabOf(plan, SIGN.z0, SIGN.z1 - SIGN.z0, P, 2, 0.3);
  const fy = y + SIGN.t / 2;
  const code = (version) =>
    `<g data-code="${version}"${version ? ' style="display:none"' : ""}>${codeLines(version)
      .map((text, i, all) => `<text class="bc-code" x="${SIGN.x0 + 5.4}" y="${r2(-(all.length === 1 ? (SIGN.z0 + SIGN.z1) / 2 - 1.3 : SIGN.z1 - 6.2 - i * 4.4))}" font-size="3.4">${text.replace(/ /g, "&#160;")}</text>`)
      .join("")}</g>`;
  const window = flat(SIGN.x0 + 4, SIGN.z0 + 1.4, SIGN.x1 - 4, SIGN.z1 - 1.4, 0.8);
  // A bulldog clip at the top of the sheet.
  const clipBar = flat((SIGN.x0 + SIGN.x1) / 2 - 5, SIGN.z1 - 1.2, (SIGN.x0 + SIGN.x1) / 2 + 5, SIGN.z1 + 0.8, 0.5, 2);
  const svg =
    `<g data-part="sign">` +
    S(tab, { tone: "hi" }) +
    `<g transform="${planeY(fy)}"><path class="bc-sign-face" d="${window}"/>${code(0)}${code(1)}<path class="iso-line" data-tone="lo" d="${window}"/><path class="bc-clip" d="${clipBar}"/><path class="iso-line" data-tone="mid" d="${clipBar}"/></g>` +
    `</g>`;
  put("sign.tab", [(SIGN.x0 + SIGN.x1) / 2, y, (SIGN.z0 + SIGN.z1) / 2], svg, [shape]);
}

// ---------------------------------------------------------------- settle the painter's order
A.settle(R, P);
// Items in front of the belt's cards (near railing, arch, barrier, intake, open drawer) form the front layer.
const FRONT_LIFT = 10000;
for (const item of R.items) if (FRONT.has(item.name)) item.key += FRONT_LIFT;
R.items.sort((a, b) => a.key - b.key);
const groupOf = (item) => `<g class="it${item.className ? ` ${item.className}` : ""}" data-name="${item.name}">${item.svg}</g>`;
const backItems = R.items.filter((item) => !FRONT.has(item.name)).map(groupOf);
const frontItems = R.items.filter((item) => FRONT.has(item.name)).map(groupOf);

// The live layer: cards on the belt, clipped to the belt's run up to the slot face; the light curtain;
// and the page that drops into the hopper.
function beltCard() {
  const plan = { x: -CARD.l / 2, y: -CARD.w / 2, w: CARD.l, d: CARD.w, r: 0.8 };
  const z0 = BELT.top;
  const top = z0 + CARD.t;
  const stripe = path3([[-6.2, -3.8, top], [-1.2, -3.8, top], [-1.2, -1.4, top], [-6.2, -1.4, top]], true);
  const lines = [[0.8, 7, -3.2], [0.8, 5, -1.6], [-6.2, 6.2, 1.2], [-6.2, 4.2, 2.8]].map(([u0, u1, v]) => k.lineOnTop([u0, v], [u1, v], top, P)).join("");
  return (
    `<g class="bc-card">` +
    S(k.slabOf(plan, z0, CARD.t, P, 3, 0.25), { tone: "hi" }) +
    Ln(lines, { tone: "lo", free: true }) +
    `<path class="bc-card-glow" d="${stripe}"/><path class="bc-card-label" d="${stripe}"/>` +
    `</g>`
  );
}
const CARD_COUNT = 7;
const trackClip = hull([BELT.x0 - 40, -CARD.w, BELT.top - 0.2], [SLOT.x, CARD.w, BELT.top + CARD.t + 0.6]);
const cardsSvg =
  `<clipPath id="bc-track-clip"><path d="${trackClip}"/></clipPath>` +
  `<g data-part="cards" clip-path="url(#bc-track-clip)">${Array.from({ length: CARD_COUNT }, (_, i) => `<g data-card="${i}" transform="translate(-9999 0)">${beltCard()}</g>`).join("")}</g>`;
const curtainSvg = `<path class="bc-curtain" data-part="curtain" d="${CURTAIN}"/>`;
// A page standing in the hopper, sunk by live code into the mouth.
const FEED = { x: (MOUTH.x0 + MOUTH.x1) / 2 - 1, w: 11, h: 13, lean: 0.28 };
const feedPage = (() => {
  const F = { o: [FEED.x, 0, HOPPER.z1 - 6], a: G.unit3([1, 0, FEED.lean]), u: [0, 1, 0], v: G.unit3([-FEED.lean, 0, 1]) };
  const fix = G.cross3(F.u, F.v);
  F.a = fix;
  const poly = [[-FEED.w / 2, 0], [FEED.w / 2, 0], [FEED.w / 2, FEED.h], [-FEED.w / 2, FEED.h]];
  const p = (pu, pv) => G.add3(F.o, G.add3(G.mul3(F.u, pu), G.mul3(F.v, pv)));
  const lines = textLines("code", FEED.w, FEED.h).map(([u0, v, u1]) => path3([p(u0, FEED.h - (v + FEED.h / 2)), p(u1, FEED.h - (v + FEED.h / 2))])).join("");
  const clip = hull([MOUTH.x0 - 6, -MOUTH.y, HOPPER.z1], [MOUTH.x1 + 4, MOUTH.y, HOPPER.z1 + 30]);
  return `<clipPath id="bc-feed-clip"><path d="${clip}"/></clipPath><g clip-path="url(#bc-feed-clip)"><g data-part="feed">${S(G.prismOf(F, poly, 0, 0.4, P), { tone: "hi" })}${Ln(lines, { tone: "faint", free: true })}</g></g>`;
})();

// ---------------------------------------------------------------- frames: the wide desktop card and the phone crop
const inkPoints = [];
for (const chunk of [...back, ...backItems, ...frontItems]) {
  for (const [, d] of chunk.matchAll(/class="iso-fill" d="([^"]*)"/g)) {
    const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 1 < numbers.length; i += 2) inkPoints.push([numbers[i], numbers[i + 1]]);
  }
}
const ink = {
  x0: Math.min(...inkPoints.map((p) => p[0])),
  x1: Math.max(...inkPoints.map((p) => p[0])),
  y0: Math.min(...inkPoints.map((p) => p[1])),
  y1: Math.max(...inkPoints.map((p) => p[1])),
};
function frameAround(box, aspect, fill) {
  let vw = (box.x1 - box.x0) / fill;
  let vh = (box.y1 - box.y0) / fill;
  if (vw / vh > aspect) vh = vw / aspect;
  else vw = vh * aspect;
  return { x: Math.round((box.x0 + box.x1) / 2 - vw / 2), y: Math.round((box.y0 + box.y1) / 2 - vh / 2), w: Math.round(vw), h: Math.round(vh) };
}
const WIDE = frameAround(ink, 2.4, 0.96);
// The phone crop: the bridge span from the first pier to the barrier, the arch at its heart.
const cropPoints = [[-56, -24, 0], [-56, 24, 0], [124, -24, 0], [124, 24, 0], [0, 0, ARCH.beam.z1 + 14], [BARRIER.x, 0, BARRIER.header + 6], [-56, 24, -6]].map(at);
const CROP = frameAround({ x0: Math.min(...cropPoints.map((p) => p[0])), x1: Math.max(...cropPoints.map((p) => p[0])), y0: Math.min(...cropPoints.map((p) => p[1])), y1: Math.max(...cropPoints.map((p) => p[1])) }, 4 / 3, 0.98);

// Hit areas for the in-figure buttons, in view-box units (live code turns them into percentages per frame).
const boxOf = (min, max) => {
  const s = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) s.push(at([x, y, z]));
  const xs = s.map((p) => p[0]);
  const ys = s.map((p) => p[1]);
  const pad = 3;
  return { x: r2(Math.min(...xs) - pad), y: r2(Math.min(...ys) - pad), w: r2(Math.max(...xs) - Math.min(...xs) + pad * 2), h: r2(Math.max(...ys) - Math.min(...ys) + pad * 2) };
};
const HOTS = {
  code: boxOf([SIGN.x0 - 2, SIGN.y - 5, Z], [SIGN.x1 + 2, SIGN.y + 5, SIGN.z1 + 1.5]),
  archcode: boxOf([PLATE.x - 1, PLATE.y0, PLATE.z0], [BEAM.x1, PLATE.y1, PLATE.z1 + 2]),
  guide: boxOf([CAB.x0 - PROUD - PULL.d, GUIDE.y0, GUIDE.z0], [CAB.x0, GUIDE.y1, GUIDE.z1]),
  page: boxOf([-224, 16, Z], [-204, 36, Z + 1]),
  held: boxOf([STOP_X - CARD.l / 2 - 1, -CARD.w / 2 - 1, BELT.top], [STOP_X + CARD.l / 2 + 1, CARD.w / 2 + 1, BELT.top + 4]),
  terminal: boxOf([TERM.x0, TERM.y0, Z], [TERM.x1, TERM.y1, TERM.z1]),
};

const LABEL_TEXT =
  "An isometric bridge over a river. On the left bank lies a messy pile of loose pages, markdown files and code printouts, with a code sheet that shows the signature of send. A conveyor belt carries the pages across the bridge one by one as neat index cards, through an inspection arch at mid-span that checks each card against the code, and past a barrier into a card catalog on the right bank, where the cards are filed into drawers with glowing label plates under a lit PUBLISH lamp. An agent terminal beside the catalog pulls the sending-notifications card and shows docs/guides/sending-notifications.md line 8. When the code changes, the arch raises an amber flag, the card for the guide turns amber, the barrier drops and the belt holds, and the lamp goes out: one CHANGED_REFERENCE finding blocks publication until the guide is fixed.";
const svg = k
  .figureSvg({ width: WIDE.w, height: WIDE.h, label: LABEL_TEXT, body: [...back, ...backItems, cardsSvg, ...frontItems, curtainSvg, feedPage] })
  .replace(`viewBox="0 0 ${WIDE.w} ${WIDE.h}"`, `viewBox="${WIDE.x} ${WIDE.y} ${WIDE.w} ${WIDE.h}"`);

const DATA = {
  P,
  model: MODEL,
  start: verdict(initial()),
  frames: { wide: WIDE, crop: CROP },
  hots: HOTS,
  belt: { x0: BELT.x0, x1: BELT.x1, cleat: CLEAT, spawn: HOOD.x0 + 4, slot: SLOT.x + CARD.l / 2 + 1, arch: ARCH.x, stop: STOP_X, pitch: 58, speed: 13 },
  cards: CARD_COUNT,
  drawer: { travel: TRAVEL, lift: LIFT },
  barrier: { up: BARRIER.bar.up, down: BARRIER.bar.down },
  flag: { rise: FLAG.rise },
  feed: { sink: 12, axis: G.unit3([-FEED.lean, 0, 1]) },
  labels: DRAWERS.length,
};

const CSS = readFileSync(join(HERE, "figure.css"), "utf8");
const MODEL_SRC = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const LIVE = MODEL_SRC + readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const hot = (key, label) => `<button type="button" class="bc-hot" data-hot="${key}" aria-label="${label}"></button>`;
const body = `
<figure class="iso-figure bc-figure">
  <div class="iso-plate bc-plate" id="card">
    <div class="bc-top">
      <span class="bc-corner" data-corner="fig">Fig 1</span>
      <span class="bc-corner" data-corner="title">The bridge</span>
    </div>
    <div class="iso-stage bc-stage" role="group" aria-label="The bridge figure. Buttons on the drawing: the code sheet and the arch's plate change the signature of send, the amber card or the guide page fixes the guide, the guide's drawer and the terminal ask for it.">
      ${svg}
      <div class="bc-hots">
        ${hot("code", "Change the signature of send")}
        ${hot("page", "Fix the sending-notifications guide")}
        ${hot("archcode", "Change the signature of send")}
        ${hot("held", "Fix the sending-notifications guide")}
        ${hot("guide", "Ask for the sending-notifications guide")}
        ${hot("terminal", "Ask the agent terminal where send is documented")}
      </div>
    </div>
    <div class="bc-bottom">
      <div class="bc-left">
        <button type="button" class="bc-pause" data-pause aria-pressed="false"><span class="bc-pause-icon" aria-hidden="true"></span><span data-pause-label>Pause</span></button>
        <span class="bc-corner" data-corner="hint"><span class="bc-wide-only">Click the code · fix the amber card</span><span class="bc-crop-only">Tap the arch · tap the amber card</span></span>
      </div>
      <span class="bc-corner" data-corner="readout" data-readout>${DATA.start.readout}</span>
    </div>
    <span class="bc-sr" role="status" aria-live="polite" data-status></span>
  </div>
</figure>`;

const THEME_BOOT = `(function(){var t='dark';try{var q=new URLSearchParams(location.search).get('theme');if(q==='light'||q==='dark'){t=q;}else{var h=window.parent&&window.parent!==window?window.parent.document.documentElement:null;if(h&&h.classList.contains('light'))t='light';else if(h&&h.classList.contains('dark'))t='dark';else if(window.matchMedia('(prefers-color-scheme: light)').matches)t='light';}}catch(e){if(window.matchMedia('(prefers-color-scheme: light)').matches)t='light';}document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;})();`;
const page = (forced) =>
  `<!doctype html><html lang="en" class="iso" data-theme="${forced ?? "dark"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The bridge: doc-bridge carries docs to agents, and its publication gate</title>` +
  `<script>${forced ? `window.__bcTheme='${forced}';document.documentElement.style.colorScheme='${forced}';` : THEME_BOOT}</script>` +
  `<style>${k.ISO_CSS}${CSS}</style></head><body class="bc-body"><main class="bc-page">${body}</main>` +
  `<script type="module">${(kitScript() + LIVE).replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;

const OUT = join(ROOT, "apps", "docs", "public", "figures", "bridge-conveyor.html");
writeFileSync(OUT, page(null));
const previewAt = process.argv.indexOf("--preview");
if (previewAt > 0) {
  const dir = resolve(process.argv[previewAt + 1]);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "bridge-conveyor-dark.html"), page("dark"));
  writeFileSync(join(dir, "bridge-conveyor-light.html"), page("light"));
}
const solids = R.solids.length;
console.log("wrote", OUT.replace(ROOT + "/", ""), `${(page(null).length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${solids} recorded solids`, `scale ${KS.toFixed(3)}`, `wide ${WIDE.w}x${WIDE.h}`, `crop ${CROP.w}x${CROP.h}`);
A.auditOrExit(R, P, { cover: ["cab.guide", "arch.flag", "barrier.bar"] });
