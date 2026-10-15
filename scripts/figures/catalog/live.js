// Live code for the card-catalog figure. Inlined after the kit (translateAlong, holdStill, lineOnTop, iso).
// The state machine is scripts/figures/catalog/model.mjs, inlined by the build ahead of this file.
const DATA = __DATA__;
const P = DATA.P;
const M = DATA.model;
const VERSIONS = M.versions;
const SLIP = slipOf();

// The model (initial, ask, toggleCode, fixDoc, reset, verdict, tourStep) is model.mjs, inlined before this file.

// ---------------------------------------------------------------- elements
const html = document.documentElement;
const card = document.getElementById("card");
const stage = card.querySelector(".cc-stage");
const svg = stage.querySelector("svg");
const q = (sel) => svg.querySelector(sel);
const drawerEl = q('[data-part="drawer"]');
const boxEl = q('[data-part="box"]');
const cardEl = q('[data-part="card"]');
const liveCard = cardEl.querySelector(".cc-live");
const guideLabels = [...svg.querySelectorAll(`[data-label="${svg.querySelector('[data-part="drawer"] [data-label]').dataset.label}"]`)];
const lampEls = ["lamp", "lamp-halo", "lamp-core"].map((name) => q(`[data-part="${name}"]`));
const lever = q('[data-part="lever"]');
const leverTip = q('[data-part="lever-tip"]');
const screenGlow = q('[data-part="screen-glow"]');
const screens = Object.fromEntries([...svg.querySelectorAll("[data-screen]")].map((el) => [el.dataset.screen, el]));
const led = q('[data-part="led"]');
const sign = q('[data-part="sign"]');
const codes = [...svg.querySelectorAll("[data-code]")];
const readout = card.querySelector("[data-readout]");
const status = card.querySelector("[data-status]");
const pauseButton = card.querySelector("[data-pause]");
const pauseLabel = card.querySelector("[data-pause-label]");
const hots = Object.fromEntries([...card.querySelectorAll("[data-hot]")].map((el) => [el.dataset.hot, el]));
const still = matchMedia("(prefers-reduced-motion: reduce)");

// The capsule rides the tube's centreline, drawn over it; it fades out inside the flanges and the valve.
const capsuleGlow = document.createElementNS("http://www.w3.org/2000/svg", "path");
capsuleGlow.setAttribute("class", "cc-capsule-glow");
const capsule = document.createElementNS("http://www.w3.org/2000/svg", "path");
capsule.setAttribute("class", "cc-capsule");
const leverItem = lever.closest(".it");
leverItem.parentNode.insertBefore(capsuleGlow, leverItem);
leverItem.parentNode.insertBefore(capsule, leverItem);

// ---------------------------------------------------------------- state and motion
let st = initial();
let v = verdict(st);
const motion = { drawer: 0, lift: 0, lamp: 1, lever: 0, flip: 1, glow: 0 };
let capsuleAt = -1; // seconds since the capsule left, or -1
let screenMode = "idle";
let pendingCode = 0;
const CAPSULE_TIME = 1.6;
const path = DATA.capsule.path;
const totalLength = (path.length - 1) * DATA.capsule.step;

function targets() {
  const open = v.delivered || v.phase === "drift";
  return {
    drawer: open ? 1 : 0,
    lift: open && motion.drawer > 0.82 ? 1 : 0,
    lamp: v.published ? 1 : 0,
    lever: v.published ? 0 : 1,
  };
}
function setState(next, { announce = false } = {}) {
  const before = st;
  st = next;
  v = verdict(st);
  if (st.code !== before.code) {
    pendingCode = st.code;
    motion.flip = still.matches ? 1 : 0;
    if (still.matches) showCode(st.code);
  }
  capsuleAt = -1;
  if (v.phase === "drift") screenMode = "blocked";
  else if (!v.delivered) screenMode = "idle";
  else screenMode = "waiting";
  if (v.delivered && still.matches) screenMode = "slip";
  readout.textContent = screenMode === "waiting" ? "asking · send" : v.readout;
  card.dataset.phase = v.phase;
  hots.drawer.setAttribute("aria-label", v.phase === "drift" ? "Fix the sending-notifications guide" : "Ask for the sending-notifications guide");
  hots.code.setAttribute("aria-label", `Change the signature of send to ${VERSIONS[(st.code + 1) % VERSIONS.length]}`);
  if (announce) status.textContent = st.code !== before.code && v.published ? `Code changed back to ${VERSIONS[st.code]}. The guide already cites it: no findings; published.` : describe();
  run();
}
function describe() {
  if (v.phase === "drift") return `Code changed to ${VERSIONS[st.code]}. The guide still cites ${VERSIONS[st.doc]}: one ${M.finding} finding, publication blocked.`;
  if (v.delivered) return `The agent asked about send. The catalog sent ${SLIP}.`;
  if (v.phase === "fixed") return `The guide now cites ${VERSIONS[st.doc]}. No findings; published.`;
  return "The index is current and published.";
}
function showCode(index) {
  codes.forEach((el) => (el.style.display = Number(el.dataset.code) === index ? "" : "none"));
}

