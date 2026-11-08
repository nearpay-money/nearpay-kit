import { type ReactNode, useState } from "react";
import {
  AppShell,
  Breadcrumb,
  Button,
  buttonClassName,
  Card,
  CardTitle,
  CheckoutFrame,
  Countdown,
  ExternalLinkIcon,
  Field,
  Input,
  KeyValueList,
  LineChart,
  LogOutIcon,
  Modal,
  Money,
  type NavGroup,
  PageHeader,
  SelectionCard,
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

export function CheckoutReview() {
  return (
    <CheckoutFrame
      merchant={{ name: "Acme Studio", subtitle: "Pro plan · November" }}
      amount={<Money amount="4900" decimals={2} symbol="$" />}
      onBack={() => {}}
      links={{ help: "#help", privacy: "#privacy", terms: "#terms" }}
    >
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
        <KeyValueList
          items={[
            { label: "Purchase", value: <Money amount="4900" decimals={2} symbol="$" /> },
            { label: "Payment fees", value: <Money amount="49" decimals={2} symbol="$" /> },
            {
              label: "Total to send",
              value: <Money amount="49490000" decimals={6} symbol="USDC" maxFraction={2} rounding="ceil" />,
              total: true,
            },
          ]}
        />
        <p className="np-checkout__note g-mt-4">
          Your wallet may charge a separate network fee. Review it before approving.
        </p>
      </div>
      <div className="np-stack">
        <Button fullWidth>Pay 49.49 USDC</Button>
        <p className="np-checkout__note">
          Quote refreshes in <Countdown deadline={NOW + 42_000} now={fixedNow} />. We’ll ask you to review any change.
        </p>
      </div>
    </CheckoutFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Dashboard shell                                                                              */
/* ------------------------------------------------------------------------------------------ */

const NAV_ITEMS = [
  ["overview", "Overview"],
  ["payments", "Payments"],
  ["links", "Payment links"],
  ["customers", "Customers"],
  ["billing", "Billing"],
  ["agents", "Agent payments"],
  ["settlement", "Settlement"],
  ["developers", "Developers"],
  ["settings", "Settings"],
] as const;

function nav(current: string): NavGroup[] {
  return [
    {
      label: "Workspace",
      items: NAV_ITEMS.map(([id, label]) => ({ id, label, href: `#${id}`, current: id === current })),
    },
  ];
}

function Shell({ current, crumb, children }: { current: string; crumb: string; children: ReactNode }) {
  return (
    <AppShell
      workspace={{
        name: "Acme Studio",
        subtitle: "acme.studio",
        menu: {
          items: [
            { id: "acme", label: "Acme Studio", description: "Owner" },
            { id: "globex", label: "Globex Inc.", description: "Developer" },
            { id: "s", separator: true },
            { id: "new", label: "Create workspace" },
          ],
          onSelect: () => {},
        },
      }}
      nav={nav(current)}
      footerLinks={[{ label: "Help & support", href: "#help" }]}
      footerActions={
        <Button variant="ghost" size="sm" leadingIcon={<LogOutIcon size={16} />}>
          Sign out
        </Button>
      }
      user={{ name: "Alex Morgan", role: "Owner" }}
      breadcrumb={<Breadcrumb items={[{ label: "Acme Studio", href: "#overview" }, { label: crumb }]} />}
      mode="live"
      notifications={{ unread: 0 }}
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
  customer: string;
  amount: string;
  status: string;
  received: string;
}

const RECENT: PaymentRow[] = [
  { id: "NP–10482", customer: "Wallet 0x71…9A42", amount: "4900", status: "Paid", received: "USDC · Base" },
  { id: "NP–10481", customer: "Wallet 0x83…6B11", amount: "12900", status: "Confirming", received: "USDC · Base" },
  { id: "NP–10480", customer: "atlas.near", amount: "24900", status: "Review", received: "USDC · Base" },
];

export const recentColumns: TableColumn<PaymentRow>[] = [
  { key: "id", header: "Payment", cell: (r) => r.id, primary: true },
  { key: "customer", header: "Customer", cell: (r) => r.customer, hideOnNarrow: true },
  { key: "amount", header: "Amount", cell: (r) => <Money amount={r.amount} decimals={2} symbol="$" /> },
  { key: "status", header: "Status", cell: (r) => <StatusBadge>{r.status}</StatusBadge> },
  { key: "received", header: "Received in", cell: (r) => r.received, hideOnNarrow: true },
];

function VolumeChart() {
  return (
    <LineChart
      label="Payment volume, 1–7 November 2026"
      labels={["1 Nov", "2 Nov", "3 Nov", "4 Nov", "5 Nov", "6 Nov", "7 Nov"]}
      decimals={2}
      symbol="$"
      series={[
        { id: "v", label: "Volume", values: ["201000", "248000", "231000", "352000", "337000", "418000", "540200"] },
      ]}
    />
  );
}

export function DashboardOverview() {
  return (
    <Shell current="overview" crumb="Overview">
      <div className="g-page">
        <PageHeader
          title="Your payments, in focus."
          subtitle="Saturday, 7 November 2026"
          actions={<Button>Create payment link</Button>}
        />
        <StatGroup className="g-stats">
          <Stat
            label="Settled volume"
            value={<Money amount="2486000" decimals={2} symbol="$" />}
            sub="+12.4% vs previous week"
            trend="up"
          />
          <Stat label="Successful payments" value="428" sub="96.8% completion" />
          <Stat label="Needs attention" value="3" sub="2 reviews · 1 delayed" />
        </StatGroup>
        <hr className="np-divider" />
        <section aria-labelledby="g-volume">
          <div className="g-section-head">
            <h2 id="g-volume" className="np-text-h4">
              Payment volume
            </h2>
            <span className="np-text-caption np-text-secondary">1–7 Nov 2026 · USD</span>
          </div>
          <VolumeChart />
        </section>
        <Table
          caption="Recent payments"
          columns={recentColumns}
          rows={RECENT}
          rowKey={(r) => r.id}
          rowHref={(r) => `#payment-${r.id}`}
        />
        <p className="np-text-caption np-text-secondary">
          Funds settle directly to your chosen wallet. NearPay does not hold your balance.
        </p>
      </div>
    </Shell>
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
