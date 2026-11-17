export * from './test-clock.mjs';

type Env = Record<string, string | undefined>;
export declare function freePorts(count: number, host?: string): Promise<number[]>;
export declare function freePort(host?: string): Promise<number>;
/** The product's `pg` module (root, current package, apps/* or packages/*). */
export declare function loadPg(): Promise<{ Client: new (config: { connectionString: string }) => unknown }>;
export declare function databasePrefix(env?: Env): string;
export declare function runPrefix(env?: Env, prefix?: string): string;
export declare function jobPrefix(env?: Env, prefix?: string): string;
export declare function testDatabaseName(env?: Env, prefix?: string): string;
export declare function listTestDatabases(
  baseUrl: string,
  prefix?: string,
): Promise<{ name: string; createdAt: Date | undefined }[]>;
export declare function dropTestDatabases(
  baseUrl: string,
  options?: { prefix?: string; olderThanMs?: number; now?: number },
): Promise<string[]>;
export declare function createTestDatabase(
  baseUrl: string,
  options?: { template?: string; prefix?: string; orphanHours?: number },
): Promise<{ name: string; url: string; drop: () => Promise<void> }>;
/** DROP DATABASE with retries; on 42501 ends this role's sessions and drops without FORCE (factory#1080). */
export declare function dropDatabase(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }> },
  name: string,
  options?: { attempts?: number; waitMs?: number; log?: (line: string) => void },
): Promise<void>;
export declare function baseDatabaseUrl(env?: Env): string;
