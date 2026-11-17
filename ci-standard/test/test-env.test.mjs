import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  baseDatabaseUrl,
  createTestDatabase,
  DAY,
  databasePrefix,
  dropDatabase,
  dropTestDatabases,
  fakeClock,
  freePort,
  freePorts,
  jobPrefix,
  listTestDatabases,
  loadPg,
  startOfNextUtcMonth,
  startOfUtcDay,
  testDatabaseName,
  testNow,
} from '../scripts/test-env.mjs';

// The database tests need a server (TEST_DATABASE_URL, set on the runners) and the product's `pg`. A product with no
// database has no `pg` (escalas, an Expo app): skip there instead of failing on a runner that has Postgres.
const hasPg = await loadPg().then(
  () => true,
  () => false,
);
const dbSkip = !process.env.TEST_DATABASE_URL
  ? 'no TEST_DATABASE_URL'
  : hasPg
    ? false
    : 'no `pg` in this repo (no database)';

test('freePorts: distinct ports from the OS, bindable right after', async () => {
  const ports = await freePorts(6);
  assert.equal(new Set(ports).size, 6);
  for (const p of ports) assert.ok(p > 0 && p < 65536);
  const port = await freePort();
  await new Promise((ok, fail) => {
    const s = createServer();
    s.once('error', fail);
    s.listen(port, '127.0.0.1', () => s.close(ok));
  });
});

test('database name: <prefix>_<run_id>_<attempt>_<job>_<random>, sanitized, at most 63 bytes, unique', () => {
  const env = {
    GITHUB_REPOSITORY: 'Org/Platform-Template',
    GITHUB_RUN_ID: '42079',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_JOB: 'contract-node',
  };
  assert.equal(databasePrefix(env), 'platform_template');
  const name = testDatabaseName(env);
  assert.match(name, /^platform_template_42079_2_contract_node_[0-9a-f]{8}$/);
  assert.notEqual(testDatabaseName(env), name);
  const long = testDatabaseName({ ...env, GITHUB_JOB: 'x'.repeat(80) });
  assert.ok(Buffer.byteLength(long) <= 63, long);
  assert.match(long, /_[0-9a-f]{8}$/);
  assert.match(testDatabaseName({ GITHUB_REPOSITORY: 'o/r' }), /^r_local_\d+_job_[0-9a-f]{8}$/);
});

test('base URL from TEST_DATABASE_URL, else libpq variables (password URL-encoded)', () => {
  assert.equal(baseDatabaseUrl({ TEST_DATABASE_URL: 'postgres://a@h/db' }), 'postgres://a@h/db');
  assert.equal(
    baseDatabaseUrl({ PGHOST: 'db', PGPORT: '6543', PGUSER: 'ci', PGPASSWORD: 'p@ss' }),
    'postgres://ci:p%40ss@db:6543/postgres',
  );
});

test('clock: TEST_NOW is honoured and fixed for the run; fakeClock moves by offsets', () => {
  const at = new Date(Date.now() - 400 * DAY).toISOString();
  const code = "import('./ci-standard/scripts/test-clock.mjs').then(m => console.log(m.testNow().toISOString()))";
  const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env: { ...process.env, TEST_NOW: at } });
  assert.equal(r.stdout.trim(), at);
  const bad = spawnSync(process.execPath, ['-e', code], {
    encoding: 'utf8',
    env: { ...process.env, TEST_NOW: 'nope' },
  });
  assert.notEqual(bad.status, 0);
  assert.equal(testNow().getTime(), testNow().getTime());
  const clock = fakeClock(startOfUtcDay(testNow()));
  const start = clock.now();
  assert.equal(clock.advance(DAY).getTime() - start.getTime(), DAY);
  assert.equal(startOfNextUtcMonth(new Date(Date.UTC(2000 + 27, 11, 31))).getUTCMonth(), 0);
});

