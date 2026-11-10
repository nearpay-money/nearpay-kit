/**
 * Design tokens — typed mirror of `tokens.css` (a test keeps the two in sync).
 *
 * v2 (0.5.0): the owner-approved "Convergence" identity — navy surfaces, teal actions, violet for
 * routes and focus, mint as an accent on navy only, Instrument Sans. Rationale and copy rules:
 * `nearpay-brain/product/design-system.md`.
 */

/** Brand primitives. Prefer the semantic `color` tokens in components. */
export const palette = {
  /** Navy — dark surfaces and primary text. */
  ink: "#12263f",
  /** Deeper navy: code blocks, text on mint. */
  inkDeep: "#0f2136",
  /** Primary actions (white label), links. */
  teal: "#007a68",
  tealHover: "#005c4f",
  tealPressed: "#004a40",
  /** Brand teal for marks on light surfaces (not for text). */
  tealBrand: "#00a38c",
  /** Accent on navy only — never text on white. */
  mint: "#8ef0d3",
  mintHover: "#b0f5e1",
  /** Soft mint: verified / info callouts on light. */
  mintSoft: "#e3f7f1",
  /** Routes, cross-chain accents and the focus ring only (never buttons). */
  violet: "#5b5bd6",
  /** Violet on navy. */
  violetOnNavy: "#b4b4ff",
  canvas: "#f3f6f9",
  subtle: "#f5f8fb",
  borderFine: "#e1e7ee",
  /** Secondary-button / picker-card outline (labelled controls; decorative contrast). */
  borderOutline: "#c9d3de",
  white: "#ffffff",
  /** Navy surface family (sidebar, hero panel, checkout order side, dark bands). */
  navy: "#12263f",
  navyRaised: "#1a3150",
  navyChip: "#1d3653",
  navyBorder: "#2e4b6c",
  navyActive: "#24405f",
  /** Text on navy. */
  onNavy: "#ffffff",
  onNavySecondary: "#c7d5e4",
  onNavyMuted: "#a9bbcf",
  /** Route chip label on navy. */
  onNavyChip: "#e6eef6",
} as const;

export type ThemeName = "light" | "dark";
export type ThemeSetting = ThemeName | "auto";

export interface ColorTokens {
  /** App background (canvas / deepest navy). */
  bg: string;
  /** Cards, inputs, tables. */
  surface: string;
  /** Table headers, quiet panels, disabled controls. */
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  /** Captions, placeholders, table headers (still ≥ 4.5:1). */
  textTertiary: string;
  /** Fine borders: cards, dividers (decorative). */
  border: string;
  /** Hairlines between table rows (decorative). */
  borderSubtle: string;
  /** Outline of labelled controls: secondary buttons, picker cards (decorative; the label identifies them). */
  borderOutline: string;
  /** Text-field / checkbox borders: ≥ 3:1 against surface and bg (WCAG 1.4.11). */
  borderControl: string;
  accent: string;
  accentHover: string;
  accentPressed: string;
  onAccent: string;
  /** Accent used as text/icon on `surface` (links, checks). */
  accentText: string;
  /** Soft mint: verified / info callouts, selected rows. */
  accentSubtle: string;
  accentSubtleText: string;
  /** Focus ring (violet). */
  focus: string;
  /** Routes and cross-chain accents (violet): route lines, chips, the settlement dot. */
  route: string;
  successBg: string;
  successFg: string;
  /** "Confirming" / in-progress pill (violet pair). */
  infoBg: string;
  infoFg: string;
  warningBg: string;
  warningFg: string;
  /** Cream warning callout / KPI background. */
  warningSubtle: string;
  /** Emphasised text on `warningSubtle` (KPI value). */
  warningStrong: string;
  dangerBg: string;
  dangerFg: string;
  neutralBg: string;
  neutralFg: string;
  /** Toasts. */
  inverseBg: string;
  inverseText: string;
  skeleton: string;
  /** Navy surfaces (sidebar, order side, hero panel, dark bands). */
  navy: string;
  navyRaised: string;
  navyBorder: string;
  /** Current nav item on navy. */
  navyActive: string;
  onNavy: string;
  onNavySecondary: string;
  onNavyMuted: string;
  /** Mint accent on navy (route arrows, marks, positive values). */
  onNavyAccent: string;
  /** Violet on navy (settlement dot, focus on navy). */
  onNavyRoute: string;
}

