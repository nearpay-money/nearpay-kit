import { useState } from "react";
import {
  Button,
  CardIcon,
  CheckoutFrame,
  CopyText,
  ErrorState,
  Field,
  FilterBar,
  FilterPill,
  IdText,
  Input,
  iconSvg,
  LineChart,
  LogOutIcon,
  MenuButton,
  Modal,
  MoreIcon,
  OptionButton,
  PageHeader,
  PageLayout,
  Popover,
  SearchInput,
  Section,
  SegmentedControl,
  Select,
  Textarea,
  TwoColumnLayout,
  WalletIcon,
} from "../../src/index.js";

export function TextareaDemo() {
  return (
    <div className="g-demo-stack">
      <Field label="Refund reason" hint="Shared with the payer in the refund receipt.">
        <Textarea placeholder="Duplicate order, cancelled subscription…" />
      </Field>
      <Field label="Internal note" error="Add a note of at least 10 characters." required>
        <Textarea defaultValue="Too short" rows={3} />
      </Field>
      <Field label="Settlement wallet" error="This address is not on Base.">
        <Select options={[{ value: "a", label: "Treasury · 0x8f…D920" }]} />
      </Field>
      <Field label="Webhook URL" error>
        <Input defaultValue="http://example.com/hook" />
      </Field>
    </div>
  );
}

export function ErrorStatesDemo() {
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="g-demo-stack">
      <ErrorState
        title="Payments couldn’t load"
        message="Check your connection and try again. Nothing was changed."
        onRetry={() => {
          setRetrying(true);
          setTimeout(() => setRetrying(false), 1500);
        }}
        retrying={retrying}
        reference={
          <>
            Request <IdText value="req_01J9ZK3X4Q2ABCDEF" label="request ID" writeText={async () => {}} />
          </>
        }
      />
      <ErrorState framed={false} headingLevel={3} title="This chart is unavailable" message="Try again in a minute." />
    </div>
  );
}

export function CopyTextDemo() {
  return (
    <div className="g-demo-stack">
      <p>
        Reference <CopyText value="NP–10482" label="payment reference" writeText={async () => {}} />
      </p>
      <p>
        Payment{" "}
        <IdText value="pi_01J9ZK3X4Q2ABCDEFGHJKMNPQR" head={8} tail={6} label="payment ID" writeText={async () => {}} />
      </p>
      <p>
        Transaction{" "}
        <IdText
          value="0x9c1e5f3a7b2d4e6f8a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f"
          head={10}
          tail={8}
          label="transaction hash"
          writeText={async () => {}}
        />
      </p>
    </div>
  );
}

export function FiltersDemo() {
  const [status, setStatus] = useState("all");
  const [network, setNetwork] = useState("base");
  return (
    <div className="g-demo-stack">
      <FilterBar
        label="Payment filters"
        actions={
          <Button variant="ghost" size="sm" onClick={() => setStatus("all")}>
            Clear filters
          </Button>
        }
      >
        <SearchInput aria-label="Search payments" placeholder="Search payments" />
        <FilterPill
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            { value: "paid", label: "Paid" },
            { value: "review", label: "Review" },
            { value: "failed", label: "Failed" },
          ]}
        />
        <FilterPill
          label="Network"
          value={network}
          defaultValue="all"
          onChange={setNetwork}
          options={[
            { value: "all", label: "All networks" },
            { value: "base", label: "Base" },
            { value: "near", label: "NEAR" },
          ]}
        />
        <Popover
          label="Date range"
          trigger={(p) => (
            <button {...p} className="np-select-button">
              Last 30 days
            </button>
          )}
        >
          {(close) => (
            <div className="np-stack np-stack--sm">
              {["Today", "Last 7 days", "Last 30 days", "Last 90 days"].map((r) => (
                <Button key={r} variant="ghost" size="sm" onClick={close}>
                  {r}
                </Button>
              ))}
            </div>
          )}
        </Popover>
      </FilterBar>
      <div className="np-row">
        <MenuButton
          label="Payment actions"
          triggerLabel="Payment actions"
          variant="ghost"
          items={[
            { id: "view", label: "View payment" },
            { id: "copy", label: "Copy reference" },
            { id: "s", separator: true },
            { id: "refund", label: "Refund payment", danger: true },
          ]}
        >
          <MoreIcon />
        </MenuButton>
        <MenuButton
          label="Account"
          variant="select"
          items={[
            { id: "h", heading: "Alex Morgan" },
            { id: "settings", label: "Account settings" },
            { id: "out", label: "Sign out", icon: <LogOutIcon size={20} /> },
          ]}
        >
          Alex Morgan
        </MenuButton>
      </div>
    </div>
  );
}

export function StackedModalsDemo() {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  return (
    <div className="g-demo-stack">
      <Button variant="secondary" onClick={() => setOuter(true)}>
        Open settings dialog
      </Button>
      <Modal
        open={outer}
        onClose={() => setOuter(false)}
        title="Settlement destination"
        footer={<Button onClick={() => setInner(true)}>Change destination</Button>}
      >
        <p className="np-text-secondary">Treasury · USDC on Base</p>
      </Modal>
      <Modal
        open={inner}
        onClose={() => setInner(false)}
        title="New destination"
        size="sm"
        footer={<Button onClick={() => setStepUp(true)}>Request approval</Button>}
      >
        <Field label="Wallet address">
          <Input placeholder="0x…" />
        </Field>
      </Modal>
      <Modal open={stepUp} onClose={() => setStepUp(false)} title="Confirm it’s you" size="sm" priority="step-up">
        <Button fullWidth onClick={() => setStepUp(false)}>
          Use passkey
        </Button>
      </Modal>
    </div>
  );
}

