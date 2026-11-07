import "../../src/fonts.css";
import "../../src/tokens.css";
import "../../src/styles.css";
import "./gallery.css";

import { type ReactNode, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  Callout,
  Checkbox,
  CheckIcon,
  CheckoutFrame,
  ClockIcon,
  CopyField,
  Countdown,
  color,
  contrastRatio,
  Field,
  Input,
  KeyValueList,
  Money,
  palette,
  SearchInput,
  SelectionCard,
  ShieldCheckIcon,
  StatusBadge,
  ThemeRoot,
  type ThemeSetting,
  ToastProvider,
} from "../../src/index.js";
import { CheckoutReview, DashboardOverview, fixedNow, PaymentDetail, PhoneFrame } from "./compositions.js";
import {
  ActivityDemo,
  BadgesDemo,
  ButtonsDemo,
  CalloutsDemo,
  CardsDemo,
  ChoiceDemo,
  ComboboxDemo,
  CopyDemo,
  FieldsDemo,
  IconsDemo,
  LoadingEmptyDemo,
  MoneyDemo,
  NavigationDemo,
  OverlayDemo,
  TableDemo,
} from "./demos.js";

/* ------------------------------------------------------------------------------------------ */

function Pair({ children, single = false }: { children: () => ReactNode; single?: boolean }) {
  const themes = single ? (["light"] as const) : (["light", "dark"] as const);
  return (
    <div className={single ? "g-pair g-pair--single" : "g-pair"}>
      {themes.map((t) => (
        <ThemeRoot key={t} theme={t} className="g-panel">
          <ToastProvider>
            <p className="g-panel__label" aria-hidden="true">
              {t === "light" ? "Light" : "Dark"}
            </p>
            {children()}
          </ToastProvider>
        </ThemeRoot>
      ))}
    </div>
  );
}

