import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "../cx.js";
import { CheckIcon, ClockIcon, InfoIcon, WarningIcon } from "../icons/index.js";
import { formatMoneyParts, type MoneyFormatOptions } from "../money.js";

/* ------------------------------------------------------------------------------------------ */
/* Card                                                                                         */
/* ------------------------------------------------------------------------------------------ */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `md` = 24 px (default), `sm` = 16 px, `none` = 0 (tables, media). */
  padding?: "none" | "sm" | "md";
  as?: "div" | "section" | "article" | "aside";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = "md", as: Tag = "div", className, ...rest },
  ref,
) {
  return <Tag ref={ref} className={cx("np-card", `np-card--pad-${padding}`, className)} {...rest} />;
});

export function CardTitle({
  children,
  as: Tag = "h2",
  className,
}: {
  children: ReactNode;
  as?: "h2" | "h3" | "h4";
  className?: string;
}) {
  return <Tag className={cx("np-card__title", className)}>{children}</Tag>;
}

/* ------------------------------------------------------------------------------------------ */
/* Callout                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export type Tone = "info" | "warning" | "success" | "danger" | "neutral";

export interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** `info` (soft mint), `warning` (warm cream), `success`, `danger`, `neutral`. */
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  /** Reference line, e.g. "Reference NP-10482 · Acme Studio". */
  reference?: ReactNode;
  /** Show the tone icon. Default false (the Figma callouts are text-only). */
  icon?: boolean;
  /** Announce politely when the callout appears or changes (status updates). */
  live?: boolean;
}

const TONE_ICON = { info: InfoIcon, warning: WarningIcon, success: CheckIcon, danger: WarningIcon, neutral: InfoIcon };

