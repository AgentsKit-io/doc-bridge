// Live code for the assembly-line figure. Inlined after the kit (translateAlong, holdStill, lineOnTop).
const D = __DATA__;
const P = D.P;
const M = D.model;
const X = D.x;
const byId = Object.fromEntries(M.cards.map((card) => [card.id, card]));
const docs = M.cards.filter((card) => card.kind === "doc");
const code = M.cards.filter((card) => card.kind === "code");
const html = document.documentElement;
const stage = document.querySelector(".al-stage");
const svg = stage.querySelector("svg");
const part = (name) => svg.querySelector(`[data-part="${name}"]`);
const cardsLayer = part("cards");
const bandsLayer = part("bands");
const cleats = part("cleats");
const shuttle = part("shuttle");
const heddles = [part("heddle0"), part("heddle1")];
const pins = [part("pin0"), part("pin1")];
const ram = part("ram");
const slipPart = part("slip");
const pointer = part("pointer");
const lamp = [part("lamp"), part("lamp-halo"), part("lamp-core")];
const toggle = document.getElementById("toggle");
const status = document.querySelector("[data-status]");
const slipText = document.getElementById("slip");
const out = { index: document.getElementById("r-index"), change: document.getElementById("r-change"), gate: document.getElementById("r-gate"), findings: document.getElementById("r-findings") };
const still = matchMedia("(prefers-reduced-motion: reduce)");
const sig = (symbol, params) => `${symbol}(${params.join(", ")})`;
const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const ease = (t) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------- model state
const state = {
  changed: false,
  index: Object.fromEntries(code.map((card) => [card.symbol, card.params])),
  findings: new Map(),
  gate: { text: "idle", doc: null, stale: false },
  rush: false,
  slip: 0,
  slipFor: null,
  lamp: 0,
  knob: 0,
  heddle: [0, 0],
  shed: 0,
  shuttleAt: -10,
  speed: 0,
  belt: 0,
  dwell: null,
};
const codeParams = (card) => (card.changed && state.changed ? card.changed : card.params);
let items = [];
let uid = 0;
let queue = [];
const CYCLE = M.cards.map((card) => card.id);

function makeItem(id, x, params) {
  const card = byId[id];
  const variant = card.kind === "code" && card.changed && !same(params, card.params) ? `${id}:changed` : id;
  const template = D.templates[variant];
  const el = document.createElementNS("http://www.w3.org/2000/svg", "g");
  el.innerHTML = template.card;
  el.setAttribute("data-card", id);
  const band = document.createElementNS("http://www.w3.org/2000/svg", "g");
  band.innerHTML = template.band;
  const item = { uid: uid++, id, card, params, x, el, band, woven: x >= X.loom, gated: x >= X.gate, stamped: false, flagged: false, read: false };
  return item;
}
function place(item) {
  const t = translateAlong(P, [item.x, 0, 0]);
  item.el.setAttribute("transform", t);
  item.band.setAttribute("transform", t);
  const inCloth = item.x + 4.5 >= X.fell && item.x - 4.5 <= X.spool;
  if (item.band.hasAttribute("hidden") === inCloth) item.band.toggleAttribute("hidden", !inCloth);
}
function mount(item) {
  cardsLayer.prepend(item.el);
  bandsLayer.append(item.band);
  place(item);
}
function unmount(item) {
  item.el.remove();
  item.band.remove();
}
function showFlag(item, on) {
  item.flagged = on;
  const flag = item.el.querySelector("[data-flag]");
  if (flag) flag.toggleAttribute("hidden", !on);
}
function showStamp(item) {
  item.stamped = true;
  const mark = item.el.querySelector("[data-stamp]");
  if (mark) mark.removeAttribute("hidden");
}

// ---------------------------------------------------------------- the gate's comparison
function evaluate(item) {
  const card = item.card;
  const woven = state.index[card.claims];
  const stale = !same(woven, card.params);
  if (stale) state.findings.set(card.id, { doc: card, claimed: sig(card.claims, card.params), woven: sig(card.claims, woven) });
  else state.findings.delete(card.id);
  state.gate = { doc: card, stale, text: stale ? `flagged ${card.file}: claims ${sig(card.claims, card.params)}, index has ${sig(card.claims, woven)}` : `read ${card.file}: ${sig(card.claims, card.params)} matches the index` };
  showFlag(item, stale);
  if (!state.findings.size) state.slipFor = null;
  if (card.claims === "parse") {
    const current = codeParams(byId.parse);
    if (same(woven, current)) state.rush = false;
  }
  announce(stale ? `Gate flagged ${card.file}` : `Gate cleared ${card.file}`);
}
function weave(item) {
  item.woven = true;
  if (item.card.kind === "code") state.index[item.card.symbol] = item.params;
  state.shuttleAt = 0;
  state.shed = 1 - state.shed;
}