// Real Postgres: runs where TEST_DATABASE_URL points at a server (the contract-isolation-proof workflow sets it).
test('createTestDatabase: creates, records its time, drops; leaves nothing', {
  skip: dbSkip,
}, async () => {
  const base = process.env.TEST_DATABASE_URL;
  const db = await createTestDatabase(base);
  const listed = await listTestDatabases(base);
  const mine = listed.find((d) => d.name === db.name);
  assert.ok(mine?.createdAt && Date.now() - mine.createdAt.getTime() < 60_000);
  await db.drop();
  await db.drop();
  assert.equal(
    (await listTestDatabases(base)).some((d) => d.name === db.name),
    false,
  );
});

// #136: in a pnpm workspace `pg` is in the API package, not at the root. The helper finds it there.
test('pg is found in apps/* when the root has none', {
  skip: (() => {
    try {
      createRequire(import.meta.url).resolve('pg');
      return false;
    } catch {
      return 'pg not installed here';
    }
  })(),
}, () => {
  const pgMain = createRequire(import.meta.url).resolve('pg');
  const pgDir = pgMain.slice(0, pgMain.lastIndexOf(join('node_modules', 'pg')) + 'node_modules/pg'.length);
  // Real path: the CLI runs only when argv[1] is the module's own path (macOS tmpdir is a symlink).
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'test-env-pg-')));
  try {
    const scripts = join(root, 'ci-standard', 'scripts');
    mkdirSync(scripts, { recursive: true });
    const here = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
    for (const f of ['test-env.mjs', 'test-clock.mjs']) copyFileSync(join(here, f), join(scripts, f));
    mkdirSync(join(root, 'apps', 'api', 'node_modules'), { recursive: true });
    symlinkSync(pgDir, join(root, 'apps', 'api', 'node_modules', 'pg'), 'dir');
    // Port 1 refuses: getting that far proves `pg` loaded.
    const r = spawnSync(process.execPath, [join(scripts, 'test-env.mjs'), 'list'], {
      cwd: root,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: root, TEST_DATABASE_URL: 'postgres://x@127.0.0.1:1/postgres' },
    });
    assert.doesNotMatch(r.stderr, /Cannot find package 'pg'/);
    assert.match(r.stderr, /ECONNREFUSED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// #136: a database of the prefix with no recorded time may belong to a running job (a harness that creates its own
// `<db>_node`/`<db>_workers`): the orphan sweep stamps it and keeps it; only an explicit cleanup drops it.
test('orphan sweep stamps an unstamped database instead of dropping it', {
  skip: dbSkip,
}, async () => {
  const base = process.env.TEST_DATABASE_URL;
  const pg = await loadPg();
  // Its own sub-prefix: the explicit cleanup below must not drop the databases other test files of this job create
  // at the same time (10/11: it dropped two of them and listed three, platform-template#162).
  const mine = `${jobPrefix()}_unstamped`;
  const name = `${mine}_db`;
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const live = new pg.Client({ connectionString: base.replace(/\/[^/?]*(\?|$)/, `/${name}$1`) });
    await live.connect();
    const db = await createTestDatabase(base); // runs the 6 h orphan sweep
    await db.drop();
    assert.equal((await live.query('select 1 as ok')).rows[0].ok, 1, 'the running session survived the sweep');
    await live.end();
    const found = (await listTestDatabases(base)).find((d) => d.name === name);
    assert.ok(found?.createdAt, 'stamped with a creation time');
    assert.deepEqual(await dropTestDatabases(base, { prefix: mine }), [name]);
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
});

// factory#1080: on the runners the CI role is not a superuser; DROP ... WITH (FORCE) refuses with 42501 when an
// autovacuum worker (no role) is in the fresh database. The helper ends its own role's sessions and drops without
// FORCE (Postgres ends autovacuum workers itself), and names who held the database.
const pgError = (code, message) => Object.assign(new Error(message), { code });
function fakeClient(script) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push(sql.replace(/\s+/g, ' ').trim());
      for (const [match, answer] of script) if (match.test(sql)) return answer(sql, params);
      return { rows: [] };
    },
  };
}
const autovacuum = [{ pid: 41, backend_type: 'autovacuum worker', usename: null, application_name: '' }];

