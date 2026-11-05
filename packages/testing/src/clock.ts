/** A controllable clock for code that takes `now: () => number` (ms since epoch). */
export interface FakeClock {
  now(): number;
  nowSeconds(): number;
  advance(ms: number): void;
  set(at: Date | number): void;
}

export function fakeClock(start: Date | number = Date.UTC(2026, 10, 5, 10, 0, 0)): FakeClock {
  let t = typeof start === "number" ? start : start.getTime();
  return {
    now: () => t,
    nowSeconds: () => Math.floor(t / 1000),
    advance(ms) {
      if (ms < 0) throw new RangeError("a fake clock only moves forward");
      t += ms;
    },
    set(at) {
      t = typeof at === "number" ? at : at.getTime();
    },
  };
}
