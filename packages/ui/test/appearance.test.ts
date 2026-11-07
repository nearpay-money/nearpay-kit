// @vitest-environment jsdom
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { appearanceVars, applyAppearance, clampRadius, deriveAccent, resolveTheme } from "../src/appearance.js";
import { bestContrast, contrastRatio, isHexColor, mix, parseHex, toHex } from "../src/color.js";
import { color } from "../src/tokens.js";

describe("colour helpers", () => {
  it("parses #rgb and #rrggbb only", () => {
    expect(parseHex("#087A68")).toEqual({ r: 8, g: 122, b: 104 });
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    for (const bad of ["087a68", "#ggg", "#12345", "#1234567", "red", "rgb(0,0,0)", "#fff;x"]) {
      expect(isHexColor(bad)).toBe(false);
      expect(() => parseHex(bad)).toThrow(RangeError);
    }
  });
  it("computes WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(toHex({ r: 300, g: -1, b: 15.6 })).toBe("#ff0010");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(bestContrast("#132d31", ["#ffffff", "#000000"])).toBe("#ffffff");
  });
});

const hex = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(([r, g, b]) => toHex({ r, g, b }));

describe("merchant accent (embedded checkout)", () => {
  it("keeps the brand accent unchanged on light", () => {
    const t = deriveAccent("#087a68", "light");
    expect(t["--np-color-accent"]).toBe("#087a68");
    expect(t["--np-color-on-accent"]).toBe("#ffffff");
  });
  for (const theme of ["light", "dark"] as const) {
    it(`guarantees AA for any accent on ${theme}`, () => {
      fc.assert(
        fc.property(hex, (accent) => {
          const t = deriveAccent(accent, theme);
          const surface = color[theme].surface;
          expect(contrastRatio(t["--np-color-on-accent"], t["--np-color-accent"])).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(t["--np-color-on-accent"], t["--np-color-accent-hover"])).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(t["--np-color-on-accent"], t["--np-color-accent-pressed"])).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(t["--np-color-accent-text"], surface)).toBeGreaterThanOrEqual(4.5);
          expect(
            contrastRatio(t["--np-color-accent-subtle-text"], t["--np-color-accent-subtle"]),
          ).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(t["--np-color-focus"], surface)).toBeGreaterThanOrEqual(3);
        }),
        { numRuns: 300 },
      );
    });
  }
  it("clamps radius to 0–24 and ignores junk", () => {
    expect(clampRadius(-4)).toBe(0);
    expect(clampRadius(12.4)).toBe(12);
    expect(clampRadius(99)).toBe(24);
    expect(clampRadius(Number.NaN)).toBeNull();
    expect(clampRadius("8" as unknown)).toBeNull();
  });
  it("resolves auto with the media query", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
    expect(resolveTheme(undefined, true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
  it("ignores invalid accents instead of injecting them", () => {
    expect(appearanceVars({ accent: "red; background:url(x)" })).toEqual({});
    expect(appearanceVars({ accent: "#abc", radius: 4 })["--np-radius-control"]).toBe("4px");
  });
});

describe("applyAppearance", () => {
  it("sets data-theme and custom properties via the CSSOM, and clears stale overrides", () => {
    const el = document.createElement("div");
    applyAppearance(el, { theme: "dark", accent: "#4f46e5", radius: 30 });
    expect(el.getAttribute("data-theme")).toBe("dark");
    expect(el.classList.contains("np-root")).toBe(true);
    expect(el.style.getPropertyValue("--np-radius-control")).toBe("24px");
    expect(el.style.getPropertyValue("--np-color-accent")).toMatch(/^#[0-9a-f]{6}$/);
    applyAppearance(el, { theme: "auto" });
    expect(el.getAttribute("data-theme")).toBe("auto");
    expect(el.style.getPropertyValue("--np-color-accent")).toBe("");
    expect(el.style.getPropertyValue("--np-radius-control")).toBe("");
    applyAppearance(el, { theme: "bogus" as never });
    expect(el.getAttribute("data-theme")).toBe("light");
  });
});
