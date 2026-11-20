#!/usr/bin/env node
// Contract/e2e isolation helper (docs/ci-standard.md, "Contrato e e2e isolados"). No new dependency: Postgres
// through the product's own `pg` (dynamic import). Owner rule: no fixed port, no fixed date, no host lock, no slots.
//   freePorts(n) / freePort()      ports from the OS (listen(0)); pass them to wrangler/workerd on the command line
//   createTestDatabase(baseUrl)    one database per job: <prefix>_<run_id>_<attempt>_<job>_<random>, dropped in
//                                  finally and on SIGINT/SIGTERM; orphans of the same prefix older than 6 h are dropped.
//                                  A database of the prefix with no recorded time (made by the product's own harness,
//                                  or caught between CREATE and COMMENT) is stamped now, never dropped on sight: it may
//                                  belong to a job that is still running (#136)
//   testNow() / fakeClock()        injected clock (re-exported from test-clock.mjs)
// CLI: node ci-standard/scripts/test-env.mjs create | drop <url> | list | cleanup  (see usage at the end; base URL:
//      TEST_DATABASE_URL, else libpq env PGHOST/PGPORT/PGUSER/PGPASSWORD, database `postgres`)
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export * from './test-clock.mjs';

/** n distinct free loopback ports, all held open together while picking (no two roles get the same port). */
export async function freePorts(count, host = '127.0.0.1') {
  const servers = await Promise.all(
    Array.from(
      { length: count },
      () =>
        new Promise((ok, fail) => {
          const s = createServer();
          s.once('error', fail);
          s.listen(0, host, () => ok(s));
        }),
    ),
  );
  const ports = servers.map((s) => s.address().port);
  await Promise.all(servers.map((s) => new Promise((ok) => s.close(ok))));
  return ports;
}

export async function freePort(host = '127.0.0.1') {
  return (await freePorts(1, host))[0];
}

const sanitize = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** Prefix shared by every test database of this repo: the repo name (GITHUB_REPOSITORY, else package.json name). */
export function databasePrefix(env = process.env) {
  if (env.GITHUB_REPOSITORY) return sanitize(env.GITHUB_REPOSITORY.split('/').pop());
  try {
    return sanitize(JSON.parse(readFileSync('package.json', 'utf8')).name) || 'test';
  } catch {
    return 'test';
  }
}

/** Prefix of this CI run: <prefix>_<run_id>_<run_attempt> (local runs: <prefix>_local_<pid>). */
export function runPrefix(env = process.env, prefix = databasePrefix(env)) {
  return env.GITHUB_RUN_ID
    ? `${prefix}_${sanitize(env.GITHUB_RUN_ID)}_${sanitize(env.GITHUB_RUN_ATTEMPT ?? '1')}`
    : `${prefix}_local_${process.pid}`;
}

/** Prefix of this job: <run prefix>_<GITHUB_JOB>[_<TEST_DB_SUFFIX>] (set TEST_DB_SUFFIX per matrix copy). */
export function jobPrefix(env = process.env, prefix = databasePrefix(env)) {
  const job = sanitize(`${env.GITHUB_JOB ?? 'job'}${env.TEST_DB_SUFFIX ? `_${env.TEST_DB_SUFFIX}` : ''}`) || 'job';
  return `${runPrefix(env, prefix)}_${job}`.slice(0, 54).replace(/_+$/, '');
}

/** <prefix>_<run_id>_<run_attempt>_<job>_<random>, lowercase, at most 63 bytes (Postgres identifier limit). */
export function testDatabaseName(env = process.env, prefix = databasePrefix(env)) {
  return `${jobPrefix(env, prefix)}_${randomBytes(4).toString('hex')}`;
}

const withDatabase = (baseUrl, name) => {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
};
const quoteIdent = (s) => `"${s.replace(/"/g, '""')}"`;

// `pg` is the product's own dependency. In a pnpm workspace it lives in the API package, not at the root (#136:
// expenses and miaudota failed with "Cannot find package 'pg'"): try the root, the current package, then apps/* and
// packages/*.
let pgModule;
export function loadPg() {
  pgModule ??= (async () => {
    try {
      return (await import('pg')).default;
    } catch (e) {
      if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    }
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const from = [join(process.cwd(), 'package.json')];
    for (const dir of ['apps', 'packages']) {
      try {
        for (const name of readdirSync(join(root, dir)).sort()) from.push(join(root, dir, name, 'package.json'));
      } catch {
        // no such folder
      }
    }
    for (const file of from) {
      let resolved;
      try {
        resolved = createRequire(file).resolve('pg');
      } catch {
        continue;
      }
      return (await import(pathToFileURL(resolved).href)).default;
    }
    throw new Error(
      'test-env: `pg` not found at the root nor in apps/* or packages/* (install the dependencies first)',
    );
  })();
  return pgModule;
}

