import type { ReactNode } from "react";
import { cx } from "../cx.js";

/**
 * Route helpers for "How your payment travels": chips joined by a dashed arrow. Colours come from
 * tokens — violet on light surfaces, mint on navy (inside `.np-surface-navy`, e.g. the checkout
 * order side) — and the arrow is plain SVG with classes (no inline styles).
 */

export function RouteChip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("np-route__chip", className)}>{children}</span>;
}

/** Dashed arrow that stretches between chips (decorative): a flexible dashed line plus a fixed head. */
export function RouteArrow({ className }: { className?: string }) {
  return (
    <span className={cx("np-route__arrow", className)} aria-hidden="true">
      <svg
        className="np-route__line"
        viewBox="0 0 100 16"
        preserveAspectRatio="none"
        focusable="false"
        aria-hidden="true"
      >
        <path d="M0 8h100" />
      </svg>
      <svg className="np-route__head" viewBox="0 0 10 16" focusable="false" aria-hidden="true">
        <path d="M1.5 3l7 5-7 5" />
      </svg>
    </span>
  );
}

export interface RouteDiagramProps {
  /** Heading. Default "How your payment travels". */
  title?: ReactNode;
  /** Ordered stops, e.g. `["USDC on Base", "Acme's wallet"]` (two or more). */
  stops: readonly ReactNode[];
  /** Explanation under the route ("Routed by NEAR Intents straight to the merchant. NearPay never holds your funds."). */
  note?: ReactNode;
  className?: string;
}

/**
 * The route card: title, stops joined by dashed arrows, note. The stops are an ordered list, so
 * assistive technology reads them in sequence ("USDC on Base, then Acme's wallet").
 */
export function RouteDiagram({ title = "How your payment travels", stops, note, className }: RouteDiagramProps) {
  return (
    <section className={cx("np-route", className)} aria-label={typeof title === "string" ? title : undefined}>
      <p className="np-route__title">{title}</p>
      <ol className="np-route__path">
        {stops.map((stop, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stops are positional
          <li key={i} className="np-route__stop">
            {i > 0 ? <RouteArrow /> : null}
            <RouteChip>{stop}</RouteChip>
          </li>
        ))}
      </ol>
      {note ? <p className="np-route__note">{note}</p> : null}
    </section>
  );
}
