import { type HTMLAttributes, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Appearance, applyAppearance } from "../appearance.js";
import { cx } from "../cx.js";

export interface ThemeRootProps extends HTMLAttributes<HTMLDivElement>, Appearance {}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function usePrefersDark(enabled: boolean): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [enabled]);
  return dark;
}

/**
 * Theme root: `class="np-root"`, `data-theme`, and runtime appearance overrides (merchant accent,
 * radius) applied through the CSSOM — never as an inline `style` attribute (checkout CSP).
 */
export function ThemeRoot({ theme = "light", accent, radius, className, children, ...rest }: ThemeRootProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersDark = usePrefersDark(theme === "auto" && accent !== undefined);
  useIsoLayoutEffect(() => {
    if (ref.current) applyAppearance(ref.current, { theme, accent, radius }, prefersDark);
  }, [theme, accent, radius, prefersDark]);
  return (
    <div ref={ref} className={cx("np-root", className)} data-theme={theme} {...rest}>
      {children}
    </div>
  );
}
