// Live code for the bridge-conveyor figure. Inlined after the kit (translateAlong, holdStill, iso).
// The state machine is scripts/figures/bridge-conveyor/model.mjs, inlined by the build ahead of this file.
const DATA = __DATA__;
const P = DATA.P;
const M = DATA.model;
const VERSIONS = M.versions;
const SLIP = slipOf();
const B = DATA.belt;

// ---------------------------------------------------------------- elements
const html = document.documentElement;
const card = document.getElementById("card");
const stage = card.querySelector(".bc-stage");
const svg = stage.querySelector("svg");
const q = (sel) => svg.querySelector(sel);
const drawerEl = q('[data-part="drawer"]');
const boxEl = q('[data-part="box"]');
const dcardEl = q('[data-part="dcard"]');
const dcard = dcardEl.querySelector(".bc-live");
const guideIndex = svg.querySelector('[data-part="drawer"] [data-label]').dataset.label;
const labelsOf = (index) => [...svg.querySelectorAll(`[data-label="${index}"]`)];
const guideLabels = labelsOf(guideIndex);
const glows = [...svg.querySelectorAll(".bc-glow[data-label]")];
const lampEls = ["lamp.globe", "lamp.globe-core", "lamp-halo"].map((name) => q(`[data-part="${name}"]`));
const cleats = q('[data-part="cleats"]');
const scanline = q('[data-part="scanline"]');
const curtain = q('[data-part="curtain"]');
const cards = [...svg.querySelectorAll("[data-card]")];
const cardBodies = cards.map((el) => el.querySelector(".bc-card"));
const boomEl = q('[data-part="boom"]');
const flag = q('[data-part="flag"]');
const feed = q('[data-part="feed"]');
const screenGlow = q('[data-part="screen-glow"]');
const screens = Object.fromEntries([...svg.querySelectorAll("[data-screen]")].map((el) => [el.dataset.screen, el]));
const led = q('[data-part="led"]');
const sign = q('[data-part="sign"]');
const codes = [...svg.querySelectorAll("[data-code]")];
const archCodes = [...svg.querySelectorAll("[data-archcode]")];
const readout = card.querySelector("[data-readout]");
const status = card.querySelector("[data-status]");
const pauseButton = card.querySelector("[data-pause]");
const pauseLabel = card.querySelector("[data-pause-label]");
const hots = Object.fromEntries([...card.querySelectorAll("[data-hot]")].map((el) => [el.dataset.hot, el]));
const still = matchMedia("(prefers-reduced-motion: reduce)");
const narrow = matchMedia("(max-width: 480px)");

// ---------------------------------------------------------------- framing: the wide card, or the phone crop of the span
let frameName = "";
function applyFrame() {
  const name = narrow.matches ? "crop" : "wide";
  if (name === frameName) return;
  frameName = name;
  const f = DATA.frames[name];
  svg.setAttribute("viewBox", `${f.x} ${f.y} ${f.w} ${f.h}`);
  card.dataset.frame = name;
  layoutHots();
}
function layoutHots() {
  const f = DATA.frames[frameName];
  for (const [key, el] of Object.entries(hots)) {
    const h = DATA.hots[key];
    const x0 = Math.max(h.x, f.x);
    const y0 = Math.max(h.y, f.y);
    const x1 = Math.min(h.x + h.w, f.x + f.w);
    const y1 = Math.min(h.y + h.h, f.y + f.h);
    el.dataset.out = x1 - x0 < h.w * 0.6 || y1 - y0 < h.h * 0.6 ? "1" : "";
    el.style.left = `${(((x0 - f.x) / f.w) * 100).toFixed(2)}%`;
    el.style.top = `${(((y0 - f.y) / f.h) * 100).toFixed(2)}%`;
    el.style.width = `${(((x1 - x0) / f.w) * 100).toFixed(2)}%`;
    el.style.height = `${(((y1 - y0) / f.h) * 100).toFixed(2)}%`;
  }
  syncHots();
}
function syncHots() {
  for (const [key, el] of Object.entries(hots)) {
    const off = el.dataset.out === "1" || (key === "held" && v.phase !== "drift") || (key === "page" && v.phase !== "drift");
    el.hidden = off;
  }
}

