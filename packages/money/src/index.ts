/**
 * Integer money (INV-5, lld/00-foundations.md §6, domain-model §3).
 *
 * - Every amount is a `bigint` in minor units (fiat) or base units (assets). Functions throw a
 *   TypeError when given a `number` amount, so a float can never slip into a money path.
 * - Prices and FX rates are exact rationals parsed from decimal strings; there is no float maths.
 * - Rounding (foundations §6): conversions to the merchant's settlement amount round DOWN, fees
 *   round UP, payer-facing totals round UP. Each helper names its rounding.
 */

export type Amount = bigint;
export interface Fiat {
  readonly amount: bigint;
  readonly currency: string;
}
export interface AssetAmount {
  readonly amount: bigint;
  readonly assetId: string;
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Throws unless `x` is a bigint (rejects numbers, strings, null). */
export function assertAmount(x: unknown, name = "amount"): asserts x is bigint {
  if (typeof x !== "bigint") throw new TypeError(`${name} must be a bigint, got ${typeof x}`);
}

function assertNonNegative(x: bigint, name: string): void {
  if (x < 0n) throw new RangeError(`${name} must be non-negative`);
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255)
    throw new RangeError(`invalid decimals: ${decimals}`);
}

// ---------------------------------------------------------------------------------------------
// Wire formats
// ---------------------------------------------------------------------------------------------

const BASE_UNITS_RE = /^(0|[1-9][0-9]{0,77})$/;

/** Parses a base-unit decimal string (`"25000000"`). */
export function fromBaseUnits(s: string): bigint {
  if (typeof s !== "string" || !BASE_UNITS_RE.test(s)) throw new RangeError(`invalid base units: ${String(s)}`);
  return BigInt(s);
}

/** Renders base units as the wire string. */
export function toBaseUnits(amount: bigint): string {
  assertAmount(amount);
  assertNonNegative(amount, "amount");
  const s = amount.toString();
  if (s.length > 78) throw new RangeError("amount exceeds 78 digits");
  return s;
}

/** Converts a JSON fiat amount (safe integer number) to bigint. */
export function fiatFromJson(n: number): bigint {
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) throw new RangeError(`invalid fiat amount: ${n}`);
  return BigInt(n);
}

/** Converts a fiat bigint to its JSON number form; throws above 2^53 − 1. */
export function fiatToJson(amount: bigint): number {
  assertAmount(amount);
  assertNonNegative(amount, "amount");
  if (amount > MAX_SAFE) throw new RangeError("fiat amount exceeds 2^53 - 1");
  return Number(amount);
}

// ---------------------------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------------------------

/** ISO 4217 minor-unit exponents that differ from 2. */
const EXPONENTS: Record<string, number> = {
  bif: 0,
  clp: 0,
  djf: 0,
  gnf: 0,
  isk: 0,
  jpy: 0,
  kmf: 0,
  krw: 0,
  pyg: 0,
  rwf: 0,
  ugx: 0,
  uyi: 0,
  vnd: 0,
  vuv: 0,
  xaf: 0,
  xof: 0,
  xpf: 0,
  bhd: 3,
  iqd: 3,
  jod: 3,
  kwd: 3,
  lyd: 3,
  omr: 3,
  tnd: 3,
  clf: 4,
  uyw: 4,
};

/** Minor-unit exponent of an ISO 4217 currency (lower-case). */
export function minorUnits(currency: string): number {
  if (!/^[a-z]{3}$/.test(currency)) throw new RangeError(`invalid currency: ${currency}`);
  return EXPONENTS[currency] ?? 2;
}

/**
 * Parses a human decimal ("12.5") into base units with `decimals` places. Extra fractional digits
 * are rejected unless a rounding mode is given.
 */
export function parseUnits(value: string, decimals: number, rounding?: "floor" | "ceil"): bigint {
  assertDecimals(decimals);
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value))
    throw new RangeError(`invalid decimal: ${value}`);
  const [int = "0", frac = ""] = value.split(".");
  if (frac.length <= decimals) return BigInt(int + frac.padEnd(decimals, "0"));
  if (!rounding) throw new RangeError(`${value} has more than ${decimals} decimals`);
  const kept = BigInt(int + frac.slice(0, decimals));
  const dropped = /[1-9]/.test(frac.slice(decimals));
  return rounding === "ceil" && dropped ? kept + 1n : kept;
}

