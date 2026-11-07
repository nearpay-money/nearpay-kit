import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  add,
  afterBps,
  assertAmount,
  bpsOf,
  ceil,
  cmp,
  convertUnits,
  div,
  fiatFromJson,
  fiatToJson,
  floor,
  formatUnits,
  fromBaseUnits,
  maxOf,
  minOf,
  minorUnits,
  mul,
  mulDivCeil,
  mulDivFloor,
  parseDecimal,
  parseJsonDecimals,
  parseUnits,
  ratioFromWire,
  rational,
  ratioToWire,
  relativeDiff,
  roundRational,
  sub,
  toBaseUnits,
  toDecimalString,
  toDisplayDecimal,
  toUsdMicros,
} from "../src/index.js";

const big = fc.bigInt({ min: 0n, max: 10n ** 40n });

describe("no floats in money paths (INV-5)", () => {
  it("throws on number amounts everywhere", () => {
    expect(() => assertAmount(1)).toThrow(TypeError);
    expect(() => mulDivFloor(1 as never, 1n, 1n)).toThrow(TypeError);
    expect(() => bpsOf(100 as never, 10)).toThrow(TypeError);
    expect(() => toBaseUnits(1 as never)).toThrow(TypeError);
    expect(() => formatUnits(1 as never, 6)).toThrow(TypeError);
    expect(() => fiatToJson(1 as never)).toThrow(TypeError);
    expect(() => rational(1 as never)).toThrow(TypeError);
  });
});