// ---------------------------------------------------------------- readout
let lastKey = "";
function readout() {
  const counts = { documents: docs.length, modules: code.length, symbols: new Set(code.map((card) => card.symbol)).size, relations: code.length + docs.length };
  const parse = byId.parse;
  const findings = [...state.findings.values()];
  const first = findings[0];
  const data = {
    index: `${counts.documents} documents · ${counts.modules} modules · ${counts.symbols} symbols · ${counts.relations} relations · woven ${sig("parse", state.index.parse)}`,
    change: state.changed ? `${sig("parse", parse.params)} → ${sig("parse", parse.changed)}: a required parameter` : `${parse.file} exports ${sig("parse", parse.params)}`,
    gate: state.gate.text,
    findings: findings.length ? `${findings.length} advisory · CHANGED_REFERENCE · ${findings.map((f) => `${f.doc.file}:${f.doc.line}`).join(", ")}` : "0",
    slip:
      state.slipFor && first
        ? `doc-bridge · advisory, not a gate\nCHANGED_REFERENCE  ${first.doc.file}:${first.doc.line}\nclaims  ${first.claimed}\ncode    ${first.woven}  (${parse.file})\nregion fix: replace the claim with ${first.woven}`
        : "",
  };
  toggle.setAttribute("aria-pressed", state.changed ? "true" : "false");
  const key = JSON.stringify(data);
  if (key === lastKey) return;
  lastKey = key;
  out.index.textContent = data.index;
  out.change.textContent = data.change;
  out.gate.textContent = data.gate;
  out.findings.textContent = data.findings;
  slipText.hidden = !data.slip;
  slipText.textContent = data.slip;
}
let announceTimer = 0;
function announce(text) {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => (status.textContent = text), 400);
}

// ---------------------------------------------------------------- drawing the moving parts
function draw() {
  for (const item of items) place(item);
  cleats.setAttribute("transform", translateAlong(P, [((state.belt % D.cleat) + D.cleat) % D.cleat, 0, 0]));
  const s = state.shuttleAt;
  const travel = s >= 0 && s <= 1 ? 0.5 - 0.5 * Math.cos(2 * Math.PI * s) : 0;
  shuttle.setAttribute("transform", translateAlong(P, [0, D.shuttle * travel, 0]));
  heddles.forEach((el, i) => {
    const dz = -D.heddle * state.heddle[i];
    const t = translateAlong(P, [0, 0, dz]);
    el.setAttribute("transform", t);
    const [dx, dy] = axisVector(P, [0, 0, dz]);
    holdStill(el, [dx, dy]);
  });
  pins.forEach((el, i) => {
    const dz = -state.pins[i];
    el.setAttribute("transform", translateAlong(P, [0, 0, dz]));
    holdStill(el, axisVector(P, [0, 0, dz]));
  });
  const press = -D.ram * state.ram;
  ram.setAttribute("transform", translateAlong(P, [0, 0, press]));
  holdStill(ram, axisVector(P, [0, 0, press]));
  slipPart.setAttribute("transform", translateAlong(P, [0, D.slip * ease(clamp01(state.slip)), 0]));
  const angle = D.knob.angles[0] + (D.knob.angles[1] - D.knob.angles[0]) * state.knob;
  const [kx, ky] = D.knob.at;
  pointer.setAttribute("d", lineOnTop([kx - Math.sin(angle) * 1.5, ky + Math.cos(angle) * 1.5], [kx + Math.sin(angle) * 5.2, ky - Math.cos(angle) * 5.2], D.knob.z, P));
  const level = clamp01(state.lamp);
  lamp[0].setAttribute("opacity", (0.92 * level).toFixed(3));
  lamp[1].setAttribute("opacity", (0.55 * level).toFixed(3));
  lamp[2].setAttribute("opacity", (0.9 * level).toFixed(3));
  readout();
  if (typeof followAction === "function") followAction();
}
state.pins = [0, 0];
state.ram = 0;