async function connect(url) {
  const pg = await loadPg();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

// DROP ... WITH (FORCE) fails while a session it may not end is open on the database ("permission denied to
// terminate process", 42501) or one is still connecting (55006). Both pass in a moment: retry instead of failing the
// suite (#136: mama-market's contract died on this in the `finally` of a migration check).
//
// factory#1080: on the runners the CI role is not a superuser, and FORCE checks its right to end EVERY session of the
// database before ending any. An autovacuum worker (it has no role; a fresh database right after a migration with
// data is a prime target) fails that check, so FORCE gives 42501 although nothing of another user is there. A plain
// DROP DATABASE ends autovacuum workers itself and waits for them; it refuses only real sessions (55006). So on 42501
// the helper ends the sessions of its own role (allowed without privileges), runs the plain DROP, and names who holds
// the database in the log and in the final error, so a real foreign session is identified, not guessed.
const RETRYABLE_DROP = new Set(['42501', '55006']);
const describeHolders = (rows) =>
  rows.length
    ? rows
        .map((r) => `${r.backend_type ?? '?'} role=${r.usename ?? '-'} app=${r.application_name || '-'} pid=${r.pid}`)
        .join('; ')
    : 'nobody visible';

/** Sessions on database `name` other than this one (pg_stat_activity), for the log. Never throws. */
async function dropHolders(client, name) {
  try {
    const r = await client.query(
      `SELECT pid, backend_type, usename, application_name FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    return r.rows ?? [];
  } catch {
    return [];
  }
}

/**
 * DROP DATABASE `name` (IF EXISTS), retried on 42501/55006; on 42501 falls back to ending this role's sessions and a
 * plain DROP (ends autovacuum workers). Exported for its tests; `log` gets one line per retry.
 */
export async function dropDatabase(client, name, { attempts = 6, waitMs = 500, log = (m) => console.error(m) } = {}) {
  const q = quoteIdent(name);
  for (let attempt = 1; ; attempt++) {
    let err;
    try {
      await client.query(`DROP DATABASE IF EXISTS ${q} WITH (FORCE)`);
      return;
    } catch (e) {
      if (!RETRYABLE_DROP.has(e?.code)) throw e;
      err = e;
    }
    const holders = await dropHolders(client, name);
    if (err.code === '42501') {
      try {
        await client.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
           WHERE datname = $1 AND pid <> pg_backend_pid() AND usename = current_user`,
          [name],
        );
        await client.query(`DROP DATABASE IF EXISTS ${q}`);
        log(`test-env: dropped ${name} without FORCE after 42501 (held by: ${describeHolders(holders)})`);
        return;
      } catch (e) {
        if (!RETRYABLE_DROP.has(e?.code)) throw e;
      }
    }
    if (attempt >= attempts) {
      err.message = `${err.message} (database ${name} held by: ${describeHolders(holders)})`;
      throw err;
    }
    log(
      `test-env: drop ${name}: ${err.code} ${err.message}; held by: ${describeHolders(holders)}; retry ${attempt}/${attempts - 1}`,
    );
    await new Promise((ok) => setTimeout(ok, waitMs * attempt));
  }
}

/** Test databases of `prefix` with their creation time (from COMMENT ON DATABASE). */
export async function listTestDatabases(baseUrl, prefix = databasePrefix()) {
  const client = await connect(baseUrl);
  try {
    const r = await client.query(
      `SELECT datname, shobj_description(oid, 'pg_database') AS created
       FROM pg_database WHERE datname LIKE $1 ORDER BY datname`,
      [`${prefix.replace(/_/g, '\\_')}\\_%`],
    );
    return r.rows.map((row) => ({ name: row.datname, createdAt: row.created ? new Date(row.created) : undefined }));
  } finally {
    await client.end();
  }
}

/**
 * Drop the test databases of `prefix` older than `olderThanMs`. Returns the names.
 * With olderThanMs = 0 (`cleanup --job`: this job's own databases) everything of the prefix goes. With an age, a
 * database with no recorded time is stamped now and kept: it may be in use by a running job (a product harness that
 * creates `<db>_node`/`<db>_workers` itself, or a database caught between CREATE and COMMENT). Dropping it on sight
 * killed live contracts (#136: miaudota "terminating connection due to administrator command", agenda-gospel
 * "database ..._workers does not exist"). A stamped real orphan goes on a later sweep.
 */
export async function dropTestDatabases(
  baseUrl,
  { prefix = databasePrefix(), olderThanMs = 0, now = Date.now() } = {},
) {
  const all = await listTestDatabases(baseUrl, prefix);
  const unknown = (d) => !d.createdAt || Number.isNaN(d.createdAt.getTime());
  const stale = all.filter((d) => (unknown(d) ? olderThanMs <= 0 : now - d.createdAt.getTime() >= olderThanMs));
  const unstamped = olderThanMs > 0 ? all.filter(unknown) : [];
  if (!stale.length && !unstamped.length) return [];
  const client = await connect(baseUrl);
  const dropped = [];
  try {
    for (const d of unstamped)
      await client
        .query(`COMMENT ON DATABASE ${quoteIdent(d.name)} IS '${new Date(now).toISOString()}'`)
        .catch(() => undefined); // gone meanwhile, or not ours to comment
    for (const d of stale) {
      try {
        await dropDatabase(client, d.name);
        dropped.push(d.name);
      } catch (e) {
        if (olderThanMs <= 0) throw e;
        // An orphan sweep never fails the job that is starting: the next sweep tries again.
        console.error(`test-env: could not drop orphan ${d.name}: ${e.message}`);
      }
    }
  } finally {
    await client.end();
  }
  return dropped;
}