function Section({ id, title, lede, children }: { id: string; title: string; lede?: string; children: ReactNode }) {
  return (
    <section id={id} className="g-section" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="g-section__title">
        {title}
      </h2>
      {lede ? <p className="g-section__lede">{lede}</p> : null}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Foundations                                                                                  */
/* ------------------------------------------------------------------------------------------ */

const SWATCHES: Array<[string, string, string]> = [
  ["Deep ink", palette.ink, "g-sw-ink"],
  ["NearPay teal", palette.teal, "g-sw-teal"],
  ["Teal hover", palette.tealHover, "g-sw-teal-hover"],
  ["Mint accent", palette.mint, "g-sw-mint"],
  ["Soft mint", palette.mintSoft, "g-sw-mint-soft"],
  ["Warm canvas", palette.canvas, "g-sw-canvas"],
  ["Fine borders", palette.borderFine, "g-sw-border"],
];

const PAIRS: Array<[string, keyof typeof color.light, keyof typeof color.light, number]> = [
  ["Body text / surface", "text", "surface", 4.5],
  ["Secondary text / canvas", "textSecondary", "bg", 4.5],
  ["On accent / accent", "onAccent", "accent", 4.5],
  ["Accent text / surface", "accentText", "surface", 4.5],
  ["Accent / soft mint", "accentSubtleText", "accentSubtle", 4.5],
  ["Success", "successFg", "successBg", 4.5],
  ["Warning", "warningFg", "warningBg", 4.5],
  ["Danger", "dangerFg", "dangerBg", 4.5],
  ["Control border / surface", "borderControl", "surface", 3],
  ["Focus ring / surface", "focus", "surface", 3],
];

function Foundations() {
  return (
    <>
      <div className="g-swatches">
        {SWATCHES.map(([name, hex, cls]) => (
          <div key={name} className="g-swatch">
            <span className={`g-swatch__chip ${cls}`} />
            <span className="g-swatch__name">{name}</span>
            <span className="g-swatch__hex np-tabular">{hex}</span>
          </div>
        ))}
      </div>
      <div className="g-contrast">
        {(["light", "dark"] as const).map((t) => (
          <table key={t} className="g-money-table">
            <caption className="g-contrast__caption">WCAG contrast — {t}</caption>
            <thead>
              <tr>
                <th scope="col">Pair</th>
                <th scope="col">Ratio</th>
                <th scope="col">Needs</th>
              </tr>
            </thead>
            <tbody>
              {PAIRS.map(([label, fg, bg, min]) => {
                const r = contrastRatio(color[t][fg], color[t][bg]);
                return (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="np-tabular">{r.toFixed(2)}:1</td>
                    <td>
                      <StatusBadge
                        tone={r >= min ? "success" : "danger"}
                      >{`${r >= min ? "Pass" : "Fail"} ${min}:1`}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>
      <div className="g-type">
        <p className="np-text-display">Payments, with clarity.</p>
        <p className="np-text-h1">Make room for your next idea.</p>
        <p className="np-text-h2">Your payments, in focus.</p>
        <p className="np-text-h3">Payment activity</p>
        <p className="np-text-h4">Live payments are not active yet</p>
        <p className="np-text-body">16 · A calm, familiar payment experience. Complexity stays behind the scenes.</p>
        <p className="np-text-small">14 · Track every payment from checkout to settlement.</p>
        <p className="np-text-caption np-text-secondary">12 · Funds settle directly to your chosen wallet.</p>
        <p className="g-type__amount np-tabular">
          <Money amount="4900" decimals={2} symbol="$" /> · <Money amount="2486000" decimals={2} symbol="$" />
        </p>
      </div>
      <div className="g-space">
        {[4, 8, 12, 16, 24, 32, 48, 64].map((n) => (
          <div key={n} className="g-space__row">
            <span className={`g-space__bar g-space__bar--${n}`} />
            <span className="np-text-caption np-tabular">{n} px</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Checkout states                                                                              */
/* ------------------------------------------------------------------------------------------ */

const LINKS = { help: "#help", privacy: "#privacy", terms: "#terms" };
const MERCHANT = { name: "Acme Studio", subtitle: "Pro plan · November" };
const AMOUNT = <Money amount="4900" decimals={2} symbol="$" />;

function SendManual() {
  const [sure, setSure] = useState(false);
  return (
    <CheckoutFrame onBack={() => {}} links={LINKS}>
      <div className="np-stack">
        <h1 className="np-checkout__title">Send 49.49 USDC</h1>
        <p className="np-checkout__lede">To pay Acme Studio $49.00</p>
      </div>
      <Callout tone="warning" title="Use the Base network">
        This address accepts USDC on Base only.
      </Callout>
      <Checkbox variant="tile" label="I’m sending on Base" checked={sure} onChange={(e) => setSure(e.target.checked)} />
      {sure ? (
        <CopyField
          label="Deposit address"
          value="0x8f24a1B9c0E5d7F3a2b4C6d8E0f1A3b5C7c3D920"
          writeText={async () => {}}
          footer={
            <>
              Expires in <Countdown deadline={fixedNow() + 872_000} now={fixedNow} />
            </>
          }
        />
      ) : (
        <p className="np-checkout__note">Confirm the network to see the deposit address.</p>
      )}
      <KeyValueList
        items={[{ label: "Exact amount", value: <Money amount="49490000" decimals={6} symbol="USDC" /> }]}
      />
      <div className="np-stack">
        <Button fullWidth disabled={!sure}>
          I’ve sent the payment
        </Button>
        <p className="np-checkout__note">We confirm automatically. This button does not confirm payment.</p>
      </div>
    </CheckoutFrame>
  );
}

function StateScreen({
  icon,
  title,
  body,
  badge,
  callout,
  reference = "Reference NP–10482 · Acme Studio",
  action,
  tone = "info",
}: {
  icon: ReactNode;
  title: string;
  body: string;
  badge: string;
  callout: string;
  reference?: string;
  action: ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <CheckoutFrame merchant={MERCHANT} amount={AMOUNT} onBack={() => {}} links={LINKS}>
      <hr className="np-divider" />
      <div className="np-stack">
        <span className="np-checkout__state-icon">{icon}</span>
        <h1 className="np-checkout__title">{title}</h1>
        <p className="np-checkout__lede">{body}</p>
        <StatusBadge>{badge}</StatusBadge>
      </div>
      <Callout tone={tone} title={callout} reference={reference} live />
      {action}
    </CheckoutFrame>
  );
}

function CheckoutStates() {
  return (
    <div className="g-phones">
      <PhoneFrame label="Pay with — search + token rows">
        <CheckoutFrame onBack={() => {}} links={LINKS}>
          <StatusBadge>Connected</StatusBadge>
          <h1 className="np-checkout__title">Pay with</h1>
          <SearchInput placeholder="Search token or network" aria-label="Search token or network" />
          <SelectionCard avatar="U" title="USDC · Base" description="49.49 USDC · includes fees" />
        </CheckoutFrame>
      </PhoneFrame>
      <PhoneFrame label="Manual path — network guard, address, countdown">
        <SendManual />
      </PhoneFrame>
      <PhoneFrame label="Confirming">
        <StateScreen
          icon={<ClockIcon />}
          title="Confirming your payment"
          body="Your payment was detected. Keep this page open while we confirm it."
          badge="Payment detected"
          callout="Don’t send another payment."
          action={
            <Button fullWidth loading loadingText="Confirming…">
              Confirming
            </Button>
          }
        />
      </PhoneFrame>
      <PhoneFrame label="Complete">
        <StateScreen
          icon={<CheckIcon />}
          title="Payment complete"
          body="Acme Studio has received your payment."
          badge="Paid"
          callout="49.49 USDC paid · Base"
          action={<Button fullWidth>Return to Acme Studio</Button>}
        />
      </PhoneFrame>
      <PhoneFrame label="Under review">
        <StateScreen
          icon={<ShieldCheckIcon />}
          title="Payment under review"
          body="Your payment was received and needs a review before the order can be confirmed."
          badge="Under review"
          callout="Don’t pay again. Return here for updates."
          action={<Button fullWidth>Copy payment reference</Button>}
        />
      </PhoneFrame>
      <PhoneFrame label="Test mode">
        <CheckoutFrame testMode onBack={() => {}} merchant={{ name: "Acme Studio" }}>
          <h1 className="np-checkout__title">Try a payment</h1>
          <p className="np-checkout__lede">
            This checkout uses simulated funds. Your wallet will not send a real payment.
          </p>
          <Button fullWidth>Simulate payment</Button>
        </CheckoutFrame>
      </PhoneFrame>
    </div>
  );
}

function DesktopCheckout() {
  return (
    <CheckoutFrame
      merchant={MERCHANT}
      amount={AMOUNT}
      onBack={() => {}}
      links={LINKS}
      summary={
        <>
          <h2 className="np-text-h3">Pro plan</h2>
          <p className="np-text-secondary">
            One workspace. Unlimited projects.
            <br />
            Billed monthly.
          </p>
          <hr className="np-divider" />
          <KeyValueList
            items={[
              { label: "Subtotal", value: <Money amount="4900" decimals={2} symbol="$" /> },
              { label: "Payment fees", value: <Money amount="49" decimals={2} symbol="$" /> },
              { label: "Total", value: <Money amount="4949" decimals={2} symbol="$" />, total: true },
            ]}
          />
        </>
      }
    >
      <h2 className="np-text-h3">Review your payment</h2>
      <SelectionCard
        avatar="U"
        title="USDC · Base"
        description="Wallet 0x71…9A42"
        action={
          <button type="button" className="np-link-button">
            Change
          </button>
        }
      />
      <div>
        <KeyValueList items={[{ label: "You send", value: <Money amount="49490000" decimals={6} symbol="USDC" /> }]} />
        <p className="np-checkout__note">Any additional network fee is shown in your wallet before approval.</p>
      </div>
      <div className="np-stack">
        <Button fullWidth>Pay 49.49 USDC</Button>
        <Button fullWidth variant="secondary">
          Send from another wallet
        </Button>
      </div>
    </CheckoutFrame>
  );
}

function AppearanceDemo() {
  const [theme, setTheme] = useState<ThemeSetting>("light");
  const [accent, setAccent] = useState("#4f46e5");
  const [radius, setRadius] = useState(12);
  return (
    <div className="g-appearance">
      <ThemeRoot theme="light" className="g-appearance__controls">
        <div className="np-stack">
          <Field label="Theme">
            <select className="g-native" value={theme} onChange={(e) => setTheme(e.target.value as ThemeSetting)}>
              <option value="light">light</option>
              <option value="dark">dark</option>
              <option value="auto">auto</option>
            </select>
          </Field>
          <Field label="Accent" hint="#rgb or #rrggbb — adjusted to keep WCAG AA.">
            <Input value={accent} onChange={(e) => setAccent(e.target.value)} />
          </Field>
          <Field label={`Corner radius · ${radius} px`}>
            <input
              className="g-range"
              type="range"
              min={0}
              max={24}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
          </Field>
        </div>
      </ThemeRoot>
      <ThemeRoot theme={theme} accent={accent} radius={radius} className="g-appearance__preview">
        <CheckoutFrame variant="embed" merchant={MERCHANT} amount={AMOUNT} links={LINKS}>
          <SelectionCard avatar="U" title="USDC · Base" description="Wallet 0x71…9A42" />
          <Button fullWidth>Pay 49.49 USDC</Button>
          <Button fullWidth variant="secondary">
            Send from another wallet
          </Button>
        </CheckoutFrame>
      </ThemeRoot>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */

const TOC: Array<[string, string]> = [
  ["foundations", "Foundations"],
  ["ref-checkout", "Ref A · Checkout review"],
  ["ref-overview", "Ref B · Dashboard overview"],
  ["ref-detail", "Ref C · Payment detail"],
  ["checkout-states", "Checkout states"],
  ["appearance", "Merchant appearance"],
  ["buttons", "Button · IconButton"],
  ["fields", "Field · Input · Select"],
  ["combobox", "Combobox (Pay with)"],
  ["choice", "OptionCard · Checkbox"],
  ["callouts", "Callout"],
  ["badges", "StatusBadge"],
  ["money", "Money · Stat · KeyValue"],
  ["table", "Table · Pager"],
  ["navigation", "Tabs · Segmented · PageHeader"],
  ["activity", "Timeline · Steps"],
  ["copy", "CopyField · Countdown"],
  ["overlays", "Modal · Toast · LiveRegion"],
  ["loading", "Skeleton · EmptyState"],
  ["cards", "Card"],
  ["icons", "Icons"],
];

function App() {
  return (
    <ThemeRoot theme="light" className="g-app">
      <header className="g-header">
        <p className="g-header__eyebrow">@nearpay-internal/ui · v0.1.2</p>
        <h1 className="np-text-h1">NearPay design system</h1>
        <p className="g-header__lede">
          Tokens, components and reference screens rebuilt from the owner’s Figma. Every component is shown in light and
          dark. Nothing here uses inline styles; the page runs under the checkout CSP rules.
        </p>
      </header>
      <div className="g-layout">
        <nav className="g-toc" aria-label="Gallery sections">
          <ul>
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="g-main">
          <Section
            id="foundations"
            title="Foundations"
            lede="Palette, WCAG contrast (computed live from tokens.ts), type scale and 4/8 grid."
          >
            <Foundations />
          </Section>
          <Section
            id="ref-checkout"
            title="Reference A — Checkout, mobile review"
            lede="USDC · Base selected; purchase, payer fees and total to send on separate rows; one primary action."
          >
            <div className="g-phones">
              <ThemeRoot theme="light">
                <PhoneFrame label="Light">
                  <CheckoutReview />
                </PhoneFrame>
              </ThemeRoot>
              <ThemeRoot theme="dark">
                <PhoneFrame label="Dark (deep-ink surface, mint primary)" dark>
                  <CheckoutReview />
                </PhoneFrame>
              </ThemeRoot>
            </div>
            <ThemeRoot theme="light" className="g-desktop g-desktop--checkout">
              <DesktopCheckout />
            </ThemeRoot>
          </Section>
          <Section
            id="ref-overview"
            title="Reference B — Dashboard overview"
            lede="Workspace shell, stats, chart placeholder, recent payments."
          >
            <ThemeRoot theme="light" className="g-desktop">
              <DashboardOverview />
            </ThemeRoot>
            <ThemeRoot theme="dark" className="g-desktop">
              <DashboardOverview />
            </ThemeRoot>
          </Section>
          <Section
            id="ref-detail"
            title="Reference C — Payment detail"
            lede="Gross, payer-sent and received amounts kept separate. “Refund payment” opens the dialog."
          >
            <ThemeRoot theme="light" className="g-desktop">
              <ToastProvider>
                <PaymentDetail />
              </ToastProvider>
            </ThemeRoot>
          </Section>
          <Section id="checkout-states" title="Checkout states">
            <ThemeRoot theme="light">
              <CheckoutStates />
            </ThemeRoot>
          </Section>
          <Section
            id="appearance"
            title="Merchant appearance (embedded checkout)"
            lede="theme · accent · radius applied at runtime through CSS custom properties (CSSOM, CSP-safe)."
          >
            <AppearanceDemo />
          </Section>
          <Section
            id="buttons"
            title="Button · IconButton"
            lede="Primary, secondary, ghost, danger, mint (on dark); disabled, loading “Processing…”, dense, full width."
          >
            <Pair>{() => <ButtonsDemo />}</Pair>
          </Section>
          <Section
            id="fields"
            title="Field · Input · SearchInput · Select"
            lede="56 px fields, 16 px text, label + hint + error wiring, control borders ≥ 3:1."
          >
            <Pair>{() => <FieldsDemo />}</Pair>
          </Section>
          <Section
            id="combobox"
            title="Combobox-lite"
            lede="Type to filter, ↑/↓ to move, Enter to choose, Esc to clear. Result counts are announced politely."
          >
            <Pair>{() => <ComboboxDemo />}</Pair>
          </Section>
          <Section id="choice" title="RadioCardGroup · OptionCard · SelectionCard · Checkbox">
            <Pair>{() => <ChoiceDemo />}</Pair>
          </Section>
          <Section id="callouts" title="Callout">
            <Pair>{() => <CalloutsDemo />}</Pair>
          </Section>
          <Section id="badges" title="StatusBadge · ModePill" lede="Status is always a word plus colour.">
            <Pair>{() => <BadgesDemo />}</Pair>
          </Section>
          <Section
            id="money"
            title="Money · Stat · KeyValue"
            lede="bigint base units → text, tabular numerals, no floats."
          >
            <Pair>{() => <MoneyDemo />}</Pair>
          </Section>
          <Section id="table" title="Table · Pager">
            <Pair>{() => <TableDemo />}</Pair>
          </Section>
          <Section id="navigation" title="Breadcrumb · PageHeader · Tabs · SegmentedControl">
            <Pair>{() => <NavigationDemo />}</Pair>
          </Section>
          <Section id="activity" title="Timeline · Steps">
            <Pair>{() => <ActivityDemo />}</Pair>
          </Section>
          <Section id="copy" title="CopyField · Countdown">
            <Pair>{() => <CopyDemo />}</Pair>
          </Section>
          <Section id="overlays" title="Modal · Toast · LiveRegion">
            <Pair>{() => <OverlayDemo />}</Pair>
          </Section>
          <Section id="loading" title="Skeleton · EmptyState">
            <Pair>{() => <LoadingEmptyDemo />}</Pair>
          </Section>
          <Section id="cards" title="Card">
            <Pair>{() => <CardsDemo />}</Pair>
          </Section>
          <Section
            id="icons"
            title="Icons"
            lede="Inline SVG, 24 px grid, currentColor. No icon font, no remote assets."
          >
            <Pair>{() => <IconsDemo />}</Pair>
          </Section>
        </main>
      </div>
    </ThemeRoot>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