const follow = (x, target, dt, tau, calm) => {
  if (calm) return target;
  const next = x + (target - x) * (1 - Math.exp(-dt / tau));
  return Math.abs(target - next) < 0.002 ? target : next;
};
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

function draw() {
  const dy = motion.drawer * DATA.drawer.travel;
  const shift = translateAlong(P, [0, dy, 0]);
  drawerEl.setAttribute("transform", shift);
  const m = shift.match(/translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/);
  holdStill(drawerEl, m ? [Number(m[1]), Number(m[2])] : [0, 0]);
  boxEl.style.visibility = motion.drawer > 0.01 ? "visible" : "hidden";
  cardEl.setAttribute("transform", translateAlong(P, [0, 0, motion.lift * DATA.drawer.lift]));
  const stale = v.phase === "drift";
  liveCard.classList.toggle("cc-stale", stale && motion.lift > 0.02);
  liveCard.classList.toggle("cc-on", !stale && motion.lift > 0.02);
  for (const el of guideLabels) el.classList.toggle("cc-stale", stale);
  const lamp = motion.lamp;
  lampEls[0].style.opacity = (0.92 * lamp).toFixed(3);
  lampEls[1].style.opacity = (0.55 * lamp).toFixed(3);
  lampEls[2].style.opacity = (0.95 * lamp).toFixed(3);
  // The lever turns from along the pipe (open) to across it (shut).
  const angle = (smooth(motion.lever) * Math.PI) / 2;
  const L = DATA.lever;
  const tip = [L.at[0] + Math.cos(angle) * L.length, L.at[1] + Math.sin(angle) * L.length];
  lever.setAttribute("d", lineOnTop(L.at, tip, L.z, P));
  const t = iso([tip[0], tip[1], L.z], P);
  leverTip.setAttribute("cx", t[0].toFixed(2));
  leverTip.setAttribute("cy", t[1].toFixed(2));
  // The flip sign: squash to the hinge, swap the face, open again.
  const flip = motion.flip;
  const s = flip < 0.5 ? 1 - smooth(flip * 2) : smooth((flip - 0.5) * 2);
  if (flip >= 0.5) showCode(pendingCode);
  sign.setAttribute("transform", flip >= 1 ? "" : `translate(0 ${signHinge.toFixed(2)}) scale(1 ${Math.max(0.04, s).toFixed(3)}) translate(0 ${(-signHinge).toFixed(2)})`);
  // Capsule.
  if (capsuleAt >= 0) {
    const p = smooth(clamp01(capsuleAt / CAPSULE_TIME));
    const head = p * totalLength;
    const tail = Math.max(0, head - 9);
    const pts = [];
    for (let d = tail; d <= head + 1e-6; d += DATA.capsule.step / 2) {
      const i = Math.min(path.length - 1, d / DATA.capsule.step);
      const i0 = Math.floor(i);
      const i1 = Math.min(path.length - 1, i0 + 1);
      const f = i - i0;
      pts.push([path[i0][0] + (path[i1][0] - path[i0][0]) * f, path[i0][1] + (path[i1][1] - path[i0][1]) * f]);
    }
    const d = pts.length > 1 ? "M" + pts.map((p2) => p2[0].toFixed(2) + " " + p2[1].toFixed(2)).join("L") : "";
    capsule.setAttribute("d", d);
    capsuleGlow.setAttribute("d", d);
    const mid = (head + tail) / 2;
    let seen = 1;
    for (const [a, b] of DATA.capsule.hide) seen = Math.min(seen, mid < a - 2 || mid > b + 2 ? 1 : mid < a ? (a - mid) / 2 : mid > b ? (mid - b) / 2 : 0);
    capsule.style.opacity = seen.toFixed(3);
    capsuleGlow.style.opacity = (seen * 0.8).toFixed(3);
  } else {
    capsule.setAttribute("d", "");
    capsuleGlow.setAttribute("d", "");
  }
  for (const [name, el] of Object.entries(screens)) el.style.display = name === (screenMode === "waiting" ? "idle" : screenMode) ? "" : "none";
  screenGlow.style.opacity = (screenMode === "slip" ? 0.32 + 0.4 * motion.glow : screenMode === "blocked" ? 0.05 : 0.14).toFixed(3);
  led.style.opacity = v.published ? (0.55 + 0.45 * motion.glow).toFixed(3) : "0.12";
  card.dataset.screen = screenMode;
}
const signBox = sign.getBBox();
const signHinge = signBox.y;

