/**
 * Colour helpers used by the runtime appearance API (merchant accent) and by the contrast tests.
 * Pure functions, sRGB only, WCAG 2.2 relative luminance.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** True for `#rgb` and `#rrggbb` (the only accent formats the embedded checkout accepts). */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

/** Parses `#rgb` / `#rrggbb`; throws a RangeError on anything else. */
export function parseHex(hex: string): Rgb {
  if (!isHexColor(hex)) throw new RangeError(`invalid hex colour: ${String(hex)}`);
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  return {
    r: Number.parseInt(h.slice(1, 3), 16),
    g: Number.parseInt(h.slice(3, 5), 16),
    b: Number.parseInt(h.slice(5, 7), 16),
  };
}

const byte = (n: number): string =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, "0");

/** Formats as lower-case `#rrggbb`. */
export function toHex({ r, g, b }: Rgb): string {
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(color: string | Rgb): number {
  const { r, g, b } = typeof color === "string" ? parseHex(color) : color;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two opaque colours, 1–21. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Linear sRGB-space mix: `weight` of `b` into `a` (0 → a, 1 → b). */
export function mix(a: string, b: string, weight: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  const w = Math.min(1, Math.max(0, weight));
  return toHex({ r: x.r + (y.r - x.r) * w, g: x.g + (y.g - x.g) * w, b: x.b + (y.b - x.b) * w });
}

/** Picks whichever of `candidates` contrasts best with `background`. */
export function bestContrast(background: string, candidates: readonly string[]): string {
  let best = candidates[0] ?? "#ffffff";
  let bestRatio = 0;
  for (const c of candidates) {
    const r = contrastRatio(background, c);
    if (r > bestRatio) {
      best = c;
      bestRatio = r;
    }
  }
  return best;
}
