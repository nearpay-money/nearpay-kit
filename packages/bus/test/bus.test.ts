import { CONSUMER_DEFAULTS } from "@nearpay-internal/spec";
import { describe, expect, it } from "vitest";
import { redeliveryDelayMs } from "../src/index.js";

describe("redeliveryDelayMs", () => {
  it("follows the foundations schedule and repeats its last step", () => {
    expect(CONSUMER_DEFAULTS.backoffSeconds).toEqual([1, 5, 30, 120, 600]);
    expect([1, 2, 3, 4, 5, 6, 19].map((d) => redeliveryDelayMs(d))).toEqual([
      1_000, 5_000, 30_000, 120_000, 600_000, 600_000, 600_000,
    ]);
  });

  it("supports custom and fractional schedules", () => {
    expect(redeliveryDelayMs(1, [0.05, 0.2])).toBe(50);
    expect(redeliveryDelayMs(2, [0.05, 0.2])).toBe(200);
    expect(redeliveryDelayMs(9, [0.05, 0.2])).toBe(200);
  });

  it("treats out-of-range deliveries and empty schedules safely", () => {
    expect(redeliveryDelayMs(0)).toBe(1_000);
    expect(redeliveryDelayMs(-3)).toBe(1_000);
    expect(redeliveryDelayMs(3, [])).toBe(0);
  });
});
