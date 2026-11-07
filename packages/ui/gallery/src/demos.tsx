import { useState } from "react";
import {
  ArrowRightIcon,
  Breadcrumb,
  Button,
  Callout,
  Card,
  CardIcon,
  CardTitle,
  Checkbox,
  ClockIcon,
  Combobox,
  type ComboboxOption,
  CopyField,
  Countdown,
  EmptyState,
  Field,
  formatMoney,
  IconButton,
  Input,
  icons,
  KeyValueList,
  LiveRegion,
  MenuIcon,
  Modal,
  ModePill,
  Money,
  type MoneyFormatOptions,
  OptionCard,
  PageHeader,
  Pager,
  RadioCardGroup,
  SearchInput,
  SegmentedControl,
  Select,
  SelectionCard,
  ShieldCheckIcon,
  Skeleton,
  Stat,
  StatGroup,
  StatusBadge,
  Steps,
  Table,
  Tabs,
  Timeline,
  useToast,
  WalletIcon,
} from "../../src/index.js";
import { ACTIVITY, fixedNow, recentColumns } from "./compositions.js";

export function ButtonsDemo() {
  return (
    <div className="g-demo-stack">
      <div className="np-row">
        <Button>Continue</Button>
        <Button variant="secondary">Continue</Button>
        <Button variant="ghost">Continue</Button>
        <Button variant="danger">Refund payment</Button>
        <Button variant="mint">Continue</Button>
      </div>
      <div className="np-row">
        <Button disabled>Continue</Button>
        <Button loading>Continue</Button>
        <Button variant="secondary" loading loadingText="Checking…">
          Check again
        </Button>
        <Button size="sm" variant="secondary">
          Dense 40 px
        </Button>
        <Button variant="secondary" trailingIcon={<ArrowRightIcon size={16} />}>
          Next page
        </Button>
      </div>
      <div className="np-row">
        <IconButton label="Open menu" icon={<MenuIcon />} />
        <IconButton label="Open menu" variant="secondary" icon={<MenuIcon />} />
        <IconButton label="Open menu" size="sm" variant="secondary" icon={<MenuIcon />} />
        <IconButton label="Open menu" disabled icon={<MenuIcon />} />
      </div>
      <Button fullWidth leadingIcon={<WalletIcon />}>
        Connect wallet
      </Button>
      <Button fullWidth variant="secondary">
        Send from an exchange or wallet
      </Button>
    </div>
  );
}

export function FieldsDemo() {
  const [network, setNetwork] = useState("base");
  return (
    <div className="g-demo-stack">
      <Field label="Destination name" hint="Only your team sees this name.">
        <Input defaultValue="Treasury" />
      </Field>
      <Field label="Your refund wallet address" error="Enter a Base address that starts with 0x.">
        <Input defaultValue="atlas.near" />
      </Field>
      <Field label="Price">
        <Input numeric inputMode="decimal" defaultValue="49.00" leading="$" trailing="USD" />
      </Field>
      <Field label="Network">
        <Select
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
          options={[
            { value: "base", label: "Base" },
            { value: "ethereum", label: "Ethereum" },
            { value: "arbitrum", label: "Arbitrum" },
            { value: "near", label: "NEAR" },
          ]}
        />
      </Field>
      <Field label="Search" hideLabel>
        <SearchInput placeholder="Search token or network" />
      </Field>
      <Field label="Wallet address" hint="Connect a wallet to verify ownership.">
        <Input disabled placeholder="Connect a wallet to verify ownership" />
      </Field>
    </div>
  );
}

const TOKENS: ComboboxOption[] = [
  { value: "usdc-base", label: "USDC · Base", description: "49.49 USDC · includes fees", keywords: ["usd coin"] },
  { value: "usdc-eth", label: "USDC · Ethereum", description: "Quote available before payment" },
  { value: "eth-eth", label: "ETH · Ethereum", description: "Quote available before payment", keywords: ["ether"] },
  { value: "near-near", label: "NEAR · NEAR", description: "Quote available before payment" },
];

const NETWORKS: ComboboxOption[] = [
  { value: "all", label: "All networks" },
  { value: "base", label: "Base" },
  { value: "ethereum", label: "Ethereum" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "near", label: "NEAR" },
  { value: "solana", label: "Solana", disabled: true, description: "Coming soon" },
];

