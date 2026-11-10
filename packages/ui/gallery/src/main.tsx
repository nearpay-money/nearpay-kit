import "../../src/fonts.css";
import "../../src/tokens.css";
import "../../src/styles.css";
import "../../src/prose.css";
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
  NearPayLogo,
  palette,
  SearchInput,
  SelectionCard,
  ShieldCheckIcon,
  StateScreen,
  StatusBadge,
  ThemeRoot,
  type ThemeSetting,
  ToastProvider,
} from "../../src/index.js";
import { CheckoutReview, DashboardOverview, fixedNow, LandingHero, PaymentDetail, PhoneFrame } from "./compositions.js";
import {
  ActivityDemo,
  BadgesDemo,
  ButtonsDemo,
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
import {
  CopyTextDemo,
  ErrorStatesDemo,
  FiltersDemo,
  LayoutDemo,
  LineChartDemo,
  OptionButtonDemo,
  ProseDemo,
  StackedModalsDemo,
  SvgIconsDemo,
  TextareaDemo,
} from "./demos-021.js";
import {
  BrandDemo,
  BrandFilesDemo,
  ButtonsV2Demo,
  CalloutsV2Demo,
  ConvergenceDemo,
  KpiDemo,
  LogoRulesDemo,
  ModeSwitchDemo,
  NavySurfaceDemo,
  PickerDemo,
  RouteDemo,
  StatusPairsDemo,
} from "./demos-050.js";

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
  ["Navy", palette.navy, "g-sw-navy"],
  ["Navy raised", palette.navyRaised, "g-sw-navy-raised"],
  ["Navy active", palette.navyActive, "g-sw-navy-active"],
  ["Teal (actions)", palette.teal, "g-sw-teal"],
  ["Teal hover", palette.tealHover, "g-sw-teal-hover"],
  ["Brand teal (marks)", palette.tealBrand, "g-sw-teal-brand"],
  ["Violet (routes, focus)", palette.violet, "g-sw-violet"],
  ["Violet on navy", palette.violetOnNavy, "g-sw-violet-navy"],
  ["Mint (on navy only)", palette.mint, "g-sw-mint"],
  ["Soft mint", palette.mintSoft, "g-sw-mint-soft"],
  ["Canvas", palette.canvas, "g-sw-canvas"],
  ["Borders", palette.borderFine, "g-sw-border"],
  ["Control outline", palette.borderOutline, "g-sw-outline"],
];

