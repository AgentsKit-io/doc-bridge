export declare const SECOND: number;
export declare const MINUTE: number;
export declare const HOUR: number;
export declare const DAY: number;
export declare function testNow(): Date;
export declare function fakeClock(start?: Date): {
  now: () => Date;
  advance(ms: number): Date;
  set(date: Date): Date;
};
export declare const addMs: (date: Date, ms: number) => Date;
export declare const startOfUtcDay: (date: Date) => Date;
export declare const startOfUtcMonth: (date: Date) => Date;
export declare const startOfNextUtcMonth: (date: Date) => Date;