export function ComboboxDemo() {
  const [token, setToken] = useState("usdc-base");
  const [net, setNet] = useState("all");
  return (
    <div className="g-demo-grid">
      <Combobox
        label="Pay with"
        options={TOKENS}
        value={token}
        onChange={setToken}
        listLabel="Available for this payment"
        empty={
          <EmptyState
            framed={false}
            headingLevel={3}
            title="No matching payment options"
            action={
              <Button variant="secondary" fullWidth>
                Clear filters
              </Button>
            }
          >
            Try another token or network. Only options that can complete this payment are shown.
          </EmptyState>
        }
      />
      <Combobox
        label="Choose a network"
        placeholder="Search networks"
        variant="rows"
        options={NETWORKS}
        value={net}
        onChange={setNet}
      />
    </div>
  );
}

export function ChoiceDemo() {
  const [token, setToken] = useState("usdc-base");
  const [confirmed, setConfirmed] = useState(true);
  return (
    <div className="g-demo-stack">
      <RadioCardGroup label="Available for this payment" value={token} onChange={setToken}>
        <OptionCard value="usdc-base" avatar="U" title="USDC · Base" description="49.49 USDC · includes fees" />
        <OptionCard value="usdc-eth" avatar="U" title="USDC · Ethereum" description="Quote available before payment" />
        <OptionCard value="near" avatar="N" title="NEAR · NEAR" description="Not enough funds" disabled />
      </RadioCardGroup>
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
      <Checkbox
        variant="tile"
        label="I’m sending on Base"
        checked={confirmed}
        onChange={(e) => setConfirmed(e.target.checked)}
      />
      <Checkbox variant="tile" label="I included the memo" />
      <div className="np-stack np-stack--sm">
        <Checkbox label="Email receipts to the payer" defaultChecked />
        <Checkbox label="Require two approvals" description="Destination changes need two admins." />
        <Checkbox label="Disabled option" disabled />
      </div>
    </div>
  );
}

export function CalloutsDemo() {
  return (
    <div className="g-demo-stack">
      <Callout tone="info" title="No account needed">
        You’ll see the total, including fees, before you pay.
      </Callout>
      <Callout tone="warning" title="Use the Base network">
        This address accepts USDC on Base only.
      </Callout>
      <Callout tone="success" title="49.49 USDC paid · Base" reference="Reference NP–10482 · Acme Studio" />
      <Callout tone="danger" title="This address has expired — do not send" reference="Reference NP–10482" icon />
      <Callout tone="neutral" title="Wallet-only checkout" icon>
        A payer does not need an email or NearPay account.
      </Callout>
    </div>
  );
}

const VOCAB = [
  "Paid",
  "Active",
  "Live",
  "Matched",
  "Confirming",
  "Payment detected",
  "Pending",
  "Review",
  "Under review",
  "Cooling off",
  "Awaiting approval",
  "Open",
  "Past due",
  "Not paid",
  "Return pending",
  "Test",
  "Failed",
  "Expired",
  "Returned",
  "Draft",
  "Revoked",
];

export function BadgesDemo() {
  return (
    <div className="g-demo-stack">
      <div className="g-badges">
        {VOCAB.map((v) => (
          <StatusBadge key={v}>{v}</StatusBadge>
        ))}
      </div>
      <div className="np-row">
        <ModePill mode="live" />
        <ModePill mode="test" />
        <StatusBadge tone="success">Business details reviewed by NearPay</StatusBadge>
      </div>
    </div>
  );
}

const MONEY_CASES: Array<[string, MoneyFormatOptions]> = [
  ["USD cents", { amount: "4900", decimals: 2, symbol: "$" }],
  ["Thousands", { amount: "2486000", decimals: 2, symbol: "$" }],
  ["USDC exact", { amount: "49490000", decimals: 6, symbol: "USDC" }],
  ["USDC, 2 dp ceil", { amount: "49485001", decimals: 6, symbol: "USDC", maxFraction: 2, rounding: "ceil" }],
  ["Refund (negative)", { amount: "-4900", decimals: 2, symbol: "$" }],
  ["Delta", { amount: "1240", decimals: 2, symbol: "$", signDisplay: "always" }],
  ["NEAR, 1 yocto", { amount: "1", decimals: 24, symbol: "NEAR" }],
  ["JPY (0 dp)", { amount: "4900", decimals: 0, symbol: "¥" }],
];