export function OptionButtonDemo() {
  return (
    <div className="g-demo-stack">
      <OptionButton
        avatar={<WalletIcon />}
        title="Connect a wallet"
        description="Pay from MetaMask, Coinbase Wallet or NEAR wallets"
      />
      <OptionButton
        avatar={<CardIcon />}
        title="Send from an exchange"
        description="Copy an address and send manually"
      />
      <OptionButton avatar="G" title="Globex Inc." description="Owner · 3 members" disabled />
    </div>
  );
}

export function LayoutDemo() {
  return (
    <PageLayout
      width="default"
      header={
        <PageHeader
          title="Branding"
          subtitle="How hosted checkout looks to payers."
          actions={<Button>Save changes</Button>}
        />
      }
    >
      <Section title="Appearance" description="Applied to hosted and embedded checkout.">
        <TwoColumnLayout
          asideLabel="Preview"
          aside={
            <CheckoutFrame variant="embed" merchant={{ name: "Acme Studio" }}>
              <Button fullWidth>Pay 49.49 USDC</Button>
            </CheckoutFrame>
          }
        >
          <div className="np-stack">
            <Field label="Display name">
              <Input defaultValue="Acme Studio" />
            </Field>
            <Field label="Theme">
              <Select
                options={[
                  { value: "auto", label: "Match the payer’s device" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            </Field>
            <Field label="Support message" hint="Shown under the payment button.">
              <Textarea rows={3} />
            </Field>
          </div>
        </TwoColumnLayout>
      </Section>
      <Section title="Danger zone" headingLevel={3} divided>
        <p className="np-text-secondary">Remove the logo and reset colours.</p>
      </Section>
    </PageLayout>
  );
}

const DAYS = ["1 Nov", "2 Nov", "3 Nov", "4 Nov", "5 Nov", "6 Nov", "7 Nov"];

export function LineChartDemo() {
  const [range, setRange] = useState("single");
  return (
    <div className="g-demo-stack">
      <SegmentedControl
        label="Series"
        size="sm"
        value={range}
        onChange={setRange}
        items={[
          { id: "single", label: "Volume" },
          { id: "multi", label: "By network" },
        ]}
      />
      {range === "single" ? (
        <LineChart
          label="Payment volume, 1–7 Nov 2026"
          labels={DAYS}
          decimals={2}
          symbol="$"
          series={[
            {
              id: "v",
              label: "Volume",
              values: ["201000", "248000", "231000", "352000", "337000", "418000", "540200"],
            },
          ]}
        />
      ) : (
        <LineChart
          label="Volume by network, 1–7 Nov 2026"
          labels={DAYS}
          decimals={6}
          symbol="USDC"
          series={[
            {
              id: "base",
              label: "Base",
              values: [
                "1200000000",
                "1450000000",
                "1300000000",
                "2100000000",
                "1980000000",
                "2600000000",
                "3100000000",
              ],
            },
            {
              id: "near",
              label: "NEAR",
              values: ["600000000", "720000000", "800000000", "950000000", "910000000", "1100000000", "1500000000"],
            },
            {
              id: "eth",
              label: "Ethereum",
              values: ["210000000", "310000000", "210000000", "470000000", "480000000", "480000000", "802000000"],
            },
            {
              id: "arb",
              label: "Arbitrum",
              values: ["0", "0", "120000000", null, "140000000", "190000000", "210000000"],
            },
          ]}
        />
      )}
      <LineChart
        size="sm"
        label="Refunds, 1–7 Nov 2026"
        labels={DAYS}
        decimals={2}
        symbol="$"
        series={[{ id: "r", label: "Refunds", values: ["4900", "0", "12900", "0", "0", "8900", "4900"] }]}
      />
    </div>
  );
}

export function SvgIconsDemo() {
  const names = ["check", "copy", "refresh", "log-out", "nearpay-mark"] as const;
  return (
    <ul className="g-icons">
      {names.map((n) => (
        <li key={n}>
          {/* Rendered from the React-free string API (what Astro pages use). */}
          <span
            className="g-svg-icon"
            ref={(el) => {
              if (el) el.innerHTML = iconSvg(n, { size: 24 });
            }}
          />
          <span>{n}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProseDemo() {
  return (
    <div className="g-prose">
      <nav className="np-toc" aria-label="On this page">
        <p className="np-toc__title">On this page</p>
        <ol>
          <li>
            <a href="#g-prose-1" aria-current="location">
              Accept a payment
            </a>
          </li>
          <li>
            <a href="#g-prose-2">Verify webhooks</a>
          </li>
        </ol>
      </nav>
      <article className="np-prose">
        <h2 id="g-prose-1">Accept a payment</h2>
        <p>
          Create a payment link, share it, and NearPay confirms the payment on-chain. Amounts are integers in the
          asset’s smallest unit, for example <code>4900</code> for $49.00.
        </p>
        <ul>
          <li>Payers never need an account.</li>
          <li>Funds settle directly to your wallet.</li>
        </ul>
        <figure className="np-codeblock">
          <figcaption className="np-codeblock__title">curl</figcaption>
          <pre>
            <code>{`curl https://api.nearpay.money/v1/payment_links \\
  -H "Authorization: Bearer sk_test_…" \\
  -d amount=4900 -d currency=usd`}</code>
          </pre>
        </figure>
        <h2 id="g-prose-2">Verify webhooks</h2>
        <blockquote>Always verify the signature before trusting an event.</blockquote>
      </article>
    </div>
  );
}
