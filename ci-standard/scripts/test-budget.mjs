// CI standard v3 (owner's decisions of 10/11: fail fast, no slow tests on the PR path). Zero dependencies; synced by the
// manifest (copy): never edit it in a product repo. The product's vitest.config spreads `vitestBudget()` into `test`.
//
// The profile comes from CI_TEST_PROFILE (ci-standard's test job and the factory station set it: `pr` on the PR path,
// `full` on nightly, production and manual runs); without it, a pull_request run is `pr` and anything else (local,
// nightly) is `full`.
//   pr   -> stop at the first failing test (bail 1), fail a test above 10 s (or above the repo's own timeout when it is
//           lower: the budget never loosens a check), skip `*.slow.test.*` (they run nightly)
//   full -> run everything (all failures show), the repo's own timeout
// Both warn (vitest marks it slow) above 2 s, and in CI write a JSON report to CI_TEST_REPORT_DIR that
// ci-standard/scripts/slow-tests.mjs reads for the job summary (the 10 slowest tests).
// Overrides: TEST_BAIL=0|1, TEST_SLOW=0|1 (1 = run the slow tests too), TEST_TIMEOUT_MS=<ms>.

export const SLOW_TEST_WARN_MS = 2_000;
export const PR_TEST_TIMEOUT_MS = 10_000;
export const SLOW_TEST_GLOB = '**/*.slow.test.*';

/** `pr` on the PR path (bail, 10 s per test, no slow files), `full` otherwise. */
export function testProfile(env = process.env) {
  const profile = env.CI_TEST_PROFILE;
  if (profile === 'pr' || profile === 'full') return profile;
  return env.GITHUB_EVENT_NAME === 'pull_request' ? 'pr' : 'full';
}

/**
 * Vitest `test` options of the budget, to spread first in the repo's own config:
 * `test: { ...vitestBudget({ testTimeout: 60_000 }), include: [...] }` (`testTimeout` = the repo's timeout off the PR
 * path; `exclude` = the repo's own excludes, the slow glob is added on the PR path).
 */
export function vitestBudget({ testTimeout = 60_000, exclude = ['**/node_modules/**'], env = process.env } = {}) {
  const pr = testProfile(env) === 'pr';
  const bail = env.TEST_BAIL === '1' ? 1 : env.TEST_BAIL === '0' ? 0 : pr ? 1 : 0;
  const skipSlow = env.TEST_SLOW ? env.TEST_SLOW === '0' : pr;
  const timeout =
    Number(env.TEST_TIMEOUT_MS) > 0
      ? Number(env.TEST_TIMEOUT_MS)
      : pr
        ? Math.min(PR_TEST_TIMEOUT_MS, testTimeout)
        : testTimeout;
  const options = {
    bail,
    slowTestThreshold: SLOW_TEST_WARN_MS,
    testTimeout: timeout,
    exclude: skipSlow ? [...exclude, SLOW_TEST_GLOB] : [...exclude],
  };
  const dir = env.CI_TEST_REPORT_DIR;
  if (dir) {
    // One file per vitest process: a workspace that runs one vitest per app writes one report each.
    options.reporters = ['default', 'json'];
    options.outputFile = { json: `${dir.replace(/\/$/, '')}/vitest-${process.pid}-${Date.now()}.json` };
  }
  return options;
}
