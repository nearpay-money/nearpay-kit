import type { SVGProps } from "react";
import { MARK_DOT, MARK_ROUTES_PATH, MARK_VIEWBOX, type MarkVariant, markPaint } from "../brand.js";
import { cx } from "../cx.js";

export interface NearPayMarkProps extends Omit<SVGProps<SVGSVGElement>, "children" | "title"> {
  /**
   * `auto` (default) follows the surface: teal/violet on light, mint/light-violet under
   * `data-theme="dark"` or inside `.np-surface-navy`. `light`, `dark` (alias `onNavy`), `mono`
   * (currentColor) and `app-icon` (teal tile) are fixed.
   */
  variant?: MarkVariant | "auto";
  /** Pixel size (width = height). Default 24. */
  size?: number;
  /** Accessible name; without it the mark is decorative (`aria-hidden`). */
  title?: string;
  /** Force the ≤ 32 px weights (stroke 6, dot r 6). Default: on at `size` ≤ 20. */
  favicon?: boolean;
}

/**
 * The NearPay mark — "Convergence": routes from many chains meeting one settlement dot. Exact
 * geometry from the brand brief; colours are presentation attributes (CSP-safe), and the `auto`
 * variant is re-coloured by `.np-mark--auto` rules in styles.css.
 */
export function NearPayMark({ variant = "auto", size = 24, title, favicon, className, ...rest }: NearPayMarkProps) {
  const small = favicon ?? size <= 20;
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true as const };
  const cls = cx("np-mark", `np-mark--${variant}`, className);
  if (variant === "app-icon") {
    const p = markPaint("app-icon", small);
    const scale = small ? 0.72 : 0.625;
    const offset = (48 - 48 * scale) / 2;
    return (
      // biome-ignore lint/a11y/noSvgWithoutTitle: titled (role="img" + aria-label) when `title` is given, otherwise aria-hidden
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={MARK_VIEWBOX}
        width={size}
        height={size}
        focusable="false"
        className={cls}
        {...a11y}
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        <rect width="48" height="48" rx="12" fill={p.tile} />
        <g transform={`translate(${offset} ${offset}) scale(${scale})`}>
          <path d={MARK_ROUTES_PATH} fill="none" stroke={p.routes} strokeWidth={p.strokeWidth} strokeLinecap="round" />
          <circle cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={p.dotR} fill={p.dot} />
        </g>
      </svg>
    );
  }
  const paint = markPaint(variant === "auto" ? "light" : variant, small);
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: titled (role="img" + aria-label) when `title` is given, otherwise aria-hidden
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={MARK_VIEWBOX}
      width={size}
      height={size}
      focusable="false"
      className={cls}
      {...a11y}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path
        className="np-mark__routes"
        d={MARK_ROUTES_PATH}
        fill="none"
        stroke={paint.routes}
        strokeWidth={paint.strokeWidth}
        strokeLinecap="round"
      />
      <circle className="np-mark__dot" cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={paint.dotR} fill={paint.dot} />
    </svg>
  );
}

/** Lock-up sizes in px: wordmark font size, mark size, tracking (em) — from the approved artboards. */
export const LOGO_SIZES = {
  /** Sidebar, checkout footer: 19 / 26. */
  sm: { font: 19, mark: 26, tracking: -0.02 },
  /** Site header: 21 / 30. */
  md: { font: 21, mark: 30, tracking: -0.02 },
  /** Navy bands, auth pages: 30 / 40. */
  lg: { font: 30, mark: 40, tracking: -0.03 },
  /** Brand presentations: 64 / 88. */
  xl: { font: 64, mark: 88, tracking: -0.035 },
} as const;

export type LogoSize = keyof typeof LOGO_SIZES;

export interface NearPayLogoProps {
  /** `auto` (default: navy wordmark on light, white on dark/navy), `light`, `dark`/`onNavy`, `mono`. */
  variant?: "auto" | "light" | "dark" | "onNavy" | "mono";
  size?: LogoSize;
  /** Accessible name of the lock-up. Default "NearPay". Pass "" inside a link that has its own name. */
  label?: string;
  className?: string;
}

/**
 * Mark + "NearPay" wordmark (Instrument Sans 650, tracking −0.02…−0.035em by size). The wordmark
 * is live text in the package font; for a font-independent file use `logoSvg()` from
 * `@nearpay-internal/ui/brand` or `brand/logo-*.svg`.
 */
export function NearPayLogo({ variant = "auto", size = "sm", label = "NearPay", className }: NearPayLogoProps) {
  const s = LOGO_SIZES[size];
  const markVariant: NearPayMarkProps["variant"] = variant === "onNavy" ? "dark" : variant;
  // Labelled: one image named "NearPay". Unlabelled (label=""): the wordmark is read as plain text.
  const a11y = label ? { role: "img", "aria-label": label } : {};
  return (
    <span
      className={cx("np-logo", `np-logo--${size}`, `np-logo--${variant === "onNavy" ? "dark" : variant}`, className)}
      {...a11y}
    >
      <NearPayMark variant={markVariant} size={s.mark} className="np-logo__mark" favicon={false} />
      <span className="np-logo__word" aria-hidden={label ? true : undefined}>
        NearPay
      </span>
    </span>
  );
}
