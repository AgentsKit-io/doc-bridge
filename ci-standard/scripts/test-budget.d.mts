export declare const SLOW_TEST_WARN_MS: number;
export declare const PR_TEST_TIMEOUT_MS: number;
export declare const SLOW_TEST_GLOB: string;
export declare function testProfile(env?: Record<string, string | undefined>): 'pr' | 'full';
export declare function vitestBudget(options?: {
  testTimeout?: number;
  exclude?: string[];
  env?: Record<string, string | undefined>;
}): {
  bail: number;
  slowTestThreshold: number;
  testTimeout: number;
  exclude: string[];
  reporters?: string[];
  outputFile?: { json: string };
};
