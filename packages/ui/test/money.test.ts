import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatCountdown, formatMoney, formatMoneyParts, MINUS, truncateMiddle } from "../src/money.js";

describe("formatMoney — fiat", () => {
  it("formats cents with a prefix symbol and two decimals", () => {
    expect(formatMoney({ amount: "4900", decimals: 2, symbol: "$" })).toBe("$49.00");
    expect(formatMoney({ amount: 49n, decimals: 2, symbol: "$" })).toBe("$0.49");
    expect(formatMoney({ amount: "2486000", decimals: 2, symbol: "$" })).toBe("$24,860.00");
    expect(formatMoney({ amount: "0", decimals: 2, symbol: "$" })).toBe("$0.00");
  });
  it("groups thousands at every magnitude", () => {
    expect(formatMoney({ amount: "100000", decimals: 2 })).toBe("1,000.00");
    expect(formatMoney({ amount: "123456789012345678901234567890", decimals: 2 })).toBe(
      "1,234,567,890,123,456,789,012,345,678.90",
    );
    expect(formatMoney({ amount: "99999", decimals: 2, groupSeparator: "" })).toBe("999.99");
  });
  it("handles zero-decimal currencies", () => {
    expect(formatMoney({ amount: "4900", decimals: 0, symbol: "¥" })).toBe("¥4,900");
  });
});

describe("formatMoney — assets", () => {
  it("suffixes ticker symbols and shows every significant digit by default", () => {
    expect(formatMoney({ amount: "49490000", decimals: 6, symbol: "USDC" })).toBe("49.49 USDC");
    expect(formatMoney({ amount: "49490001", decimals: 6, symbol: "USDC" })).toBe("49.490001 USDC");
    expect(formatMoney({ amount: "1", decimals: 18, symbol: "ETH" })).toBe("0.000000000000000001 ETH");
  });
  it("supports NEAR's 24 decimals exactly", () => {
    expect(formatMoney({ amount: "1", decimals: 24, symbol: "NEAR" })).toBe("0.000000000000000000000001 NEAR");
    expect(formatMoney({ amount: (10n ** 24n * 5n).toString(), decimals: 24, symbol: "NEAR" })).toBe("5.00 NEAR");
    expect(formatMoney({ amount: (10n ** 24n * 1234n + 1n).toString(), decimals: 24, symbol: "NEAR" })).toBe(
      "1,234.000000000000000000000001 NEAR",
    );
  });
  it("respects explicit symbol position", () => {
    expect(formatMoney({ amount: "100", decimals: 2, symbol: "€", symbolPosition: "suffix" })).toBe("1.00 €");
    expect(formatMoney({ amount: "100", decimals: 2, symbol: "US$", symbolPosition: "prefix" })).toBe("US$1.00");
  });
});

describe("rounding for display", () => {
  const base = { decimals: 6, symbol: "USDC", maxFraction: 2 } as const;
  it("rounds with the requested mode and reports it", () => {
    expect(formatMoney({ ...base, amount: "49485001", rounding: "ceil" })).toBe("49.49 USDC");
    expect(formatMoney({ ...base, amount: "49485001", rounding: "floor" })).toBe("49.48 USDC");
    expect(formatMoney({ ...base, amount: "49485001", rounding: "trunc" })).toBe("49.48 USDC");
    expect(formatMoney({ ...base, amount: "49485000" })).toBe("49.49 USDC");
    expect(formatMoney({ ...base, amount: "49484999" })).toBe("49.48 USDC");
    expect(formatMoneyParts({ ...base, amount: "49485001" }).rounded).toBe(true);
    expect(formatMoneyParts({ ...base, amount: "49480000" }).rounded).toBe(false);
  });
  it("rounds negatives symmetrically (floor goes more negative)", () => {
    expect(formatMoney({ ...base, amount: "-49485001", rounding: "floor" })).toBe(`${MINUS}49.49 USDC`);
    expect(formatMoney({ ...base, amount: "-49485001", rounding: "ceil" })).toBe(`${MINUS}49.48 USDC`);
    expect(formatMoney({ ...base, amount: "-49485000" })).toBe(`${MINUS}49.49 USDC`);
  });
  it("carries into the integer part", () => {
    expect(formatMoney({ amount: "999999", decimals: 6, maxFraction: 2, rounding: "ceil" })).toBe("1.00");
    expect(formatMoney({ amount: "99999999995", decimals: 8, maxFraction: 2 })).toBe("1,000.00");
    expect(formatMoney({ amount: "5", decimals: 1, maxFraction: 0 })).toBe("1");
  });
});

