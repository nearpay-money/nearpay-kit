import { type ReactNode, useState } from "react";
import {
  AppShell,
  Breadcrumb,
  Button,
  buttonClassName,
  Callout,
  Card,
  CardTitle,
  CheckoutFrame,
  ConvergenceHero,
  Countdown,
  ExternalLinkIcon,
  Field,
  Input,
  KeyValueList,
  KpiCard,
  KpiGrid,
  LineChart,
  Modal,
  type Mode,
  Money,
  type NavGroup,
  NearPayLogo,
  PageHeader,
  PickerTrigger,
  RouteDiagram,
  Stat,
  StatGroup,
  StatusBadge,
  Table,
  type TableColumn,
  Timeline,
  type TimelineItem,
} from "../../src/index.js";

/* Fixed clock so the gallery renders identically every time. */
const NOW = Date.UTC(2026, 10, 7, 5, 12, 0);
export const fixedNow = () => NOW;

/* ------------------------------------------------------------------------------------------ */
/* (a) Checkout — mobile "Review" (USDC · Base selected)                                        */
/* ------------------------------------------------------------------------------------------ */

export function PhoneFrame({ children, dark = false, label }: { children: ReactNode; dark?: boolean; label: string }) {
  return (
    <figure className={dark ? "g-phone g-phone--dark" : "g-phone"}>
      <div className="g-phone__status" aria-hidden="true">
        <span>9:41</span>
        <span className="g-phone__glyphs">
          <span className="g-phone__dot" />
          <span className="g-phone__bar" />
        </span>
      </div>
      {children}
      <figcaption className="g-caption">{label}</figcaption>
    </figure>
  );
}

/** "Pay with" review step (Checkout-proposed artboard): pickers, breakdown, one primary action. */
function PayStep() {
  return (
    <>
      <h1 className="np-checkout__title">Pay with</h1>
      <div className="np-pickers">
        <PickerTrigger caption="Network" value="Base" avatar="B" aria-haspopup="listbox" />
        <PickerTrigger caption="Token" value="USDC" balance="4.52101" avatar="$" selected aria-haspopup="listbox" />
      </div>
      <p className="g-wallet-line">
        <span className="g-wallet-line__dot" aria-hidden="true" />
        Wallet 0x4De0…7559 connected · balance covers the network fee
      </p>
      <Card padding="sm" className="g-breakdown">
        <KeyValueList
          items={[
            {
              label: "Merchant receives",
              value: <Money amount="2000000" decimals={6} maxFraction={2} symbol="USDC" />,
            },
            { label: "Routing fee", value: <Money amount="5013" decimals={6} symbol="USDC" /> },
            { label: "Network fee (paid by your wallet)", value: "about 0.0000008 ETH" },
          ]}
        />
      </Card>
      <div className="np-stack np-stack--sm">
        <Button size="lg" fullWidth>
          Pay 2.005013 USDC
        </Button>
        <Button variant="secondary" fullWidth>
          Pay from another wallet or exchange
        </Button>
        <p className="np-checkout__note g-center">
          Price held for <Countdown deadline={NOW + 872_000} now={fixedNow} />. You’ll review any change before paying.
        </p>
      </div>
    </>
  );
}

const ORDER_SUMMARY = (
  <>
    <p className="g-order__item">Pro plan, monthly</p>
    <KeyValueList
      className="g-order__lines"
      items={[
        { label: "Pro plan", value: <Money amount="200" decimals={2} symbol="$" /> },
        { label: "Payment fees", value: "Included" },
        { label: "You send", value: <Money amount="2005013" decimals={6} symbol="USDC" />, total: true },
      ]}
    />
    <RouteDiagram
      stops={["USDC on Base", "Acme’s wallet"]}
      note="Routed by NEAR Intents straight to the merchant. NearPay never holds your funds."
    />
  </>
);