/** Formats base units as a decimal string with at least `minFraction` fraction digits. */
export function formatUnits(amount: bigint, decimals: number, minFraction = 0): string {
  assertAmount(amount);
  assertDecimals(decimals);
  const neg = amount < 0n;
  const s = (neg ? -amount : amount).toString().padStart(decimals + 1, "0");
  const int = s.slice(0, s.length - decimals);
  let frac = decimals ? s.slice(s.length - decimals) : "";
  frac = frac.replace(/0+$/, "");
  if (frac.length < minFraction) frac = frac.padEnd(Math.min(minFraction, decimals), "0");
  return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

// ---------------------------------------------------------------------------------------------
// Integer arithmetic
// ---------------------------------------------------------------------------------------------

/** floor(a × b / c) for non-negative a, b and positive c. */
export function mulDivFloor(a: bigint, b: bigint, c: bigint): bigint {
  assertAmount(a, "a");
  assertAmount(b, "b");
  assertAmount(c, "c");
  assertNonNegative(a, "a");
  assertNonNegative(b, "b");
  if (c <= 0n) throw new RangeError("c must be positive");
  return (a * b) / c;
}

/** ceil(a × b / c) for non-negative a, b and positive c. */
export function mulDivCeil(a: bigint, b: bigint, c: bigint): bigint {
  const p = mulDivFloor(a, b, c);
  return p * c === a * b ? p : p + 1n;
}

function assertBps(bps: number | bigint): bigint {
  const b = typeof bps === "bigint" ? bps : Number.isInteger(bps) ? BigInt(bps) : Number.NaN;
  if (typeof b !== "bigint" || b < 0n || b > 10_000n) throw new RangeError(`invalid bps: ${String(bps)}`);
  return b;
}

/** Fee of `bps` on `amount`, rounded UP (fees round up). bps is a small integer, not money. */
export function bpsOf(amount: bigint, bps: number | bigint): bigint {
  return mulDivCeil(amount, assertBps(bps), 10_000n);
}

/** `amount` net of a `bps` fee, rounded DOWN (merchant-bearer settlement, rails §8.1 step 5). */
export function afterBps(amount: bigint, bps: number | bigint): bigint {
  return mulDivFloor(amount, 10_000n - assertBps(bps), 10_000n);
}

export function maxOf(...xs: bigint[]): bigint {
  if (xs.length === 0) throw new RangeError("maxOf needs values");
  // biome-ignore lint/complexity/useMathMinMax: Math.max does not accept bigint.
  return xs.reduce((m, x) => (x > m ? x : m));
}

export function minOf(...xs: bigint[]): bigint {
  if (xs.length === 0) throw new RangeError("minOf needs values");
  // biome-ignore lint/complexity/useMathMinMax: Math.min does not accept bigint.
  return xs.reduce((m, x) => (x < m ? x : m));
}

// ---------------------------------------------------------------------------------------------
// Exact rationals (prices, FX)
// ---------------------------------------------------------------------------------------------

/** A reduced fraction with a positive denominator. */
export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
}

export function rational(num: bigint, den = 1n): Rational {
  assertAmount(num, "num");
  assertAmount(den, "den");
  if (den === 0n) throw new RangeError("denominator is zero");
  const sign = den < 0n ? -1n : 1n;
  const g = gcd(num, den) || 1n;
  return { num: (sign * num) / g, den: (sign * den) / g };
}

/** Parses a decimal or scientific string exactly ("0.9998", "1.2e-5", "-3"). */
export function parseDecimal(s: string): Rational {
  const m = /^(-)?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(typeof s === "string" ? s.trim() : "");
  if (!m) throw new RangeError(`invalid decimal: ${String(s)}`);
  const [, sign, int = "0", frac = "", exp = "0"] = m;
  const e = Number.parseInt(exp, 10) - frac.length;
  if (Math.abs(e) > 400) throw new RangeError(`exponent out of range: ${s}`);
  let num = BigInt(int + frac);
  let den = 1n;
  if (e >= 0) num *= 10n ** BigInt(e);
  else den = 10n ** BigInt(-e);
  return rational(sign ? -num : num, den);
}

export const mul = (a: Rational, b: Rational): Rational => rational(a.num * b.num, a.den * b.den);
export const div = (a: Rational, b: Rational): Rational => {
  if (b.num === 0n) throw new RangeError("division by zero");
  return rational(a.num * b.den, a.den * b.num);
};
export const add = (a: Rational, b: Rational): Rational => rational(a.num * b.den + b.num * a.den, a.den * b.den);
export const sub = (a: Rational, b: Rational): Rational => rational(a.num * b.den - b.num * a.den, a.den * b.den);
export const cmp = (a: Rational, b: Rational): -1 | 0 | 1 => {
  const d = a.num * b.den - b.num * a.den;
  return d < 0n ? -1 : d > 0n ? 1 : 0;
};
/** |a − b| / |b| (relative difference), for sanity bands such as rails' 1.5 % price agreement. */
export function relativeDiff(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new RangeError("reference is zero");
  const d = sub(a, b);
  const abs = (r: Rational) => rational(r.num < 0n ? -r.num : r.num, r.den);
  return div(abs(d), abs(b));
}

/** Largest integer ≤ r. */
export function floor(r: Rational): bigint {
  const q = r.num / r.den;
  return r.num < 0n && q * r.den !== r.num ? q - 1n : q;
}

/** Smallest integer ≥ r. */
export function ceil(r: Rational): bigint {
  const q = r.num / r.den;
  return r.num > 0n && q * r.den !== r.num ? q + 1n : q;
}

/** Decimal rendering with exactly `places` digits, rounded as requested. */
export function toDecimalString(r: Rational, places: number, rounding: "floor" | "ceil" = "floor"): string {
  assertDecimals(places);
  const scaled = mul(r, rational(10n ** BigInt(places)));
  const v = rounding === "floor" ? floor(scaled) : ceil(scaled);
  return formatUnits(v, places, places);
}
