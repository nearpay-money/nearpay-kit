import type { ReactNode } from "react";
import { cx } from "../cx.js";
import { ArrowLeftIcon } from "../icons/index.js";
import { NearPayLogo, NearPayMark } from "./Brand.js";
import { Avatar } from "./Choice.js";
import { Callout } from "./Display.js";

export interface CheckoutMerchant {
  /** Attested merchant name (never the unverified display name). */
  name: string;
  /** "Pro plan · November". */
  subtitle?: string;
  /** Avatar initial; defaults to the name's first letter. */
  initial?: string;
}

export interface CheckoutFrameProps {
  merchant?: CheckoutMerchant;
  /** Amount hero, usually `<Money size="hero" …/>`. */
  amount?: ReactNode;
  /** Back action; omitted → no back button. */
  onBack?: () => void;
  backLabel?: string;
  secureLabel?: string;
  /** Shows the "Test mode — no real funds" banner. */
  testMode?: boolean;
  /** Custom banner slot (replaces the test-mode banner). */
  banner?: ReactNode;
  /**
   * Order summary (plan, description, line items). With a summary, wide containers (≥ 880 px) show
   * the two-column desktop checkout; narrow ones stack it under the amount.
   */
  summary?: ReactNode;
  /** `page` (hosted, default) or `embed` (iframe: no brand bar, transparent canvas). */
  variant?: "page" | "embed";
  /** Footer brand line, shown next to the NearPay mark. Default "Secured by NearPay". */
  securedLabel?: ReactNode;
  /** Footer links; items without an href are omitted. */
  links?: { help?: string; privacy?: string; terms?: string };
  className?: string;
  /** Passed through to the root element. */
  "data-testid"?: string;
  children: ReactNode;
}

function BackButton({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button type="button" className="np-checkout__back" onClick={onBack}>
      <ArrowLeftIcon size={16} />
      <span>{label}</span>
    </button>
  );
}

/**
 * Checkout layout: back + "Secure checkout", merchant header with avatar initial, amount hero,
 * flow content, and the "Secured by NearPay · Help · Privacy · Terms" footer. Responsive to its
 * container (container queries), so the same markup works hosted, embedded and in previews.
 * v2: with a `summary`, containers ≥ 880 px show the split layout — the order side on navy
 * (merchant, amount, lines, `RouteDiagram`) and the pay side on white.
 */
export function CheckoutFrame({
  merchant,
  amount,
  onBack,
  backLabel = "Back",
  secureLabel = "Secure checkout",
  testMode = false,
  banner,
  summary,
  variant = "page",
  securedLabel = "Secured by NearPay",
  links = {},
  className,
  "data-testid": testId,
  children,
}: CheckoutFrameProps) {
  const bannerNode =
    banner ?? (testMode ? <Callout tone="info" title="Test mode — no real funds" reference="Sandbox payment" /> : null);
  const hasHeader = Boolean(merchant || amount);
  const linkEntries: Array<[string, string | undefined]> = [
    ["Help", links.help],
    ["Privacy", links.privacy],
    ["Terms", links.terms],
  ];
  const linkItems = linkEntries.filter((l): l is [string, string] => typeof l[1] === "string");
  return (
    <div
      className={cx(
        "np-checkout",
        `np-checkout--${variant}`,
        summary != null && "np-checkout--with-summary",
        className,
      )}
      data-testid={testId}
    >
      {/* The root is the size container; the canvas paints the background so container queries can restyle it. */}
      <div className="np-checkout__canvas">
        <div className="np-checkout__inner">
          <div className="np-checkout__topbar">
            <span className="np-checkout__brand">
              <NearPayLogo size="sm" />
            </span>
            {onBack ? <BackButton onBack={onBack} label={backLabel} /> : <span />}
            <span className="np-checkout__secure">{secureLabel}</span>
          </div>
          {bannerNode ? <div className="np-checkout__banner">{bannerNode}</div> : null}
          {hasHeader || summary ? (
            <section
              className={cx("np-checkout__summary", variant === "page" && "np-surface-navy")}
              aria-label="Order summary"
            >
              {onBack && merchant ? (
                <span className="np-checkout__back-wide">
                  <BackButton onBack={onBack} label={`Back to ${merchant.name}`} />
                </span>
              ) : null}
              {merchant ? (
                <div className="np-checkout__merchant">
                  <Avatar initial={merchant.initial ?? merchant.name} shape="square" size="lg" />
                  <div className="np-checkout__merchant-text">
                    <p className="np-checkout__merchant-name">{merchant.name}</p>
                    {merchant.subtitle ? <p className="np-checkout__merchant-sub">{merchant.subtitle}</p> : null}
                  </div>
                </div>
              ) : null}
              {amount ? <p className="np-checkout__amount">{amount}</p> : null}
              {summary ? <div className="np-checkout__details">{summary}</div> : null}
            </section>
          ) : null}
          <section className="np-checkout__main">
            <div className="np-checkout__flow">{children}</div>
            <footer className="np-checkout__footer">
              <p className="np-checkout__secured">
                <NearPayMark size={18} favicon={false} className="np-checkout__secured-mark" />
                <span>{securedLabel}</span>
              </p>
              {linkItems.length > 0 ? (
                <ul className="np-checkout__links">
                  {linkItems.map(([label, href]) => (
                    <li key={label}>
                      <a href={href}>{label}</a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}