export const color: Record<ThemeName, ColorTokens> = {
  light: {
    bg: "#f3f6f9",
    surface: "#ffffff",
    surfaceMuted: "#f7f9fb",
    text: "#12263f",
    textSecondary: "#4a5b70",
    textTertiary: "#5a6b80",
    border: "#e1e7ee",
    borderSubtle: "#edf1f5",
    borderOutline: "#c9d3de",
    borderControl: "#7a8ca2",
    accent: "#007a68",
    accentHover: "#005c4f",
    accentPressed: "#004a40",
    onAccent: "#ffffff",
    accentText: "#007a68",
    accentSubtle: "#e3f7f1",
    accentSubtleText: "#00594c",
    focus: "#5b5bd6",
    route: "#5b5bd6",
    successBg: "#ddf7ef",
    successFg: "#00594c",
    infoBg: "#ececfd",
    infoFg: "#3b3ba8",
    warningBg: "#fff1d6",
    warningFg: "#7a4b00",
    warningSubtle: "#fff7e6",
    warningStrong: "#5c3900",
    dangerBg: "#fdecea",
    dangerFg: "#b42318",
    neutralBg: "#edf1f5",
    neutralFg: "#4a5b70",
    inverseBg: "#12263f",
    inverseText: "#ffffff",
    skeleton: "#e7ecf2",
    navy: "#12263f",
    navyRaised: "#1a3150",
    navyBorder: "#2e4b6c",
    navyActive: "#24405f",
    onNavy: "#ffffff",
    onNavySecondary: "#c7d5e4",
    onNavyMuted: "#a9bbcf",
    onNavyAccent: "#8ef0d3",
    onNavyRoute: "#b4b4ff",
  },
  dark: {
    bg: "#0b1a2c",
    surface: "#12263f",
    surfaceMuted: "#0f2136",
    text: "#ffffff",
    textSecondary: "#c7d5e4",
    textTertiary: "#a9bbcf",
    border: "#2e4b6c",
    borderSubtle: "#223a57",
    borderOutline: "#3d5b7e",
    borderControl: "#7189a6",
    accent: "#8ef0d3",
    accentHover: "#b0f5e1",
    accentPressed: "#6fe3c1",
    onAccent: "#12263f",
    accentText: "#8ef0d3",
    accentSubtle: "#17384a",
    accentSubtleText: "#8ef0d3",
    focus: "#b4b4ff",
    route: "#b4b4ff",
    successBg: "#133b3d",
    successFg: "#8ef0d3",
    infoBg: "#272c5e",
    infoFg: "#c4c4ff",
    warningBg: "#3a2f1c",
    warningFg: "#ffd58a",
    warningSubtle: "#2e2716",
    warningStrong: "#ffe3b0",
    dangerBg: "#45222a",
    dangerFg: "#ffadad",
    neutralBg: "#24405f",
    neutralFg: "#c7d5e4",
    inverseBg: "#ffffff",
    inverseText: "#12263f",
    skeleton: "#24405f",
    navy: "#0f2136",
    navyRaised: "#1a3150",
    navyBorder: "#2e4b6c",
    navyActive: "#24405f",
    onNavy: "#ffffff",
    onNavySecondary: "#c7d5e4",
    onNavyMuted: "#a9bbcf",
    onNavyAccent: "#8ef0d3",
    onNavyRoute: "#b4b4ff",
  },
};

/**
 * Chart series colours, in fixed order (`--np-chart-1…4`): teal, violet, slate, amber. Each is
 * ≥ 3:1 against the surface; series are never told apart by colour alone (legend + table).
 */
export const chart: Record<ThemeName, readonly [string, string, string, string]> = {
  light: ["#007a68", "#5b5bd6", "#74879e", "#a35f00"],
  dark: ["#8ef0d3", "#b4b4ff", "#9fb3c8", "#ffb86b"],
};

/** Type scale (px). Headings are tight; body uses a generous line height. */
export const fontSize = {
  /** Landing hero headline. */
  display: 76,
  h1: 48,
  h2: 34,
  h3: 24,
  h4: 18,
  body: 16,
  small: 14,
  caption: 13,
  /** Screen titles in the checkout flow ("Pay with"). */
  title: 30,
  /** KPI / stat figures. */
  stat: 32,
  /** Checkout amount (mobile / single column). */
  amount: 48,
  /** Checkout amount on the navy order side. */
  amountHero: 80,
} as const;

/** Instrument Sans is variable (400–700): 650 is the heading / wordmark weight. */
export const fontWeight = { regular: 400, medium: 500, semibold: 600, strong: 650, bold: 700 } as const;

export const lineHeight = { tight: 1.02, heading: 1.2, body: 1.55 } as const;

/** Letter-spacing (em): headings tighten with size (−0.02 … −0.045). */
export const tracking = { display: -0.045, heading: -0.03, amount: -0.045, title: -0.01 } as const;

export const fontFamily = {
  sans: '"Instrument Sans Variable", "Instrument Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace',
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
  /** Dense desktop controls (dashboard actions, top bar). */
  controlDense: 40,
  /** Text fields, selects. */
  field: 52,
  gutterMobile: 24,
  gutterWorkspace: 40,
  sidebar: 248,
  topbar: 72,
} as const;

export const radius = {
  /** Default control radius; the embedded checkout lets merchants pick 0–24 (cards and pills follow). */
  control: 12,
  /** Cards (control × 4/3, max 24). */
  card: 16,
  /** Big panels: hero, checkout order side (control × 2, max 28). */
  panel: 24,
  /** Small radius: chips inside controls, skeletons, code. */
  badge: 6,
  /** Pills: status badges, marketing buttons, segmented control. */
  pill: 999,
} as const;

export const motion = { fast: 120, base: 200 } as const;

/** Focus ring: 3 px violet, offset 2 px. */
export const focusRing = { width: 3, offset: 2 } as const;

/** Elevation: shadows only on floating elements. */
export const shadow = {
  overlay: "0 1px 2px rgb(18 38 63 / 0.06), 0 16px 40px -12px rgb(18 38 63 / 0.22)",
  /** Floating card on navy (hero "Payment received" card). */
  onNavy: "0 30px 60px -20px rgb(4 14 26 / 0.6)",
} as const;

/** Every token, for documentation tooling. */
export const tokens = {
  palette,
  color,
  chart,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
  fontFamily,
  space,
  size,
  radius,
  motion,
  focusRing,
  shadow,
} as const;
