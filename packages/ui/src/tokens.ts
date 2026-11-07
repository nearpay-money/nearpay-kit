/**
 * Design tokens — typed mirror of `tokens.css` (a test keeps the two in sync).
 *
 * Values were sampled from the owner's Figma ("NearPay — Payments Product Design"); see
 * `nearpay-brain/product/design-system.md` for the rationale behind each token.
 */

/** Brand primitives. Prefer the semantic `color` tokens in components. */
export const palette = {
  ink: "#132d31",
  inkDeep: "#102c30",
  teal: "#087a68",
  tealHover: "#065e52",
  tealPressed: "#054c43",
  mint: "#65dfc0",
  mintHover: "#85e8cf",
  mintSoft: "#eaf5f1",
  canvas: "#f7f9f8",
  borderFine: "#dce5e3",
  white: "#ffffff",
} as const;

export type ThemeName = "light" | "dark";
export type ThemeSetting = ThemeName | "auto";

export interface ColorTokens {
  /** App background (warm canvas / deep ink). */
  bg: string;
  /** Cards, inputs, tables. */
  surface: string;
  /** Table headers, sidebar, disabled controls. */
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  /** Fine borders: cards, dividers, table rules (decorative). */
  border: string;
  /** Form-control borders: ≥ 3:1 against surface (WCAG 1.4.11). */
  borderControl: string;
  accent: string;
  accentHover: string;
  accentPressed: string;
  onAccent: string;
  /** Accent used as text/icon on `surface` (links, checks, active nav). */
  accentText: string;
  /** Soft mint: info callouts, active nav, avatars. */
  accentSubtle: string;
  accentSubtleText: string;
  focus: string;
  successBg: string;
  successFg: string;
  warningBg: string;
  warningFg: string;
  dangerBg: string;
  dangerFg: string;
  neutralBg: string;
  neutralFg: string;
  /** Toasts. */
  inverseBg: string;
  inverseText: string;
  skeleton: string;
}

export const color: Record<ThemeName, ColorTokens> = {
  light: {
    bg: "#f7f9f8",
    surface: "#ffffff",
    surfaceMuted: "#f7f9f8",
    text: "#132d31",
    textSecondary: "#52676b",
    border: "#dce5e3",
    borderControl: "#7f928f",
    accent: "#087a68",
    accentHover: "#065e52",
    accentPressed: "#054c43",
    onAccent: "#ffffff",
    accentText: "#087a68",
    accentSubtle: "#eaf5f1",
    accentSubtleText: "#087a68",
    focus: "#087a68",
    successBg: "#eaf6ee",
    successFg: "#17744d",
    warningBg: "#fff5e4",
    warningFg: "#895710",
    dangerBg: "#fceef0",
    dangerFg: "#b44048",
    neutralBg: "#eef2f1",
    neutralFg: "#52676b",
    inverseBg: "#132d31",
    inverseText: "#ffffff",
    skeleton: "#e9efed",
  },
  dark: {
    bg: "#102c30",
    surface: "#193a3f",
    surfaceMuted: "#143236",
    text: "#ffffff",
    textSecondary: "#a9c0be",
    border: "#2d4c50",
    borderControl: "#6e8c8a",
    accent: "#65dfc0",
    accentHover: "#85e8cf",
    accentPressed: "#4fd3b2",
    onAccent: "#102c30",
    accentText: "#65dfc0",
    accentSubtle: "#1e4c45",
    accentSubtleText: "#65dfc0",
    focus: "#65dfc0",
    successBg: "#173f37",
    successFg: "#7fe0b5",
    warningBg: "#3d3320",
    warningFg: "#f2c879",
    dangerBg: "#45262b",
    dangerFg: "#ff9aa2",
    neutralBg: "#24434a",
    neutralFg: "#b3cac8",
    inverseBg: "#ffffff",
    inverseText: "#132d31",
    skeleton: "#24434a",
  },
};

/** Type scale (px). Headings are tight; body uses a generous line height. */
export const fontSize = {
  display: 64,
  h1: 48,
  h2: 32,
  h3: 24,
  h4: 20,
  body: 16,
  small: 14,
  caption: 12,
  /** Checkout amount hero (sampled from the Figma; sits between h1 and h2). */
  amount: 42,
} as const;

export const fontWeight = { regular: 400, medium: 500, semibold: 600 } as const;

export const lineHeight = { tight: 1.1, heading: 1.25, body: 1.5 } as const;

/** Letter-spacing (em): tight headings, tighter amount hero. */
export const tracking = { display: -0.02, heading: -0.015, amount: -0.03 } as const;

export const fontFamily = {
  sans: '"DM Sans Variable", "DM Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const;

/** 4/8 px grid. */
export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const size = {
  /** Touch controls (buttons). */
  control: 48,
  /** Dense desktop controls where the Figma shows them. */
  controlDense: 40,
  /** Text fields, selects, search. */
  field: 56,
  gutterMobile: 24,
  gutterWorkspace: 48,
  sidebar: 224,
  topbar: 72,
} as const;

export const radius = {
  /** Default control radius; the embedded checkout lets merchants pick 0–24. */
  control: 8,
  card: 12,
  badge: 4,
} as const;

export const motion = { fast: 120, base: 200 } as const;

/** Every token, for documentation tooling. */
export const tokens = {
  palette,
  color,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
  fontFamily,
  space,
  size,
  radius,
  motion,
} as const;