// ---------------------------------------------------------------- state and motion
let st = initial();
let v = verdict(st);
const motion = { drawer: 0, lift: 0, lamp: 1, bar: 0, flag: 0, flip: 1, glow: 0 };
let u = 18; // belt travel, world units
let speed = B.speed;
let heldCard = -1; // the guide's card while a finding holds the belt
let flagged = false;
let screenMode = "idle";
let slipAt = -1;
let pendingCode = 0;
const N = DATA.cards;
const CYCLE = N * B.pitch;
const flashes = new Map(); // label index -> seconds left
const posOf = (i, at = u) => B.spawn + ((((at - i * B.pitch) % CYCLE) + CYCLE) % CYCLE);

function heldTarget() {
  // The card that will stop in front of the barrier: the nearest one upstream of the stop point.
  let best = -1;
  let bestS = -Infinity;
  for (let i = 0; i < N; i++) {
    const s = posOf(i);
    if (s <= B.stop + 0.01 && s > bestS) {
      best = i;
      bestS = s;
    }
  }
  return { index: best, u: u + (B.stop - bestS) };
}
function targets() {
  const open = v.delivered || v.phase === "drift";
  return {
    drawer: open ? 1 : 0,
    lift: open && motion.drawer > 0.82 ? 1 : 0,
    lamp: v.published ? 1 : 0,
    bar: v.published ? 0 : 1,
    flag: flagged ? 1 : 0,
  };
}
let holdU = 0;
function setState(next, { announce = false } = {}) {
  const before = st;
  st = next;
  v = verdict(st);
  if (st.code !== before.code) {
    pendingCode = st.code;
    motion.flip = still.matches ? 1 : 0;
    if (still.matches) showCode(st.code);
  }
  if (v.phase === "drift") {
    if (heldCard < 0) {
      const t = heldTarget();
      heldCard = t.index;
      holdU = t.u;
      if (still.matches) u = holdU;
    }
  } else {
    flagged = false;
  }
  slipAt = -1;
  screenMode = v.phase === "drift" ? "blocked" : v.delivered ? (still.matches ? "slip" : "waiting") : "idle";
  readout.textContent = screenMode === "waiting" ? "asking · send" : v.readout;
  card.dataset.phase = v.phase;
  hots.guide.setAttribute("aria-label", v.phase === "drift" ? "Fix the sending-notifications guide" : "Ask for the sending-notifications guide");
  for (const key of ["code", "archcode"]) hots[key].setAttribute("aria-label", `Change the signature of send to ${VERSIONS[(st.code + 1) % VERSIONS.length]}`);
  syncHots();
  if (announce) status.textContent = st.code !== before.code && v.published ? `Code changed back to ${VERSIONS[st.code]}. The guide already cites it: no findings; published.` : describe();
  run();
}
function describe() {
  if (v.phase === "drift") return `Code changed to ${VERSIONS[st.code]}. The guide still cites ${VERSIONS[st.doc]}: one ${M.finding} finding. The arch flags the guide's card, the barrier drops and publication is blocked.`;
  if (v.delivered) return `The agent asked about send. The catalog gave it ${SLIP}.`;
  if (v.phase === "fixed") return `The guide now cites ${VERSIONS[st.doc]}. No findings; the barrier lifts and the index is published.`;
  return "The belt files every page into the index, and the index is published.";
}
function showCode(index) {
  codes.forEach((el) => (el.style.display = Number(el.dataset.code) === index ? "" : "none"));
  archCodes.forEach((el) => (el.style.display = Number(el.dataset.archcode) === index ? "" : "none"));
}

