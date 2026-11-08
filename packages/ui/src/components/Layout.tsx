import { type ReactNode, useId } from "react";
import { cx } from "../cx.js";

export interface PageLayoutProps {
  /** Usually a `<PageHeader>` (with an optional `<FilterBar>` under it). */
  header?: ReactNode;
  children: ReactNode;
  /** `default` 1120 px, `narrow` 720 px (forms, settings), `full`. */
  width?: "default" | "narrow" | "full";
  className?: string;
}

/** Page content column inside `AppShell`: header, then sections 32 px apart. */
export function PageLayout({ header, children, width = "default", className }: PageLayoutProps) {
  return (
    <div className={cx("np-page", `np-page--${width}`, className)}>
      {header ? <div className="np-page__header">{header}</div> : null}
      <div className="np-page__body">{children}</div>
    </div>
  );
}

export interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions next to the title. */
  actions?: ReactNode;
  children?: ReactNode;
  headingLevel?: 2 | 3;
  /** Divider above the section. */
  divided?: boolean;
  id?: string;
  className?: string;
}

/** A titled page section (`<section aria-labelledby>`). */
export function Section({
  title,
  description,
  actions,
  children,
  headingLevel = 2,
  divided = false,
  id,
  className,
}: SectionProps) {
  const auto = useId();
  const titleId = `np-sec${auto}`;
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      id={id}
      aria-labelledby={title ? titleId : undefined}
      className={cx("np-section", divided && "np-section--divided", className)}
    >
      {title || actions ? (
        <div className="np-section__header">
          <div className="np-section__text">
            {title ? (
              <H id={titleId} className={cx("np-section__title", headingLevel === 3 && "np-section__title--sm")}>
                {title}
              </H>
            ) : null}
            {description ? <p className="np-section__description">{description}</p> : null}
          </div>
          {actions ? <div className="np-section__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface TwoColumnLayoutProps {
  /** Main column (a form, an activity list). */
  children: ReactNode;
  /** Side panel (summary card, help, preview). */
  aside: ReactNode;
  /** Accessible name of the side panel (makes it a labelled `<aside>`). */
  asideLabel?: string;
  /** Keep the side panel in view while the main column scrolls (wide layouts only). */
  stickyAside?: boolean;
  className?: string;
}

/**
 * Form + side panel. Side by side when the layout itself is ≥ 880 px wide (container query on
 * the outer element, so it works inside any column); stacked, panel last, below that.
 */
export function TwoColumnLayout({ children, aside, asideLabel, stickyAside = false, className }: TwoColumnLayoutProps) {
  return (
    <div className={cx("np-two-col", stickyAside && "np-two-col--sticky", className)}>
      <div className="np-two-col__grid">
        <div className="np-two-col__main">{children}</div>
        <aside className="np-two-col__aside" aria-label={asideLabel}>
          {aside}
        </aside>
      </div>
    </div>
  );
}
