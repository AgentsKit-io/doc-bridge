// Builds apps/docs/public/figures/catalog.html: an isometric card catalog that stands for the
// doc-bridge index and its opt-in publication gate, drawn with the "anatomy" figure kit (MIT). The
// kit is not vendored here: point ANATOMY_DIR at a checkout of the skill (default:
// ~/.claude/skills/anatomy). The page it writes is self-contained: no network, no third-party scripts.
//
//   node scripts/figures/catalog/build.mjs                  write the page
//   node scripts/figures/catalog/build.mjs --audit          write it, then run the kit's geometry audit
//   node scripts/figures/catalog/build.mjs --preview <dir>  also write <dir>/catalog-{light,dark}.html
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
const { tubePieces, tubeSvg } = await load("kit/tube.mjs");
const { kitScript } = await load("scripts/inline-kit.mjs");
const { MODEL, verdict, initial } = await import(pathToFileURL(join(HERE, "model.mjs")).href);

const W = 600;
const H = 450;
const AZIMUTH = 56;

// ---------------------------------------------------------------- world plan (units ~ px, z up)
const PLINTH = { x: -104, y: -58, w: 208, d: 116, r: 10 };
const PLINTH_H = 8;
const FOOT_H = 5;
const CAB = { x0: -64, x1: 32, y0: -44, y1: 12 };
const FRONT = CAB.y1;
const KICK = 6;
const TOP = 94;
const LID = { z0: TOP, z1: TOP + 3.6, grow: 2.4 };
const GRID = { x0: -58, z1: 88.5, cell: { w: 26, h: 16.8 }, gap: { x: 3, z: 3.2 } };
const PROUD = 1.6; // drawer fronts stand proud of the carcass face
const TRAVEL = 30; // how far the guide's drawer slides out
const LIFT = 13; // how far its index card rises
const { row: GUIDE_ROW, column: GUIDE_COL } = MODEL.guide.drawer;
const cellOf = (row, column) => {
  const x0 = GRID.x0 + column * (GRID.cell.w + GRID.gap.x);
  const z1 = GRID.z1 - row * (GRID.cell.h + GRID.gap.z);
  return { x0, x1: x0 + GRID.cell.w, z0: z1 - GRID.cell.h, z1, cx: x0 + GRID.cell.w / 2 };
};
const GUIDE = cellOf(GUIDE_ROW, GUIDE_COL);
const LAMP = { x: -50, y: -10, base: 6.5, collar: 4.2, globe: 5.6 };
const TUBE_R = 2.4;
const PORT = { x: CAB.x1, y: -20, z: 76 };
const TERM = { x0: 46, x1: 88, y0: -36, y1: 0, z0: 0, z1: 38 };
const RECEIVER = { x: 67, y: -20 };
const KEYS = { x0: 49, x1: 85, y0: 5, y1: 20 };
const SIGN = { x0: -98, x1: -60, y: 36, z0: 8, z1: 22, t: 1.4 };

const P = k.fitProjection(
  [
    ...k.boxCorners(PLINTH, -PLINTH_H - FOOT_H, 0),
    [CAB.x0 - LID.grow, CAB.y0 - LID.grow, LID.z1],
    [CAB.x1 + LID.grow, CAB.y0 - LID.grow, LID.z1],
    [CAB.x0 - LID.grow, CAB.y1 + LID.grow, LID.z1],
    [LAMP.x, LAMP.y, LID.z1 + 14],
  ],
  W,
  H,
  { pad: 14, azimuth: AZIMUTH },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const r2 = (v) => Math.round(v * 100) / 100;
const planeOf = (y) => k.sideMatrix([0, y], 0, P, "left");
const flat = (x0, z0, x1, z1, r, steps = 4) => k.pathOf(k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, steps).map(([u, z]) => [u, -z]), true);

