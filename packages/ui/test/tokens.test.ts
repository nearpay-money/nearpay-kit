import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/color.js";
import {
  type ColorTokens,
  chart,
  color,
  fontSize,
  fontWeight,
  palette,
  radius,
  size,
  type ThemeName,
} from "../src/tokens.js";

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
    for (const [key, value] of Object.entries(fontSize))
      expect(light.get(`--np-text-${kebab(key)}`), key).toBe(`${value}px`);
    for (const [key, value] of Object.entries(size))
      expect(light.get(`--np-size-${kebab(key)}`), key).toBe(`${value}px`);
    for (const [key, value] of Object.entries(fontWeight))
      expect(light.get(`--np-weight-${key}`), key).toBe(`${value}`);
    expect(light.get("--np-radius-control")).toBe(`${radius.control}px`);
  });
  it("derives card, panel and pill radius from the control radius (16 / 24 / pill at the 12 px default)", () => {
    expect(light.get("--np-radius-card")).toBe("min(calc(var(--np-radius-control) * 4 / 3), 24px)");
    expect((radius.control * 4) / 3).toBe(radius.card);
    expect(Math.min(radius.control * 2, 28)).toBe(radius.panel);
    expect(light.get("--np-radius-pill")).toContain("999px");
  });
  it("uses Instrument Sans, self-hosted (no DM Sans, no remote font URL)", () => {
    expect(light.get("--np-font-sans")).toMatch(/^"Instrument Sans Variable", "Instrument Sans",/);
    const fonts = readFileSync(new URL("../src/fonts.css", import.meta.url), "utf8");
    expect(fonts).toContain("@fontsource-variable/instrument-sans");
    expect(fonts).not.toMatch(/dm-sans|https?:\/\//i);
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
  ["textTertiary", "surface", TEXT],
  ["textTertiary", "bg", TEXT],
  ["textTertiary", "surfaceMuted", TEXT],
  ["textTertiary", "neutralBg", TEXT],
  ["onAccent", "accent", TEXT],
  ["onAccent", "accentHover", TEXT],
  ["onAccent", "accentPressed", TEXT],
  ["accentText", "surface", TEXT],
  ["accentText", "bg", TEXT],
  ["accentText", "surfaceMuted", TEXT],
  ["accentSubtleText", "accentSubtle", TEXT],
  ["text", "accentSubtle", TEXT],
  ["textSecondary", "accentSubtle", TEXT],
  ["successFg", "successBg", TEXT],
  ["successFg", "surface", TEXT], // KPI trend "Up from …", "Verified · active"
  ["successFg", "surfaceMuted", TEXT],
  ["infoFg", "infoBg", TEXT], // "Confirming" pill
  ["warningFg", "warningBg", TEXT], // "Review" pill
  ["warningFg", "warningSubtle", TEXT], // warning callout, KPI label/link
  ["warningStrong", "warningSubtle", TEXT], // KPI value
  ["text", "warningSubtle", TEXT],
  ["dangerFg", "dangerBg", TEXT],
  ["dangerFg", "surface", TEXT],
  ["neutralFg", "neutralBg", TEXT], // "Not paid" pill
  ["text", "successBg", TEXT],
  ["text", "warningBg", TEXT],
  ["text", "dangerBg", TEXT],
  ["text", "neutralBg", TEXT],
  ["text", "infoBg", TEXT],
  ["textSecondary", "successBg", TEXT],
  ["textSecondary", "warningBg", TEXT],
  ["textSecondary", "warningSubtle", TEXT],
  ["textSecondary", "dangerBg", TEXT],
  ["textSecondary", "neutralBg", TEXT],
  ["textSecondary", "infoBg", TEXT],
  ["inverseText", "inverseBg", TEXT],
  ["surface", "dangerFg", TEXT], // danger button label
  // Navy surfaces (sidebar, checkout order side, hero, dark bands)
  ["onNavy", "navy", TEXT],
  ["onNavy", "navyRaised", TEXT],
  ["onNavy", "navyActive", TEXT], // current nav item, route chips
  ["onNavySecondary", "navy", TEXT], // nav items, order lines
  ["onNavySecondary", "navyRaised", TEXT],
  ["onNavySecondary", "navyActive", TEXT],
  ["onNavyMuted", "navy", TEXT], // merchant domain, captions, user email
  ["onNavyMuted", "navyRaised", TEXT], // "How your payment travels"
  ["onNavyMuted", "navyActive", TEXT],
  ["onNavyAccent", "navy", TEXT],
  ["onNavyAccent", "navyRaised", TEXT],
  ["onNavyRoute", "navy", TEXT],
  ["onNavyRoute", "navyRaised", TEXT],
  ["navy", "onNavyAccent", TEXT], // navy label on a mint fill
  // Non-text UI
  ["borderControl", "surface", UI],
  ["borderControl", "bg", UI],
  ["focus", "surface", UI],
  ["focus", "bg", UI],
  ["focus", "surfaceMuted", UI],
  ["route", "surface", UI],
  ["route", "bg", UI],
  ["accent", "surface", UI], // checked checkbox, selected picker border
  ["accentText", "accentSubtle", UI], // selected tile border
  ["onNavyRoute", "navyActive", UI], // focus ring on navy
  ["onNavyAccent", "navyBorder", UI], // route arrow over the navy card border
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
  it("mint fills on navy carry navy labels", () => {
    expect(contrastRatio(palette.navy, palette.mint)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(palette.navy, palette.mintHover)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(palette.inkDeep, palette.mint)).toBeGreaterThanOrEqual(TEXT);
  });
  it("navy primitives: chip labels, raised surfaces and the on-navy white button", () => {
    expect(contrastRatio(palette.onNavyChip, palette.navyChip)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(palette.onNavySecondary, palette.navyChip)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(palette.navy, palette.white)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(palette.navy, palette.onNavyChip)).toBeGreaterThanOrEqual(TEXT); // on-navy button hover
    expect(contrastRatio(palette.violet, palette.white)).toBeGreaterThanOrEqual(UI);
    expect(contrastRatio(palette.violetOnNavy, palette.navy)).toBeGreaterThanOrEqual(UI);
  });
  it("marketing navy pill button: white on navy and on its hover", () => {
    expect(contrastRatio(palette.white, palette.navy)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(palette.white, palette.navyActive)).toBeGreaterThanOrEqual(TEXT);
  });
  it("brand teal and hover carry white labels", () => {
    expect(contrastRatio(palette.white, palette.teal)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(palette.white, palette.tealHover)).toBeGreaterThanOrEqual(TEXT);
  });
});

describe("navy surface scope (.np-surface-navy)", () => {
  const navy = block(/^\.np-surface-navy\s*\{/m);
  /** Resolves a declared value: a hex literal, or var(--np-color-x) from the scope, then from each theme. */
  const resolve = (name: string, theme: ThemeName): string => {
    const v = navy.get(name);
    if (v === undefined) {
      const key = name.replace(/^--np-color-/, "").replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      return color[theme][key as keyof ColorTokens];
    }
    const ref = /^var\((--np-[a-z0-9-]+)\)$/.exec(v);
    return ref?.[1] ? resolve(ref[1], theme) : v;
  };
  const c = (k: string) => `--np-color-${k}`;
  const NAVY_PAIRS: Array<[string, string, number]> = [
    ["text", "bg", TEXT],
    ["text", "surface", TEXT],
    ["text", "surface-muted", TEXT],
    ["text-secondary", "bg", TEXT],
    ["text-secondary", "surface", TEXT],
    ["text-secondary", "surface-muted", TEXT],
    ["text-secondary", "neutral-bg", TEXT],
    ["text-tertiary", "bg", TEXT],
    ["text-tertiary", "surface", TEXT],
    ["text-tertiary", "surface-muted", TEXT],
    ["text", "neutral-bg", TEXT],
    ["accent-text", "bg", TEXT],
    ["accent-text", "surface", TEXT],
    ["accent-subtle-text", "accent-subtle", TEXT],
    ["on-accent", "accent", TEXT],
    ["on-accent", "accent-hover", TEXT],
    ["on-accent", "accent-pressed", TEXT],
    ["success-fg", "success-bg", TEXT],
    ["info-fg", "info-bg", TEXT],
    ["warning-fg", "warning-bg", TEXT],
    ["warning-fg", "warning-subtle", TEXT],
    ["warning-strong", "warning-subtle", TEXT],
    ["danger-fg", "danger-bg", TEXT],
    ["danger-fg", "surface", TEXT],
    ["neutral-fg", "neutral-bg", TEXT],
    ["inverse-text", "inverse-bg", TEXT],
    ["focus", "bg", UI],
    ["focus", "surface", UI],
    ["route", "bg", UI],
    ["border-control", "bg", UI],
    ["border-control", "surface", UI],
  ];
  for (const theme of ["light", "dark"] as const) {
    for (const [fg, bg, min] of NAVY_PAIRS) {
      it(`${theme}: ${fg} on ${bg} ≥ ${min}:1 on navy`, () => {
        const a = resolve(c(fg), theme);
        const b = resolve(c(bg), theme);
        const r = contrastRatio(a, b);
        expect(r, `${a} on ${b} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(min);
      });
    }
  }
  it("re-maps every semantic colour a component can paint text or surfaces with", () => {
    for (const k of ["text", "surface", "accent", "focus", "border", "neutral-bg", "success-fg", "info-fg"]) {
      expect(navy.has(c(k)), k).toBe(true);
    }
    expect(navy.get("--np-mark-routes")).toBe(palette.mint);
  });
});