/**
 * One database for this job, on the server of `baseUrl` (a URL to an existing database, e.g. .../postgres).
 * `template`: clone an already-migrated database (CREATE DATABASE ... TEMPLATE) instead of migrating again.
 * Returns { name, url, drop }. Call drop() in `finally`; SIGINT/SIGTERM (a cancelled CI run) also drop it.
 */
export async function createTestDatabase(baseUrl, { template, prefix = databasePrefix(), orphanHours = 6 } = {}) {
  await dropTestDatabases(baseUrl, { prefix, olderThanMs: orphanHours * 3600_000 });
  const name = testDatabaseName(process.env, prefix);
  const client = await connect(baseUrl);
  try {
    await client.query(`CREATE DATABASE ${quoteIdent(name)}${template ? ` TEMPLATE ${quoteIdent(template)}` : ''}`);
    await client.query(`COMMENT ON DATABASE ${quoteIdent(name)} IS '${new Date().toISOString()}'`);
  } finally {
    await client.end();
  }
  let dropped;
  const drop = () => {
    dropped ??= (async () => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      let c;
      try {
        c = await connect(baseUrl);
        await dropDatabase(c, name);
      } catch (e) {
        // Cleanup never fails the suite: `cleanup --job` (and the orphan sweep) drops what is left.
        console.error(`test-env: could not drop ${name}: ${e.message}`);
      } finally {
        await c?.end();
      }
    })();
    return dropped;
  };
  const onSignal = (signal) => {
    drop()
      .catch((e) => console.error(`test-env: could not drop ${name}: ${e.message}`))
      .finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  return { name, url: withDatabase(baseUrl, name), drop };
}

/** Base URL from TEST_DATABASE_URL, else the libpq variables (database `postgres`). */
export function baseDatabaseUrl(env = process.env) {
  if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;
  const user = encodeURIComponent(env.PGUSER ?? env.USER ?? 'postgres');
  const auth = env.PGPASSWORD ? `${user}:${encodeURIComponent(env.PGPASSWORD)}` : user;
  return `postgres://${auth}@${env.PGHOST ?? 'localhost'}:${env.PGPORT ?? '5432'}/postgres`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const flag = (name) => rest.includes(`--${name}`);
  const value = (name) => rest[rest.indexOf(`--${name}`) + 1];
  const base = baseDatabaseUrl();
  const prefix = flag('job') ? jobPrefix() : flag('run') ? runPrefix() : databasePrefix();
  if (command === 'create') {
    // For shell steps: prints the URL; drop it with `drop <url>` in a trap (a Node process should call
    // createTestDatabase() itself, which also drops on SIGINT/SIGTERM).
    const db = await createTestDatabase(base, { template: flag('template') ? value('template') : undefined });
    console.error(`test-env: created ${db.name}`);
    console.log(db.url);
    process.exit(0);
  } else if (command === 'drop') {
    const target = rest[0] ?? '';
    const name = target.includes('://') ? new URL(target).pathname.slice(1) : target;
    if (!name.startsWith(`${databasePrefix()}_`)) {
      console.error(`test-env: refusing to drop ${name || '(empty)'}: not a test database of this repo`);
      process.exit(2);
    }
    const client = await connect(base);
    try {
      await dropDatabase(client, name);
    } finally {
      await client.end();
    }
    console.error(`test-env: dropped ${name}`);
  } else if (command === 'list') {
    const exclude = flag('exclude-run') ? `${runPrefix()}_` : undefined;
    const dbs = (await listTestDatabases(base, prefix)).filter((d) => !exclude || !d.name.startsWith(exclude));
    for (const d of dbs) console.log(`${d.name}\t${d.createdAt?.toISOString() ?? '-'}`);
    console.log(`test-env: ${dbs.length} database(s) with prefix ${prefix}${exclude ? ' (other runs)' : ''}`);
    if (flag('fail-if-any') && dbs.length) process.exit(1);
  } else if (command === 'cleanup') {
    const hours = flag('older-than-hours') ? Number(value('older-than-hours')) : 0;
    const dropped = await dropTestDatabases(base, { prefix, olderThanMs: hours * 3600_000 });
    console.log(`test-env: dropped ${dropped.length} database(s) with prefix ${prefix}`);
  } else {
    console.error(
      'usage: test-env.mjs create [--template <db>] | drop <url|name> | list [--run|--job] [--exclude-run] [--fail-if-any] | cleanup [--run|--job] [--older-than-hours N]',
    );
    process.exit(2);
  }
}
