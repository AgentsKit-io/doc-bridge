// Injected clock for contract/e2e suites (docs/ci-standard.md, "Contrato e e2e isolados"). Runtime-agnostic: no
// Node import, so contracts that also run in workerd can use it. Never write a real-calendar date literal in a test:
// start from testNow() and move by offsets; anchor on startOfUtcDay/startOfUtcMonth when the test crosses a window.
export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const fromEnv = globalThis.process?.env?.TEST_NOW;
const runStart = fromEnv ? new Date(fromEnv) : new Date();
if (Number.isNaN(runStart.getTime())) throw new Error(`TEST_NOW is not a valid date: ${fromEnv}`);

/** The suite's "now": TEST_NOW when set (reproduce a failure), else the run's start, fixed for the whole run. */
export function testNow() {
  return new Date(runStart.getTime());
}

/** A fake clock starting at `start` (default testNow()): `now()` for injection, `advance(ms)`, `set(date)`. */
export function fakeClock(start = testNow()) {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    advance(ms) {
      t += ms;
      return new Date(t);
    },
    set(date) {
      t = date.getTime();
      return new Date(t);
    },
  };
}

export const addMs = (date, ms) => new Date(date.getTime() + ms);
export const startOfUtcDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
export const startOfUtcMonth = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
export const startOfNextUtcMonth = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