export function MoneyDemo() {
  return (
    <div className="g-demo-stack">
      <StatGroup>
        <Stat
          label="Settled volume"
          value={<Money amount="2486000" decimals={2} symbol="$" />}
          sub="+12.4% vs previous week"
          trend="up"
        />
        <Stat
          label="Refunds"
          value={<Money amount="-12900" decimals={2} symbol="$" />}
          sub="−3.1% vs previous week"
          trend="down"
        />
        <Stat label="Needs attention" value="3" sub="2 reviews · 1 delayed" />
      </StatGroup>
      <table className="g-money-table">
        <caption className="np-sr-only">Money formatting examples</caption>
        <thead>
          <tr>
            <th scope="col">Case</th>
            <th scope="col">Input (base units)</th>
            <th scope="col">Rendered</th>
          </tr>
        </thead>
        <tbody>
          {MONEY_CASES.map(([name, o]) => (
            <tr key={name}>
              <td>{name}</td>
              <td className="np-tabular">
                {String(o.amount)} · {o.decimals} dp
              </td>
              <td>
                <Money {...o} /> <span className="np-sr-only">{formatMoney(o)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <KeyValueList
        items={[
          { label: "Purchase", value: <Money amount="4900" decimals={2} symbol="$" /> },
          { label: "Payment fees", value: <Money amount="49" decimals={2} symbol="$" /> },
          { label: "Total to send", value: <Money amount="49490000" decimals={6} symbol="USDC" />, total: true },
        ]}
      />
      <KeyValueList
        layout="stacked"
        items={[
          { label: "Payment destination", value: "USDC · Base" },
          { label: "Destination fingerprint", value: <span className="np-tabular">8F24 · C3D9 · 20A1 · 71B6</span> },
        ]}
      />
    </div>
  );
}

export function TableDemo() {
  const [state, setState] = useState("data");
  return (
    <div className="g-demo-stack">
      <SegmentedControl
        label="Table state"
        size="sm"
        value={state}
        onChange={setState}
        items={[
          { id: "data", label: "Data" },
          { id: "loading", label: "Loading" },
          { id: "empty", label: "Empty" },
        ]}
      />
      <Table
        caption="Payments"
        columns={recentColumns}
        rows={
          state === "data"
            ? [
                {
                  id: "NP–10482",
                  customer: "Wallet 0x71…9A42",
                  amount: "4900",
                  status: "Paid",
                  received: "USDC · Base",
                },
                {
                  id: "NP–10478",
                  customer: "Wallet 0x98…84D2",
                  amount: "8900",
                  status: "Failed",
                  received: "No settlement",
                },
                {
                  id: "NP–10477",
                  customer: "northstar.near",
                  amount: "12900",
                  status: "Pending",
                  received: "USDC · Base",
                },
              ]
            : []
        }
        rowKey={(r) => r.id}
        rowHref={(r) => `#${r.id}`}
        loading={state === "loading"}
        empty="No payments match these filters."
        footer={<Pager summary="Showing 1–20 payments" hasNext onNext={() => {}} />}
      />
    </div>
  );
}

export function NavigationDemo() {
  const [tab, setTab] = useState("keys");
  const [range, setRange] = useState("30d");
  return (
    <div className="g-demo-stack">
      <Breadcrumb items={[{ label: "Acme Studio", href: "#" }, { label: "Developers" }]} />
      <PageHeader
        title="Developers"
        subtitle="Manage access and verify payment notifications."
        actions={<Button>Create key</Button>}
      />
      <Tabs
        label="Developer settings"
        value={tab}
        onChange={setTab}
        items={[
          { id: "keys", label: "API keys" },
          { id: "notifications", label: "Notifications" },
          { id: "events", label: "Events" },
        ]}
      >
        <p className="np-text-secondary">
          {tab === "keys"
            ? "Two keys · last used 2 minutes ago."
            : tab === "notifications"
              ? "1 endpoint · delivering."
              : "Events from the last 30 days."}
        </p>
      </Tabs>
      <SegmentedControl
        label="Date range"
        value={range}
        onChange={setRange}
        items={[
          { id: "7d", label: "7 days" },
          { id: "30d", label: "30 days" },
          { id: "90d", label: "90 days" },
        ]}
      />
    </div>
  );
}

export function ActivityDemo() {
  return (
    <div className="g-demo-stack">
      <Timeline
        items={[
          ...ACTIVITY.slice(2),
          {
            id: "p",
            time: "10:54 IST",
            title: "Refund pending",
            body: "Confirmation will appear here.",
            state: "pending",
          },
          {
            id: "x",
            time: "10:55 IST",
            title: "Received less than expected",
            body: "Expected 49.49 USDC, detected 45.00 USDC.",
            state: "attention",
          },
        ]}
      />
      <Steps
        items={[
          { id: "1", title: "Create your account", description: "Acme Studio · Passkey secured", status: "complete" },
          {
            id: "2",
            title: "Choose where you receive payments",
            description: "Pick a token, network and wallet you control.",
            status: "current",
            action: <Button>Continue</Button>,
          },
          {
            id: "3",
            title: "Add your business details",
            description: "Reviewed by NearPay before live payments.",
            status: "upcoming",
            action: <Button variant="secondary">Start</Button>,
          },
          {
            id: "4",
            title: "Make a test payment",
            description: "See the full checkout and settlement experience.",
            status: "upcoming",
            action: <Button variant="secondary">Try it</Button>,
          },
        ]}
      />
    </div>
  );
}

export function CopyDemo() {
  const deadline = fixedNow() + (14 * 60 + 32) * 1000;
  return (
    <div className="g-demo-stack">
      <Callout tone="warning" title="Use the Base network">
        This address accepts USDC on Base only.
      </Callout>
      <CopyField
        label="Deposit address"
        value="0x8f24a1B9c0E5d7F3a2b4C6d8E0f1A3b5C7c3D920"
        writeText={async () => {}}
        footer={
          <>
            Expires in <Countdown deadline={deadline} now={fixedNow} />
          </>
        }
      />
      <KeyValueList
        items={[{ label: "Exact amount", value: <Money amount="49490000" decimals={6} symbol="USDC" /> }]}
      />
    </div>
  );
}

export function OverlayDemo() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const toast = useToast();
  return (
    <div className="g-demo-stack">
      <div className="np-row">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open dialog
        </Button>
        <Button variant="secondary" onClick={() => toast.show({ title: "Payment link copied", tone: "success" })}>
          Show toast
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.show({ title: "Payment under review", body: "We’ll email you when it’s confirmed.", tone: "warning" })
          }
        >
          Warning toast
        </Button>
        <Button
          variant="secondary"
          onClick={() => setStatus((s) => (s === "Payment detected" ? "Payment complete" : "Payment detected"))}
        >
          Announce status
        </Button>
      </div>
      <LiveRegion visible className="np-text-small np-text-secondary">
        {status ? `Status: ${status}` : "Status updates are announced here without moving focus."}
      </LiveRegion>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Change default settlement destination"
        description="Destination changes need a second approver and a 24-hour safety window."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Request approval</Button>
          </>
        }
      >
        <Field label="Reason" hint="Shared with the approver.">
          <Input placeholder="Add a reason for this change" />
        </Field>
      </Modal>
    </div>
  );
}

export function LoadingEmptyDemo() {
  return (
    <div className="g-demo-stack">
      <Card>
        <div className="np-stack">
          <Skeleton shape="title" width="50" />
          <Skeleton shape="stat" width="75" />
          <Skeleton width="100" />
          <Skeleton width="75" />
          <div className="np-row">
            <Skeleton shape="circle" />
            <Skeleton width="50" />
          </div>
        </div>
      </Card>
      <EmptyState
        icon={<CardIcon />}
        title="No test payments yet"
        action={<Button>Create test payment link</Button>}
        footnote="Test mode · no real funds move"
      >
        Create a test payment link, open checkout, and simulate a payment. You’ll see the result here.
      </EmptyState>
    </div>
  );
}

export function CardsDemo() {
  return (
    <div className="g-demo-grid">
      <Card>
        <div className="np-stack">
          <StatusBadge>Pending</StatusBadge>
          <CardTitle>Live payments are not active yet</CardTitle>
          <p className="np-text-secondary">
            Add your business details and activate a settlement destination. A new destination has a 24-hour safety
            window.
          </p>
          <Button variant="secondary" fullWidth>
            View requirements
          </Button>
        </div>
      </Card>
      <Card>
        <div className="np-stack">
          <CardTitle>Payment details</CardTitle>
          <p className="np-text-h4">Acme Studio</p>
          <StatusBadge tone="success">Reviewed</StatusBadge>
          <p>Business details reviewed by NearPay</p>
          <hr className="np-divider" />
          <KeyValueList
            layout="stacked"
            items={[
              { label: "Payment destination", value: "USDC · Base" },
              { label: "Destination fingerprint", value: "8F24 · C3D9 · 20A1 · 71B6" },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

export function IconsDemo() {
  return (
    <ul className="g-icons">
      {Object.entries(icons).map(([name, Icon]) => (
        <li key={name}>
          <Icon size={24} />
          <span>{name}</span>
        </li>
      ))}
      <li>
        <ShieldCheckIcon size={32} className="np-text-accent" />
        <span>32 px</span>
      </li>
      <li>
        <ClockIcon size={32} className="np-text-accent" />
        <span>32 px</span>
      </li>
    </ul>
  );
}