// ---------------------------------------------------------------- the line
const ACCEL = 70;
const STATIONS = { gate: 0.95, stamp: 1.3 };
function nextStop() {
  let best = null;
  for (const item of items) {
    if (item.card.kind !== "doc") continue;
    if (!item.read && item.x <= X.gate) {
      const dist = X.gate - item.x;
      if (!best || dist < best.dist) best = { item, dist, station: "gate" };
    }
    if (item.flagged && !item.stamped && item.x <= X.stamp) {
      const dist = X.stamp - item.x;
      if (!best || dist < best.dist) best = { item, dist, station: "stamp" };
    }
  }
  return best;
}
function spawn() {
  const last = items.length ? items[items.length - 1] : null;
  const from = last ? last.x - M.pitch : X.spawn;
  if (from < X.spawn) return;
  const id = queue.shift();
  const card = byId[id];
  const item = makeItem(id, from, card.kind === "code" ? codeParams(card) : card.params);
  item.woven = false;
  item.gated = false;
  items.push(item);
  mount(item);
  const next = (CYCLE.indexOf(id) + 1) % CYCLE.length;
  if (!queue.length) queue.push(...CYCLE.slice(next), ...CYCLE.slice(0, next));
}
function advance(dx) {
  state.belt += dx;
  for (const item of items) {
    const before = item.x;
    item.x += dx;
    if (!item.woven && before < X.loom && item.x >= X.loom) weave(item);
  }
  while (items.length && items[0].x > X.exit) unmount(items.shift());
}
function step(dt) {
  const calm = still.matches;
  const target = (state.rush ? M.rush : 1) * M.speed;
  if (state.dwell) {
    const d = state.dwell;
    d.t += dt;
    const total = d.total;
    if (d.station === "gate") {
      const wanted = state.index[d.item.card.claims].length;
      const k = Math.min(ease(clamp01(d.t / 0.3)), ease(clamp01((total - d.t) / 0.3)));
      state.pins = [0, 1].map((i) => (i < wanted ? (i < d.item.card.params.length ? D.pin : D.pin - 1.2) * k : 0));
      if (!d.done && d.t >= 0.35) {
        d.done = true;
        d.item.read = true;
        evaluate(d.item);
      }
    } else {
      const k = d.t < 0.45 ? ease(d.t / 0.45) : d.t < 0.7 ? 1 : ease(clamp01((total - d.t) / (total - 0.7)));
      state.ram = k;
      if (!d.done && d.t >= 0.45) {
        d.done = true;
        showStamp(d.item);
        if (state.findings.has(d.item.card.id)) state.slipFor = d.item.card.id;
        announce(`Stamp printed an advisory slip for ${d.item.card.file}`);
      }
    }
    if (d.t >= total) {
      state.dwell = null;
      state.pins = [0, 0];
      state.ram = 0;
    }
  } else {
    state.speed += (target - state.speed) * (1 - Math.exp(-dt / 0.45));
    const stop = nextStop();
    if (stop) {
      const brake = Math.sqrt(2 * ACCEL * (state.rush ? 1.8 : 1) * Math.max(0, stop.dist));
      if (brake < state.speed) state.speed = brake;
      if (stop.dist <= Math.max(0.02, state.speed * dt)) {
        advance(stop.dist);
        state.speed = 0;
        state.dwell = { station: stop.station, item: stop.item, t: 0, done: false, total: STATIONS[stop.station] * (stop.station === "gate" && state.rush ? 0.7 : 1) };
        if (stop.station === "gate") stop.item.gated = true;
      } else advance(state.speed * dt);
    } else advance(state.speed * dt);
    spawn();
  }
  if (state.shuttleAt >= 0 && state.shuttleAt <= 1) state.shuttleAt += dt / 0.85;
  for (const i of [0, 1]) state.heddle[i] += ((state.shed === i ? 1 : 0) - state.heddle[i]) * (1 - Math.exp(-dt / 0.12));
  state.knob += ((state.changed ? 1 : 0) - state.knob) * (1 - Math.exp(-dt / 0.2));
  state.lamp += ((state.findings.size ? 1 : 0) - state.lamp) * (1 - Math.exp(-dt / 0.25));
  state.slip += ((state.slipFor ? 1 : 0) - state.slip) * (1 - Math.exp(-dt / 0.35));
  if (calm) settleAll();
}

// Reduced motion: no belt travel; every consequence of a change is applied at once.
function settleAll() {
  state.knob = state.changed ? 1 : 0;
  for (const item of items) if (item.card.kind === "code" && item.card.changed) swap(item, codeParams(item.card));
  for (const card of code) state.index[card.symbol] = codeParams(card);
  for (const item of items) {
    if (item.card.kind !== "doc") continue;
    if (item.x >= X.gate) {
      evaluate(item);
      if (item.x >= X.stamp && item.flagged) showStamp(item);
    }
  }
  const stamped = items.find((item) => item.flagged && item.stamped);
  state.slipFor = stamped ? stamped.card.id : null;
  state.lamp = state.findings.size ? 1 : 0;
  state.slip = state.slipFor ? 1 : 0;
  state.heddle = [state.shed === 0 ? 1 : 0, state.shed === 1 ? 1 : 0];
  state.pins = [0, 0];
  state.ram = 0;
  state.shuttleAt = -10;
  state.rush = false;
  state.gate = state.findings.size ? state.gate : { text: "idle", doc: null, stale: false };
  for (const item of items) if (item.card.kind === "doc" && !state.findings.has(item.card.id)) {
    showFlag(item, false);
    const mark = item.el.querySelector("[data-stamp]");
    if (mark) mark.setAttribute("hidden", "");
    item.stamped = false;
  }
}
function swap(item, params) {
  if (same(item.params, params)) return;
  const fresh = makeItem(item.id, item.x, params);
  item.el.replaceWith(fresh.el);
  item.band.replaceWith(fresh.band);
  item.el = fresh.el;
  item.band = fresh.band;
  item.params = params;
  place(item);
}