const follow = (x, target, dt, tau, calm) => {
  if (calm) return target;
  const next = x + (target - x) * (1 - Math.exp(-dt / tau));
  return Math.abs(target - next) < 0.002 ? target : next;
};
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const shiftOf = (by) => {
  const m = translateAlong(P, by).match(/translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};
const X1 = shiftOf([1, 0, 0]);
const Z1 = shiftOf([0, 0, 1]);
const signBox = sign.getBBox();
const signHinge = signBox.y;

function draw() {
  // Belt and cards.
  const c = ((u % B.cleat) + B.cleat) % B.cleat;
  cleats.setAttribute("transform", `translate(${(X1[0] * c).toFixed(2)} ${(X1[1] * c).toFixed(2)})`);
  // The arch's scan brightens as a card passes under it.
  let pass = 0;
  cards.forEach((el, i) => {
    const s = posOf(i);
    if (!still.matches && s <= B.slot) pass = Math.max(pass, Math.exp(-(((s - B.arch) / 11) ** 2)));
  });
  scanline.style.opacity = (0.5 + 0.5 * pass).toFixed(3);
  scanline.style.strokeWidth = `${(1.3 + 1.2 * pass).toFixed(2)}px`;
  curtain.style.opacity = (0.14 + 0.3 * pass).toFixed(3);
  svg.style.setProperty("--bc-breath", (0.5 + 0.5 * Math.sin(clock * 1.25)).toFixed(3));
  cards.forEach((el, i) => {
    const s = posOf(i);
    if (s > B.slot) {
      el.setAttribute("transform", "translate(-9999 0)");
      return;
    }
    el.setAttribute("transform", `translate(${(X1[0] * s).toFixed(2)} ${(X1[1] * s).toFixed(2)})`);
    cardBodies[i].classList.toggle("bc-stale", i === heldCard && flagged);
  });
  // The page in the hopper sinks before each card leaves the intake, then a new one fades in.
  const p = (((u % B.pitch) + B.pitch) % B.pitch) / B.pitch;
  const sink = p < 0.55 ? 0 : p < 0.95 ? smooth((p - 0.55) / 0.4) : 1;
  const show = p < 0.35 ? smooth(p / 0.35) : p < 0.95 ? 1 : 0;
  const d = DATA.feed.sink * sink;
  const ax = DATA.feed.axis;
  const off = shiftOf([ax[0] * -d, ax[1] * -d, ax[2] * -d]);
  feed.setAttribute("transform", `translate(${off[0].toFixed(2)} ${off[1].toFixed(2)})`);
  feed.style.opacity = (still.matches ? 1 : show).toFixed(3);
  // Drawer and its card.
  const dx = -motion.drawer * DATA.drawer.travel;
  const shift = shiftOf([dx, 0, 0]);
  drawerEl.setAttribute("transform", `translate(${shift[0]} ${shift[1]})`);
  holdStill(drawerEl, shift);
  boxEl.style.visibility = motion.drawer > 0.01 ? "visible" : "hidden";
  const lift = motion.lift * DATA.drawer.lift;
  dcardEl.setAttribute("transform", `translate(${(Z1[0] * lift).toFixed(2)} ${(Z1[1] * lift).toFixed(2)})`);
  const stale = v.phase === "drift";
  dcard.classList.toggle("bc-stale", stale && motion.lift > 0.02);
  dcard.classList.toggle("bc-on", !stale && motion.lift > 0.02);
  for (const el of guideLabels) el.classList.toggle("bc-stale", stale);
  for (const el of glows) {
    const left = flashes.get(el.dataset.label) || 0;
    el.classList.toggle("bc-flash", left > 0);
  }
  // Lamp, barrier, flag.
  lampEls[0].style.opacity = (0.92 * motion.lamp).toFixed(3);
  lampEls[1].style.opacity = (0.95 * motion.lamp).toFixed(3);
  lampEls[2].style.opacity = (0.55 * motion.lamp).toFixed(3);
  drawBoom(motion.bar);
  const rise = (smooth(motion.flag) - 1) * DATA.flag.rise;
  flag.setAttribute("transform", `translate(${(Z1[0] * rise).toFixed(2)} ${(Z1[1] * rise).toFixed(2)})`);
  card.toggleAttribute("data-flag", flagged);
  // The code sheet flips; the arch's plate changes with it.
  const flip = motion.flip;
  const s = flip < 0.5 ? 1 - smooth(flip * 2) : smooth((flip - 0.5) * 2);
  if (flip >= 0.5) showCode(pendingCode);
  sign.setAttribute("transform", flip >= 1 ? "" : `translate(0 ${signHinge.toFixed(2)}) scale(1 ${Math.max(0.04, s).toFixed(3)}) translate(0 ${(-signHinge).toFixed(2)})`);
  // Terminal.
  for (const [name, el] of Object.entries(screens)) el.style.display = name === (screenMode === "waiting" ? "idle" : screenMode) ? "" : "none";
  screenGlow.style.opacity = (screenMode === "slip" ? 0.32 + 0.4 * motion.glow : screenMode === "blocked" ? 0.05 : 0.14).toFixed(3);
  led.style.opacity = v.published ? (0.55 + 0.45 * motion.glow).toFixed(3) : "0.12";
  card.dataset.screen = screenMode;
}


// ---------------------------------------------------------------- the boom: an oriented box turning about x
const BM = DATA.boom;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const pt = (p) => iso(p, P);
const pathD = (pts, closed = true) => "M" + pts.map((p) => p[0].toFixed(2) + " " + p[1].toFixed(2)).join("L") + (closed ? "Z" : "");
function hull2(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
const bandOfScore = (s) => {
  let t = 0;
  while (t < BM.bands.length && s >= BM.bands[t]) t++;
  return t;
};
const boomParts = (() => {
  const make = (cls, extra = "") => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("class", cls);
    for (const [k2, val] of Object.entries(extra)) el.setAttribute(k2, val);
    return el;
  };
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "iso-solid");
  const parts = { fill: make("iso-fill"), shades: [0, 1, 2, 3].map((i) => make("iso-shade", { "data-shade": String(i) })), top: make("iso-top"), stripe: make("bc-stripe"), crease: make("iso-line iso-crease", { "data-tone": "faint" }), edge: make("iso-line iso-edge", { "data-tone": "hi" }) };
  g.append(parts.fill, ...parts.shades, parts.top, parts.stripe, parts.crease, parts.edge);
  boomEl.append(g);
  return parts;
})();
function drawBoom(down) {
  const theta = (Math.PI / 2) * (1 - smooth(down));
  const d = [0, -Math.cos(theta), Math.sin(theta)];
  const n = [0, Math.sin(theta), Math.cos(theta)];
  const e = [1, 0, 0];
  const s0 = -BM.stub;
  const s1 = BM.length;
  const at3 = (s, a, b) => add(add(add(BM.pivot, mul(d, s)), mul(n, a)), mul(e, b));
  const corners = [];
  for (const s of [s0, s1]) for (const a of [-BM.t, BM.t]) for (const b of [-BM.half, BM.half]) corners.push(pt(at3(s, a, b)));
  const hull = hull2(corners);
  // Faces along the arm: (normal, a-sign, b-sign) spans; end caps by s.
  const faces = [
    { nrm: n, quad: (sa, sb) => [at3(sa, BM.t, -BM.half), at3(sb, BM.t, -BM.half), at3(sb, BM.t, BM.half), at3(sa, BM.t, BM.half)] },
    { nrm: mul(n, -1), quad: (sa, sb) => [at3(sa, -BM.t, -BM.half), at3(sb, -BM.t, -BM.half), at3(sb, -BM.t, BM.half), at3(sa, -BM.t, BM.half)] },
    { nrm: e, quad: (sa, sb) => [at3(sa, -BM.t, BM.half), at3(sb, -BM.t, BM.half), at3(sb, BM.t, BM.half), at3(sa, BM.t, BM.half)] },
    { nrm: mul(e, -1), quad: (sa, sb) => [at3(sa, -BM.t, -BM.half), at3(sb, -BM.t, -BM.half), at3(sb, BM.t, -BM.half), at3(sa, BM.t, -BM.half)] },
  ];
  const caps = [
    { nrm: d, pts: [at3(s1, -BM.t, -BM.half), at3(s1, BM.t, -BM.half), at3(s1, BM.t, BM.half), at3(s1, -BM.t, BM.half)] },
    { nrm: mul(d, -1), pts: [at3(s0, -BM.t, -BM.half), at3(s0, BM.t, -BM.half), at3(s0, BM.t, BM.half), at3(s0, -BM.t, BM.half)] },
  ];
  const buckets = [[], [], [], [], []];
  const stripes = [];
  const creases = [];
  const seen = [];
  for (const f of faces) {
    if (dot(f.nrm, BM.view) <= 1e-6) continue;
    seen.push(f);
    const q = f.quad(s0, s1).map(pt);
    buckets[bandOfScore(dot(f.nrm, BM.light))].push(pathD(q));
    // Warning bands, painted across the arm every 6 units from its tip.
    for (let s = s1 - 3; s > s0 + 2; s -= 6) stripes.push(pathD(f.quad(Math.max(s0 + 3.2, s - 3), s).map(pt)));
  }
  for (const c of caps) if (dot(c.nrm, BM.view) > 1e-6) buckets[bandOfScore(dot(c.nrm, BM.light))].push(pathD(c.pts.map(pt)));
  // Creases where two visible long faces meet.
  if (seen.length === 2) {
    const [f, g] = seen;
    const qa = f.quad(s0, s1);
    const qb = g.quad(s0, s1);
    const shared = qa.filter((p) => qb.some((r) => Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2]) < 1e-6));
    if (shared.length === 2) creases.push(pathD(shared.map(pt), false));
  }
  boomParts.fill.setAttribute("d", pathD(hull));
  boomParts.shades.forEach((el, i) => el.setAttribute("d", buckets[i].join("")));
  boomParts.top.setAttribute("d", buckets[4].join(""));
  boomParts.stripe.setAttribute("d", stripes.join(""));
  boomParts.crease.setAttribute("d", creases.join(""));
  boomParts.edge.setAttribute("d", pathD(hull));
}