/** Ref A — hosted checkout, review / pay step. `wide` renders the split layout (navy order side). */
export function CheckoutReview({ wide = false }: { wide?: boolean }) {
  return (
    <CheckoutFrame
      merchant={{ name: "Acme GmbH", subtitle: "acme.example" }}
      amount={<Money amount="200" decimals={2} symbol="$" />}
      summary={wide ? ORDER_SUMMARY : undefined}
      banner={<Callout tone="verified" compact title="Payout address verified for Acme GmbH" />}
      links={{ help: "#help", privacy: "#privacy", terms: "#terms" }}
      securedLabel="Powered by NearPay"
    >
      <PayStep />
    </CheckoutFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Dashboard shell                                                                              */
/* ------------------------------------------------------------------------------------------ */

const NAV_ITEMS = [
  ["home", "Home"],
  ["payments", "Payments"],
  ["links", "Payment links"],
  ["subscriptions", "Subscriptions"],
  ["customers", "Customers"],
  ["agents", "Agent payments"],
  ["wallets", "Payout wallets"],
] as const;

function nav(current: string): NavGroup[] {
  return [
    {
      label: "Workspace",
      hideLabel: true,
      items: NAV_ITEMS.map(([id, label]) => ({ id, label, href: `#${id}`, current: id === current })),
    },
    {
      label: "Build",
      hideLabel: true,
      items: [
        { id: "developers", label: "Developers", href: "#developers", current: current === "developers" },
        { id: "settings", label: "Settings", href: "#settings", current: current === "settings" },
      ],
    },
  ];
}

function Shell({ current, crumb, children }: { current: string; crumb: string; children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("live");
  return (
    <AppShell
      workspace={{
        name: "Acme Coffee",
        menu: {
          items: [
            { id: "acme", label: "Acme Coffee", description: "Owner" },
            { id: "globex", label: "Globex Inc.", description: "Developer" },
            { id: "s", separator: true },
            { id: "new", label: "Create workspace" },
          ],
          onSelect: () => {},
        },
      }}
      nav={nav(current)}
      user={{ name: "owner@acme.example" }}
      search={{ placeholder: "Search payments, customers, links" }}
      breadcrumb={
        crumb === "Home" ? undefined : <Breadcrumb items={[{ label: "Home", href: "#home" }, { label: crumb }]} />
      }
      mode={mode}
      onModeChange={setMode}
    >
      {children}
    </AppShell>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* (b) Dashboard — Overview                                                                     */
/* ------------------------------------------------------------------------------------------ */

interface PaymentRow {
  id: string;
  amount: string;
  status: string;
  description: string;
  paidWith: string;
  date: string;
}

const RECENT: PaymentRow[] = [
  { id: "p5", amount: "4900", status: "Paid", description: "Acme Pro", paidWith: "USDC on Base", date: "Today, 14:09" },
  {
    id: "p4",
    amount: "12900",
    status: "Confirming",
    description: "Acme Pro",
    paidWith: "SOL on Solana",
    date: "Today, 14:02",
  },
  {
    id: "p3",
    amount: "24900",
    status: "Review",
    description: "Annual plan",
    paidWith: "ETH on Arbitrum",
    date: "Today, 01:49",
  },
  {
    id: "p2",
    amount: "1500",
    status: "Not paid",
    description: "Beans 1kg",
    paidWith: "Not chosen",
    date: "Today, 01:49",
  },
  {
    id: "p1",
    amount: "8600",
    status: "Paid",
    description: "Team plan",
    paidWith: "USDC on NEAR",
    date: "Yesterday, 06:47",
  },
];

export const recentColumns: TableColumn<PaymentRow>[] = [
  {
    key: "amount",
    header: "Amount",
    cell: (r) => <Money amount={r.amount} decimals={2} symbol="$" />,
    primary: true,
    numeric: true,
  },
  { key: "status", header: "Status", cell: (r) => <StatusBadge>{r.status}</StatusBadge> },
  { key: "description", header: "Description", cell: (r) => r.description },
  { key: "with", header: "Paid with", cell: (r) => r.paidWith, muted: true, hideOnNarrow: true },
  { key: "date", header: "Date", cell: (r) => r.date, muted: true, align: "end" },
];

function VolumeChart() {
  return (
    <LineChart
      label="Volume by where customers paid from, 2–8 November 2026"
      labels={["2 Nov", "3 Nov", "4 Nov", "5 Nov", "6 Nov", "7 Nov", "8 Nov"]}
      decimals={2}
      symbol="$"
      series={[
        { id: "base", label: "Base", values: ["4200", "7000", "10000", "11000", "9600", "6400", "4400"] },
        { id: "sol", label: "Solana", values: ["0", "2600", "5000", "3600", "0", "3000", "0"] },
        { id: "near", label: "NEAR", values: ["3000", "0", "4000", "0", "2200", "0", "1800"] },
      ]}
    />
  );
}

/** Ref B — merchant dashboard home (Dashboard-proposed artboard). */
export function DashboardOverview() {
  return (
    <Shell current="home" crumb="Home">
      <div className="g-page">
        <PageHeader
          title="Good morning, Acme"
          subtitle="Last 7 days, in USD. Funds settle straight to your payout wallet."
          actions={
            <>
              <a href="#invoice" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                Create invoice
              </a>
              <a href="#link" className={buttonClassName({ size: "sm" })}>
                Create payment link
              </a>
            </>
          }
        />
        <KpiGrid>
          <KpiCard
            label="Settled volume"
            value={<Money amount="83000" decimals={2} symbol="$" />}
            sub="Up from $105.00 last week"
            trend="up"
          />
          <KpiCard label="Successful payments" value="9" sub="of 12 started" />
          <KpiCard label="Median time to paid" value="4 s" sub="from the customer’s deposit" />
          <KpiCard
            label="Needs attention"
            value="2"
            tone="warning"
            sub={<a href="#review">1 to review, 1 delayed</a>}
          />
        </KpiGrid>
        <div className="g-dash-row">
          <Card variant="flat" as="section" className="g-dash-chart" aria-labelledby="g-volume">
            <h2 id="g-volume" className="np-card__title">
              Volume by where customers paid from
            </h2>
            <VolumeChart />
          </Card>
          <Card variant="flat" as="section" className="g-dash-wallet" aria-labelledby="g-wallet">
            <div className="np-stack">
              <h2 id="g-wallet" className="np-card__title">
                Payout wallet
              </h2>
              <div className="g-wallet">
                <p className="g-wallet__name">USDC on NEAR Intents</p>
                <p className="np-text-small np-text-secondary np-tabular">bac80c…71cea7</p>
                <p className="np-text-caption g-success">Verified · active</p>
              </div>
              <KeyValueList
                items={[
                  { label: "Last payment arrived", value: "2 min ago" },
                  { label: "Confirmations", value: "1 block on each chain" },
                ]}
              />
              <a href="#wallets" className="g-strong-link">
                Manage payout wallets
              </a>
            </div>
          </Card>
        </div>
        <Table
          title="Recent payments"
          caption="Recent payments"
          actions={
            <a href="#payments" className="g-strong-link">
              View all
            </a>
          }
          variant="flat"
          columns={recentColumns}
          rows={RECENT}
          rowKey={(r) => r.id}
        />
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Ref C — landing hero                                                                         */
/* ------------------------------------------------------------------------------------------ */

/** Ref C — nearpay.money hero (Main artboard): header, headline, CTAs, ConvergenceHero. */
export function LandingHero({ autoPlay = true }: { autoPlay?: boolean }) {
  return (
    <div className="g-landing">
      <header className="g-landing__header">
        <a href="#top" className="g-landing__brand" aria-label="NearPay home">
          <NearPayLogo size="md" label="" />
        </a>
        <nav aria-label="Main" className="g-landing__nav">
          {["Checkout", "Payment links", "Subscriptions", "Agent payments", "Docs"].map((l) => (
            <a key={l} href={`#${l}`}>
              {l}
            </a>
          ))}
        </nav>
        <div className="np-row">
          <a href="#signin" className="g-landing__signin">
            Sign in
          </a>
          <a href="#start" className={buttonClassName({ variant: "navy", size: "sm", pill: true })}>
            Start accepting payments
          </a>
        </div>
      </header>
      <section className="g-landing__hero" aria-labelledby="g-hero-h">
        <div className="g-landing__copy">
          <h1 id="g-hero-h" className="np-text-display">
            Get paid from any chain. Settle where you choose.
          </h1>
          <p className="g-landing__lede">
            Your customers pay with the wallet and token they already have. NEAR Intents routes it, NearPay checks it
            on-chain, and the money lands in your wallet. We never hold it.
          </p>
          <div className="np-row g-landing__ctas">
            <a href="#start" className={buttonClassName({ size: "lg", pill: true })}>
              Start accepting payments
            </a>
            <a href="#demo" className={buttonClassName({ variant: "secondary", size: "lg", pill: true })}>
              See a live checkout
            </a>
          </div>
          <p className="np-text-small np-text-tertiary">
            No sign-up review. Test mode included. Live as soon as you save your business details.
          </p>
        </div>
        <ConvergenceHero
          autoPlay={autoPlay}
          card={
            <div className="g-received">
              <div className="g-received__head">
                <span>Payment received</span>
                <StatusBadge>Paid</StatusBadge>
              </div>
              <p className="g-received__amount np-tabular">
                <Money amount="4900" decimals={2} symbol="$" />
              </p>
              <p className="g-received__sub">Settled as USDC to your NEAR wallet</p>
              <hr className="np-divider" />
              <p className="g-received__row">
                <span>Confirmed in</span>
                <strong>1 block</strong>
              </p>
            </div>
          }
        />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* (c) Dashboard — Payment detail                                                               */
/* ------------------------------------------------------------------------------------------ */

export const ACTIVITY: TimelineItem[] = [
  {
    id: "a4",
    time: "10:42:18",
    dateTime: "2026-11-07T10:42:18+05:30",
    title: "Payment complete",
    body: "Settlement verified. Order can be fulfilled.",
  },
  {
    id: "a3",
    time: "10:42:11",
    dateTime: "2026-11-07T10:42:11+05:30",
    title: "Funds received",
    body: "49.00 USDC received at treasury destination.",
  },
  {
    id: "a2",
    time: "10:41:58",
    dateTime: "2026-11-07T10:41:58+05:30",
    title: "Payment detected",
    body: "49.49 USDC sent on Base.",
  },
  {
    id: "a1",
    time: "10:41:30",
    dateTime: "2026-11-07T10:41:30+05:30",
    title: "Checkout opened",
    body: "Payer chose USDC on Base.",
  },
];

export function PaymentDetail() {
  const [refunding, setRefunding] = useState(false);
  return (
    <Shell current="payments" crumb="Payments">
      <div className="g-page">
        <PageHeader
          title="Payment NP–10482"
          subtitle="Acme Pro · Created 7 Nov 2026 at 10:42 IST"
          actions={
            <Button variant="secondary" onClick={() => setRefunding(true)}>
              Refund payment
            </Button>
          }
        />
        <StatGroup className="g-stats">
          <Stat label="Purchase" value={<Money amount="4900" decimals={2} symbol="$" />} sub="Paid" />
          <Stat
            label="Payer sent"
            value={<Money amount="49490000" decimals={6} symbol="USDC" />}
            sub="Includes 0.49 USDC fees"
          />
          <Stat
            label="You received"
            value={<Money amount="49000000" decimals={6} symbol="USDC" />}
            sub="Base · Treasury wallet"
          />
        </StatGroup>
        <div className="g-detail">
          <section aria-labelledby="g-activity">
            <h2 id="g-activity" className="np-text-h3">
              Payment activity
            </h2>
            <Timeline items={ACTIVITY} />
          </section>
          <Card as="aside" className="g-detail__card" aria-label="Settlement and customer">
            <div className="np-stack np-stack--lg">
              <CardTitle>Settlement</CardTitle>
              <KeyValueList items={[{ label: "Asset / network", value: "USDC / Base" }]} className="g-kv-strong" />
              <Field label="Destination">
                <Input readOnly value="Treasury · 0x8f…D920" />
              </Field>
              <a href="#tx" className={buttonClassName({ variant: "secondary", fullWidth: true })}>
                <span>View transaction</span>
                <ExternalLinkIcon size={16} />
              </a>
              <CardTitle>Customer</CardTitle>
              <div className="np-stack">
                <p>Wallet 0x71…9A42</p>
                <p className="np-text-caption np-text-secondary">No email collected</p>
                <p className="np-text-caption np-text-accent">Merchant notification delivered</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
      <Modal
        open={refunding}
        onClose={() => setRefunding(false)}
        title="Refund NP–10482"
        description="The refund returns to the original payer wallet. You approve it in your wallet; NearPay never moves funds for you."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefunding(false)}>
              Cancel
            </Button>
            <Button onClick={() => setRefunding(false)}>Review in wallet</Button>
          </>
        }
      >
        <KeyValueList
          items={[
            { label: "Refund amount", value: <Money amount="49000000" decimals={6} symbol="USDC" /> },
            { label: "NearPay refund fee", value: <Money amount="0" decimals={6} symbol="USDC" /> },
            { label: "Network costs", value: "Shown before signing" },
            { label: "Returns to", value: "Wallet 0x71…9A42 · Base", total: true },
          ]}
        />
      </Modal>
    </Shell>
  );
}
