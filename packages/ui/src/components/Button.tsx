import { type ButtonHTMLAttributes, forwardRef, type MouseEvent, type ReactNode } from "react";
import { cx } from "../cx.js";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "ghost" | "danger" | "on-navy" | "navy" | "mint";
export type ButtonSize = "lg" | "md" | "sm";

export interface ButtonStyleOptions {
  /**
   * - `primary` — teal, white label; one per view.
   * - `secondary` — white with an outline.
   * - `quiet` — no fill until hovered (`ghost` is the 0.4 name, kept as an alias).
   * - `danger` — destructive confirmations.
   * - `on-navy` — white button for navy surfaces (sidebar, order side, dark bands).
   * - `navy` — navy fill, white label (marketing header CTA on white).
   * - `mint` — mint fill, navy label: the primary action on navy surfaces.
   */
  variant?: ButtonVariant;
  /** `lg` = 56 px (checkout pay, marketing hero), `md` = 48 px touch control (default), `sm` = 40 px dense. */
  size?: ButtonSize;
  /** Fully rounded (marketing pages). */
  pill?: boolean;
  fullWidth?: boolean;
}

/** Class names for a button look — use on `<a>` elements that navigate. */
export function buttonClassName(
  { variant = "primary", size = "md", pill, fullWidth }: ButtonStyleOptions = {},
  extra?: string,
) {
  return cx(
    "np-button",
    `np-button--${variant === "ghost" ? "quiet" : variant}`,
    variant === "ghost" && "np-button--ghost",
    size !== "md" && `np-button--${size}`,
    pill && "np-button--pill",
    fullWidth && "np-button--full",
    extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleOptions {
  /** Shows a spinner and `loadingText`; the button stays focusable but inert (`aria-disabled`). */
  loading?: boolean;
  /** Label while loading. Default "Processing…". */
  loadingText?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("np-spinner", className)} aria-hidden="true" />;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    pill,
    fullWidth,
    loading = false,
    loadingText = "Processing…",
    leadingIcon,
    trailingIcon,
    className,
    children,
    type = "button",
    onClick,
    ...rest
  },
  ref,
) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (loading || rest["aria-disabled"] === true || rest["aria-disabled"] === "true") {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={buttonClassName({ variant, size, pill, fullWidth }, cx(loading && "np-button--loading", className))}
      aria-busy={loading || undefined}
      aria-disabled={loading || rest["aria-disabled"] || undefined}
      onClick={handleClick}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{loadingText}</span>
        </>
      ) : (
        <>
          {leadingIcon}
          {children != null && <span>{children}</span>}
          {trailingIcon}
        </>
      )}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible name (required — the button shows only an icon). */
  label: string;
  icon: ReactNode;
  /** `ghost` (default, quiet), `secondary` (outlined) or `on-navy` (quiet, on navy surfaces). */
  variant?: "ghost" | "secondary" | "on-navy";
  size?: ButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "ghost", size = "md", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx("np-icon-button", `np-icon-button--${variant}`, size === "sm" && "np-icon-button--sm", className)}
      {...rest}
    >
      {icon}
    </button>
  );
});
