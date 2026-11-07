/**
 * Display formatting for integer money (INV-5). Pure string/bigint arithmetic — never a float.
 *
 * Input is a base-unit integer (`bigint` or decimal string such as `"49490000"`) plus the asset's
 * `decimals`. By default every significant digit is shown (exact); pass `maxFraction` to round for
 * display, with an explicit `rounding` mode.
 */

export type Rounding = "floor" | "ceil" | "trunc" | "half-expand";

export interface MoneyFormatOptions {
  /** Base units, e.g. `"4900"` (USD cents) or `49490000n` (USDC, 6 decimals). Negative for refunds. */
  amount: bigint | string;
  /** Asset/currency exponent, 0–255 (USD 2, USDC 6, ETH 18, NEAR 24). */
  decimals: number;
  /** `"$"`, `"€"`, `"USDC"`, `"NEAR"`… */
  symbol?: string;
  /** Default: `prefix` for single-character non-alphanumeric symbols (`$`), otherwise `suffix`. */
  symbolPosition?: "prefix" | "suffix";
  /** Minimum fraction digits (padding with zeros). Default: `min(2, decimals)`. */
  minFraction?: number;
  /** Maximum fraction digits; rounds with `rounding`. Default: `decimals` (exact). */
  maxFraction?: number;
  /** Rounding when `maxFraction < decimals`. Default `half-expand` (half away from zero). */
  rounding?: Rounding;
  /** `auto` (− for negatives), `always` (+ for positives too), `never`. */
  signDisplay?: "auto" | "always" | "never";
  /** Thousands separator. Default `","`. */
  groupSeparator?: string;
}

export interface MoneyParts {
  sign: "" | "−" | "+";
  symbol: string;
  symbolPosition: "prefix" | "suffix";
  integer: string;
  fraction: string;
  negative: boolean;
  /** True when the displayed value differs from the exact amount (rounded for display). */
  rounded: boolean;
}

const INT_RE = /^-?[0-9]+$/;
/** Minus sign used for negative amounts (typographic, read as "minus" by screen readers). */
export const MINUS = "−";

function toBigInt(amount: bigint | string): bigint {
  if (typeof amount === "bigint") return amount;
  if (typeof amount !== "string" || !INT_RE.test(amount)) {
    throw new TypeError(
      `amount must be a bigint or integer string, got ${typeof amount === "string" ? `"${amount}"` : typeof amount}`,
    );
  }
  return BigInt(amount);
}

function checkDigits(name: string, n: number, max: number): void {
  if (!Number.isInteger(n) || n < 0 || n > max) throw new RangeError(`invalid ${name}: ${n}`);
}

function group(int: string, sep: string): string {
  if (sep === "" || int.length <= 3) return int;
  let out = "";
  for (let i = int.length; i > 0; i -= 3) out = int.slice(Math.max(0, i - 3), i) + (out ? sep + out : "");
  return out;
}

function roundAbs(abs: bigint, drop: number, mode: Rounding, negative: boolean): bigint {
  const div = 10n ** BigInt(drop);
  const q = abs / div;
  const r = abs % div;
  if (r === 0n) return q;
  switch (mode) {
    case "trunc":
      return q;
    case "floor":
      return negative ? q + 1n : q;
    case "ceil":
      return negative ? q : q + 1n;
    default:
      return r * 2n >= div ? q + 1n : q;
  }
}

/** Splits an amount into display parts. Throws on non-integer input (no floats, INV-5). */
export function formatMoneyParts(opts: MoneyFormatOptions): MoneyParts {
  const value = toBigInt(opts.amount);
  const { decimals } = opts;
  checkDigits("decimals", decimals, 255);
  const maxFraction = opts.maxFraction ?? decimals;
  checkDigits("maxFraction", maxFraction, 255);
  const minFraction = Math.min(opts.minFraction ?? Math.min(2, decimals), maxFraction);
  checkDigits("minFraction", minFraction, 255);

  const negative = value < 0n;
  let abs = negative ? -value : value;
  let scale = decimals;
  let rounded = false;
  if (maxFraction < decimals) {
    const drop = decimals - maxFraction;
    const next = roundAbs(abs, drop, opts.rounding ?? "half-expand", negative);
    rounded = next * 10n ** BigInt(drop) !== abs;
    abs = next;
    scale = maxFraction;
  }
  const digits = abs.toString().padStart(scale + 1, "0");
  const intPart = digits.slice(0, digits.length - scale);
  let frac = digits.slice(digits.length - scale);
  // Trim insignificant zeros down to minFraction.
  let end = frac.length;
  while (end > minFraction && frac[end - 1] === "0") end--;
  frac = frac.slice(0, end).padEnd(minFraction, "0");

  const isZero = abs === 0n;
  const display = opts.signDisplay ?? "auto";
  let sign: MoneyParts["sign"] = "";
  if (display !== "never" && !isZero) {
    if (negative) sign = MINUS;
    else if (display === "always") sign = "+";
  }
  const symbol = opts.symbol ?? "";
  const symbolPosition =
    opts.symbolPosition ?? (symbol.length === 1 && !/[0-9A-Za-z]/.test(symbol) ? "prefix" : "suffix");
  return {
    sign,
    symbol,
    symbolPosition,
    integer: group(intPart, opts.groupSeparator ?? ","),
    fraction: frac,
    negative: negative && !isZero,
    rounded,
  };
}

/** Formats an amount: `"$49.00"`, `"49.49 USDC"`, `"−$49.00"`, `"0.000000000000000000000001 NEAR"`. */
export function formatMoney(opts: MoneyFormatOptions): string {
  const p = formatMoneyParts(opts);
  const number = p.fraction ? `${p.integer}.${p.fraction}` : p.integer;
  if (!p.symbol) return `${p.sign}${number}`;
  return p.symbolPosition === "prefix" ? `${p.sign}${p.symbol}${number}` : `${p.sign}${number} ${p.symbol}`;
}

/** Shortens long identifiers for display: `0x8f24…c3D920`. Returns the input when already short. */
export function truncateMiddle(value: string, head = 6, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

/** Formats a remaining duration in whole seconds as `mm:ss` (or `h:mm:ss` from one hour). */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