describe("negative amounts (refunds) and signs", () => {
  it("uses a typographic minus before the symbol", () => {
    expect(formatMoney({ amount: "-4900", decimals: 2, symbol: "$" })).toBe(`${MINUS}$49.00`);
    expect(formatMoney({ amount: -49_000_000n, decimals: 6, symbol: "USDC" })).toBe(`${MINUS}49.00 USDC`);
    expect(formatMoneyParts({ amount: "-1", decimals: 2 }).negative).toBe(true);
  });
  it("never shows a sign on zero", () => {
    expect(formatMoney({ amount: "-0", decimals: 2, symbol: "$" })).toBe("$0.00");
    expect(formatMoney({ amount: "0", decimals: 2, symbol: "$", signDisplay: "always" })).toBe("$0.00");
    expect(formatMoney({ amount: "-4", decimals: 2, maxFraction: 0, rounding: "trunc" })).toBe("0");
  });
  it("supports explicit plus for deltas and sign suppression", () => {
    expect(formatMoney({ amount: "1240", decimals: 2, symbol: "$", signDisplay: "always" })).toBe("+$12.40");
    expect(formatMoney({ amount: "-1240", decimals: 2, symbol: "$", signDisplay: "never" })).toBe("$12.40");
  });
});

describe("input validation (INV-5: no floats)", () => {
  it("rejects numbers, decimals and junk", () => {
    expect(() => formatMoney({ amount: 49 as never, decimals: 2 })).toThrow(TypeError);
    for (const bad of ["49.00", "1e3", "", " 1", "0x10", "--1", "1_000"]) {
      expect(() => formatMoney({ amount: bad, decimals: 2 })).toThrow(TypeError);
    }
  });
  it("rejects invalid digit counts", () => {
    expect(() => formatMoney({ amount: "1", decimals: -1 })).toThrow(RangeError);
    expect(() => formatMoney({ amount: "1", decimals: 1.5 })).toThrow(RangeError);
    expect(() => formatMoney({ amount: "1", decimals: 256 })).toThrow(RangeError);
    expect(() => formatMoney({ amount: "1", decimals: 2, maxFraction: -1 })).toThrow(RangeError);
  });
  it("clamps minFraction to maxFraction", () => {
    expect(formatMoney({ amount: "123", decimals: 2, minFraction: 4, maxFraction: 1 })).toBe("1.2");
  });
});

describe("properties", () => {
  const strip = (s: string) => s.replaceAll(",", "").replace(MINUS, "-");
  const toBase = (s: string, decimals: number) => {
    const neg = s.startsWith("-");
    const [i = "0", f = ""] = (neg ? s.slice(1) : s).split(".");
    const v = BigInt(i + f.padEnd(decimals, "0"));
    return neg ? -v : v;
  };
  it("exact formatting round-trips for decimals 0–24", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 40n), max: 10n ** 40n }),
        fc.integer({ min: 0, max: 24 }),
        (amount, decimals) => {
          const s = strip(formatMoney({ amount, decimals }));
          expect(toBase(s, decimals)).toBe(amount === 0n ? 0n : amount);
        },
      ),
    );
  });
  it("floor ≤ exact ≤ ceil after display rounding", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n }),
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 0, max: 24 }),
        (amount, decimals, maxF) => {
          const maxFraction = Math.min(maxF, decimals);
          const scale = 10n ** BigInt(decimals - maxFraction);
          const lo =
            toBase(strip(formatMoney({ amount, decimals, maxFraction, rounding: "floor" })), maxFraction) * scale;
          const hi =
            toBase(strip(formatMoney({ amount, decimals, maxFraction, rounding: "ceil" })), maxFraction) * scale;
          expect(lo <= amount && amount <= hi).toBe(true);
          expect(hi - lo === 0n || hi - lo === scale).toBe(true);
        },
      ),
    );
  });
});

describe("truncateMiddle / formatCountdown", () => {
  it("shortens long identifiers only", () => {
    expect(truncateMiddle("0x8f24a1B9c0E5d7F3a2b4C6d8E0f1A3b5C7c3D920")).toBe("0x8f24…c3D920");
    expect(truncateMiddle("acme.near")).toBe("acme.near");
    expect(truncateMiddle("0123456789abc", 6, 6)).toBe("0123456789abc");
    expect(truncateMiddle("0123456789abcd", 4, 4)).toBe("0123…abcd");
  });
  it("formats mm:ss and h:mm:ss, clamping invalid input", () => {
    expect(formatCountdown(42)).toBe("00:42");
    expect(formatCountdown(872)).toBe("14:32");
    expect(formatCountdown(3723)).toBe("1:02:03");
    expect(formatCountdown(-5)).toBe("00:00");
    expect(formatCountdown(Number.NaN)).toBe("00:00");
    expect(formatCountdown(59.9)).toBe("00:59");
  });
});
