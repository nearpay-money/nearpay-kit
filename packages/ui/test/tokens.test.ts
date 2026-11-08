import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/color.js";
import { type ColorTokens, chart, color, fontSize, palette, radius, size, type ThemeName } from "../src/tokens.js";

const css = readFileSync(new URL("../src/tokens.css", import.meta.url), "utf8");
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Custom properties declared inside the first block whose selector matches `selector`. */
function block(selector: RegExp): Map<string, string> {
  const m = selector.exec(css);
  if (!m) throw new Error(`block ${selector} not found`);
  const start = css.indexOf("{", m.index) + 1;
  let depth = 1;
  let i = start;
  while (depth > 0 && i < css.length) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  const out = new Map<string, string>();
  for (const d of css.slice(start, i - 1).matchAll(/(--np-[a-z0-9-]+):\s*([^;]+);/g)) {
    if (d[1] && d[2]) out.set(d[1], d[2].trim().replace(/\s+/g, " "));
  }
  return out;
}

const light = block(/:root,\s*\.np-root,\s*\[data-theme\]\s*\{/);
const dark = block(/^\[data-theme="dark"\]\s*\{/m);
const auto = block(/@media \(prefers-color-scheme: dark\)\s*\{\s*\[data-theme="auto"\]/);

describe("tokens.css ↔ tokens.ts", () => {
  const themes: Array<[ThemeName, Map<string, string>]> = [
    ["light", light],
    ["dark", dark],
  ];
  for (const [name, decls] of themes) {
    it(`declares every ${name} colour token with the typed value`, () => {
      for (const [key, value] of Object.entries(color[name])) {
        expect(decls.get(`--np-color-${kebab(key)}`), key).toBe(value);
      }
    });
  }
  it("declares the chart series colours per theme, each ≥ 3:1 on the surface", () => {
    for (const [name, decls] of themes) {
      chart[name].forEach((hex, i) => {
        expect(decls.get(`--np-chart-${i + 1}`)).toBe(hex);
        expect(contrastRatio(hex, color[name].surface)).toBeGreaterThanOrEqual(3);
      });
    }
  });
  it("auto (prefers dark) is identical to the dark theme", () => {
    expect(Object.fromEntries(auto)).toEqual(Object.fromEntries(dark));
  });
  it("mirrors primitives, type scale, sizes and radius", () => {
    for (const [key, value] of Object.entries(palette)) expect(light.get(`--np-${kebab(key)}`), key).toBe(value);
    for (const [key, value] of Object.entries(fontSize)) expect(light.get(`--np-text-${key}`), key).toBe(`${value}px`);
    for (const [key, value] of Object.entries(size))
      expect(light.get(`--np-size-${kebab(key)}`), key).toBe(`${value}px`);
    expect(light.get("--np-radius-control")).toBe(`${radius.control}px`);
  });
  it("keeps to the 4/8 px grid for space and sizes", () => {
    for (const [k, v] of light) {
      if (k.startsWith("--np-space-") || k.startsWith("--np-size-")) {
        expect(Number.parseInt(v, 10) % 2, k).toBe(0);
        expect(Number.parseInt(v, 10) % 4 === 0 || k === "--np-space-0-5", k).toBe(true);
      }
    }
  });
});

/** [foreground, background, minimum] — every text/background and UI pair the components render. */
const TEXT = 4.5;
const UI = 3;
const PAIRS: Array<[keyof ColorTokens, keyof ColorTokens, number]> = [
  ["text", "surface", TEXT],
  ["text", "bg", TEXT],
  ["text", "surfaceMuted", TEXT],
  ["textSecondary", "surface", TEXT],
  ["textSecondary", "bg", TEXT],
  ["textSecondary", "surfaceMuted", TEXT],
  ["onAccent", "accent", TEXT],
  ["onAccent", "accentHover", TEXT],
  ["onAccent", "accentPressed", TEXT],
  ["accentText", "surface", TEXT],
  ["accentText", "bg", TEXT],
  ["accentSubtleText", "accentSubtle", TEXT],
  ["text", "accentSubtle", TEXT],
  ["textSecondary", "accentSubtle", TEXT],
  ["successFg", "successBg", TEXT],
  ["successFg", "surface", TEXT],
  ["warningFg", "warningBg", TEXT],
  ["dangerFg", "dangerBg", TEXT],
  ["dangerFg", "surface", TEXT],
  ["neutralFg", "neutralBg", TEXT],
  ["text", "successBg", TEXT],
  ["text", "warningBg", TEXT],
  ["text", "dangerBg", TEXT],
  ["text", "neutralBg", TEXT],
  ["textSecondary", "successBg", TEXT],
  ["textSecondary", "warningBg", TEXT],
  ["textSecondary", "dangerBg", TEXT],
  ["textSecondary", "neutralBg", TEXT],
  ["inverseText", "inverseBg", TEXT],
  ["surface", "dangerFg", TEXT], // danger button label
  ["borderControl", "surface", UI],
  ["borderControl", "bg", UI],
  ["focus", "surface", UI],
  ["focus", "bg", UI],
  ["accent", "surface", UI], // checked checkbox, selected borders
  ["accentText", "accentSubtle", UI], // selected tile border
];

describe("WCAG 2.2 AA contrast", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const [fg, bg, min] of PAIRS) {
      it(`${theme}: ${fg} on ${bg} ≥ ${min}:1`, () => {
        const r = contrastRatio(color[theme][fg], color[theme][bg]);
        expect(r, `${color[theme][fg]} on ${color[theme][bg]} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(min);
      });
    }
  }
  it("mint primary on dark surfaces reads with deep-ink text", () => {
    expect(contrastRatio(palette.inkDeep, palette.mint)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(palette.inkDeep, palette.mintHover)).toBeGreaterThanOrEqual(TEXT);
  });
  it("brand teal and hover carry white labels", () => {
    expect(contrastRatio(palette.white, palette.teal)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(palette.white, palette.tealHover)).toBeGreaterThanOrEqual(TEXT);
  });
});