// ---------------------------------------------------------------- loop, input, visibility
let frame = 0;
let last = 0;
let visible = false;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  step(dt);
  draw();
  frame = visible && !still.matches && !document.hidden ? requestAnimationFrame(tick) : 0;
}
function run() {
  if (!frame && visible && !still.matches && !document.hidden) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}
function change() {
  state.changed = !state.changed;
  if (still.matches) {
    settleAll();
    if (state.findings.size) {
      const first = [...state.findings.values()][0];
      state.gate = { doc: first.doc, stale: true, text: `flagged ${first.doc.file}: claims ${first.claimed}, index has ${first.woven}` };
    }
    draw();
    announce(state.changed ? "parse gained a required parameter; the gate flagged the document that claims the old signature" : "parse is back to parse(input); the finding is cleared");
    return;
  }
  const rest = CYCLE.filter((id) => id !== "parse" && id !== "parsing");
  queue = ["parse", "parsing", ...rest];
  state.rush = true;
  announce(state.changed ? "parse gained a required parameter; the changed file is on the line" : "parse is back to parse(input); the restored file is on the line");
  run();
}
toggle.addEventListener("click", change);
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    change();
  }
});
stage.addEventListener("focus", () => (status.textContent = state.findings.size ? "One advisory finding is open." : "No findings."));
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);
document.addEventListener("visibilitychange", run);
still.addEventListener("change", () => {
  if (still.matches) settleAll();
  draw();
  run();
});

// ---------------------------------------------------------------- theme and host frame
function themeOf() {
  if (window.__alTheme) return window.__alTheme;
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
const card = document.getElementById("card");
function reportHeight() {
  if (window.parent === window) return;
  const height = Math.ceil(document.querySelector(".al-figure").getBoundingClientRect().height + 4);
  try {
    window.parent.postMessage({ type: "doc-bridge-assembly-height", height }, location.origin);
  } catch {}
}
if ("ResizeObserver" in window) new ResizeObserver(reportHeight).observe(card);

// On a narrow screen the drawing is wider than the card: pan it to keep the stations that matter in view.
const scroller = document.querySelector(".al-scroll");
let pan = 0.55;
function follow(share) {
  pan = Math.max(0, Math.min(1, share));
  const room = svg.getBoundingClientRect().width - scroller.clientWidth;
  svg.style.transform = room > 1 ? `translateX(${-Math.round(room * pan)}px)` : "";
}
let followed = 0.55;
function followAction() {
  const want = state.slipFor ? 0.84 : state.findings.size ? 0.62 : state.rush ? 0.3 : followed;
  if (want !== followed) {
    followed = want;
    follow(want);
  }
}
if ("ResizeObserver" in window) new ResizeObserver(() => follow(pan)).observe(scroller);
let drag = null;
scroller.addEventListener("pointerdown", (event) => {
  const room = svg.getBoundingClientRect().width - scroller.clientWidth;
  if (room <= 1) return;
  drag = { x: event.clientX, pan, room, id: event.pointerId };
});
scroller.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  if (!scroller.classList.contains("al-dragging")) {
    if (Math.abs(dx) < 6) return;
    scroller.classList.add("al-dragging");
    try { scroller.setPointerCapture(event.pointerId); } catch {}
  }
  follow(drag.pan - dx / drag.room);
});
const endDrag = () => {
  drag = null;
  scroller.classList.remove("al-dragging");
};
scroller.addEventListener("pointerup", endDrag);
scroller.addEventListener("pointercancel", endDrag);
stage.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (svg.getBoundingClientRect().width - scroller.clientWidth <= 1) return;
    event.preventDefault();
    follow(pan + (event.key === "ArrowRight" ? 0.2 : -0.2));
  }
});
// ---------------------------------------------------------------- start
applyTheme();
items = M.initial.map(([id, x]) => makeItem(id, x, byId[id].kind === "code" ? byId[id].params : byId[id].params));
for (const item of items) {
  mount(item);
  if (item.card.kind === "doc" && item.x >= X.gate) item.read = true;
}
queue = (() => {
  const lastId = M.initial[M.initial.length - 1][0];
  const next = (CYCLE.indexOf(lastId) + 1) % CYCLE.length;
  return [...CYCLE.slice(next), ...CYCLE.slice(0, next)];
})();
state.heddle = [1, 0];
state.speed = still.matches ? 0 : M.speed;
draw();
follow(followed);
reportHeight();