test('drop: FORCE refused (42501) by an autovacuum worker -> own sessions ended, plain DROP, holder logged', async () => {
  const lines = [];
  const c = fakeClient([
    [
      /WITH \(FORCE\)/,
      () => {
        throw pgError('42501', 'permission denied to terminate process');
      },
    ],
    [/pg_terminate_backend/, () => ({ rows: [] })],
    [/FROM pg_stat_activity/, () => ({ rows: autovacuum })],
    [/^DROP DATABASE IF EXISTS "db_1"$/, () => ({ rows: [] })],
  ]);
  await dropDatabase(c, 'db_1', { waitMs: 1, log: (l) => lines.push(l) });
  assert.deepEqual(
    c.calls.map((q) => q.split(' ').slice(0, 2).join(' ')),
    ['DROP DATABASE', 'SELECT pid,', 'SELECT pg_terminate_backend(pid)', 'DROP DATABASE'],
  );
  assert.match(c.calls[2], /usename = current_user/, 'only sessions this role may end');
  assert.equal(c.calls[3], 'DROP DATABASE IF EXISTS "db_1"', 'no FORCE on the fallback');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /without FORCE after 42501 \(held by: autovacuum worker role=- app=- pid=41\)/);
});

test('drop: a real session of another role keeps it -> retried, then the error names the holder', async () => {
  const lines = [];
  const other = [{ pid: 7, backend_type: 'client backend', usename: 'monitor', application_name: 'exporter' }];
  const c = fakeClient([
    [
      /WITH \(FORCE\)/,
      () => {
        throw pgError('42501', 'permission denied to terminate process');
      },
    ],
    [/pg_terminate_backend/, () => ({ rows: [] })],
    [/FROM pg_stat_activity/, () => ({ rows: other })],
    [
      /^DROP DATABASE/,
      () => {
        throw pgError('55006', 'database "db_2" is being accessed by other users');
      },
    ],
  ]);
  await assert.rejects(dropDatabase(c, 'db_2', { attempts: 3, waitMs: 1, log: (l) => lines.push(l) }), (e) => {
    assert.equal(e.code, '42501');
    assert.match(e.message, /database db_2 held by: client backend role=monitor app=exporter pid=7/);
    return true;
  });
  assert.equal(lines.length, 2, 'one line per retry');
  assert.match(lines[0], /retry 1\/2/);
});

test('drop: other errors are not retried; 55006 alone is retried with FORCE', async () => {
  const bad = fakeClient([
    [
      /DROP/,
      () => {
        throw pgError('3D000', 'nope');
      },
    ],
  ]);
  await assert.rejects(dropDatabase(bad, 'x', { waitMs: 1, log: () => {} }), /nope/);
  assert.equal(bad.calls.length, 1);
  let n = 0;
  const once = fakeClient([
    [
      /WITH \(FORCE\)/,
      () => {
        if (n++ === 0) throw pgError('55006', 'still connecting');
        return { rows: [] };
      },
    ],
  ]);
  await dropDatabase(once, 'y', { waitMs: 1, log: () => {} });
  assert.equal(once.calls.filter((q) => q.includes('WITH (FORCE)')).length, 2);
  assert.equal(
    once.calls.some((q) => q.includes('pg_terminate_backend')),
    false,
  );
});

// The fallback's SQL against the real server: FORCE is made to fail with 42501, a session of this role is open on
// the database; the helper ends it and the plain DROP removes the database.
test("drop fallback on a real Postgres: ends this role's session, plain DROP succeeds", {
  skip: dbSkip,
}, async () => {
  const base = process.env.TEST_DATABASE_URL;
  const pg = await loadPg();
  const db = await createTestDatabase(base);
  const holder = new pg.Client({ connectionString: db.url });
  await holder.connect();
  holder.on('error', () => {}); // it is terminated on purpose
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  const lines = [];
  try {
    const client = {
      query: (sql, params) =>
        /WITH \(FORCE\)/.test(sql)
          ? Promise.reject(pgError('42501', 'permission denied to terminate process'))
          : admin.query(sql, params),
    };
    await dropDatabase(client, db.name, { log: (l) => lines.push(l) });
    assert.match(lines[0] ?? '', /without FORCE after 42501 \(held by: client backend role=/);
    assert.equal(
      (await listTestDatabases(base)).some((d) => d.name === db.name),
      false,
    );
  } finally {
    await admin.end();
    await holder.end().catch(() => {});
    await db.drop().catch(() => {});
  }
});
