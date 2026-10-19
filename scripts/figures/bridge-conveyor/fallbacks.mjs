// Screenshots the bridge-conveyor figure card in its initial healthy state, light and dark, into the static
// fallbacks next to the page: apps/docs/public/figures/bridge-conveyor-fallback-{light,dark}.png. Needs a
// Chromium that Playwright can launch (pnpm exec playwright install chromium; install-deps chromium if the
// launch reports a missing shared library).
//
//   node scripts/figures/bridge-conveyor/fallbacks.mjs
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const FIGURES = join(ROOT, "apps", "docs", "public", "figures");
const PAGE = pathToFileURL(join(FIGURES, "bridge-conveyor.html")).href;

// A desktop width shows the whole bridge (not the phone crop). Reduced motion holds the belt, the tour and the
// drawbridge still in the baseline frame, so the shot is the same on every run.
const VIEWPORT = { width: 1280, height: 900 };
const THEMES = ["light", "dark"];

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.error("Chromium could not be launched. Run: pnpm exec playwright install chromium (and install-deps chromium for missing shared libraries)");
  throw error;
}

try {
  for (const theme of THEMES) {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2, reducedMotion: "reduce" });
    await page.goto(`${PAGE}?theme=${theme}`);
    await page.waitForFunction(() => window.__bridge?.settled() === true);
    await page.evaluate(() => document.fonts.ready);
    const state = await page.evaluate(() => window.__bridge.state());
    if (state.phase !== "baseline" || state.flagged || state.held) {
      throw new Error(`${theme}: figure is not in its healthy baseline frame (phase ${state.phase})`);
    }
    // Move the pointer off the figure so no hover outline is captured, then let the frame paint.
    await page.mouse.move(0, 0);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const card = page.locator("#card");
    await card.screenshot({ path: join(FIGURES, `bridge-conveyor-fallback-${theme}.png`), omitBackground: true });
    console.log(`${theme}: ${join(FIGURES, `bridge-conveyor-fallback-${theme}.png`)}`);
    await page.close();
  }
} finally {
  await browser.close();
}