// ---------------------------------------------------------------- recorder helpers
const R = A.recorder(P);
const record = R.solid;
function put(name, ref, svg, shapes, { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: "line", ...rest });
}
const planOf = ([x0, y0, z0], [x1, y1, z1], r = 0.6) => ({ plan: { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r }, z0, h: z1 - z0 });
function box(name, min, max, style = {}, { r = 0.6, steps = 3, bevel = 0, extra = "", inner = "", bias = 0, ground = false, className } = {}) {
  const { plan, z0, h } = planOf(min, max, r);
  const shape = record(A.slab(plan, z0, h, { name, ...(ground ? { ground } : {}) }, steps));
  const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const innerSvg = typeof inner === "function" ? inner(plan, z0, h) : inner;
  put(name, centre, S(k.slabOf(plan, z0, h, P, steps, bevel), { tone: "mid", ...style, inner: innerSvg }) + extra, [shape], { bias, className });
  return { plan, z0, h, shape };
}
function post(name, cx, cy, r, z0, z1, style = {}, { extra = "", bias = 0, steps = 28, bevel = 0 } = {}) {
  const shape = record(A.cylinder(cx, cy, r, z0, z1 - z0, { name }));
  put(name, [cx, cy, (z0 + z1) / 2], S(k.cylinder(cx, cy, r, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style }) + extra, [shape], { bias });
  return shape;
}
function turned(name, F, s0, s1, r, style = {}, { extra = "", inner = "", bias = 0, owner } = {}) {
  const shape = record(A.disc(F, s0, s1, r, { name, owner }));
  const centre = G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2));
  put(name, centre, S(G.disc(s0, s1, r, F, P), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
const sideSeam = (plan, z, steps = 3) => Ln(k.sideSeam(plan, z, P, steps), { tone: "faint" });
const screwDots = (points, z, size = 0.45, tone = "mid") => Dots(points.map(([x, y]) => at([x, y, z])), { size, tone });
const back = [];

// ---------------------------------------------------------------- plinth on feet
back.push(`<path class="iso-halo" d="${k.haloOf(PLINTH, -PLINTH_H - FOOT_H, PLINTH_H, P)}"/>`);
const FEET = k.corners(PLINTH, 22).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
for (const [x, y] of FEET) {
  back.push(S(k.cylinder(x, y, 7, -PLINTH_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 5.4, -PLINTH_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
}
back.push(S(k.slabOf(PLINTH, -PLINTH_H, PLINTH_H, P, 8, 1.4), { tone: "mid", inner: Ln(k.sideSeam(PLINTH, -3.5, P, 8), { tone: "faint" }) }));
back.push(Ln(k.planOutline(k.insetPlan(PLINTH, 5), 0, P), { tone: "lo" }));
const plinthScrews = k.corners(PLINTH, 10);
back.push(Ln(plinthScrews.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
back.push(screwDots(plinthScrews, 0, 0.5));
record(A.slab(PLINTH, -PLINTH_H, PLINTH_H, { name: "stand.plinth", ground: true }, 8));

// Label plate on the plinth: one engraved word, rule lines that stand for printed text.
const LABEL = { x: 44, y: 36, w: 44, d: 13, r: 1.2 };
back.push(S(k.slabOf(LABEL, 0, 0.8, P, 4), { tone: "lo" }));
back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P, 4), { tone: "faint" }));
back.push(k.faceTextSvg(k.topMatrix([LABEL.x + 4.5, LABEL.y + 6], 0.8, P, "x"), "doc-bridge", { size: 4.2, tone: "mid" }));
back.push(Ln([[8.6, 0.8], [10.6, 0.6]].map(([dy, w]) => k.lineOnTop([LABEL.x + 4.5, LABEL.y + dy], [LABEL.x + 4.5 + 30 * w, LABEL.y + dy], 0.8, P)).join(""), { tone: "lo", free: true }));
back.push(screwDots([[LABEL.x + 39.5, LABEL.y + 3.5], [LABEL.x + 39.5, LABEL.y + 10.5]], 0.8, 0.45));
record(A.slab(LABEL, 0, 0.8, { name: "stand.label" }, 4));

// ---------------------------------------------------------------- the cabinet
box("cab.kick", [CAB.x0 + 3, CAB.y0 + 3, 0], [CAB.x1 - 3, CAB.y1 - 3, KICK], { tone: "lo" }, { r: 1 });
const carcassSeams = (plan) => sideSeam(plan, KICK + 4, 4);
// The side panel of the carcass carries a raised field (an inset outline on the +x face).
const sideField = path3([[CAB.x1, CAB.y0 + 6, KICK + 8], [CAB.x1, CAB.y1 - 6, KICK + 8], [CAB.x1, CAB.y1 - 6, TOP - 6], [CAB.x1, CAB.y0 + 6, TOP - 6]], true);
box("cab.carcass", [CAB.x0, CAB.y0, KICK], [CAB.x1, CAB.y1, TOP], {}, {
  r: 1.4,
  steps: 4,
  bevel: 0.6,
  inner: carcassSeams,
  extra: Ln(sideField, { tone: "faint" }),
});
box("cab.lid", [CAB.x0 - LID.grow, CAB.y0 - LID.grow, LID.z0], [CAB.x1 + LID.grow, CAB.y1 + LID.grow, LID.z1], {}, {
  r: 2,
  steps: 5,
  bevel: 0.7,
  inner: (plan) => sideSeam(plan, LID.z0 + 1.4, 5),
  extra:
    Ln(k.planOutline({ x: CAB.x0 + 3, y: CAB.y0 + 3, w: CAB.x1 - CAB.x0 - 6, d: CAB.y1 - CAB.y0 - 6, r: 1.6 }, LID.z1, P, 4), { tone: "faint" }) +
    (() => {
      const c = at([LAMP.x, LAMP.y, LID.z1 + 9.5]);
      return `<circle class="cc-lamp-halo" data-part="lamp-halo" cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(LAMP.globe * 3 * KS)}"/>`;
    })(),
});

// A brass carrying handle on the side panel.
{
  const y0 = (CAB.y0 + CAB.y1) / 2 - 7;
  const z = 44;
  for (const [i, y] of [y0, y0 + 11].entries()) box(`cab.handle.foot${i}`, [CAB.x1, y, z], [CAB.x1 + 2.2, y + 3, z + 3], { tone: "hi" }, { r: 0.5, className: "cc-brass" });
  box("cab.handle.bar", [CAB.x1 + 2.2, y0, z + 0.4], [CAB.x1 + 3.6, y0 + 14, z + 2.6], { tone: "hi" }, { r: 0.6, bevel: 0.3, className: "cc-brass" });
}
// A small plate on the lid in front of the lamp: rule lines that stand for its printed word.
{
  const plate = { x: LAMP.x - 7, y: LAMP.y + 9, w: 14, d: 5, r: 0.8 };
  const z = LID.z1;
  box("lid.plate", [plate.x, plate.y, z], [plate.x + plate.w, plate.y + plate.d, z + 0.6], { tone: "hi" }, {
    r: 0.8,
    className: "cc-brass",
    extra:
      Ln([k.lineOnTop([plate.x + 2.4, plate.y + 2], [plate.x + 11, plate.y + 2], z + 0.6, P), k.lineOnTop([plate.x + 2.4, plate.y + 3.4], [plate.x + 8, plate.y + 3.4], z + 0.6, P)].join(""), { tone: "lo", free: true }) +
      screwDots([[plate.x + 1, plate.y + plate.d / 2], [plate.x + plate.w - 1, plate.y + plate.d / 2]], z + 0.6, 0.3),
  });
}

// Drawers: a proud front, a brass label holder with a glowing label card, and a cup pull.
const DRAWERS = [];
for (let row = 0; row < MODEL.drawers.rows; row++) {
  for (let column = 0; column < MODEL.drawers.columns; column++) {
    const cell = cellOf(row, column);
    DRAWERS.push({ row, column, cell, guide: row === GUIDE_ROW && column === GUIDE_COL });
  }
}
const HOLDER = { w: 13, h: 4.6, top: 2.4, t: 0.5 };
const PULL = { w: 8, h: 2.6, bottom: 3.2, d: 2.4 };
function drawerFace(cell, index, y = FRONT) {
  const front = y + PROUD;
  const hx0 = cell.cx - HOLDER.w / 2;
  const hz1 = cell.z1 - HOLDER.top;
  const hz0 = hz1 - HOLDER.h;
  const plate = path3([[hx0 + 1, front + HOLDER.t, hz0 + 0.9], [hx0 + HOLDER.w - 1, front + HOLDER.t, hz0 + 0.9], [hx0 + HOLDER.w - 1, front + HOLDER.t, hz1 - 0.9], [hx0 + 1, front + HOLDER.t, hz1 - 0.9]], true);
  return {
    front: k.slabOf({ x: cell.x0, y, w: GRID.cell.w, d: PROUD, r: 0.5 }, cell.z0, GRID.cell.h, P, 3, 0.4),
    // The front's raised field: a closed outline in the face plane.
    field: `<g transform="${planeOf(front)}">${Ln(flat(cell.x0 + 1.6, cell.z0 + 1.4, cell.x1 - 1.6, cell.z1 - 1.4, 0.8, 3), { tone: "faint" })}</g>`,
    holder: k.slabOf({ x: hx0, y: front, w: HOLDER.w, d: HOLDER.t, r: 0.3 }, hz0, HOLDER.h, P, 2),
    plate: `<path class="cc-glow" data-label="${index}" d="${plate}"/><path class="cc-label" data-label="${index}" d="${plate}"/>`,
    rivets:
      Dots([at([hx0 + 0.55, front + HOLDER.t, (hz0 + hz1) / 2]), at([hx0 + HOLDER.w - 0.55, front + HOLDER.t, (hz0 + hz1) / 2])], { size: 0.32, tone: "mid" }) +
      // The end of the drawer's locking rod, under the pull.
      Dots([at([cell.cx, front, cell.z0 + 1.6])], { size: 0.45, tone: "mid" }),
    pull: k.slabOf({ x: cell.cx - PULL.w / 2, y: front, w: PULL.w, d: PULL.d, r: 1.1 }, cell.z0 + PULL.bottom, PULL.h, P, 4, 0.3),
    shapes: [
      [[cell.x0, y, cell.z0], [cell.x1, front, cell.z1]],
      [[hx0, front, hz0], [hx0 + HOLDER.w, front + HOLDER.t, hz1]],
      [[cell.cx - PULL.w / 2, front, cell.z0 + PULL.bottom], [cell.cx + PULL.w / 2, front + PULL.d, cell.z0 + PULL.bottom + PULL.h]],
    ],
  };
}
const faceSvg = (face, lit) =>
  S(face.front, { tone: "mid", lit }) + face.field + S(face.holder, { tone: "hi", className: "cc-brass" }) + face.plate + face.rivets + S(face.pull, { tone: "hi", className: "cc-brass" });
DRAWERS.forEach((drawer, index) => {
  if (drawer.guide) return;
  const face = drawerFace(drawer.cell, index);
  const name = `cab.drawer.${drawer.row}.${drawer.column}`;
  const shapes = face.shapes.map(([min, max], part) => record(A.box(min, max, { name: `${name}.${part}` })));
  put(name, [drawer.cell.cx, FRONT + 1, (drawer.cell.z0 + drawer.cell.z1) / 2], faceSvg(face, false), shapes);
});

// The guide's drawer: built closed, slid out along +y by live code. Its box is clipped to what can be seen:
// the opening in the carcass face and the space in front of it.
const GUIDE_INDEX = DRAWERS.findIndex((drawer) => drawer.guide);
const BOX = { depth: 46, wall: 0.9, floor: 1 };
const CARD = { w: GRID.cell.w - 5, h: GRID.cell.h - 5.4, t: 0.5, tab: 3.4 };
const CARD_YS = [3.5, 6.5, 9.5, 12.5, 15.5, 18.5, 21.5, 24.5].map((d) => FRONT - d);
const LIVE_CARD = CARD_YS[0];
function cardSvg(y, className = "") {
  const x0 = GUIDE.cx - CARD.w / 2;
  const z0 = GUIDE.z0 + BOX.floor;
  const body = k.slabOf({ x: x0, y: y - CARD.t, w: CARD.w, d: CARD.t, r: 0.15 }, z0, CARD.h, P, 2);
  const tabX = x0 + 3 + ((Math.abs(Math.round(y)) * 7) % (CARD.w - 10));
  const tab = k.slabOf({ x: tabX, y: y - CARD.t, w: 6, d: CARD.t, r: 0.15 }, z0 + CARD.h, 1.6, P, 2);
  return `<g class="cc-index${className}">${S(body, { tone: "hi", crease: "none" })}${S(tab, { tone: "hi", crease: "none" })}</g>`;
}
{
  const cell = GUIDE;
  const face = drawerFace(cell, GUIDE_INDEX);
  const z0 = cell.z0;
  const z1 = cell.z1 - 1.2;
  const yb = FRONT - BOX.depth;
  const floor = k.slabOf({ x: cell.x0 + 1, y: yb, w: GRID.cell.w - 2, d: BOX.depth, r: 0.3 }, z0, BOX.floor, P, 2);
  const wallL = k.slabOf({ x: cell.x0 + 1, y: yb, w: BOX.wall, d: BOX.depth, r: 0.2 }, z0, z1 - z0, P, 2);
  const wallR = k.slabOf({ x: cell.x1 - 1 - BOX.wall, y: yb, w: BOX.wall, d: BOX.depth, r: 0.2 }, z0, z1 - z0, P, 2);
  const backWall = k.slabOf({ x: cell.x0 + 1, y: yb, w: GRID.cell.w - 2, d: BOX.wall, r: 0.2 }, z0, z1 - z0, P, 2);
  // The rod that runs through the cards and the follower block that keeps them upright.
  const follower = k.slabOf({ x: cell.cx - 7, y: CARD_YS[CARD_YS.length - 1] - 4, w: 14, d: 3, r: 0.5 }, z0 + BOX.floor, 8, P, 3);
  const cards = CARD_YS.slice(1).reverse().map((y) => cardSvg(y)).join("");
  // The visible region: the opening, plus the box swept out to full travel and the lifted card above it.
  const hull = (min, max) => {
    const pts = [];
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) pts.push(at([x, y, z]));
    return k.pathOf(G.hullOf(pts), true);
  };
  const clip = hull([cell.x0, FRONT, cell.z0 - 0.5], [cell.x1, FRONT + TRAVEL + PROUD, cell.z1]) + hull([GUIDE.cx - CARD.w / 2, FRONT + TRAVEL - 6, cell.z1 - 2], [GUIDE.cx + CARD.w / 2, FRONT + TRAVEL, cell.z1 + LIFT + 2]);
  const hole = path3([[cell.x0, FRONT, cell.z0], [cell.x1, FRONT, cell.z0], [cell.x1, FRONT, cell.z1], [cell.x0, FRONT, cell.z1]], true);
  const svg =
    `<path class="cc-hole" d="${hole}"/>` +
    `<g data-part="drawer">` +
    `<clipPath id="cc-drawer-clip"><path data-hold d="${clip}"/></clipPath>` +
    `<g clip-path="url(#cc-drawer-clip)"><g data-part="box" style="visibility:hidden">` +
    S(floor, { tone: "lo" }) + S(backWall, { tone: "lo" }) + S(wallL, { tone: "lo" }) + S(follower, { tone: "mid" }) + cards +
    `<g data-part="card">${cardSvg(LIVE_CARD, " cc-live")}</g>` +
    S(wallR, { tone: "lo" }) +
    `</g></g>` +
    faceSvg(face, true) +
    `</g>`;
  const shapes = [
    record(A.box([cell.x0, FRONT, cell.z0], [cell.x1, FRONT + PROUD + TRAVEL, cell.z1], { name: "cab.guide.drawer" })),
    record(A.box([cell.cx - PULL.w / 2, FRONT + PROUD + TRAVEL, cell.z0 + PULL.bottom], [cell.cx + PULL.w / 2, FRONT + PROUD + PULL.d + TRAVEL, cell.z0 + PULL.bottom + PULL.h], { name: "cab.guide.pull" })),
  ];
  put("cab.guide", [cell.cx, FRONT + 1, (cell.z0 + cell.z1) / 2], svg, shapes);
}

// ---------------------------------------------------------------- the PUBLISH lamp on the lid
post("lamp.base", LAMP.x, LAMP.y, LAMP.base, LID.z1, LID.z1 + 2, { tone: "lo" }, { steps: 36, bevel: 0.4, extra: screwDots([[LAMP.x - 4.6, LAMP.y], [LAMP.x + 4.6, LAMP.y]], LID.z1 + 2, 0.38) });
const COLLAR = post("lamp.collar", LAMP.x, LAMP.y, LAMP.collar, LID.z1 + 2, LID.z1 + 4.4, { tone: "mid" }, { steps: 32 });
const GLOBE_C = [LAMP.x, LAMP.y, LID.z1 + 4.4 + Math.sqrt(LAMP.globe ** 2 - LAMP.collar ** 2)];
{
  const shape = record(A.ball(GLOBE_C, LAMP.globe, { name: "lamp.globe", seated: true, cut: [COLLAR] }));
  const c = at(GLOBE_C);
  const rr = LAMP.globe * KS;
  put(
    "lamp.globe",
    GLOBE_C,
    S(G.sphereOf(GLOBE_C, LAMP.globe, P, { steps: 40 }), { tone: "hi" }) +
      `<radialGradient id="cc-lamp-grad" cx="0.36" cy="0.32" r="0.75"><stop offset="0" style="stop-color:var(--cc-on-core)"/><stop offset="0.45" style="stop-color:var(--cc-on)"/><stop offset="1" style="stop-color:var(--cc-on-deep)"/></radialGradient>` +
      `<circle class="cc-lamp" data-part="lamp" cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(rr - 0.35)}"/>` +
      `<circle class="cc-lamp-core" data-part="lamp-core" cx="${r2(c[0] - rr * 0.28)}" cy="${r2(c[1] - rr * 0.32)}" r="${r2(rr * 0.34)}"/>`,
    [shape],
  );
}

// ---------------------------------------------------------------- the pneumatic tube, its shutter valve and the terminal
const ALONG_X = G.frameOf([0, PORT.y, PORT.z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
turned("tube.boss", ALONG_X, PORT.x, PORT.x + 2.2, TUBE_R * 2.1, { tone: "mid" }, { extra: "" });
const route = G.fillet(
  [
    [PORT.x + 2.2, PORT.y, PORT.z],
    [RECEIVER.x, RECEIVER.y, PORT.z],
    [RECEIVER.x, RECEIVER.y, TERM.z1 + 2.2],
  ],
  TUBE_R * 3.2,
  14,
  { P, tube: TUBE_R },
);
const TOTAL = G.pathLength(route);
const FL = { t: 1.2, r: TUBE_R * 1.6 };
const VALVE_AT = 13;
const VALVE_HALF = TUBE_R * 2.3;
const tubeGaps = [
  [0, FL.t],
  [VALVE_AT - VALVE_HALF, VALVE_AT + VALVE_HALF],
  [TOTAL - FL.t, TOTAL],
];
{
  const id = "tube";
  R.route(id, route, TUBE_R, { owner: id, gaps: tubeGaps, rims: [FL.r, FL.r], piece: "line" });
  tubePieces(route, TUBE_R, P, { maxLength: 14, spacing: 0.9, gaps: tubeGaps }).forEach((part, index) =>
    put(`${id}:${index}`, part.mid, tubeSvg(part, { tone: "mid" }), [A.tube(part.points, part.radii)], { route: id, chunk: index }),
  );
  for (const [along, sign] of [[0, 1], [TOTAL, -1]]) {
    const tangent = G.tangentAlong(route, along);
    const centre = G.add3(G.pointAlong(route, along), G.mul3(tangent, (sign * FL.t) / 2));
    const F = G.frameAlong(centre, tangent);
    const faceS = G.dot3(F.a, V) > 0 ? FL.t / 2 : -FL.t / 2;
    const bolts = Math.abs(G.dot3(F.a, V)) > 0.12 ? Dots(G.dotsOf(F, faceS, FL.r * 0.74, 6, P, { all: true }), { size: 0.36, tone: "mid" }) : "";
    turned(`tube.flange${sign > 0 ? "0" : "1"}`, F, -FL.t / 2, FL.t / 2, FL.r, { tone: "mid" }, { extra: bolts, owner: id });
  }
  // The shutter valve: a round body on the straight run, a neck and a lever that turns across the pipe to shut it.
  const centre = G.pointAlong(route, VALVE_AT);
  const F = G.frameAlong(centre, [1, 0, 0]);
  const body = TUBE_R * 1.75;
  const bulge = (x) => TUBE_R * 1.4 + (body - TUBE_R * 1.4) * Math.sqrt(Math.max(0, 1 - (x / (TUBE_R * 1.6)) ** 2));
  const bulgeSlope = (x) => {
    if (Math.abs(x) >= TUBE_R * 1.6 - 1e-9) return 0;
    const t = Math.max(-0.995, Math.min(0.995, x / (TUBE_R * 1.6)));
    return (-(body - TUBE_R * 1.4) * t) / (TUBE_R * 1.6 * Math.sqrt(1 - t * t));
  };
  const meridian = [
    [-VALVE_HALF, 0],
    [-VALVE_HALF, TUBE_R * 1.4],
    ...Array.from({ length: 17 }, (_, index) => {
      const x = TUBE_R * 1.6 * Math.sin(((index - 8) / 8) * (Math.PI / 2));
      return [x, bulge(x), index && index < 16 ? 1 : 0];
    }),
    [VALVE_HALF, TUBE_R * 1.4],
    [VALVE_HALF, 0],
  ];
  put(
    "tube.valve",
    centre,
    S(G.lathe(meridian, F, P, { steps: 36, smooth: { slope: bulgeSlope, rows: 3 } }), { tone: "mid" }) +
      Dots([...G.dotsOf(F, -VALVE_HALF, TUBE_R * 1.15, 6, P, { all: true })], { size: 0.34, tone: "mid" }),
    [record(A.body(F, meridian, { name: "tube.valve", owner: id }))],
  );
  const UP = G.frameAlong(centre, [0, 0, 1]);
  const s0 = body - 0.2;
  const s1 = body + 2.2;
  turned("tube.valve.neck", UP, s0, s1, TUBE_R * 0.55, { tone: "mid" }, { owner: id });
  turned("tube.valve.hub", UP, s1, s1 + 1, TUBE_R * 0.85, { tone: "hi" }, { owner: id });
}
const VALVE_C = G.pointAlong(route, VALVE_AT);
const LEVER = { at: [VALVE_C[0], VALVE_C[1]], z: VALVE_C[2] + TUBE_R * 1.75 + 3.2, length: 8.5 };
// The lever is drawn live in its own item, above the hub.
const leverHub = at([LEVER.at[0], LEVER.at[1], LEVER.z]);
const leverTip = at([LEVER.at[0] + LEVER.length, LEVER.at[1], LEVER.z]);
put(
  "tube.valve.lever",
  [VALVE_C[0], VALVE_C[1], LEVER.z + 0.5],
  `<path class="iso-line cc-lever" data-part="lever" data-tone="hi" d="${k.lineOnTop(LEVER.at, [LEVER.at[0] + LEVER.length, LEVER.at[1]], LEVER.z, P)}"/>` +
    `<g class="iso-dots" data-tone="hi"><circle data-part="lever-tip" cx="${r2(leverTip[0])}" cy="${r2(leverTip[1])}" r="1.1"/><circle cx="${r2(leverHub[0])}" cy="${r2(leverHub[1])}" r="0.7"/></g>`,
  [record(A.cylinder(LEVER.at[0], LEVER.at[1], LEVER.length, LEVER.z, 0.6, { name: "tube.valve.lever", owner: "tube" }))],
  { bias: 0.4 },
);

// The agent terminal: a case with a screen on its front, a receiver on top where the tube lands, and a keyboard.
box("term.pad", [TERM.x0 - 2, TERM.y0 - 2, 0], [TERM.x1 + 2, TERM.y1 + 2, 1.4], { tone: "lo" }, { r: 1.5, steps: 4 });
const SCREEN = { x0: TERM.x0 + 5, x1: TERM.x1 - 5, z0: 12, z1: 33, r: 2.4, depth: 1.6 };
let clips = 0;
function recess({ x0, x1, z0, z1, r, depth }, y, backSvg = "", backClass = "cc-well") {
  const id = `cc-recess-${clips++}`;
  const ring = k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, 5);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const { sinA } = k.cameraOf(P);
  const tops = [];
  const sides = [[], [], [], []];
  ring.forEach(([ax, az], index) => {
    const [bx, bz] = ring[(index + 1) % ring.length];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    let [nx, nz] = [(bz - az) / length, -(bx - ax) / length];
    if (nx * (cx - (ax + bx) / 2) + nz * (cz - (az + bz) / 2) < 0) [nx, nz] = [-nx, -nz];
    if (nx <= 0 && nz <= 0) return;
    const quad = k.pathOf([at([ax, y, az]), at([bx, y, bz]), at([bx, y - depth, bz]), at([ax, y - depth, az])], true);
    if (nz >= nx) tops.push(quad);
    else sides[Math.min(3, Math.max(0, Math.floor(((nx * -sinA + 1) / 2) * 4)))].push(quad);
  });
  const shape = flat(x0, z0, x1, z1, r, 5);
  return [
    `<clipPath id="${id}"><path transform="${planeOf(y)}" d="${shape}"/></clipPath>`,
    `<g clip-path="url(#${id})">`,
    `<path class="iso-top" d="${tops.join("")}"/>`,
    ...sides.map((d, shade) => (d.length ? `<path class="iso-shade" data-shade="${shade}" d="${d.join("")}"/>` : "")),
    `<g transform="${planeOf(y - depth)}"><path class="${backClass}" d="${shape}"/>${backSvg}<path class="iso-line" data-tone="faint" d="${shape}"/></g>`,
    `</g>`,
    `<g transform="${planeOf(y)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}
// Screen content, in the face plane's (x, -z) coordinates.
const SCR = { x: SCREEN.x0 + 2.4, top: SCREEN.z1 - 3, size: 2.05, step: 3 };
const screenLines = (lines, className) =>
  lines.map((text, i) => `<text class="cc-text ${className}" x="${SCR.x}" y="${r2(-(SCR.top - SCR.size - i * SCR.step))}" font-size="${SCR.size}">${text}</text>`).join("");
const SLIP_LINES = ["docs/guides/", "sending-notifications", `.md:${MODEL.guide.line}`];
const screenSvg =
  `<path class="cc-screen-glow" data-part="screen-glow" d="${flat(SCREEN.x0 + 1, SCREEN.z0 + 1, SCREEN.x1 - 1, SCREEN.z1 - 1, 3)}"/>` +
  `<g data-screen="idle">${screenLines(["&gt; ask send()", "ready"], "cc-dim")}</g>` +
  `<g data-screen="slip" style="display:none">${screenLines(SLIP_LINES, "")}<path class="cc-slip-rule" d="M${SCR.x} ${r2(-(SCREEN.z0 + 3.2))}H${r2(SCREEN.x1 - 2.6)}"/></g>` +
  `<g data-screen="blocked" style="display:none">${screenLines(["publish", "blocked"], "cc-dim")}</g>`;
box("term.case", [TERM.x0, TERM.y0, 1.4], [TERM.x1, TERM.y1, TERM.z1], {}, {
  r: 2.2,
  steps: 5,
  bevel: 0.6,
  inner: (plan) => sideSeam(plan, 7, 5),
  extra:
    recess(SCREEN, TERM.y1, screenSvg, "cc-glass") +
    Ln(Array.from({ length: 5 }, (_, i) => k.planOutline({ x: TERM.x0 + 8 + i * 3.2, y: TERM.y0 + 5, w: 1.4, d: 14, r: 0.7 }, TERM.z1, P, 3)).join(""), { tone: "faint" }) +
    Dots([at([TERM.x1 - 6, TERM.y1, 8.5])], { size: 0.7, tone: "hi" }) +
    `<circle class="cc-led" data-part="led" cx="${r2(at([TERM.x1 - 6, TERM.y1, 8.5])[0])}" cy="${r2(at([TERM.x1 - 6, TERM.y1, 8.5])[1])}" r="0.75"/>`,
});
// The receiver on top: a boss the tube's end flange lands on.
post("term.receiver", RECEIVER.x, RECEIVER.y, FL.r + 1.2, TERM.z1, TERM.z1 + 2.2, { tone: "mid" }, { steps: 32, bevel: 0.3 });
// Keyboard in front of the terminal.
box("term.keys", [KEYS.x0, KEYS.y0, 0], [KEYS.x1, KEYS.y1, 3], {}, {
  r: 1.6,
  steps: 4,
  bevel: 0.4,
  extra: (() => {
    const rows = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) rows.push(k.planOutline({ x: KEYS.x0 + 2.2 + c * 4, y: KEYS.y0 + 2.2 + r * 3.8, w: 3.2, d: 3, r: 0.6 }, 3, P, 2));
    return Ln(rows.join(""), { tone: "lo" });
  })(),
});

// ---------------------------------------------------------------- the code tab: a flip sign showing the code's signature
box("sign.base", [SIGN.x0 - 2, SIGN.y - 5, 0], [SIGN.x1 + 2, SIGN.y + 5, 2.2], { tone: "lo" }, {
  r: 1.4,
  steps: 4,
  bevel: 0.4,
  extra: screwDots([[SIGN.x0, SIGN.y - 3.2], [SIGN.x1, SIGN.y - 3.2]], 2.2, 0.42),
});
for (const [i, x] of [SIGN.x0 + 1.9, SIGN.x1 - 1.9].entries()) post(`sign.post${i}`, x, SIGN.y, 1.1, 2.2, SIGN.z1 + 1.5, { tone: "mid" }, { steps: 18 });
{
  const y = SIGN.y;
  const shape = record(A.slab({ x: SIGN.x0 + 3, y: y - SIGN.t / 2, w: SIGN.x1 - SIGN.x0 - 6, d: SIGN.t, r: 0.3 }, SIGN.z0, SIGN.z1 - SIGN.z0, { name: "sign.tab" }, 2));
  const tab = k.slabOf({ x: SIGN.x0 + 3, y: y - SIGN.t / 2, w: SIGN.x1 - SIGN.x0 - 6, d: SIGN.t, r: 0.3 }, SIGN.z0, SIGN.z1 - SIGN.z0, P, 2, 0.3);
  const fy = y + SIGN.t / 2;
  const code = (lines, key) =>
    `<g data-code="${key}"${key ? ' style="display:none"' : ""}>${lines.map((text, i) => `<text class="cc-code" x="${SIGN.x0 + 5}" y="${r2(-(SIGN.z1 - 4.2 - i * 3.6))}" font-size="2.6">${text}</text>`).join("")}</g>`;
  const window = flat(SIGN.x0 + 4, SIGN.z0 + 1.4, SIGN.x1 - 4, SIGN.z1 - 1.4, 0.8);
  const svg =
    `<g data-part="sign">` +
    S(tab, { tone: "hi" }) +
    `<g transform="${planeOf(fy)}"><path class="cc-sign-face" d="${window}"/>${code(["send(to, text)"], 0)}${code(["send({ to, text,", "  channel })"], 1)}<path class="iso-line" data-tone="lo" d="${window}"/></g>` +
    `</g>`;
  put("sign.tab", [(SIGN.x0 + SIGN.x1) / 2, y, (SIGN.z0 + SIGN.z1) / 2], svg, [shape]);
}

// ---------------------------------------------------------------- settle the painter's order and write the page
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const groups = R.items.map((item) => `<g class="it${item.className ? ` ${item.className}` : ""}" data-name="${item.name}">${item.svg}</g>`);

// Crop the view box to the drawing: every solid's fill is in view-box coordinates (face-plane groups are not).
const inkPoints = [];
for (const chunk of [...back, ...groups]) {
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
// A 4:3 view box around the drawing, so the card keeps its shape and the object fills about two thirds of it.
const FILL = 0.9;
let vw = (ink.x1 - ink.x0) / FILL;
let vh = (ink.y1 - ink.y0 + 10) / FILL;
const ASPECT = 1.42;
if (vw / vh > ASPECT) vh = vw / ASPECT;
else vw = vh * ASPECT;
const VIEW = { x: Math.round((ink.x0 + ink.x1) / 2 - vw / 2), y: Math.round((ink.y0 + ink.y1 + 6) / 2 - vh / 2), w: Math.round(vw), h: Math.round(vh) };

// Hit areas for the in-figure buttons, in view-box units.
const boxOf = (points) => {
  const s = points.map(at);
  const xs = s.map((p) => p[0]);
  const ys = s.map((p) => p[1]);
  const pad = 3;
  return { x: Math.min(...xs) - pad - VIEW.x, y: Math.min(...ys) - pad - VIEW.y, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
};
const corners3 = (min, max) => {
  const out = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
};
const HOTS = {
  drawer: boxOf(corners3([GUIDE.x0, FRONT, GUIDE.z0], [GUIDE.x1, FRONT + PROUD + 2, GUIDE.z1])),
  terminal: boxOf(corners3([TERM.x0, TERM.y0, 0], [TERM.x1, TERM.y1, TERM.z1 + 2])),
  code: boxOf(corners3([SIGN.x0 - 2, SIGN.y - 5, 0], [SIGN.x1 + 2, SIGN.y + 5, SIGN.z1 + 1.5])),
};
for (const hot of Object.values(HOTS)) for (const key of ["x", "y", "w", "h"]) hot[key] = r2((hot[key] / (key === "x" || key === "w" ? VIEW.w : VIEW.h)) * 100);

const LABEL_TEXT =
  "An isometric library card catalog on a plinth, standing for the doc-bridge index. Its twelve drawers each carry a glowing label card: indexed documentation that agrees with the code. A PUBLISH lamp on top is lit while publication is allowed. A pneumatic tube runs from the cabinet through a shutter valve to a small agent terminal. A flip sign in front shows the code's signature for send. When the signature changes, the guide's index card turns amber, the lamp goes out and the shutter closes: one CHANGED_REFERENCE finding blocks publication until the guide is fixed.";
const svg = k
  .figureSvg({ width: VIEW.w, height: VIEW.h, label: LABEL_TEXT, body: [...back, ...groups] })
  .replace(`viewBox="0 0 ${VIEW.w} ${VIEW.h}"`, `viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}"`);

// The capsule's screen path along the tube's centreline, and where the valve body hides it.
const capsulePath = G.resample(route, 1.2).map((p) => at(p).map(r2));
const DATA = {
  P,
  model: MODEL,
  start: verdict(initial()),
  drawer: { travel: TRAVEL, lift: LIFT },
  lever: LEVER,
  capsule: { path: capsulePath, step: 1.2, hide: [[0, FL.t + 1.5], [VALVE_AT - VALVE_HALF - 0.5, VALVE_AT + VALVE_HALF + 0.5], [TOTAL - FL.t - 1.5, TOTAL]] },
};

const CSS = readFileSync(join(HERE, "figure.css"), "utf8");
const MODEL_SRC = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const LIVE = MODEL_SRC + readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const hot = (key, label) => `<button type="button" class="cc-hot" data-hot="${key}" aria-label="${label}" style="left:${HOTS[key].x}%;top:${HOTS[key].y}%;width:${HOTS[key].w}%;height:${HOTS[key].h}%"></button>`;
const body = `
<figure class="iso-figure cc-figure">
  <div class="iso-plate cc-plate" id="card">
    <div class="cc-top">
      <span class="cc-corner" data-corner="fig">Fig 1</span>
      <span class="cc-corner" data-corner="title">Card catalog</span>
    </div>
    <div class="iso-stage cc-stage" role="group" aria-label="Card catalog figure. Buttons on the drawing: the guide's drawer asks for it, the terminal asks the agent, the code tab changes the signature of send.">
      ${svg}
      <div class="cc-hots">
        ${hot("drawer", "Ask for the sending-notifications guide")}
        ${hot("terminal", "Ask the agent terminal where send is documented")}
        ${hot("code", "Change the signature of send")}
      </div>
    </div>
    <div class="cc-bottom">
      <div class="cc-left">
        <button type="button" class="cc-pause" data-pause aria-pressed="false"><span class="cc-pause-icon" aria-hidden="true"></span><span data-pause-label>Pause</span></button>
        <span class="cc-corner" data-corner="hint">Click a drawer · flip the tab</span>
      </div>
      <span class="cc-corner" data-corner="readout" data-readout>${DATA.start.readout}</span>
    </div>
    <span class="cc-sr" role="status" aria-live="polite" data-status></span>
  </div>
</figure>`;

const THEME_BOOT = `(function(){var t='dark';try{var q=new URLSearchParams(location.search).get('theme');if(q==='light'||q==='dark'){t=q;}else{var h=window.parent&&window.parent!==window?window.parent.document.documentElement:null;if(h&&h.classList.contains('light'))t='light';else if(h&&h.classList.contains('dark'))t='dark';else if(window.matchMedia('(prefers-color-scheme: light)').matches)t='light';}}catch(e){if(window.matchMedia('(prefers-color-scheme: light)').matches)t='light';}document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;})();`;
const page = (forced) =>
  `<!doctype html><html lang="en" class="iso" data-theme="${forced ?? "dark"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Card catalog: the doc-bridge index and its publication gate</title>` +
  `<script>${forced ? `window.__ccTheme='${forced}';document.documentElement.style.colorScheme='${forced}';` : THEME_BOOT}</script>` +
  `<style>${k.ISO_CSS}${CSS}</style></head><body class="cc-body"><main class="cc-page">${body}</main>` +
  `<script type="module">${(kitScript() + LIVE).replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;

const OUT = join(ROOT, "apps", "docs", "public", "figures", "catalog.html");
writeFileSync(OUT, page(null));
const previewAt = process.argv.indexOf("--preview");
if (previewAt > 0) {
  const dir = resolve(process.argv[previewAt + 1]);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "catalog-dark.html"), page("dark"));
  writeFileSync(join(dir, "catalog-light.html"), page("light"));
}
console.log("wrote", OUT.replace(ROOT + "/", ""), `${(page(null).length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${R.solids.length} recorded solids`, `scale ${KS.toFixed(3)}`, `view ${VIEW.w}x${VIEW.h}`);
A.auditOrExit(R, P, { cover: ["cab.guide"] });
