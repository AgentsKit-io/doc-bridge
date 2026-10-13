// Builds apps/docs/public/figures/assembly-line.html: an isometric figure of the doc-bridge
// assembly line, drawn with the "anatomy" figure kit (MIT). The kit is not vendored here: point
// ANATOMY_DIR at a checkout of the skill (default: ~/.claude/skills/anatomy, built at commit
// bb13e5e). The page it writes is self-contained: no network, no third-party scripts.
//
//   node scripts/figures/assembly-line/build.mjs            write the page
//   node scripts/figures/assembly-line/build.mjs --audit    write it, then run the kit's geometry audit
//   node scripts/figures/assembly-line/build.mjs --preview <dir>   also write <dir>/assembly-line-{light,dark}.html
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
const { MODEL } = await import(pathToFileURL(join(HERE, "model.mjs")).href);

const W = 840;
const H = 336;
const AZIMUTH = 72;

// ---------------------------------------------------------------- world plan (units ~ px, z up)
const PLATE = { x: -346, y: -96, w: 692, d: 160, r: 10 };
const PLATE_H = 10;
const FOOT_H = 5;
const BELT = { x0: -300, x1: 300, y0: -13, y1: 13, z0: 23, z1: 25 };
const RAIL = { z0: 14, z1: 27, t: 4 };
const MOUTH = -283.2; // the intake curtain's back face: cards appear from here
const LX = -140; // loom centre
const FELL = LX + 5.5; // the reed's front face: the woven index starts here
const GX = 45; // sensor gate centre
const SX = 165; // stamp centre
const SPOOL_X = 78; // index spool axis
const CLOTH = { y0: -60, y1: -36, z: 36, top: 36.4, x0: -218, x1: SPOOL_X };
const LANES = ["documents", "modules", "symbols", "relations"];
const LANE_W = (CLOTH.y1 - CLOTH.y0) / LANES.length;
const laneY = (index) => CLOTH.y0 + LANE_W * (index + 0.5);
const CARD_Z = BELT.z1;
const DOC_TOP = CARD_Z + 1.8;
const HOLE_X = [-6, -1];
const HOLE_Y = 4.2;
const TOOTH_X = [-7, -2];
const STAMP = { gland: 70, tip: 24 };
const RAM_STROKE = 38.5 - DOC_TOP; // pad face travels down onto the document
const PIN = { z0: 50, len: 17, stroke: 7.4 };
const HEDDLE_STROKE = 4;
// The advisory slip: built inside the printer and slid out of the slot on its +x face, past the printer.
const PRINTER = { x0: SX - 12, x1: SX + 12, y0: 22, y1: 40, z1: 30 };
const SLIP = { y0: 24.5, y1: 37.5, x1: PRINTER.x1, len: 34, out: 34, z: 21 };
SLIP.x0 = SLIP.x1 - SLIP.len;
const SLOT = { y0: SLIP.y0 - 1, y1: SLIP.y1 + 1, z0: 20.4, z1: 22.2 };
const TRAY = { x0: PRINTER.x1, x1: PRINTER.x1 + SLIP.out + 4, y0: SLIP.y0 - 1.5, y1: SLIP.y1 + 1.5, z0: 19, z1: SLIP.z };

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    [-318, -14, 86], [-288, 14, 86],
    [45, -12, 111],
    [-161, -75, 96], [-119, 27, 96],
    [157, -46, 88], [173, 8, 88],
  ],
  W,
  H,
  { pad: 22, azimuth: AZIMUTH },
);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- recorder helpers
const R = A.recorder(P);
const record = R.solid;
function put(name, ref, svg, shapes, { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: "line", ...rest });
}
const planOf = ([x0, y0, z0], [x1, y1, z1], r = 0.6) => ({ plan: { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r }, z0, h: z1 - z0 });
function box(name, min, max, style = {}, { r = 0.6, steps = 3, bevel = 0, extra = "", inner = "", bias = 0, ground = false } = {}) {
  const { plan, z0, h } = planOf(min, max, r);
  const shape = record(A.slab(plan, z0, h, { name, ...(ground ? { ground } : {}) }, steps));
  const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const innerSvg = typeof inner === "function" ? inner(plan, z0, h) : inner;
  put(name, centre, S(k.slabOf(plan, z0, h, P, steps, bevel), { tone: "mid", ...style, inner: innerSvg }) + extra, [shape], { bias });
  return { plan, z0, h, shape };
}
function post(name, cx, cy, r, z0, z1, style = {}, { extra = "", bias = 0, steps = 28, bevel = 0 } = {}) {
  const shape = record(A.cylinder(cx, cy, r, z0, z1 - z0, { name }));
  put(name, [cx, cy, (z0 + z1) / 2], S(k.cylinder(cx, cy, r, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style }) + extra, [shape], { bias });
  return shape;
}
function turned(name, F, s0, s1, r, style = {}, { extra = "", inner = "", bias = 0, bevel = 0 } = {}) {
  const shape = record(A.disc(F, s0, s1, r, { name }));
  const centre = G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2));
  put(name, centre, S(G.disc(s0, s1, r, F, P, { bevel }), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
function ball(name, c, r, style = {}, { extra = "", bias = 0 } = {}) {
  const shape = record(A.ball(c, r, { name }));
  put(name, c, S(G.sphereOf(c, r, P, { steps: 40 }), { tone: "mid", ...style }) + extra, [shape], { bias });
  return shape;
}
const alongY = (x, z) => G.frameOf([x, 0, z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const alongX = (y, z) => G.frameOf([0, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const down = (x, y, z) => G.frameOf([x, y, z], [0, 0, -1], [1, 0, 0], [0, 1, 0]);
const sideSeam = (plan, z, steps = 3) => Ln(k.sideSeam(plan, z, P, steps), { tone: "faint" });
const screwDots = (points, z, size = 0.45, tone = "mid") => Dots(points.map(([x, y]) => at([x, y, z])), { size, tone });
const back = [];

// ---------------------------------------------------------------- base plate on feet
back.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`);
const FEET = [...k.corners(PLATE, 26), [0, PLATE.y + 26], [0, PLATE.y + PLATE.d - 26]].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
for (const [x, y] of FEET) {
  back.push(S(k.cylinder(x, y, 7.5, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 5.6, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
}
back.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: Ln(k.sideSeam(PLATE, -4, P, 8), { tone: "faint" }) }));
back.push(Ln(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
const plateScrews = k.corners(PLATE, 11);
back.push(Ln(plateScrews.map(([x, y]) => k.ring(x, y, 2.3, 0, P, 16)).join(""), { tone: "lo" }));
back.push(screwDots(plateScrews, 0, 0.55));
record(A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate", ground: true }, 8));

// Ruler strip along the front edge, ticks rooted on its back edge.
const STRIP = { x: -250, y: 52, w: 330, d: 6, r: 1 };
back.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
const ticks = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 5, 5, STRIP.y, 0.6, [1.8, 3.4], P);
back.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
back.push(screwDots([[STRIP.x + 2, STRIP.y + 3], [STRIP.x + STRIP.w - 2, STRIP.y + 3]], 0.6, 0.4));
record(A.slab(STRIP, 0, 0.6, { name: "stand.strip" }, 3));

// Label plate: one engraved word, three rule lines that stand for printed text.
const LABEL = { x: 194, y: 42, w: 44, d: 15, r: 1.2 };
back.push(S(k.slabOf(LABEL, 0, 0.8, P, 4), { tone: "lo" }));
back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P, 4), { tone: "faint" }));
back.push(k.faceTextSvg(k.topMatrix([LABEL.x + 4.5, LABEL.y + 6.2], 0.8, P, "x"), "doc-bridge", { size: 4.2, tone: "mid" }));
back.push(Ln([k.lineOnTop([LABEL.x + 4.5, LABEL.y + 8.8], [LABEL.x + 30, LABEL.y + 8.8], 0.8, P), k.lineOnTop([LABEL.x + 4.5, LABEL.y + 10.6], [LABEL.x + 24, LABEL.y + 10.6], 0.8, P), k.lineOnTop([LABEL.x + 4.5, LABEL.y + 12.4], [LABEL.x + 34, LABEL.y + 12.4], 0.8, P)].join(""), { tone: "lo", free: true }));
back.push(screwDots([[LABEL.x + 39.5, LABEL.y + 3.5], [LABEL.x + 39.5, LABEL.y + 11.5]], 0.8, 0.45));
record(A.slab(LABEL, 0, 0.8, { name: "stand.label" }, 4));

// ---------------------------------------------------------------- conveyor
const LEG_X = [-255, -175, -95, -15, 65, 145, 225];
for (const x of LEG_X) {
  for (const [y0, y1] of [[-18.5, -11.5], [11.5, 18.5]]) {
    const side = y0 < 0 ? "back" : "front";
    box(`belt.leg.pad.${side}${x}`, [x - 4.5, y0, 0], [x + 4.5, y1, 1.2], { tone: "lo" }, { r: 0.8 });
    const ry = y0 < 0 ? [-17, -13] : [13, 17];
    box(`belt.leg.${side}${x}`, [x - 3, ry[0], 1.2], [x + 3, ry[1], RAIL.z0], {}, { r: 0.6, extra: screwDots([[x - 2.6, y0 + 1.4], [x + 2.6, y0 + 1.4], [x - 2.6, y1 - 1.4], [x + 2.6, y1 - 1.4]], 1.2, 0.35, "lo") });
  }
}
const railDots = (y) => Dots(Array.from({ length: 15 }, (_, i) => at([-280 + i * 40, y, 20.5])), { size: 0.42, tone: "mid" });
box("belt.rail.back", [BELT.x0, -17, RAIL.z0], [BELT.x1, -13, RAIL.z1], {}, { r: 0.6, bevel: 0.4 });
box("belt.rail.front", [BELT.x0, 13, RAIL.z0], [BELT.x1, 17, RAIL.z1], {}, { r: 0.6, bevel: 0.4, extra: railDots(17) });
// The belt surface. Its cleats run in a clipped group that live code slides along x.
const CLEAT = 8;
const beltClipPath = path3([[MOUTH, -13, BELT.z1], [282, -13, BELT.z1], [282, 13, BELT.z1], [MOUTH, 13, BELT.z1]], true);
const cleats = Array.from({ length: Math.ceil((282 - MOUTH) / CLEAT) + 2 }, (_, i) => k.segment([MOUTH - CLEAT + i * CLEAT, -13, BELT.z1], [MOUTH - CLEAT + i * CLEAT, 13, BELT.z1], P)).join("");
{
  const { plan, z0, h } = planOf([BELT.x0, -13, BELT.z0], [BELT.x1, 13, BELT.z1], 0.3);
  const shape = record(A.slab(plan, z0, h, { name: "belt.surface" }, 2));
  put("belt.surface", [0, 0, 24], S(k.slabOf(plan, z0, h, P, 2), { tone: "lo" }) + `<clipPath id="al-belt"><path d="${beltClipPath}"/></clipPath><g clip-path="url(#al-belt)"><g data-part="cleats">${Ln(cleats, { tone: "faint" })}</g></g>`, [shape]);
}

// ---------------------------------------------------------------- intake and exit tunnels
function tunnel(name, x0, x1, capX0, capX1) {
  box(`${name}.wall.back`, [x0, -24, 0], [x1, -17, 46], {}, { r: 0.6, bevel: 0.5 });
  box(`${name}.wall.front`, [x0, 17, 0], [x1, 24, 46], {}, { r: 0.6, bevel: 0.5, inner: (plan) => sideSeam(plan, 8) + sideSeam(plan, 38) });
  box(`${name}.cap`, [capX0, -24, 0], [capX1, 24, 50], {}, { r: 0.6, bevel: 0.5 });
  box(`${name}.roof`, [x0, -24, 46], [x1, 24, 50], {}, { r: 0.8, bevel: 0.6 });
}
tunnel("intake", -322, -282, -326, -322);
tunnel("exit", 282, 322, 322, 326);
// Strip curtain at the intake mouth: slats hang from the roof and stop above the cards.
for (const [i, y0] of [-12, -6, 0, 6].entries()) box(`intake.slat${i}`, [-283.2, y0, 32.6], [-282.6, y0 + 5.8, 46], { tone: "lo" }, { r: 0.2, steps: 2 });
// Intake magazine on the roof: a stack of files and documents behind a window slot.
{
  const MAG = [[-316, -12, 50], [-290, 12, 84]];
  const slot = path3([[-311, 12, 57], [-295, 12, 57], [-295, 12, 79], [-311, 12, 79]], true);
  const stack = Array.from({ length: 7 }, (_, i) => path3([[-311, 12, 59.5 + i * 3], [-295, 12, 59.5 + i * 3]])).join("");
  box("intake.magazine", MAG[0], MAG[1], {}, { r: 1, bevel: 0.6, extra: Ln(slot, { tone: "lo" }) + Ln(stack, { tone: "faint" }) });
  box("intake.magazine.cap", [-318, -14, 84], [-288, 14, 87], {}, { r: 1.2, bevel: 0.5, extra: screwDots([[-314, -10], [-292, -10], [-314, 10], [-292, 10]], 87, 0.45) });
}
// Exit roof vents: closed slots.
const vents = Array.from({ length: 4 }, (_, i) => k.planOutline({ x: 288 + i * 7.5, y: -14, w: 3.2, d: 28, r: 1.4 }, 50, P, 3)).join("");
for (const item of R.items) if (item.name === "exit.roof") item.svg += Ln(vents, { tone: "lo" });

// Selector knob on a console at the intake: its pointer sits on the old or the new signature.
const KNOB = [-294, 39];
box("console", [-306, 30, 0], [-282, 48, 14], {}, { r: 2, bevel: 0.6, inner: (plan) => sideSeam(plan, 4) });
post("console.collar", KNOB[0], KNOB[1], 7.6, 14, 15.2, { tone: "lo" }, { steps: 32 });
post("console.knob", KNOB[0], KNOB[1], 6, 15.2, 20.2, {}, { steps: 36, bevel: 0.4, extra: Ln(k.knurl(KNOB[0], KNOB[1], 6, 15.2, 20.2, 36, P), { tone: "lo" }) });
const KNOB_ANGLES = [-0.7, 0.7];
const pointerAt = (angle) => k.lineOnTop([KNOB[0] - Math.sin(angle) * 1.5, KNOB[1] + Math.cos(angle) * 1.5], [KNOB[0] + Math.sin(angle) * 5.2, KNOB[1] - Math.cos(angle) * 5.2], 20.2, P);
const detents = KNOB_ANGLES.map((a) => [KNOB[0] + Math.sin(a) * 9.3, KNOB[1] - Math.cos(a) * 9.3]);
for (const item of R.items) {
  if (item.name === "console.knob") item.svg += `<path data-part="pointer" class="iso-line" data-tone="hi" data-free="start" d="${pointerAt(KNOB_ANGLES[0])}" style="stroke-width:1"/>` + Ln(k.ring(KNOB[0], KNOB[1], 1.2, 20.2, P, 14), { tone: "mid" });
  if (item.name === "console") item.svg += screwDots(detents, 14, 0.7, "hi") + screwDots([[-303.5, 32.5], [-284.5, 32.5], [-303.5, 45.5], [-284.5, 45.5]], 14, 0.4);
}

// ---------------------------------------------------------------- index shelf, warp beam, cloth, spool
{
  box("shelf", [-210, -64, 33], [67, -32, 36], {}, { r: 1.5, bevel: 0.5, inner: (plan) => sideSeam(plan, 34.5) });
  for (const x of [-196, -96, 4]) {
    post(`shelf.post.base${x}`, x, -48, 4.5, 0, 1.2, { tone: "lo" });
    post(`shelf.post${x}`, x, -48, 2.6, 1.2, 33, {});
  }
}
// Warp beam: the unwoven threads come off it.
{
  const F = alongY(-218, 31.4);
  // One coloured end cap per lane: the threads of each entity kind come off their own section of the beam.
  LANES.forEach((lane, i) => turned(`warp.beam.${lane}`, F, CLOTH.y0 + LANE_W * i, CLOTH.y0 + LANE_W * (i + 1), 5, { tone: "mid", className: `al-tint al-lane${i}` }));
  turned("warp.flange.back", F, -62, -60, 7, { tone: "mid" });
  turned("warp.flange.front", F, -36, -34, 7, { tone: "mid" }, { extra: Dots(G.dotsOf(F, -34, 5.4, 6, P, { all: true }), { size: 0.4, tone: "mid" }) });
  turned("warp.axle.back", F, -68, -62, 1.5, { tone: "lo" });
  turned("warp.axle.front", F, -34, -28, 1.5, { tone: "lo" });
  box("warp.bracket.back", [-221, -68, 0], [-215, -64, 29.9], {}, { r: 0.6 });
  box("warp.bracket.front", [-221, -32, 0], [-215, -28, 29.9], {}, { r: 0.6 });
}
// The cloth: warp threads along x in four lanes; woven bands (one per card) are added live.
const warpLines = [];
for (let i = 0; i <= 16; i++) {
  const y = CLOTH.y0 + (i * (CLOTH.y1 - CLOTH.y0)) / 16;
  if (i === 0 || i === 16) continue;
  // Lane borders run the whole sheet; the other warp threads show only where the sheet is not woven yet.
  const lane = i % 4 === 0;
  warpLines.push({ d: path3([[CLOTH.x0, y, CLOTH.top], [lane ? CLOTH.x1 : FELL, y, CLOTH.top]]), lane });
}
const bandClip = path3([[FELL, CLOTH.y0, CLOTH.top], [SPOOL_X, CLOTH.y0, CLOTH.top], [SPOOL_X, CLOTH.y1, CLOTH.top], [FELL, CLOTH.y1, CLOTH.top]], true);
// The woven sheet: one tinted lane per entity kind, with a weave texture laid in the plane of the cloth.
const laneFills = LANES.map((_, i) => {
  const y0 = CLOTH.y0 + LANE_W * i;
  const d = path3([[FELL, y0, CLOTH.top], [SPOOL_X, y0, CLOTH.top], [SPOOL_X, y0 + LANE_W, CLOTH.top], [FELL, y0 + LANE_W, CLOTH.top]], true);
  return `<path class="al-lane-fill al-lane${i}" d="${d}"/>`;
}).join("");
const WEAVE = { x: 3, y: LANE_W / 2 };
const weavePattern = `<pattern id="al-weave" patternUnits="userSpaceOnUse" width="${WEAVE.x * 2}" height="${r2(WEAVE.y * 2)}" patternTransform="${k.topMatrix([0, 0], CLOTH.top, P, "x")}"><rect class="al-weave" x="0" y="0" width="${WEAVE.x}" height="${r2(WEAVE.y)}"/><rect class="al-weave" x="${WEAVE.x}" y="${r2(WEAVE.y)}" width="${WEAVE.x}" height="${r2(WEAVE.y)}"/></pattern>`;
{
  const { plan, z0, h } = planOf([CLOTH.x0, CLOTH.y0, CLOTH.z], [CLOTH.x1, CLOTH.y1, CLOTH.top], 0.2);
  const shape = record(A.slab(plan, z0, h, { name: "cloth" }, 2));
  put(
    "cloth",
    [-70, -48, CLOTH.top],
    S(k.slabOf(plan, z0, h, P, 2), { tone: "lo", crease: "none" }) +
      weavePattern +
      laneFills +
      `<path class="al-weave-cover" d="${bandClip}" fill="url(#al-weave)"/>` +
      Ln(warpLines.filter((l) => !l.lane).map((l) => l.d).join(""), { tone: "faint" }) +
      Ln(warpLines.filter((l) => l.lane).map((l) => l.d).join(""), { tone: "lo" }) +
      `<clipPath id="al-cloth"><path d="${bandClip}"/></clipPath><g clip-path="url(#al-cloth)" data-part="bands"></g>`,
    [shape],
  );
}
// Index spool after the gate: the woven index winds onto it.
{
  const F = alongY(SPOOL_X, CLOTH.top - 9.5);
  // The wound index: each lane winds onto its own tinted band of the core, so the four kinds read at both ends.
  LANES.forEach((lane, i) => turned(`spool.core.${lane}`, F, CLOTH.y0 + LANE_W * i, CLOTH.y0 + LANE_W * (i + 1), 9.5, { tone: "hi", className: `al-tint al-lane${i}` }));
  turned("spool.flange.back", F, -62, -60, 12, { tone: "mid" });
  turned("spool.flange.front", F, -36, -34, 12, { tone: "mid" }, { extra: Dots(G.dotsOf(F, -34, 9.6, 8, P, { all: true }), { size: 0.45, tone: "mid" }) + Ln(G.circleOf(F, -34, 3.2, P), { tone: "lo" }) });
  turned("spool.axle.back", F, -68, -62, 2, { tone: "lo" });
  turned("spool.axle.front", F, -34, -28, 2, { tone: "lo" });
  box("spool.bracket.back", [SPOOL_X - 3, -68, 0], [SPOOL_X + 3, -64, CLOTH.top - 9.5 - 2], {}, { r: 0.6 });
  box("spool.bracket.front", [SPOOL_X - 3, -32, 0], [SPOOL_X + 3, -28, CLOTH.top - 9.5 - 2], {}, { r: 0.6 });
  box("spool.gearbox", [SPOOL_X - 6, -77, 18], [SPOOL_X + 6, -68, 30], {}, { r: 1.2, bevel: 0.5, inner: (plan) => sideSeam(plan, 24), extra: screwDots([[SPOOL_X - 4, -75], [SPOOL_X + 4, -75], [SPOOL_X - 4, -70], [SPOOL_X + 4, -70]], 30, 0.4) });
  box("spool.gearbox.stand", [SPOOL_X - 4, -76, 0], [SPOOL_X + 4, -70, 18], { tone: "mid" }, { r: 0.6 });
}

// ---------------------------------------------------------------- loom
const portal = (name, cx, half, top, headerZ) => {
  for (const [label, y0] of [["back", -75], ["front", 21]]) {
    for (const x of [cx - half, cx + half]) box(`${name}.post.${label}${x}`, [x - 3, y0, 0], [x + 3, y0 + 6, top], {}, { r: 0.6, bevel: 0.4, inner: (plan) => sideSeam(plan, 12) });
    box(`${name}.header.${label}`, [cx - half + 3, y0, headerZ], [cx + half - 3, y0 + 6, top], {}, { r: 0.4, bevel: 0.4, extra: screwDots([[cx - half + 6, y0 + 3], [cx + half - 6, y0 + 3]], top, 0.42) });
  }
  for (const x of [cx - half, cx + half]) box(`${name}.beam${x}`, [x - 3, -75, top], [x + 3, 27, top + 6], {}, { r: 0.6, bevel: 0.5, extra: screwDots([[x, -72], [x, 24]], top + 6, 0.45) });
};
portal("loom", LX, 18, 90, 82);
box("loom.beam.centre", [LX - 9, -69, 82], [LX - 1, 21, 90], {}, { r: 0.6, bevel: 0.4 });
// Swords carry the race board; the shuttle runs on the race from above the belt to the cloth.
box("loom.sword.back", [LX, -69, 40], [LX + 4, -65, 90], {}, { r: 0.4 });
box("loom.sword.front", [LX, 17, 40], [LX + 4, 21, 90], {}, { r: 0.4 });
box("loom.race", [LX, -65, 40], [LX + 4, 17, 43], { tone: "mid" }, { r: 0.4, bevel: 0.3 });
// Reed: a comb that beats each pick into the fell.
const comb = (name, x0, x1, z0, z1, count, style = {}) => {
  const bar = (label, zA, zB) => box(`${name}.${label}`, [x0, -61, zA], [x1, -35, zB], style, { r: 0.3, steps: 2 });
  bar("bottom", z0, z0 + 2);
  bar("top", z1 - 2, z1);
  box(`${name}.stave.back`, [x0, -61, z0 + 2], [x1, -59.4, z1 - 2], style, { r: 0.2, steps: 2 });
  box(`${name}.stave.front`, [x0, -36.6, z0 + 2], [x1, -35, z1 - 2], style, { r: 0.2, steps: 2 });
  const xm = (x0 + x1) / 2;
  const wires = Array.from({ length: count }, (_, i) => -59.4 + ((i + 1) * 22.8) / (count + 1)).map((y) => path3([[xm, y, z0 + 2], [xm, y, z1 - 2]])).join("");
  return wires;
};
{
  const dents = comb("loom.reed", LX + 4, LX + 5.5, CLOTH.top, 54, 22, {});
  const dx = LX + 4.75;
  put("loom.reed.dents", [dx, -48, 45], Ln(dents, { tone: "lo" }), [record(A.box([dx - 0.15, -59.4, CLOTH.top + 2], [dx + 0.15, -36.6, 52], { name: "loom.reed.dents" }))]);
}
// Heddle shafts: two frames on lift rods that slide out of the centre beam. Built at rest (up).
const HEDDLES = [LX - 6.75, LX - 2.25];
const heddleSvg = [];
for (const [i, hx] of HEDDLES.entries()) {
  const x0 = hx - 0.75;
  const x1 = hx + 0.75;
  const F = down(hx, -48, 82);
  const rod = G.rodOut(F, 0, 82 - 62, 0.9, P, { stroke: HEDDLE_STROKE });
  const parts = [];
  const shapes = [];
  const slabItem = (min, max, tone = "mid") => {
    const { plan, z0, h } = planOf(min, max, 0.2);
    parts.push(S(k.slabOf(plan, z0, h, P, 2), { tone }));
  };
  const wires = Array.from({ length: 15 }, (_, j) => -59.4 + ((j + 1) * 22.8) / 16).map((y) => path3([[hx, y, 44], [hx, y, 60]])).join("");
  parts.push(Ln(wires, { tone: "lo" }));
  slabItem([x0, -61, 42], [x1, -35, 44]);
  slabItem([x0, -61, 44], [x1, -59.4, 60]);
  slabItem([x0, -36.6, 44], [x1, -35, 60]);
  slabItem([x0, -61, 60], [x1, -35, 62]);
  shapes.push(record(A.box([x0, -61, 42 - HEDDLE_STROKE], [x1, -35, 62], { name: `loom.heddle${i}.frame` })));
  shapes.push(record(A.disc(F, 0, 82 - 62, 0.9, { name: `loom.heddle${i}.rod` })));
  const clip = `<clipPath id="al-heddle${i}"><path data-hold d="${rod.clip}"/></clipPath>`;
  heddleSvg.push(i);
  put(`loom.heddle${i}`, [hx, -48, 52], `${clip}<g data-part="heddle${i}"><g clip-path="url(#al-heddle${i})">${S(rod.paths, { tone: "mid" })}</g>${parts.join("")}</g>`, shapes, { bias: 0 });
}
// Shuttle on the race (swept along y).
const SHUTTLE = { x0: LX + 0.5, x1: LX + 3.5, y0: 2, y1: 14, z0: 43, z1: 46.2 };
const SHUTTLE_TRAVEL = -54;
{
  const plan = { x: SHUTTLE.x0, y: SHUTTLE.y0, w: SHUTTLE.x1 - SHUTTLE.x0, d: SHUTTLE.y1 - SHUTTLE.y0, r: 1.4 };
  const shape = record(A.slab({ ...plan, y: SHUTTLE.y0 + SHUTTLE_TRAVEL, d: SHUTTLE.y1 - SHUTTLE.y0 - SHUTTLE_TRAVEL }, SHUTTLE.z0, SHUTTLE.z1 - SHUTTLE.z0, { name: "loom.shuttle" }, 4));
  const bobbin = k.lineOnTop([LX + 2, SHUTTLE.y0 + 3], [LX + 2, SHUTTLE.y1 - 3], SHUTTLE.z1, P);
  put("loom.shuttle", [LX + 2, -20, 44.6], `<g data-part="shuttle">${S(k.slabOf(plan, SHUTTLE.z0, SHUTTLE.z1 - SHUTTLE.z0, P, 4, 0.3), { tone: "hi", lit: true })}${Ln(bobbin, { tone: "lit" })}</g>`, [shape]);
}

// ---------------------------------------------------------------- sensor gate
portal("gate", GX, 14, 80, 74);
box("gate.housing", [GX - 17, -30, 86], [GX + 17, 6, 100], {}, {
  r: 1.6,
  bevel: 0.6,
  inner: (plan) => sideSeam(plan, 90),
  extra:
    screwDots([[GX - 14, -27], [GX + 14, -27], [GX - 14, 3], [GX + 14, 3]], 100, 0.45) +
    Ln(path3([[GX - 12, 6, 92], [GX + 12, 6, 92], [GX + 12, 6, 97], [GX - 12, 6, 97]], true), { tone: "lo" }) +
    Ln(Array.from({ length: 5 }, (_, i) => path3([[GX - 10 + i * 5, 6, 92], [GX - 10 + i * 5, 6, 97]])).join(""), { tone: "faint" }),
});
const LAMP_COLLAR = post("gate.lamp.collar", GX, -12, 3.4, 100, 102, { tone: "lo" }, { steps: 24 });
const LAMP_C = [GX, -12, 102 + Math.sqrt(25 - 3.4 * 3.4)];
{
  const shape = record(A.ball(LAMP_C, 5, { name: "gate.lamp", seated: true, cut: [LAMP_COLLAR] }));
  const c = at(LAMP_C);
  const rr = 5 * KS;
  put(
    "gate.lamp",
    LAMP_C,
    `<circle class="al-lamp-halo" data-part="lamp-halo" cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(rr * 3.2)}" opacity="0"/>` +
      S(G.sphereOf(LAMP_C, 5, P, { steps: 40 }), { tone: "hi" }) +
      `<circle class="al-lamp" data-part="lamp" cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(rr - 0.3)}" opacity="0"/>` +
      `<circle class="al-lamp-core" data-part="lamp-core" cx="${r2(c[0] - rr * 0.3)}" cy="${r2(c[1] - rr * 0.35)}" r="${r2(rr * 0.32)}" opacity="0"/>`,
    [shape],
  );
}
box("gate.column", [GX - 4, -4, 58], [GX + 4, 4, 86], {}, { r: 0.6, inner: (plan) => sideSeam(plan, 72) });
box("gate.head", [GX - 9, -9, 50], [GX + 9, 9, 58], {}, { r: 1.5, bevel: 0.5, inner: (plan) => sideSeam(plan, 54), extra: screwDots([[GX - 6.5, -6.5], [GX + 6.5, -6.5], [GX - 6.5, 6.5], [GX + 6.5, 6.5]], 58, 0.4) });
// Probe pins: they drop into the document's claim holes.
for (const [i, dx] of HOLE_X.entries()) {
  const F = down(GX + dx, HOLE_Y, PIN.z0);
  const rod = G.rodOut(F, 0, PIN.len, 0.8, P, { stroke: PIN.stroke });
  const shape = record(A.disc(F, 0, PIN.len, 0.8, { name: `gate.pin${i}` }));
  put(`gate.pin${i}`, [GX + dx, HOLE_Y, PIN.z0 - PIN.len / 2], `<clipPath id="al-pin${i}"><path data-hold d="${rod.clip}"/></clipPath><g data-part="pin${i}"><g clip-path="url(#al-pin${i})">${S(rod.paths, { tone: "hi" })}</g></g>`, [shape]);
}
// Index reader: an arm from the gate to a feeler roller resting on the spool.
box("gate.hanger", [GX + 11, -52, 70], [GX + 17, -46, 80], {}, { r: 0.5 });
box("gate.arm", [GX + 11, -52, 66], [SPOOL_X + 6, -46, 70], {}, { r: 1, bevel: 0.4, extra: screwDots([[GX + 14, -49], [SPOOL_X + 3, -49]], 70, 0.4) });
const FEELER_TIP = [SPOOL_X, -49, CLOTH.top + 1.5];
post("gate.feeler", SPOOL_X, -49, 1, FEELER_TIP[2] + Math.sqrt(1.5 * 1.5 - 1), 66, { tone: "hi" }, { steps: 16 });
ball("gate.feeler.tip", FEELER_TIP, 1.5, { tone: "hi" });

// ---------------------------------------------------------------- stamp and slip printer
box("stamp.column", [SX - 8, -46, 3], [SX + 8, -30, 88], {}, { r: 1.5, bevel: 0.6, inner: (plan) => sideSeam(plan, 10) + sideSeam(plan, 64) });
box("stamp.column.foot", [SX - 11, -49, 0], [SX + 11, -27, 3], { tone: "lo" }, { r: 1.5, extra: screwDots([[SX - 9, -47], [SX + 9, -47], [SX - 9, -29], [SX + 9, -29]], 3, 0.45) });
box("stamp.arm", [SX - 7, -30, 74], [SX + 7, 8, 88], {}, { r: 1.5, bevel: 0.6, inner: (plan) => sideSeam(plan, 81), extra: screwDots([[SX - 4.5, -27], [SX + 4.5, -27], [SX - 4.5, 5], [SX + 4.5, 5]], 88, 0.45) });
post("stamp.gland", SX, 0, 4.5, 70, 74, { tone: "mid" }, { steps: 28 });
{
  const F = down(SX, 0, STAMP.gland);
  const rod = G.rodOut(F, 0, STAMP.tip, 2.2, P, { stroke: RAM_STROKE });
  const head = planOf([SX - 9, -8, 40], [SX + 9, 8, 46], 1.4);
  const pad = planOf([SX - 7, -6, 38.5], [SX + 7, 6, 40], 0.8);
  const shapes = [
    record(A.disc(F, 0, STAMP.tip, 2.2, { name: "stamp.ram" })),
    record(A.slab(head.plan, head.z0, head.h, { name: "stamp.head" }, 4)),
    record(A.slab(pad.plan, 32.2, 40 - 32.2, { name: "stamp.pad" }, 3)),
  ];
  const svg =
    `<clipPath id="al-ram"><path data-hold d="${rod.clip}"/></clipPath><g data-part="ram"><g clip-path="url(#al-ram)">${S(rod.paths, { tone: "hi" })}</g>` +
    S(k.slabOf(pad.plan, pad.z0, pad.h, P, 3), { tone: "lo" }) +
    S(k.slabOf(head.plan, head.z0, head.h, P, 4, 0.5), { tone: "mid", inner: sideSeam(head.plan, 43, 4) }) +
    screwDots([[SX - 6.5, -5.5], [SX + 6.5, -5.5], [SX - 6.5, 5.5], [SX + 6.5, 5.5]], 46, 0.4) +
    `</g>`;
  put("stamp.ram", [SX, 0, 44], svg, shapes);
}
{
  const slot = path3([[PRINTER.x1, SLOT.y0, SLOT.z0], [PRINTER.x1, SLOT.y1, SLOT.z0], [PRINTER.x1, SLOT.y1, SLOT.z1], [PRINTER.x1, SLOT.y0, SLOT.z1]], true);
  box("stamp.printer", [PRINTER.x0, PRINTER.y0, 0], [PRINTER.x1, PRINTER.y1, PRINTER.z1], {}, {
    r: 1.5,
    bevel: 0.6,
    inner: (plan) => sideSeam(plan, 8),
    extra: `<path class="al-slot" d="${slot}"/>` + Ln(slot, { tone: "lo" }) + screwDots([[SX - 9.5, 24.5], [SX + 9.5, 24.5], [SX - 9.5, 37.5], [SX + 9.5, 37.5]], PRINTER.z1, 0.45),
  });
}
box("stamp.cheek.left", [SX - 10, 27, 30], [SX - 7, 35, 38.5], {}, { r: 0.6 });
box("stamp.cheek.right", [SX + 7, 27, 30], [SX + 10, 35, 38.5], {}, { r: 0.6 });
{
  const F = alongX(31, 34.6);
  turned("stamp.roll", G.frameOf([0, 31, 34.6], [1, 0, 0], [0, 1, 0], [0, 0, 1]), SX - 7, SX + 7, 4, { tone: "hi" }, { inner: Ln([SX - 3.5, SX, SX + 3.5].map((s) => G.arcOf(F, s, 4, P)).join(""), { tone: "faint" }) });
}
// Output tray off the printer's slot face, on a leg at its far end.
box("stamp.tray", [TRAY.x0, TRAY.y0, TRAY.z0], [TRAY.x1, TRAY.y1, TRAY.z1], { tone: "lo" }, { r: 1, bevel: 0.3 });
box("stamp.tray.lip", [TRAY.x1 - 1.6, TRAY.y0, TRAY.z1], [TRAY.x1, TRAY.y1, TRAY.z1 + 1.4], { tone: "lo" }, { r: 0.4, steps: 2 });
box("stamp.tray.leg", [TRAY.x1 - 7, 28, 0], [TRAY.x1 - 2, 34, TRAY.z0], {}, { r: 0.6 });
// The slip: built inside the printer, slid out along +x by live code; clipped at the slot face so only what has left
// the printer shows. A bold amber band across its leading end marks it as an advisory.
{
  const plan = { x: SLIP.x0, y: SLIP.y0, w: SLIP.len, d: SLIP.y1 - SLIP.y0, r: 0.3 };
  const shape = record(A.slab({ ...plan, x: PRINTER.x1, w: SLIP.out }, SLIP.z, 0.3, { name: "stamp.slip" }, 2));
  const zt = SLIP.z + 0.3;
  const band = { x: SLIP.x1 - 9, y: SLIP.y0, w: 5, d: SLIP.y1 - SLIP.y0 };
  const rules = [
    [SLIP.y0 + 2.6, 0.9], [SLIP.y0 + 4.8, 0.6], [SLIP.y0 + 7, 0.78], [SLIP.y0 + 9.2, 0.5], [SLIP.y0 + 11.2, 0.7],
  ].map(([y, w]) => k.lineOnTop([SLIP.x1 - 31, y], [SLIP.x1 - 31 + 19 * w, y], zt, P)).join("");
  const box3 = [];
  for (const x of [PRINTER.x1, PRINTER.x1 + SLIP.out + 6]) for (const y of [SLOT.y0, SLOT.y1]) for (const z of [SLOT.z0, SLOT.z1]) box3.push(at([x, y, z]));
  const clip = k.pathOf(G.hullOf(box3), true);
  const bandPath = path3([[band.x, band.y, zt], [band.x + band.w, band.y, zt], [band.x + band.w, band.y + band.d, zt], [band.x, band.y + band.d, zt]], true);
  put(
    "stamp.slip",
    [PRINTER.x1 + SLIP.out / 2, (SLIP.y0 + SLIP.y1) / 2, SLIP.z],
    `<clipPath id="al-slip"><path d="${clip}"/></clipPath><g clip-path="url(#al-slip)"><g data-part="slip">${S(k.slabOf(plan, SLIP.z, 0.3, P, 2), { tone: "hi", crease: "none" })}${Ln(rules, { tone: "mid", free: true })}<path class="al-band" d="${bandPath}"/></g></g>`,
    [shape],
  );
}

// ---------------------------------------------------------------- drive motor at the exit
{
  const F = alongY(302, 19);
  turned("motor.coupling", F, 24, 28, 4, { tone: "lo" });
  turned("motor.body", F, 28, 47, 9, { tone: "mid" }, { inner: k.fadedSvg(G.ribsOf(F, 30, 45, 9, 28, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
  turned("motor.cap", F, 47, 50, 7.5, { tone: "mid" }, { extra: Dots(G.dotsOf(F, 50, 5.6, 4, P, { all: true }), { size: 0.45 }) + Ln(G.circleOf(F, 50, 2, P), { tone: "lo" }) });
  box("motor.feet", [293, 30, 0], [311, 45, 10], { tone: "mid" }, { r: 1, bevel: 0.4, extra: screwDots([[295, 32], [309, 32], [295, 43], [309, 43]], 10, 0.42) });
  box("motor.terminal", [297, 33, 28], [307, 42, 33], {}, { r: 0.8, bevel: 0.3, extra: screwDots([[299, 35], [305, 35], [299, 40], [305, 40]], 33, 0.4) });
}

// ---------------------------------------------------------------- the card lane (moving cards are drawn here)
const LANE = { x0: MOUTH, x1: 304, y0: -12.5, y1: 12.5, z0: CARD_Z, z1: CARD_Z + 7.2 };
const laneClip = path3([[MOUTH, -40, 0], [600, -40, 0], [600, -40, 140], [MOUTH, -40, 140], [MOUTH, 40, 140], [MOUTH, 40, 0]], false);
{
  const shape = record(A.slab({ x: LANE.x0, y: LANE.y0, w: LANE.x1 - LANE.x0, d: LANE.y1 - LANE.y0, r: 0.5 }, LANE.z0, LANE.z1 - LANE.z0, { name: "cards.lane" }, 2));
  // The clip is the half-space x >= MOUTH, drawn as a large screen polygon.
  const big = [[MOUTH, -60, -20], [MOUTH, 80, -20], [MOUTH, 80, 160], [MOUTH, -60, 160]].map(at);
  const far = [[700, -60, -20], [700, 80, -20], [700, 80, 160], [700, -60, 160]].map(at);
  const hull = k.pathOf(G.hullOf([...big, ...far]), true);
  void laneClip;
  put("cards.lane", [0, 0, CARD_Z + 3], `<clipPath id="al-lane"><path d="${hull}"/></clipPath><g clip-path="url(#al-lane)" data-part="cards"></g>`, [shape], { cover: true });
}

// ---------------------------------------------------------------- card templates (built at x = 0)
function codeCard(params, lit) {
  const body = { x: -12, y: -9.5, w: 24, d: 19, r: 1.8 };
  const H = 5;
  const top = CARD_Z + H;
  const out = [S(k.slabOf(body, CARD_Z, H, P, 4, 0.5), { tone: lit ? "hi" : "mid", lit, inner: sideSeam(body, CARD_Z + 1.6, 4) })];
  out.push(Ln(k.planOutline({ x: -10, y: -7.5, w: 20, d: 9.5, r: 0.8 }, top, P, 3), { tone: "faint" }));
  const lines = [[-8.5, -6, 0.9], [-8.5, -4.2, 0.55], [-6.2, -2.4, 0.7], [-6.2, -0.6, 0.42]].map(([x, y, w]) => k.lineOnTop([x, y], [x + 15 * w, y], top, P)).join("");
  out.push(Ln(lines, { tone: lit ? "hi" : "lo", free: true }));
  params.forEach((_, i) => {
    const plan = { x: TOOTH_X[i] - 1.6, y: 3.6, w: 3.2, d: 3.4, r: 0.5 };
    out.push(S(k.slabOf(plan, top, 2.2, P, 2), { tone: lit ? "hi" : "mid", lit }));
  });
  out.push(Dots([at([-10, 7.6, top]), at([10, 7.6, top])], { size: 0.45, tone: "mid" }));
  return out.join("");
}
function docCard(params) {
  const carrier = { x: -12.5, y: -9.5, w: 25, d: 19, r: 1.2 };
  const paper = { x: -10.5, y: -7.8, w: 21, d: 15.6, r: 0.4 };
  const out = [S(k.slabOf(carrier, CARD_Z, 1.2, P, 3, 0.3), { tone: "lo" })];
  out.push(S(k.slabOf(paper, CARD_Z + 1.2, 0.6, P, 2), { tone: "hi", crease: "none" }));
  out.push(Ln(k.lineOnTop([-8.6, -5.6], [0.5, -5.6], DOC_TOP, P), { tone: "mid", free: true }));
  out.push(Ln([[-3.6, 0.95], [-1.9, 0.7], [-0.2, 0.85], [1.5, 0.5]].map(([y, w]) => k.lineOnTop([-8.6, y], [-8.6 + 17 * w, y], DOC_TOP, P)).join(""), { tone: "lo", free: true }));
  params.forEach((_, i) => {
    out.push(`<path class="al-hole" d="${k.ring(HOLE_X[i], HOLE_Y, 1.3, DOC_TOP, P, 18)}"/>`);
    out.push(Ln(k.ring(HOLE_X[i], HOLE_Y, 1.3, DOC_TOP, P, 18), { tone: "mid" }));
  });
  out.push(`<g data-flag hidden>${S(k.slabOf({ x: 10.6, y: -9.5, w: 1.9, d: 4.4, r: 0.3 }, CARD_Z + 1.2, 3.6, P, 2), { tone: "hi", className: "al-flag" })}</g>`);
  out.push(`<path data-stamp hidden class="al-mark" d="${k.planOutline({ x: 3, y: 1.6, w: 6, d: 4.6, r: 0.8 }, DOC_TOP, P, 3)}"/>`);
  return out.join("");
}
function bandSvg(card, lit) {
  const z = CLOTH.top;
  const wefts = [-4, 0, 4].map((dx) => k.segment([dx, CLOTH.y0, z], [dx, CLOTH.y1, z], P)).join("");
  const knots = [];
  const knot = (lane, dx) => knots.push(at([dx, laneY(lane), z]));
  if (card.kind === "code") {
    knot(1, 0);
    card.params.forEach((_, i) => knot(2, card.params.length === 1 ? 0 : i === 0 ? -2 : 2));
    knot(3, -4);
  } else {
    knot(0, 0);
    knot(3, 4);
  }
  return Ln(wefts, { tone: lit ? "lit" : "mid" }) + Dots(knots, { size: 0.85, tone: "hi" });
}
const TEMPLATES = {};
for (const card of MODEL.cards) {
  if (card.kind === "code") {
    TEMPLATES[card.id] = { card: codeCard(card.params, false), band: bandSvg(card, false) };
    if (card.changed) TEMPLATES[`${card.id}:changed`] = { card: codeCard(card.changed, true), band: bandSvg({ ...card, params: card.changed }, true) };
  } else {
    TEMPLATES[card.id] = { card: docCard(card.params), band: bandSvg(card, false) };
  }
}

// ---------------------------------------------------------------- settle the painter's order and write the page
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
// The stations' key parts take the accent material (the light theme gives it a slate tint; see figure.css).
const ACCENT = /^(gate\.(housing|head|column|lamp\.collar|post|header|beam|hanger|arm)|stamp\.(ram|gland|arm)|spool\.(flange|gearbox|axle))/;
const groups = R.items.map((item) => `<g class="it${ACCENT.test(item.name) ? " al-accent" : ""}" data-name="${item.name}">${item.svg}</g>`);

// Crop the view box to the drawing, so the stage holds no dead band. Every static path is a polyline (M/L/Z only);
// clip paths and the soft halo under the plate are left out, the halo gets a fixed margin below.
const polylines = [];
for (const chunk of [...back, ...groups]) {
  const drawn = chunk.replace(/<clipPath[^]*?<\/clipPath>/g, "").replace(/<path class="iso-halo"[^>]*>/g, "");
  for (const [, d] of drawn.matchAll(/ d="([^"]*)"/g)) {
    for (const sub of d.split("M").filter(Boolean)) {
      const numbers = (sub.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      const points = [];
      for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]]);
      if (points.length) polylines.push(points);
    }
  }
}
const inkPoints = polylines.flat();
const ink = {
  x0: Math.min(...inkPoints.map((p) => p[0])),
  x1: Math.max(...inkPoints.map((p) => p[0])),
  y0: Math.min(...inkPoints.map((p) => p[1])),
  y1: Math.max(...inkPoints.map((p) => p[1])),
};
const CROP = { pad: 4, halo: 9 };
const VIEW = { x: Math.floor(ink.x0 - CROP.pad), y: Math.floor(ink.y0 - CROP.pad), w: 0, h: 0 };
VIEW.w = Math.ceil(ink.x1 + CROP.pad) - VIEW.x;
VIEW.h = Math.ceil(ink.y1 + CROP.halo) - VIEW.y;
// Silhouette profile for the phone view: for every PROFILE_STEP view-box units across, the highest and lowest ink
// of any drawn segment in that column, as [top, bottom]. Live code uses it to fit the stage to the visible window.
const PROFILE_STEP = 5;
const columns = Math.ceil(VIEW.w / PROFILE_STEP) + 1;
const tops = Array(columns).fill(Infinity);
const bottoms = Array(columns).fill(-Infinity);
for (const points of polylines) {
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i], points[i + 1]].map(([x, y]) => [x - VIEW.x, y - VIEW.y]);
    const c0 = Math.max(0, Math.ceil(Math.min(a[0], b[0]) / PROFILE_STEP));
    const c1 = Math.min(columns - 1, Math.floor(Math.max(a[0], b[0]) / PROFILE_STEP));
    for (let c = c0; c <= c1; c++) {
      const x = c * PROFILE_STEP;
      const y = a[0] === b[0] ? null : a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
      tops[c] = Math.min(tops[c], y ?? Math.min(a[1], b[1]));
      bottoms[c] = Math.max(bottoms[c], y ?? Math.max(a[1], b[1]));
    }
  }
}
const profile = tops.map((top, c) => [r2(Number.isFinite(top) ? top : VIEW.h), r2(Number.isFinite(bottoms[c]) ? bottoms[c] : 0)]);

const LABEL_TEXT =
  "An isometric assembly line on one long conveyor. From left to right: code files and markdown documents come out of an intake tunnel onto the belt; a loom over the belt weaves every card into a woven index sheet that runs along a back shelf onto a spool; a sensor gate drops probe pins into each document's claim holes and reads the woven index with a feeler on the spool, and its lamp turns amber when a document claims a signature the code no longer has; a stamp then marks that document and its printer slides out an advisory slip.";
const svg = k
  .figureSvg({ width: VIEW.w, height: VIEW.h, label: LABEL_TEXT, body: [...back, ...groups] })
  .replace(`viewBox="0 0 ${VIEW.w} ${VIEW.h}"`, `viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}"`);

const DATA = {
  P,
  model: MODEL,
  templates: TEMPLATES,
  x: { mouth: MOUTH, fell: FELL, loom: LX + 2, gate: GX, stamp: SX, spool: SPOOL_X, exit: 304, spawn: -300 },
  knob: { at: KNOB, angles: KNOB_ANGLES, z: 20.2 },
  heddle: HEDDLE_STROKE,
  pin: PIN.stroke,
  ram: RAM_STROKE,
  shuttle: SHUTTLE_TRAVEL,
  slip: SLIP.out,
  cleat: CLEAT,
  view: { w: VIEW.w, h: VIEW.h, step: PROFILE_STEP, profile },
};

const CSS = readFileSync(join(HERE, "figure.css"), "utf8");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const facts = MODEL.published.map((f) => `<li><span class="al-fact-value">${esc(f.value)}</span> <span class="al-fact-label">${esc(f.label)}</span></li>`).join("");
const body = `
<figure class="iso-figure al-figure">
  <div class="iso-plate al-plate" id="card">
    <div class="al-corners" aria-hidden="true">
      <span class="al-corner" data-corner="fig">Fig 1</span>
      <span class="al-corner" data-corner="title">The doc-bridge assembly line</span>
    </div>
    <div class="iso-stage al-stage" tabindex="0" role="group" aria-label="Assembly line figure. Press Space or Enter to change the parse signature; press again to change it back. On a narrow screen, the left and right arrow keys pan the drawing.">
      <div class="al-scroll">${svg}</div>
    </div>
    <span class="al-swipe" aria-hidden="true">Swipe the drawing to follow the line</span>
    <div class="al-controls">
      <button type="button" id="toggle" class="al-toggle" aria-pressed="false"><span class="al-switch" aria-hidden="true"></span><span data-label>Change <code>parse(input)</code> to <code>parse(input, strict)</code></span></button>
      <span class="al-hint">Space or Enter on the figure toggles it too</span>
    </div>
    <div class="al-readout" data-readout aria-live="off">
      <dl>
        <div><dt>Index</dt><dd id="r-index"></dd></div>
        <div><dt>Code</dt><dd id="r-change"></dd></div>
        <div><dt>Gate</dt><dd id="r-gate"></dd></div>
        <div><dt>Findings</dt><dd id="r-findings"></dd></div>
      </dl>
      <pre class="al-slip" id="slip" hidden></pre>
    </div>
    <span class="al-sr" role="status" aria-live="polite" data-status></span>
  </div>
  <figcaption class="iso-legend al-legend">
    <span class="iso-keys">
      <span class="iso-key"><svg class="iso-swatch" data-mark="lit" viewBox="0 0 16 10" aria-hidden="true"><path d="M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z"/></svg>The changed code file: one tooth per parameter</span>
      <span class="iso-key al-lane-key">Woven index lanes:${LANES.map((lane, i) => ` <span class="al-lane-chip"><span class="al-lane-swatch al-lane${i}" aria-hidden="true"></span>${lane}${i < LANES.length - 1 ? "," : ""}</span>`).join("")}</span>
      <span class="iso-key"><span class="al-amber-key" aria-hidden="true"></span>Gate lamp and stamp: an advisory finding</span>
    </span>
    <span class="iso-caption">The figure runs its own small model: three code files, three documents and the claims between them. Published results from the repository reports:</span>
    <ul class="al-facts">${facts}</ul>
  </figcaption>
</figure>`;

const THEME_BOOT = `(function(){var t='dark';try{var q=new URLSearchParams(location.search).get('theme');if(q==='light'||q==='dark'){t=q;}else{var h=window.parent&&window.parent!==window?window.parent.document.documentElement:null;if(h&&h.classList.contains('light'))t='light';else if(h&&h.classList.contains('dark'))t='dark';else if(window.matchMedia('(prefers-color-scheme: light)').matches)t='light';}}catch(e){if(window.matchMedia('(prefers-color-scheme: light)').matches)t='light';}document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;})();`;
const page = (forced) =>
  `<!doctype html><html lang="en" class="iso" data-theme="${forced ?? "dark"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The doc-bridge assembly line</title>` +
  `<script>${forced ? `window.__alTheme='${forced}';document.documentElement.style.colorScheme='${forced}';` : THEME_BOOT}</script>` +
  `<style>${k.ISO_CSS}${CSS}</style></head><body class="al-body"><main class="al-page">${body}</main>` +
  `<script type="module">${(kitScript() + LIVE).replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;

const OUT = join(ROOT, "apps", "docs", "public", "figures", "assembly-line.html");
writeFileSync(OUT, page(null));
const previewAt = process.argv.indexOf("--preview");
if (previewAt > 0) {
  const dir = resolve(process.argv[previewAt + 1]);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "assembly-line-dark.html"), page("dark"));
  writeFileSync(join(dir, "assembly-line-light.html"), page("light"));
}
const solids = R.solids.length;
console.log("wrote", OUT.replace(ROOT + "/", ""), `${(page(null).length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${solids} recorded solids`, `scale ${KS.toFixed(3)}`);
A.auditOrExit(R, P, { cover: ["cards.lane", "loom.shuttle", "stamp.slip", "gate.lamp"] });