// ---------------------------------------------------------------- the loop
let frame = 0;
let last = 0;
let visible = false;
let paused = false;
let held = false; // hover or focus
let idleUntil = 0;
let tourClock = 0;
let clock = 0; // seconds the figure has been running, for the labels' slow breathing
const DWELL = { baseline: 6, asked: 4.2, drift: 5.2, fixed: 3.2 };
const touring = () => !still.matches && !paused && !held && performance.now() > idleUntil;
const beltLive = () => !still.matches && !paused;

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (!calm) clock += dt;
  if (touring()) {
    tourClock += dt;
    const settled = v.phase !== "drift" || (heldCard >= 0 && Math.abs(u - holdU) < 0.05);
    if (tourClock > DWELL[v.phase] && slipAt < 0 && screenMode !== "waiting" && settled) {
      tourClock = 0;
      setState(tourStep(st));
    }
  }
  // The belt runs while publication is allowed and the barrier is up; a finding holds it with the guide's
  // card in front of the barrier.
  const before = u;
  if (heldCard >= 0) {
    if (v.phase === "drift") {
      const left = holdU - u;
      const want = calm ? 0 : Math.max(0, Math.min(B.speed, left * 1.4));
      speed = follow(speed, want, dt, 0.25, calm);
      if (calm) u = holdU;
      else u = Math.min(holdU, u + (beltLive() ? speed : 0) * dt);
      if (posOf(heldCard) > B.arch + 2 || calm) flagged = true;
    } else if (motion.bar < 0.2) {
      heldCard = -1;
    }
  } else if (!calm) {
    speed = follow(speed, beltLive() ? B.speed : 0, dt, 0.35, calm);
    u += speed * dt;
  }
  // A card that slides into the slot is filed: its drawer's label brightens for a moment.
  if (u > before) {
    for (let i = 0; i < N; i++) {
      const a = posOf(i, before);
      const b = posOf(i, u);
      if (a < B.slot - 6 && b >= B.slot - 6 && b > a) {
        const lap = Math.floor((u - i * B.pitch) / CYCLE);
        const index = String(i === heldCard || (i * 5 + lap) % 3 === 0 ? guideIndex : (i * 4 + lap * 2) % DATA.labels);
        flashes.set(index, 0.9);
      }
    }
  }
  for (const [key, left] of flashes) {
    if (left - dt <= 0) flashes.delete(key);
    else flashes.set(key, left - dt);
  }
  const want = targets();
  motion.drawer = follow(motion.drawer, want.drawer, dt, 0.24, calm);
  motion.lift = follow(motion.lift, want.drawer ? want.lift : 0, dt, 0.18, calm);
  if (!want.drawer && motion.lift > 0.02) motion.drawer = Math.max(motion.drawer, 0.85);
  motion.lamp = follow(motion.lamp, want.lamp, dt, want.lamp ? 0.3 : 0.18, calm);
  motion.bar = follow(motion.bar, want.bar, dt, 0.28, calm);
  motion.flag = follow(motion.flag, want.flag, dt, 0.22, calm);
  if (motion.flip < 1) motion.flip = calm ? 1 : Math.min(1, motion.flip + dt / 0.42);
  // The slip shows on the terminal once the card is up.
  if (screenMode === "waiting" && motion.lift > 0.92 && slipAt < 0) slipAt = 0;
  if (slipAt >= 0) {
    slipAt += dt;
    if (slipAt >= 0.5) {
      slipAt = -1;
      screenMode = "slip";
      motion.glow = 1;
      readout.textContent = v.readout;
    }
  }
  motion.glow = follow(motion.glow, 0, dt, 0.9, calm);
  draw();
  const moving =
    beltLive() ||
    motion.drawer !== want.drawer ||
    motion.lamp !== want.lamp ||
    motion.bar !== want.bar ||
    motion.flag !== want.flag ||
    motion.flip < 1 ||
    slipAt >= 0 ||
    screenMode === "waiting" ||
    motion.glow > 0.002;
  frame = visible && (moving || touring()) ? requestAnimationFrame(tick) : 0;
  if (!frame && visible && !touring() && !still.matches && !paused) scheduleWake();
}
let wake = 0;
function scheduleWake() {
  clearTimeout(wake);
  const wait = Math.max(50, idleUntil - performance.now() + 20);
  wake = setTimeout(run, held ? 400 : wait);
}
function run() {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}
new IntersectionObserver(
  (entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) run();
  },
  { rootMargin: "120px 0px" },
).observe(stage);

