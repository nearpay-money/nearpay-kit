import { type ButtonHTMLAttributes, forwardRef, type MouseEvent, type ReactNode } from "react";
import { cx } from "../cx.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "mint";
export type ButtonSize = "md" | "sm";

export interface ButtonStyleOptions {
  /** `primary` (one per view), `secondary`, `ghost` (quiet), `danger`, `mint` (primary on dark surfaces). */
  variant?: ButtonVariant;
  /** `md` = 48 px touch control (default); `sm` = 40 px dense desktop control. */
  size?: ButtonSize;
  fullWidth?: boolean;
}

/** Class names for a button look — use on `<a>` elements that navigate. */
export function buttonClassName(
  { variant = "primary", size = "md", fullWidth }: ButtonStyleOptions = {},
  extra?: string,
) {
  return cx(
    "np-button",
    `np-button--${variant}`,
    size === "sm" && "np-button--sm",
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
      className={buttonClassName({ variant, size, fullWidth }, cx(loading && "np-button--loading", className))}
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
  variant?: "ghost" | "secondary";
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