describe("wire formats", () => {
  it("parses and renders base units", () => {
    expect(fromBaseUnits("25000000")).toBe(25_000_000n);
    expect(toBaseUnits(10n ** 30n)).toBe("1000000000000000000000000000000");
    for (const bad of ["", "-1", "01", "1.0", "1e3", "9".repeat(79)]) expect(() => fromBaseUnits(bad)).toThrow();
    expect(() => toBaseUnits(-1n)).toThrow();
    expect(() => toBaseUnits(10n ** 78n)).toThrow();
  });
  it("converts fiat JSON numbers safely", () => {
    expect(fiatFromJson(4999)).toBe(4999n);
    expect(fiatToJson(4999n)).toBe(4999);
    for (const bad of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) expect(() => fiatFromJson(bad)).toThrow();
    expect(() => fiatToJson(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow();
  });
});

describe("units", () => {
  it("knows ISO 4217 exponents", () => {
    expect(minorUnits("usd")).toBe(2);
    expect(minorUnits("jpy")).toBe(0);
    expect(minorUnits("kwd")).toBe(3);
    expect(() => minorUnits("USD")).toThrow();
  });
  it("parses decimals exactly and refuses silent truncation", () => {
    expect(parseUnits("25", 6)).toBe(25_000_000n);
    expect(parseUnits("0.000001", 6)).toBe(1n);
    expect(() => parseUnits("0.0000011", 6)).toThrow(/more than 6 decimals/);
    expect(parseUnits("0.0000011", 6, "floor")).toBe(1n);
    expect(parseUnits("0.0000011", 6, "ceil")).toBe(2n);
    expect(parseUnits("0.0000010", 6, "ceil")).toBe(1n);
    for (const bad of ["", "1.", ".5", "-1", "1e6", "01"]) expect(() => parseUnits(bad, 6)).toThrow();
  });
  it("formats with trimmed or padded fractions", () => {
    expect(formatUnits(25_000_000n, 6)).toBe("25");
    expect(formatUnits(25_000_000n, 6, 2)).toBe("25.00");
    expect(formatUnits(1n, 24)).toBe("0.000000000000000000000001");
    expect(formatUnits(-1500n, 3)).toBe("-1.5");
    expect(formatUnits(7n, 0, 2)).toBe("7");
  });
  it("round-trips parse/format for any amount and decimals", () => {
    fc.assert(
      fc.property(big, fc.integer({ min: 0, max: 30 }), (a, d) => {
        expect(parseUnits(formatUnits(a, d), d)).toBe(a);
      }),
    );
  });
});

describe("integer arithmetic", () => {
  it("bounds mulDiv floor and ceil around the exact value", () => {
    fc.assert(
      fc.property(big, big, fc.bigInt({ min: 1n, max: 10n ** 20n }), (a, b, c) => {
        const f = mulDivFloor(a, b, c);
        const cl = mulDivCeil(a, b, c);
        expect(f * c <= a * b).toBe(true);
        expect((f + 1n) * c > a * b).toBe(true);
        expect(cl - f <= 1n).toBe(true);
        expect(cl * c >= a * b).toBe(true);
      }),
    );
    expect(() => mulDivFloor(1n, 1n, 0n)).toThrow();
    expect(() => mulDivFloor(-1n, 1n, 1n)).toThrow();
  });
  it("rounds fees up and net amounts down, never losing value", () => {
    expect(bpsOf(1_000_000n, 30)).toBe(3_000n);
    expect(bpsOf(1n, 1)).toBe(1n);
    expect(bpsOf(0n, 500)).toBe(0n);
    expect(afterBps(1_000_000n, 50)).toBe(995_000n);
    expect(afterBps(1n, 1)).toBe(0n);
    fc.assert(
      fc.property(big, fc.integer({ min: 0, max: 10_000 }), (a, bps) => {
        const fee = bpsOf(a, bps);
        const net = afterBps(a, bps);
        expect(fee + net >= a).toBe(true);
        expect(fee + net <= a + 1n).toBe(true);
      }),
    );
    for (const bad of [-1, 10_001, 1.5]) expect(() => bpsOf(1n, bad)).toThrow();
  });
  it("finds min and max", () => {
    expect(maxOf(3n, 9n, 1n)).toBe(9n);
    expect(minOf(3n, 9n, 1n)).toBe(1n);
    expect(() => maxOf()).toThrow();
  });
});

describe("rationals", () => {
  it("parses decimal and scientific strings exactly", () => {
    expect(parseDecimal("0.9998")).toEqual({ num: 4999n, den: 5000n });
    expect(parseDecimal("1.2e-5")).toEqual({ num: 3n, den: 250000n });
    expect(parseDecimal("3E2")).toEqual({ num: 300n, den: 1n });
    expect(parseDecimal("-0.5")).toEqual({ num: -1n, den: 2n });
    for (const bad of ["", "abc", "1..2", "0x10", "1e9999"]) expect(() => parseDecimal(bad)).toThrow();
  });
  it("does exact arithmetic and comparisons", () => {
    const a = parseDecimal("0.1");
    const b = parseDecimal("0.2");
    expect(cmp(add(a, b), parseDecimal("0.3"))).toBe(0);
    expect(sub(b, a)).toEqual(a);
    expect(mul(a, b)).toEqual(parseDecimal("0.02"));
    expect(div(b, a)).toEqual(rational(2n));
    expect(() => div(a, rational(0n))).toThrow();
    expect(() => rational(1n, 0n)).toThrow();
    expect(rational(2n, -4n)).toEqual({ num: -1n, den: 2n });
  });
  it("floors and ceils correctly for both signs", () => {
    expect(floor(rational(7n, 2n))).toBe(3n);
    expect(ceil(rational(7n, 2n))).toBe(4n);
    expect(floor(rational(-7n, 2n))).toBe(-4n);
    expect(ceil(rational(-7n, 2n))).toBe(-3n);
    expect(floor(rational(6n, 2n))).toBe(3n);
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 20n), max: 10n ** 20n }),
        fc.bigInt({ min: 1n, max: 10n ** 10n }),
        (n, d) => {
          const r = rational(n, d);
          const f = floor(r);
          expect(f * r.den <= r.num && (f + 1n) * r.den > r.num).toBe(true);
          expect(ceil(r) - f <= 1n).toBe(true);
        },
      ),
    );
  });
  it("computes relative differences for price-agreement bands", () => {
    expect(cmp(relativeDiff(parseDecimal("1.015"), parseDecimal("1")), parseDecimal("0.015"))).toBe(0);
    expect(cmp(relativeDiff(parseDecimal("0.985"), parseDecimal("1")), parseDecimal("0.015"))).toBe(0);
    expect(() => relativeDiff(rational(1n), rational(0n))).toThrow();
  });
  it("renders decimals with the requested rounding", () => {
    expect(toDecimalString(rational(1n, 3n), 6)).toBe("0.333333");
    expect(toDecimalString(rational(1n, 3n), 6, "ceil")).toBe("0.333334");
    expect(toDecimalString(rational(5n), 2)).toBe("5.00");
  });
  it("converts a USD price to settlement units with round-down (pricing example)", () => {
    // USD 25.00 into a token priced at USD 0.9998 with 6 decimals → floor(25 / 0.9998 × 10^6)
    const units = floor(mul(div(rational(2500n, 100n), parseDecimal("0.9998")), rational(10n ** 6n)));
    expect(units).toBe(25_005_001n);
  });
});