// ---------------------------------------------------------------- input
const QUIET = 6000;
function act(next) {
  idleUntil = performance.now() + QUIET;
  tourClock = 0;
  setState(next, { announce: true });
}
const toggle = () => act(toggleCode(st));
const fix = () => act(fixDoc(st));
hots.code.addEventListener("click", toggle);
hots.archcode.addEventListener("click", toggle);
hots.page.addEventListener("click", fix);
hots.held.addEventListener("click", fix);
hots.guide.addEventListener("click", () => act(v.phase === "drift" ? fixDoc(st) : ask(st)));
hots.terminal.addEventListener("click", () => act(ask(st)));
for (const [name, el] of Object.entries(hots)) {
  const on = () => card.setAttribute("data-hover", name);
  const off = () => card.removeAttribute("data-hover");
  el.addEventListener("pointerenter", on);
  el.addEventListener("pointerleave", off);
  el.addEventListener("focus", on);
  el.addEventListener("blur", off);
}
card.addEventListener("pointerenter", () => {
  held = true;
});
card.addEventListener("pointerleave", () => {
  held = false;
  idleUntil = Math.max(idleUntil, performance.now() + 3600);
  run();
});
card.addEventListener("focusin", () => {
  held = true;
  if (!status.textContent) status.textContent = describe();
});
card.addEventListener("focusout", (event) => {
  if (card.contains(event.relatedTarget)) return;
  held = false;
  idleUntil = Math.max(idleUntil, performance.now() + 3600);
  run();
});
function setPaused(next) {
  paused = next;
  pauseButton.setAttribute("aria-pressed", String(paused));
  pauseLabel.textContent = paused ? "Play" : "Pause";
  card.toggleAttribute("data-paused", paused);
  if (!paused) idleUntil = 0;
  run();
}
pauseButton.addEventListener("click", () => setPaused(!paused));
const syncStill = () => {
  pauseButton.hidden = still.matches;
  run();
};
still.addEventListener("change", syncStill);
narrow.addEventListener("change", applyFrame);

