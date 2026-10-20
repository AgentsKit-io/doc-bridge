// The drawbridge leaf of the bridge-conveyor figure: a rigid set of axis-aligned boxes (given in the leaf's
// down pose) that turn about a world-y axis through (hinge.x, hinge.z). A pure module with no DOM: the build
// draws the down pose with it and inlines it in the page, where live.js redraws the leaf every frame.
//
// Rotation is in the x-z plane. A point s ahead of the axis and h above it goes to
//   x = hinge.x + s cos(t) - h sin(t),   z = hinge.z + s sin(t) + h cos(t)
// so raising the leaf lifts the free end and swings anything above the axis back toward the pier.

const lfRound = (v) => (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
const lfPath = (pts, closed = true) => "M" + pts.map((p) => `${lfRound(p[0])} ${lfRound(p[1])}`).join("L") + (closed ? "Z" : "");

function lfCamera(P) {
  const a = (P.azimuth * Math.PI) / 180;
  const e = (P.elevation * Math.PI) / 180;
  const sinA = Math.sin(a);
  const cosA = Math.cos(a);
  const sinE = Math.sin(e);
  const cosE = Math.cos(e);
  return { sinA, cosA, sinE, cosE, k: P.scale * Math.sqrt(1.6), view: [cosA * cosE, sinA * cosE, sinE] };
}

function lfHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// The six faces of a box by corner index (bit 0 = x, bit 1 = y, bit 2 = z, set = max), with each face's
// normal in the leaf's own axes (x along the leaf, z up from it).
const LF_FACES = [
  { n: [1, 0, 0], ring: [1, 3, 7, 5] },
  { n: [-1, 0, 0], ring: [0, 4, 6, 2] },
  { n: [0, 1, 0], ring: [2, 6, 7, 3] },
  { n: [0, -1, 0], ring: [0, 1, 5, 4] },
  { n: [0, 0, 1], ring: [4, 5, 7, 6] },
  { n: [0, 0, -1], ring: [0, 2, 3, 1] },
];

/** A function that places leaf-pose points (down-pose world coordinates) at angle `theta`, projected or not. */
export function leafPose(spec, theta, P) {
  const cam = lfCamera(P);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const place = (p) => {
    const along = p[0] - spec.hinge.x;
    const up = p[2] - spec.hinge.z;
    return [spec.hinge.x + along * c - up * s, p[1], spec.hinge.z + along * s + up * c];
  };
  const turn = (n) => [n[0] * c - n[2] * s, n[1], n[0] * s + n[2] * c];
  const flat = ([x, y, z]) => [P.origin[0] + (x * cam.sinA - y * cam.cosA) * cam.k, P.origin[1] + ((x * cam.cosA + y * cam.sinA) * cam.sinE - z * cam.cosE) * cam.k];
  const seen = (n) => n[0] * cam.view[0] + n[1] * cam.view[1] + n[2] * cam.view[2] > 1e-6;
  return { cam, c, s, place, turn, flat, seen };
}

/** One box drawn like the kit's solids: fill, four shade bands, top, crease and edge. */
export function leafSolid(box, pose) {
  const { min, max } = box;
  const corners = Array.from({ length: 8 }, (_, i) => pose.place([i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]));
  const flat = corners.map(pose.flat);
  const shades = [[], [], [], []];
  const top = [];
  const visible = [];
  for (const face of LF_FACES) {
    const n = pose.turn(face.n);
    if (!pose.seen(n)) continue;
    visible.push(face);
    const d = lfPath(face.ring.map((i) => flat[i]));
    if (face.n[2] > 0) top.push(d);
    else {
      const lit = (n[0] * -pose.cam.sinA + n[1] * pose.cam.cosA + 1) / 2;
      shades[Math.min(3, Math.max(0, Math.floor(lit * 4)))].push(d);
    }
  }
  const crease = [];
  for (let a = 0; a < visible.length; a++) {
    for (let b = a + 1; b < visible.length; b++) {
      const shared = visible[a].ring.filter((i) => visible[b].ring.includes(i));
      if (shared.length === 2) crease.push(lfPath(shared.map((i) => flat[i]), false));
    }
  }
  const hull = lfPath(lfHull(flat));
  const className = box.className ? `iso-solid ${box.className}` : "iso-solid";
  return (
    `<g class="${className}"><path class="iso-fill" d="${hull}"/>` +
    shades.map((d, i) => (d.length ? `<path class="iso-shade" data-shade="${i}" d="${d.join("")}"/>` : "")).join("") +
    `<path class="iso-top" d="${top.join("")}"/>` +
    (crease.length ? `<path class="iso-line iso-crease" data-tone="faint" d="${crease.join("")}"/>` : "") +
    `<path class="iso-line iso-edge" data-tone="${box.tone ?? "mid"}" d="${hull}"/></g>`
  );
}

// Amber warning bands across the leaf's free end: on its end face and on the last stretch of its top.
function leafHazard(spec, pose) {
  const { end, y, z0, z1, band, reach } = spec.hazard;
  const out = [];
  const quad = (pts) => lfPath(pts.map((p) => pose.flat(pose.place(p))));
  if (pose.seen(pose.turn([1, 0, 0]))) {
    for (let v = -y; v < y - 1; v += band * 2) {
      const v1 = Math.min(y, v + band);
      out.push(quad([[end, v, z0], [end, v1, z0], [end, v1, z1], [end, v, z1]]));
    }
  }
  if (pose.seen(pose.turn([0, 0, 1]))) {
    for (let v = -y; v < y - 1; v += band * 2) {
      const v1 = Math.min(y, v + band);
      out.push(quad([[end - reach, v, z1], [end - reach, v1, z1], [end, v1, z1], [end, v, z1]]));
    }
  }
  return out.length ? `<g data-part="leaf-hazard"><path class="bc-hazard" d="${out.join("")}"/></g>` : `<g data-part="leaf-hazard"></g>`;
}

/** The leaf's markup for one layer ("back" or "front") at angle `theta` (radians). */
export function leafSvg(spec, theta, P, layer, phase = 0) {
  const pose = leafPose(spec, theta, P);
  const parts = [];
  for (const item of spec.parts) {
    if (item.layer !== layer) continue;
    if (item.kind === "box") parts.push(leafSolid(item, pose));
    else if (item.kind === "hazard") parts.push(leafHazard(spec, pose));
    else if (item.kind === "lines" && pose.seen(pose.turn([0, 0, 1]))) {
      const d = item.lines.map(([a, b]) => lfPath([pose.flat(pose.place(a)), pose.flat(pose.place(b))], false)).join("");
      parts.push(`<path class="iso-line" data-tone="${item.tone ?? "faint"}" d="${d}"/>`);
    } else if (item.kind === "cleats" && pose.seen(pose.turn([0, 0, 1]))) {
      // The belt's cleats: lines across the belt on its top, slid along with the belt by `phase`.
      const lines = [];
      for (let x = item.origin; x <= item.x1 + item.step; x += item.step) {
        const at = x + phase;
        if (at <= item.x0 || at >= item.x1) continue;
        lines.push(lfPath([pose.flat(pose.place([at, -item.half, item.top])), pose.flat(pose.place([at, item.half, item.top]))], false));
      }
      parts.push(`<path class="iso-line bc-cleat" data-tone="mid" d="${lines.join("")}"/>`);
    }
  }
  return parts.join("");
}