// stage 2 — rails-fx: explicit rounding, wire ratios, unit conversion, lossless JSON

describe("stage 2 FX helpers", () => {
  it("rounds half-even (banker's) and half-up explicitly", () => {
    const r = (s: string) => parseDecimal(s);
    expect(roundRational(r("2.5"), "half_even")).toBe(2n);
    expect(roundRational(r("3.5"), "half_even")).toBe(4n);
    expect(roundRational(r("2.5"), "half_up")).toBe(3n);
    expect(roundRational(r("-2.5"), "half_up")).toBe(-3n);
    expect(roundRational(r("-2.5"), "half_even")).toBe(-2n);
    expect(roundRational(r("2.4999"), "half_up")).toBe(2n);
    expect(roundRational(r("2.0001"), "floor")).toBe(2n);
    expect(roundRational(r("2.0001"), "ceil")).toBe(3n);
    expect(toDecimalString(r("0.125"), 2, "half_even")).toBe("0.12");
    expect(toDecimalString(r("0.135"), 2, "half_even")).toBe("0.14");
  });

  it("half-even never differs from the exact value by more than half a unit", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n }),
        fc.bigInt({ min: 1n, max: 10n ** 20n }),
        (n, d) => {
          const q = rational(n, d);
          const v = roundRational(q, "half_even");
          const diff = sub(rational(v), q);
          return cmp(rational(diff.num < 0n ? -diff.num : diff.num, diff.den), rational(1n, 2n)) <= 0;
        },
      ),
    );
  });

  it("renders display decimals and round-trips wire ratios", () => {
    const cross = div(parseDecimal("1.0823"), parseDecimal("0.8571")); // USD per GBP via EUR, not a finite decimal
    expect(toDisplayDecimal(cross)).toBe("1.262746470656866177");
    expect(ratioFromWire(ratioToWire(cross))).toEqual(cross);
    expect(ratioToWire(parseDecimal("1.0823"))).toEqual({ num: "10823", den: "10000" });
    expect(() => ratioFromWire({ num: "1.5", den: "1" })).toThrow(RangeError);
    expect(() => ratioFromWire({ num: "1", den: "0" })).toThrow(RangeError);
    expect(() => ratioToWire(rational(-1n))).toThrow(RangeError);
  });

  it("converts between unit systems with explicit rounding", () => {
    const eurUsd = parseDecimal("1.0823");
    // EUR 19.99 → USD cents, floor / ceil
    expect(convertUnits(1999n, 2, eurUsd, 2, "floor")).toBe(2163n);
    expect(convertUnits(1999n, 2, eurUsd, 2, "ceil")).toBe(2164n);
    // EUR 19.99 → USDC base units (6 decimals) at par after FX
    expect(convertUnits(1999n, 2, eurUsd, 6, "floor")).toBe(21635177n);
    // JPY (exponent 0) → USD micros
    expect(toUsdMicros(1500n, "jpy", parseDecimal("0.0065"))).toBe(9750000n);
    // USD 2.00 → wNEAR (24 decimals) at USD 2.5 per NEAR
    expect(convertUnits(200n, 2, div(rational(1n), parseDecimal("2.5")), 24, "floor")).toBe(8n * 10n ** 23n);
    expect(() => convertUnits(1 as unknown as bigint, 2, eurUsd, 2, "floor")).toThrow(TypeError);
  });

  it("parses JSON numbers as their exact source text", () => {
    const v = parseJsonDecimals('{"near":{"usd":2.4891234567890123456,"last_updated_at":1793966374},"x":[1e-7]}') as {
      near: { usd: string; last_updated_at: string };
      x: string[];
    };
    expect(v.near.usd).toBe("2.4891234567890123456");
    expect(v.near.last_updated_at).toBe("1793966374");
    expect(parseDecimal(v.x[0] as string)).toEqual(rational(1n, 10_000_000n));
  });
});
