import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import { cx } from "../cx.js";

/* ------------------------------------------------------------------------------------------ */
/* Tabs                                                                                         */
/* ------------------------------------------------------------------------------------------ */

export interface TabItem {
  id: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Panel content for the selected tab. */
  children?: ReactNode;
  className?: string;
}

function rovingKeys<T extends { id: string; disabled?: boolean }>(
  e: KeyboardEvent,
  items: readonly T[],
  current: string,
  select: (id: string) => void,
) {
  const enabled = items.filter((i) => !i.disabled);
  const idx = enabled.findIndex((i) => i.id === current);
  let next: T | undefined;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") next = enabled[(idx + 1) % enabled.length];
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = enabled[(idx - 1 + enabled.length) % enabled.length];
  else if (e.key === "Home") next = enabled[0];
  else if (e.key === "End") next = enabled[enabled.length - 1];
  if (!next) return;
  e.preventDefault();
  select(next.id);
  return next.id;
}

/** Tabs with automatic activation and roving focus (WAI-ARIA tabs pattern). */
export function Tabs({ items, value, onChange, label, children, className }: TabsProps) {
  const auto = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const tabId = (id: string) => `np-t${auto}-${id}`;
  const panelId = `np-t${auto}-panel`;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const id = rovingKeys(e, items, value, onChange);
    if (id) listRef.current?.ownerDocument.getElementById(tabId(id))?.focus();
  };
  return (
    <div className={cx("np-tabs", className)}>
      <div ref={listRef} role="tablist" aria-label={label} className="np-tabs__list" onKeyDown={onKeyDown}>
        {items.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              id={tabId(t.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              className={cx("np-tabs__tab", selected && "np-tabs__tab--selected")}
              onClick={() => onChange(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {children !== undefined ? (
        <div role="tabpanel" id={panelId} aria-labelledby={tabId(value)} className="np-tabs__panel">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* SegmentedControl                                                                             */
/* ------------------------------------------------------------------------------------------ */

export interface SegmentedControlProps {
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  size?: "md" | "sm";
  className?: string;
}

/** Compact single-choice control (radiogroup) for view filters, e.g. Live / Test, 7d / 30d. */
export function SegmentedControl({ items, value, onChange, label, size = "md", className }: SegmentedControlProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const id = rovingKeys(e, items, value, onChange);
    if (!id || !ref.current) return;
    for (const el of Array.from(ref.current.children)) {
      if (el instanceof HTMLElement && el.dataset.id === id) el.focus();
    }
  };
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={cx("np-segmented", size === "sm" && "np-segmented--sm", className)}
      onKeyDown={onKeyDown}
    >
      {items.map((t) => {
        const checked = t.id === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a styled radio button group with roving focus
          <button
            key={t.id}
            type="button"
            role="radio"
            data-id={t.id}
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={t.disabled}
            className={cx("np-segmented__item", checked && "np-segmented__item--selected")}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Breadcrumb                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
}

/** "Acme Studio / Payments". The last item is the current page. */
export function Breadcrumb({ items, className }: { items: readonly BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cx("np-breadcrumb", className)}>
      <ol className="np-breadcrumb__list">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: breadcrumb positions are stable
            <li key={i} className="np-breadcrumb__item">
              {last || !it.href ? (
                <span aria-current={last ? "page" : undefined}>{it.label}</span>
              ) : (
                <a href={it.href} className="np-breadcrumb__link">
                  {it.label}
                </a>
              )}
              {last ? null : (
                <span className="np-breadcrumb__sep" aria-hidden="true">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* PageHeader                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Status next to the title (e.g. a StatusBadge on detail pages). */
  status?: ReactNode;
  /** Right-aligned actions — at most one primary. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, status, actions, className }: PageHeaderProps) {
  return (
    <header className={cx("np-page-header", className)}>
      <div className="np-page-header__text">
        {status ? <div className="np-page-header__status">{status}</div> : null}
        <h1 className="np-page-header__title">{title}</h1>
        {subtitle ? <p className="np-page-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="np-page-header__actions">{actions}</div> : null}
    </header>
  );
}
