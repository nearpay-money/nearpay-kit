import type { ReactNode } from "react";
import { cx } from "../cx.js";
import { RefreshIcon, WarningIcon } from "../icons/index.js";
import { Button } from "./Button.js";
import { Callout, StatusBadge, type Tone } from "./Display.js";

/* ------------------------------------------------------------------------------------------ */
/* ErrorState                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export interface ErrorStateProps {
  /** Default "Something went wrong". Say what failed ("Payments couldn’t load"). */
  title?: ReactNode;
  /** What happened and what to do next. Never a raw error dump. */
  message?: ReactNode;
  /** Shows a retry button. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Retry in flight: the button shows a spinner and "Retrying…". */
  retrying?: boolean;
  /** Support reference, e.g. the request id (`<IdText …/>`). */
  reference?: ReactNode;
  icon?: ReactNode;
  /** Wrap in a bordered card (default true). */
  framed?: boolean;
  headingLevel?: 2 | 3;
  className?: string;
  "data-testid"?: string;
}

/** Load/action failure in place of content: title, message, optional retry. Announced as an alert. */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  reference,
  icon,
  framed = true,
  headingLevel = 2,
  className,
  "data-testid": testId,
}: ErrorStateProps) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div
      role="alert"
      className={cx("np-empty", "np-error-state", framed && "np-empty--framed", className)}
      data-testid={testId}
    >
      <div className="np-empty__icon np-error-state__icon">{icon ?? <WarningIcon />}</div>
      <H className="np-empty__title">{title}</H>
      {message ? <div className="np-empty__body">{message}</div> : null}
      {onRetry ? (
        <div className="np-empty__action">
          <Button
            variant="secondary"
            onClick={onRetry}
            loading={retrying}
            loadingText="Retrying…"
            leadingIcon={<RefreshIcon size={20} />}
          >
            {retryLabel}
          </Button>
        </div>
      ) : null}
      {reference ? <p className="np-empty__footnote">{reference}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* StateScreen                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export interface StateScreenCallout {
  tone?: Tone;
  title: ReactNode;
  body?: ReactNode;
  /** "Reference NP-10482 · Acme Studio". */
  reference?: ReactNode;
}

export interface StateScreenProps {
  icon?: ReactNode;
  /** Icon colour. Default `info` (accent). */
  tone?: Tone;
  title: ReactNode;
  /** Lede under the title. */
  children?: ReactNode;
  /** Status word under the lede (a string becomes a `StatusBadge`). */
  badge?: ReactNode;
  callout?: StateScreenCallout | ReactNode;
  /** Primary/secondary actions (stacked, full width on phones). */
  actions?: ReactNode;
  /** Announce the callout politely when it appears/changes (status screens). Default true. */
  live?: boolean;
  /** 1 for full-page states (checkout result), 2 inside a page. */
  headingLevel?: 1 | 2;
  className?: string;
  "data-testid"?: string;
}

function isCallout(v: unknown): v is StateScreenCallout {
  return typeof v === "object" && v !== null && "title" in v && !("$$typeof" in v);
}

/**
 * Result/status screen composition (Confirming, Payment complete, Under review, link expired…):
 * icon, title, lede, status badge, a callout with a reference, and actions.
 */
export function StateScreen({
  icon,
  tone = "info",
  title,
  children,
  badge,
  callout,
  actions,
  live = true,
  headingLevel = 1,
  className,
  "data-testid": testId,
}: StateScreenProps) {
  const H = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className={cx("np-state", className)} data-testid={testId}>
      <div className="np-state__head">
        {icon ? <span className={cx("np-state__icon", `np-state__icon--${tone}`)}>{icon}</span> : null}
        <H className="np-state__title">{title}</H>
        {children ? <div className="np-state__lede">{children}</div> : null}
        {typeof badge === "string" ? <StatusBadge>{badge}</StatusBadge> : badge}
      </div>
      {isCallout(callout) ? (
        <Callout tone={callout.tone ?? "info"} title={callout.title} reference={callout.reference} live={live}>
          {callout.body}
        </Callout>
      ) : (
        callout
      )}
      {actions ? <div className="np-state__actions">{actions}</div> : null}
    </div>
  );
}