export function Callout({
  tone = "info",
  title,
  children,
  reference,
  icon = false,
  live,
  className,
  ...rest
}: CalloutProps) {
  const Icon = TONE_ICON[tone];
  return (
    <div
      className={cx("np-callout", `np-callout--${tone}`, icon && "np-callout--icon", className)}
      role={live ? "status" : undefined}
      {...rest}
    >
      {icon ? <Icon size={20} className="np-callout__icon" /> : null}
      <div className="np-callout__content">
        <p className="np-callout__title">{title}</p>
        {children ? <div className="np-callout__body">{children}</div> : null}
        {reference ? <p className="np-callout__reference">{reference}</p> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* StatusBadge                                                                                  */
/* ------------------------------------------------------------------------------------------ */

/**
 * Status vocabulary → tone. Labels are always shown as text (never colour alone).
 * Payment: Paid, Confirming, Payment detected, Pending, Review, Under review, Failed, Not paid,
 * Not submitted, Return pending, Returned, Expired. Objects: Active, Cooling off, Open, Past due,
 * Draft, Revoked. Modes: Live, Test.
 */
export const STATUS_TONES: Readonly<Record<string, Tone>> = {
  paid: "success",
  succeeded: "success",
  complete: "success",
  completed: "success",
  active: "success",
  live: "success",
  connected: "success",
  matched: "success",
  delivered: "success",
  ready: "success",
  verified: "success",
  reviewed: "success",
  confirming: "warning",
  "payment detected": "warning",
  pending: "warning",
  review: "warning",
  "under review": "warning",
  "pending review": "warning",
  "awaiting approval": "warning",
  "cooling off": "warning",
  open: "warning",
  "past due": "warning",
  test: "warning",
  "not paid": "warning",
  "not submitted": "warning",
  "return pending": "warning",
  "action needed": "warning",
  failed: "danger",
  expired: "danger",
  blocked: "danger",
  rejected: "danger",
  returned: "neutral",
  refunded: "neutral",
  draft: "neutral",
  revoked: "neutral",
  disabled: "neutral",
  canceled: "neutral",
};

export function statusTone(label: string): Tone {
  return STATUS_TONES[label.trim().toLowerCase()] ?? "neutral";
}

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Visible label, e.g. "Paid". */
  children: string;
  /** Override the tone derived from the label. */
  tone?: Tone;
}

export function StatusBadge({ children, tone, className, ...rest }: StatusBadgeProps) {
  const t = tone ?? statusTone(children);
  return (
    <span className={cx("np-badge", `np-badge--${t}`, className)} {...rest}>
      {children}
    </span>
  );
}

/** Live / Test mode pill (top bar, checkout). */
export function ModePill({ mode, className }: { mode: "live" | "test"; className?: string }) {
  return (
    <StatusBadge tone={mode === "live" ? "success" : "warning"} className={cx("np-mode-pill", className)}>
      {mode === "live" ? "Live" : "Test"}
    </StatusBadge>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Money                                                                                        */
/* ------------------------------------------------------------------------------------------ */

export interface MoneyProps extends MoneyFormatOptions {
  className?: string;
  /** Visual size: inherit (default), `stat` (32 px), `hero` (checkout amount). */
  size?: "inherit" | "stat" | "hero";
}

/** Formatted, tabular amount from base units (bigint or integer string). */
export function Money({ className, size = "inherit", ...opts }: MoneyProps) {
  const p = formatMoneyParts(opts);
  const number = p.fraction ? `${p.integer}.${p.fraction}` : p.integer;
  return (
    <span
      className={cx(
        "np-money",
        size !== "inherit" && `np-money--${size}`,
        p.negative && "np-money--negative",
        className,
      )}
      data-rounded={p.rounded || undefined}
    >
      {p.sign}
      {p.symbol && p.symbolPosition === "prefix" ? p.symbol : null}
      {number}
      {p.symbol && p.symbolPosition === "suffix" ? (
        <>
          {" "}
          <span className="np-money__symbol">{p.symbol}</span>
        </>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Stat                                                                                         */
/* ------------------------------------------------------------------------------------------ */

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** Sub-label under the value ("Paid", "2 reviews · 1 delayed"). */
  sub?: ReactNode;
  /** Colours the sub-label for deltas ("+12.4% vs previous week"). Text must still state direction. */
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export function Stat({ label, value, sub, trend = "neutral", className }: StatProps) {
  return (
    <div className={cx("np-stat", className)}>
      <dt className="np-stat__label">{label}</dt>
      <dd className="np-stat__value">{value}</dd>
      {sub ? <dd className={cx("np-stat__sub", trend !== "neutral" && `np-stat__sub--${trend}`)}>{sub}</dd> : null}
    </div>
  );
}

/** Row of stats (renders a `<dl>` grid). */
export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cx("np-stat-group", className)}>{children}</dl>;
}

/* ------------------------------------------------------------------------------------------ */
/* KeyValue                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  /** Total row: divider above, emphasised value. */
  total?: boolean;
}

export interface KeyValueListProps {
  items: readonly KeyValueItem[];
  /** `inline` = label left, value right (default). `stacked` = label above value. */
  layout?: "inline" | "stacked";
  className?: string;
}

/** Purchase / Payment fees / Total to send. Gross, payer fees and settlement stay separate rows. */
export function KeyValueList({ items, layout = "inline", className }: KeyValueListProps) {
  return (
    <dl className={cx("np-kv", `np-kv--${layout}`, className)}>
      {items.map((it, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static presentational list
        <div key={i} className={cx("np-kv__row", it.total && "np-kv__row--total")}>
          <dt className="np-kv__label">{it.label}</dt>
          <dd className="np-kv__value">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Skeleton                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export interface SkeletonProps {
  shape?: "text" | "title" | "stat" | "block" | "circle";
  width?: "25" | "50" | "75" | "100";
  className?: string;
}

/** Loading placeholder. Decorative — pair with a status message (e.g. `aria-busy` on the region). */
export function Skeleton({ shape = "text", width = "100", className }: SkeletonProps) {
  return (
    <span
      className={cx("np-skeleton", `np-skeleton--${shape}`, `np-skeleton--w${width}`, className)}
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* EmptyState                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** Small print under the action ("Test mode · no real funds move"). */
  footnote?: ReactNode;
  /** Wrap in a bordered card (default true). */
  framed?: boolean;
  headingLevel?: 2 | 3;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  footnote,
  framed = true,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cx("np-empty", framed && "np-empty--framed", className)}>
      {icon ? <div className="np-empty__icon">{icon}</div> : null}
      <H className="np-empty__title">{title}</H>
      {children ? <div className="np-empty__body">{children}</div> : null}
      {action ? <div className="np-empty__action">{action}</div> : null}
      {footnote ? <p className="np-empty__footnote">{footnote}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Timeline / ActivityList                                                                      */
/* ------------------------------------------------------------------------------------------ */

export interface TimelineItem {
  id: string;
  /** Display time ("10:42:18"); `dateTime` is the machine-readable ISO value. */
  time: string;
  dateTime?: string;
  title: ReactNode;
  body?: ReactNode;
  /** `done` (check), `pending` (clock), `attention` (warning), `info` (dot). */
  state?: "done" | "pending" | "attention" | "info";
}

const STATE_LABEL = { done: "Completed", pending: "In progress", attention: "Needs attention", info: "Event" };

export function Timeline({
  items,
  label = "Payment activity",
  className,
}: {
  items: readonly TimelineItem[];
  label?: string;
  className?: string;
}) {
  return (
    <ol className={cx("np-timeline", className)} aria-label={label}>
      {items.map((it) => {
        const state = it.state ?? "done";
        return (
          <li key={it.id} className={cx("np-timeline__item", `np-timeline__item--${state}`)}>
            <span className="np-timeline__marker">
              {state === "done" ? (
                <CheckIcon size={16} />
              ) : state === "pending" ? (
                <ClockIcon size={16} />
              ) : state === "attention" ? (
                <WarningIcon size={16} />
              ) : (
                <span className="np-timeline__dot" />
              )}
              <span className="np-sr-only">{STATE_LABEL[state]}: </span>
            </span>
            <div className="np-timeline__content">
              <p className="np-timeline__title">
                <time className="np-tabular" dateTime={it.dateTime}>
                  {it.time}
                </time>
                <span aria-hidden="true"> · </span>
                <span className="np-sr-only">, </span>
                {it.title}
              </p>
              {it.body ? <p className="np-timeline__body">{it.body}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Steps / Checklist                                                                            */
/* ------------------------------------------------------------------------------------------ */

export interface StepItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  status: "complete" | "current" | "upcoming";
  /** Action for current/upcoming steps (a Button). Complete steps show a "Complete" tag. */
  action?: ReactNode;
}

const STEP_STATUS = { complete: "Complete", current: "Current step", upcoming: "Not started" };

/** Onboarding checklist (01–04). Numbers are zero-padded; status is stated in text. */
export function Steps({
  items,
  label = "Setup steps",
  className,
}: {
  items: readonly StepItem[];
  label?: string;
  className?: string;
}) {
  return (
    <ol className={cx("np-steps", className)} aria-label={label}>
      {items.map((it, i) => (
        <li
          key={it.id}
          className={cx("np-steps__item", `np-steps__item--${it.status}`)}
          aria-current={it.status === "current" ? "step" : undefined}
        >
          <div className="np-steps__text">
            <p className="np-steps__title">
              <span className="np-steps__number np-tabular">{String(i + 1).padStart(2, "0")}</span>
              {it.title}
              <span className="np-sr-only"> — {STEP_STATUS[it.status]}</span>
            </p>
            {it.description ? <p className="np-steps__description">{it.description}</p> : null}
          </div>
          <div className="np-steps__action">
            {it.status === "complete" ? (
              <span className="np-steps__done" aria-hidden="true">
                <CheckIcon size={16} />
                Complete
              </span>
            ) : (
              it.action
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
