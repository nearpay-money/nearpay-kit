import { describe, expect, it } from "vitest";
import { recurringSlot } from "../src/index.js";

describe("recurringSlot", () => {
  const H = 3_600_000;
  const D = 24 * H;
  it("floors to the period", () => {
    expect(recurringSlot({ everyMs: H }, Date.UTC(2026, 10, 5, 10, 59, 59))).toBe(Date.UTC(2026, 10, 5, 10));
    expect(recurringSlot({ everyMs: H }, Date.UTC(2026, 10, 5, 11))).toBe(Date.UTC(2026, 10, 5, 11));
  });
  it("applies an offset within the period (daily at 02:00 UTC)", () => {
    const daily = { everyMs: D, offsetMs: 2 * H };
    expect(recurringSlot(daily, Date.UTC(2026, 10, 5, 1, 59))).toBe(Date.UTC(2026, 10, 4, 2));
    expect(recurringSlot(daily, Date.UTC(2026, 10, 5, 2))).toBe(Date.UTC(2026, 10, 5, 2));
    expect(recurringSlot(daily, Date.UTC(2026, 10, 5, 23))).toBe(Date.UTC(2026, 10, 5, 2));
  });
});