// ---------------------------------------------------------------- the loop
let frame = 0;
let last = 0;
let visible = false;
let paused = false;
let held = false; // hover or focus
let idleUntil = 0; // after a reader acts, the tour waits this long (ms timestamp)
let tourClock = 0;
const DWELL = { baseline: 1.8, asked: 3.8, drift: 3.6, fixed: 2.4 };
const touring = () => !still.matches && !paused && !held && performance.now() > idleUntil;

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring()) {
    tourClock += dt;
    if (tourClock > DWELL[v.phase] && capsuleAt < 0) {
      tourClock = 0;
      setState(tourStep(st));
    }
  }
  const want = targets();
  motion.drawer = follow(motion.drawer, want.drawer, dt, 0.24, calm);
  motion.lift = follow(motion.lift, want.drawer ? want.lift : 0, dt, 0.18, calm);
  if (!want.drawer && motion.lift > 0.02) motion.drawer = Math.max(motion.drawer, 0.85);
  motion.lamp = follow(motion.lamp, want.lamp, dt, want.lamp ? 0.3 : 0.18, calm);
  motion.lever = follow(motion.lever, want.lever, dt, 0.2, calm);
  if (motion.flip < 1) motion.flip = calm ? 1 : Math.min(1, motion.flip + dt / 0.42);
  // The capsule leaves once the card is up, and the slip shows when it lands.
  if (screenMode === "waiting" && motion.lift > 0.92) {
    if (capsuleAt < 0) capsuleAt = 0;
  }
  if (capsuleAt >= 0) {
    capsuleAt += dt;
    if (capsuleAt >= CAPSULE_TIME) {
      capsuleAt = -1;
      screenMode = "slip";
      motion.glow = 1;
      readout.textContent = v.readout;
    }
  }
  motion.glow = follow(motion.glow, 0, dt, 0.9, calm);
  draw();
  const moving =
    motion.drawer !== want.drawer || motion.lift !== (want.drawer ? want.lift : 0) || motion.lamp !== want.lamp || motion.lever !== want.lever || motion.flip < 1 || capsuleAt >= 0 || screenMode === "waiting" || motion.glow > 0.002;
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
hots.drawer.addEventListener("click", () => act(v.phase === "drift" ? fixDoc(st) : ask(st)));
hots.terminal.addEventListener("click", () => act(ask(st)));
hots.code.addEventListener("click", () => act(toggleCode(st)));
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
  if (!paused) {
    idleUntil = 0;
    run();
  }
}
pauseButton.addEventListener("click", () => setPaused(!paused));
const syncStill = () => {
  pauseButton.hidden = still.matches;
  run();
};
still.addEventListener("change", syncStill);

// ---------------------------------------------------------------- theme and host frame
function themeOf() {
  if (window.__ccTheme) return window.__ccTheme;
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
  const height = Math.ceil(document.querySelector(".cc-figure").getBoundingClientRect().height + 4);
  try {
    window.parent.postMessage({ type: "doc-bridge-catalog-height", height }, location.origin);
  } catch {}
}
if ("ResizeObserver" in window) new ResizeObserver(reportHeight).observe(card);

// ---------------------------------------------------------------- start
applyTheme();
syncStill();
setState(st);
draw();
reportHeight();
// Test hooks: the e2e check drives the figure through its states without waiting for the tour.
window.__catalog = {
  state: () => ({ ...v, code: VERSIONS[st.code], cites: VERSIONS[st.doc] }),
  ask: () => act(ask(st)),
  toggle: () => act(toggleCode(st)),
  fix: () => act(fixDoc(st)),
  reset: () => act(initial()),
  pause: (value = true) => setPaused(value),
};
