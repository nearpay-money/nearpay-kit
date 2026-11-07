/**
 * Runtime appearance (embedded checkout: theme `light|dark|auto`, accent `#rgb/#rrggbb`, radius 0–24 px).
 *
 * Overrides are applied as custom properties through the CSSOM (`style.setProperty`), which the
 * checkout CSP (`style-src 'self' 'nonce-…'`) permits — no inline `style=""` markup is produced.
 * Accents are adjusted until every pair meets WCAG 2.2 AA, so a merchant cannot make checkout
 * unreadable.
 */
import { contrastRatio, isHexColor, mix, parseHex, toHex } from "./color.js";
import { color, type ThemeName, type ThemeSetting } from "./tokens.js";

export interface Appearance {
  theme?: ThemeSetting;
  /** `#rgb` or `#rrggbb`; invalid values are ignored. */
  accent?: string;
  /** Control radius in px, clamped to 0–24; non-finite values are ignored. */
  radius?: number;
}

export interface AccentTokens {
  "--np-color-accent": string;
  "--np-color-accent-hover": string;
  "--np-color-accent-pressed": string;
  "--np-color-on-accent": string;
  "--np-color-accent-text": string;
  "--np-color-accent-subtle": string;
  "--np-color-accent-subtle-text": string;
  "--np-color-focus": string;
}

const BLACK = "#000000";
const WHITE = "#ffffff";

/** Moves `c` toward `target` in small steps until `ok(c)` holds (or it reaches the target). */
function adjustUntil(c: string, target: string, ok: (x: string) => boolean): string {
  let x = c;
  for (let i = 1; i <= 20 && !ok(x); i++) x = mix(c, target, i / 20);
  return x;
}

/**
 * Derives the accent token set for a merchant accent on the given theme. Guarantees:
 * on-accent text ≥ 4.5:1 on the accent, accent text ≥ 4.5:1 on surface, focus ring ≥ 3:1 on surface.
 */
export function deriveAccent(accent: string, theme: ThemeName): AccentTokens {
  const base = toHex(parseHex(accent));
  const t = color[theme];
  const surface = t.surface;
  // Button fill: pick the better of white / ink, then nudge the fill until it reaches 4.5:1.
  const onCandidates = theme === "light" ? [WHITE, t.text] : [color.dark.onAccent, WHITE];
  const pick = (fill: string) =>
    onCandidates.reduce((a, b) => (contrastRatio(fill, b) > contrastRatio(fill, a) ? b : a));
  let fill = base;
  let on = pick(fill);
  if (contrastRatio(fill, on) < 4.5) {
    const towards = on === WHITE ? BLACK : WHITE;
    fill = adjustUntil(base, towards, (x) => contrastRatio(x, on) >= 4.5);
    on = pick(fill);
  }
  const onIsLight = contrastRatio(on, BLACK) > contrastRatio(on, WHITE);
  // Hover/pressed move away from the on-accent colour, so contrast only improves.
  const away = onIsLight ? BLACK : WHITE;
  const hover = mix(fill, away, 0.22);
  const pressed = mix(fill, away, 0.36);
  const towardText = theme === "light" ? BLACK : WHITE;
  const text = adjustUntil(base, towardText, (x) => contrastRatio(x, surface) >= 4.5);
  const subtle = mix(surface, base, theme === "light" ? 0.1 : 0.22);
  const subtleText = adjustUntil(text, towardText, (x) => contrastRatio(x, subtle) >= 4.5);
  const focus = adjustUntil(base, towardText, (x) => contrastRatio(x, surface) >= 3);
  return {
    "--np-color-accent": fill,
    "--np-color-accent-hover": hover,
    "--np-color-accent-pressed": pressed,
    "--np-color-on-accent": on,
    "--np-color-accent-text": text,
    "--np-color-accent-subtle": subtle,
    "--np-color-accent-subtle-text": subtleText,
    "--np-color-focus": focus,
  };
}

/** Clamps a merchant radius to 0–24 px; returns `null` for non-finite input. */
export function clampRadius(radius: unknown): number | null {
  if (typeof radius !== "number" || !Number.isFinite(radius)) return null;
  return Math.round(Math.min(24, Math.max(0, radius)));
}

/** Resolves `auto` with the given media query result (defaults to `light` without one). */
export function resolveTheme(setting: ThemeSetting | undefined, prefersDark: boolean): ThemeName {
  if (setting === "dark" || setting === "light") return setting;
  return prefersDark ? "dark" : "light";
}

const MANAGED = [
  "--np-color-accent",
  "--np-color-accent-hover",
  "--np-color-accent-pressed",
  "--np-color-on-accent",
  "--np-color-accent-text",
  "--np-color-accent-subtle",
  "--np-color-accent-subtle-text",
  "--np-color-focus",
  "--np-radius-control",
] as const;

/** The custom properties `applyAppearance` would set (pure; useful for SSR and tests). */
export function appearanceVars(appearance: Appearance, prefersDark = false): Record<string, string> {
  const out: Record<string, string> = {};
  if (isHexColor(appearance.accent)) {
    Object.assign(out, deriveAccent(appearance.accent, resolveTheme(appearance.theme, prefersDark)));
  }
  const r = clampRadius(appearance.radius);
  if (r !== null) out["--np-radius-control"] = `${r}px`;
  return out;
}

/**
 * Applies an appearance to a theme root: sets `data-theme` and the derived custom properties,
 * clearing any previously applied override that the new appearance no longer sets.
 */
export function applyAppearance(el: HTMLElement, appearance: Appearance, prefersDark = false): void {
  const theme = appearance.theme ?? "light";
  el.setAttribute("data-theme", theme === "auto" || theme === "dark" ? theme : "light");
  if (!el.classList.contains("np-root")) el.classList.add("np-root");
  const vars = appearanceVars(appearance, prefersDark);
  for (const name of MANAGED) {
    const v = vars[name];
    if (v === undefined) el.style.removeProperty(name);
    else el.style.setProperty(name, v);
  }
}