// ---------------------------------------------------------------- theme and host frame
function themeOf() {
  if (window.__bcTheme) return window.__bcTheme;
  const query = new URLSearchParams(location.search).get("theme");
  if (query === "light" || query === "dark") return query;
  try {
    const host = window.parent !== window ? window.parent.document.documentElement : null;
    if (host && host.classList.contains("light")) return "light";
    if (host && host.classList.contains("dark")) return "dark";
  } catch {}
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
function applyTheme() {
  const theme = themeOf();
  html.setAttribute("data-theme", theme);
  html.style.colorScheme = theme;
}
matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyTheme);
try {
  if (window.parent !== window) new MutationObserver(applyTheme).observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
} catch {}
function reportHeight() {
  if (window.parent === window) return;
  const height = Math.ceil(document.querySelector(".bc-figure").getBoundingClientRect().height + 4);
  try {
    window.parent.postMessage({ type: "doc-bridge-bridge-conveyor-height", height }, location.origin);
  } catch {}
}
if ("ResizeObserver" in window) new ResizeObserver(reportHeight).observe(card);

// ---------------------------------------------------------------- start
applyTheme();
applyFrame();
syncStill();
setState(st);
draw();
reportHeight();
// Test hooks: the e2e check drives the figure through its states without waiting for the tour.
window.__bridge = {
  state: () => ({ ...v, code: VERSIONS[st.code], cites: VERSIONS[st.doc], frame: frameName, flagged, held: heldCard >= 0, belt: Math.round(u * 100) / 100 }),
  ask: () => act(ask(st)),
  toggle: () => act(toggleCode(st)),
  fix: () => act(fixDoc(st)),
  reset: () => act(initial()),
  pause: (value = true) => setPaused(value),
  settled: () => motion.drawer === targets().drawer && motion.bar === targets().bar && motion.flag === targets().flag && (v.phase !== "drift" || Math.abs(u - holdU) < 0.05),
};