const PAIRS: Array<[string, keyof typeof color.light, keyof typeof color.light, number]> = [
  ["Body text / surface", "text", "surface", 4.5],
  ["Secondary text / canvas", "textSecondary", "bg", 4.5],
  ["Tertiary text / canvas", "textTertiary", "bg", 4.5],
  ["On accent / accent", "onAccent", "accent", 4.5],
  ["Accent text / surface", "accentText", "surface", 4.5],
  ["Verified / soft mint", "accentSubtleText", "accentSubtle", 4.5],
  ["Paid", "successFg", "successBg", 4.5],
  ["Confirming", "infoFg", "infoBg", 4.5],
  ["Review", "warningFg", "warningBg", 4.5],
  ["Warning callout", "warningFg", "warningSubtle", 4.5],
  ["Not paid", "neutralFg", "neutralBg", 4.5],
  ["Failed", "dangerFg", "dangerBg", 4.5],
  ["Nav text / navy", "onNavySecondary", "navy", 4.5],
  ["Muted / navy raised", "onNavyMuted", "navyRaised", 4.5],
  ["Current nav / navy active", "onNavy", "navyActive", 4.5],
  ["Mint / navy", "onNavyAccent", "navy", 4.5],
  ["Control border / surface", "borderControl", "surface", 3],
  ["Focus ring / surface", "focus", "surface", 3],
  ["Route / surface", "route", "surface", 3],
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
        <p className="np-text-display">Get paid from any chain.</p>
        <p className="np-text-h1">A payment, from wallet to wallet, in seconds.</p>
        <p className="np-text-h2">Good morning, Acme</p>
        <p className="np-text-title">Pay with</p>
        <p className="np-text-h3">The customer pays their way</p>
        <p className="np-text-h4">Recent payments</p>
        <p className="np-text-body">
          16 · Your customers pay with the wallet and token they already have. NearPay never holds the money.
        </p>
        <p className="np-text-small">14 · Funds settle straight to your payout wallet.</p>
        <p className="np-text-caption np-text-tertiary">13 · Confirmed after one block on each chain.</p>
        <p className="g-type__amount np-tabular">
          <Money amount="200" decimals={2} symbol="$" /> · <Money amount="2005013" decimals={6} symbol="USDC" />
        </p>
        <p className="np-text-caption np-text-secondary">
          Instrument Sans (OFL), self-hosted · weights 400 / 500 / 600 / 650 / 700 · tabular numerals for amounts.
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

function ResultScreen({
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
      <StateScreen
        icon={icon}
        title={title}
        badge={badge}
        callout={{ tone, title: callout, reference }}
        actions={action}
      >
        {body}
      </StateScreen>
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
        <ResultScreen
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
        <ResultScreen
          icon={<CheckIcon />}
          title="Payment complete"
          body="Acme Studio has received your payment."
          badge="Paid"
          callout="49.49 USDC paid · Base"
          action={<Button fullWidth>Return to Acme Studio</Button>}
        />
      </PhoneFrame>
      <PhoneFrame label="Under review">
        <ResultScreen
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
  ["brand", "Brand · logo"],
  ["ref-checkout", "Ref A · Checkout review"],
  ["ref-overview", "Ref B · Dashboard home"],
  ["ref-landing", "Ref C · Landing hero"],
  ["ref-detail", "Payment detail"],
  ["checkout-states", "Checkout states"],
  ["appearance", "Merchant appearance"],
  ["buttons", "Button · IconButton"],
  ["navy", "Navy surfaces"],
  ["kpi", "KPI cards"],
  ["picker", "Picker trigger"],
  ["route", "RouteDiagram"],
  ["hero", "ConvergenceHero"],
  ["mode", "ModeSwitch"],
  ["callouts", "Callout"],
  ["badges", "StatusBadge"],
  ["fields", "Field · Input · Select"],
  ["combobox", "Combobox (Pay with)"],
  ["choice", "OptionCard · Checkbox"],
  ["money", "Money · Stat · KeyValue"],
  ["table", "Table · Pager"],
  ["navigation", "Tabs · Segmented · PageHeader"],
  ["activity", "Timeline · Steps"],
  ["copy", "CopyField · Countdown"],
  ["overlays", "Modal · Toast · LiveRegion"],
  ["loading", "Skeleton · EmptyState"],
  ["cards", "Card"],
  ["icons", "Icons"],
  ["textarea", "Textarea · field errors"],
  ["error-state", "ErrorState"],
  ["copy-text", "CopyText · IdText"],
  ["filters", "FilterBar · Menu · Popover"],
  ["stacked-modals", "Stacked modals · step-up"],
  ["option-button", "OptionButton"],
  ["layout", "PageLayout · Section · TwoColumn"],
  ["line-chart", "LineChart"],
  ["svg-icons", "Icons as SVG strings"],
  ["prose", "prose.css"],
];

function App() {
  return (
    <ThemeRoot theme="light" className="g-app">
      <header className="g-header">
        <NearPayLogo size="lg" />
        <p className="g-header__eyebrow">@nearpay-internal/ui 0.5.0 · design v2</p>
        <h1 className="np-text-h1">NearPay design system</h1>
        <p className="g-header__lede">
          Tokens, brand, components and the three approved reference screens in the v2 identity. Every component is
          shown in light and dark. Nothing here uses inline styles; the page follows the checkout CSP rules.
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
            id="brand"
            title="Brand — A. Convergence"
            lede="Routes from many chains meet one settlement dot. NearPayMark (auto, light, dark, mono, app icon) and NearPayLogo in four sizes; files ship in @nearpay-internal/ui/brand/."
          >
            <Pair>{() => <BrandDemo />}</Pair>
            <Pair single>{() => <BrandFilesDemo />}</Pair>
            <Pair single>{() => <LogoRulesDemo />}</Pair>
          </Section>
          <Section
            id="ref-checkout"
            title="Reference A — Hosted checkout, review"
            lede="Split layout from 880 px: navy order side (merchant, amount, lines, route) and the white pay side (verified payout address, pickers, breakdown, one primary action)."
          >
            <ThemeRoot theme="light" className="g-desktop g-desktop--checkout">
              <CheckoutReview wide />
            </ThemeRoot>
            <ThemeRoot theme="dark" className="g-desktop g-desktop--checkout">
              <CheckoutReview wide />
            </ThemeRoot>
            <div className="g-phones">
              <ThemeRoot theme="light">
                <PhoneFrame label="Mobile · light">
                  <CheckoutReview />
                </PhoneFrame>
              </ThemeRoot>
              <ThemeRoot theme="dark">
                <PhoneFrame label="Mobile · dark" dark>
                  <CheckoutReview />
                </PhoneFrame>
              </ThemeRoot>
            </div>
          </Section>
          <Section
            id="ref-overview"
            title="Reference B — Dashboard home"
            lede="Navy sidebar with the workspace switcher; search and Live/Test in the top bar; KPI cards, volume by source chain, payout wallet, recent payments."
          >
            <ThemeRoot theme="light" className="g-desktop">
              <DashboardOverview />
            </ThemeRoot>
            <ThemeRoot theme="dark" className="g-desktop">
              <DashboardOverview />
            </ThemeRoot>
          </Section>
          <Section
            id="ref-landing"
            title="Reference C — Landing hero"
            lede="nearpay.money: headline, active CTAs, and the ConvergenceHero — one payment at a time travels a route into the settlement point (static under reduced motion)."
          >
            <ThemeRoot theme="light" className="g-desktop">
              <LandingHero />
            </ThemeRoot>
            <ThemeRoot theme="dark" className="g-desktop">
              <LandingHero autoPlay={false} />
            </ThemeRoot>
          </Section>
          <Section
            id="ref-detail"
            title="Payment detail"
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
            lede="Primary (teal), secondary (outline), quiet, danger; lg / md / sm; pill for marketing; on-navy, navy and mint for dark surfaces. No arrows in labels."
          >
            <Pair>{() => <ButtonsV2Demo />}</Pair>
            <Pair>{() => <ButtonsDemo />}</Pair>
          </Section>
          <Section
            id="navy"
            title="Navy surfaces"
            lede="np-surface-navy re-maps the semantic colours for any content on navy."
          >
            <Pair>{() => <NavySurfaceDemo />}</Pair>
          </Section>
          <Section
            id="kpi"
            title="KPI cards"
            lede="KpiGrid + KpiCard: 32 px tabular figures; the warning tone is the cream “Needs attention”."
          >
            <Pair>{() => <KpiDemo />}</Pair>
          </Section>
          <Section
            id="picker"
            title="Picker trigger"
            lede="Label + value + optional balance; the chosen picker gets a 2 px teal border. Same structure classes as the checkout picker."
          >
            <Pair>{() => <PickerDemo />}</Pair>
          </Section>
          <Section
            id="route"
            title="RouteDiagram"
            lede="“How your payment travels”: route chips joined by a dashed arrow; violet on light, mint on navy."
          >
            <Pair>{() => <RouteDemo />}</Pair>
          </Section>
          <Section
            id="hero"
            title="ConvergenceHero"
            lede="Five curved routes into one settlement dot; a glowing dot travels a random route every 2.4 s and the point pulses on arrival. SMIL, no dependencies, no inline styles."
          >
            <Pair single>{() => <ConvergenceDemo />}</Pair>
          </Section>
          <Section
            id="mode"
            title="ModeSwitch"
            lede="Live / Test in the top bar: a pill segmented control (radiogroup, arrow keys)."
          >
            <Pair>{() => <ModeSwitchDemo />}</Pair>
          </Section>
          <Section
            id="fields"
            title="Field · Input · SearchInput · Select"
            lede="52 px fields, 16 px text, label + hint + error wiring, control borders ≥ 3:1."
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
          <Section
            id="callouts"
            title="Callout"
            lede="Verified / info in soft mint, warning in cream, progress in violet; compact one-line banners."
          >
            <Pair>{() => <CalloutsV2Demo />}</Pair>
          </Section>
          <Section
            id="badges"
            title="StatusBadge · ModePill"
            lede="v2 pairs: Paid, Confirming, Review, Not paid, Failed. Status is always a word plus colour."
          >
            <Pair>{() => <StatusPairsDemo />}</Pair>
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
          <Section id="textarea" title="Textarea · field-level error state">
            <Pair>{() => <TextareaDemo />}</Pair>
          </Section>
          <Section
            id="error-state"
            title="ErrorState"
            lede="Title, message, retry (with busy state), support reference."
          >
            <Pair>{() => <ErrorStatesDemo />}</Pair>
          </Section>
          <Section
            id="copy-text"
            title="CopyText · IdText"
            lede="Short values and monospace ids with copy; results announced politely."
          >
            <Pair>{() => <CopyTextDemo />}</Pair>
          </Section>
          <Section
            id="filters"
            title="FilterBar · FilterPill · MenuButton · Popover"
            lede="Select-style pills open single-choice menus; ↑/↓, Home/End, type-ahead, Esc."
          >
            <Pair>{() => <FiltersDemo />}</Pair>
          </Section>
          <Section
            id="stacked-modals"
            title="Stacked modals · step-up"
            lede="Nested dialogs stack; the step-up dialog sits above any open modal."
          >
            <Pair>{() => <StackedModalsDemo />}</Pair>
          </Section>
          <Section id="option-button" title="OptionButton">
            <Pair>{() => <OptionButtonDemo />}</Pair>
          </Section>
          <Section
            id="layout"
            title="PageLayout · Section · TwoColumnLayout"
            lede="Form + side panel; stacks below 880 px of its own width."
          >
            <Pair single>{() => <LayoutDemo />}</Pair>
          </Section>
          <Section
            id="line-chart"
            title="LineChart"
            lede="Integer inputs (bigint/strings), crosshair + tooltip on hover and ←/→, hidden data table."
          >
            <Pair>{() => <LineChartDemo />}</Pair>
          </Section>
          <Section
            id="svg-icons"
            title="Icons as SVG strings"
            lede="@nearpay-internal/ui/icons-svg — React-free, for Astro/static pages."
          >
            <Pair>{() => <SvgIconsDemo />}</Pair>
          </Section>
          <Section id="prose" title="prose.css" lede="Optional long-form styles: prose, code block, table of contents.">
            <Pair>{() => <ProseDemo />}</Pair>
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
