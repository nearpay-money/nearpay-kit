import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppShell,
  Breadcrumb,
  Button,
  buttonClassName,
  Callout,
  Card,
  CardTitle,
  Checkbox,
  CheckIcon,
  CheckoutFrame,
  Combobox,
  CopyField,
  Countdown,
  EmptyState,
  Field,
  filterOptions,
  IconButton,
  Input,
  icons,
  KeyValueList,
  LiveRegion,
  Modal,
  ModePill,
  Money,
  NearPayMark,
  OptionCard,
  PageHeader,
  Pager,
  RadioCardGroup,
  SearchInput,
  SegmentedControl,
  Select,
  SelectionCard,
  Skeleton,
  Stat,
  StatGroup,
  StatusBadge,
  Steps,
  statusTone,
  Table,
  Tabs,
  ThemeRoot,
  Timeline,
  ToastProvider,
  useCountdown,
  useToast,
} from "../src/index.js";

function TileCheckbox() {
  const [on, setOn] = useState(false);
  return (
    <Checkbox
      variant="tile"
      label="I’m sending on Base"
      checked={on}
      onChange={(e) => setOn(e.target.checked)}
      description="Required"
    />
  );
}

function TokenGroup() {
  const [v, setV] = useState("usdc-base");
  return (
    <RadioCardGroup label="Available for this payment" value={v} onChange={setV}>
      <OptionCard value="usdc-base" avatar="U" title="USDC · Base" description="49.49 USDC · includes fees" />
      <OptionCard value="eth" avatar="E" title="ETH · Ethereum" />
      <OptionCard value="near" title="NEAR" disabled indicator="none" />
    </RadioCardGroup>
  );
}

function TabsHarness() {
  const [v, setV] = useState("keys");
  return (
    <Tabs
      label="Developer settings"
      value={v}
      onChange={setV}
      items={[
        { id: "keys", label: "API keys" },
        { id: "hooks", label: "Notifications" },
        { id: "events", label: "Events", disabled: true },
      ]}
    >
      panel {v}
    </Tabs>
  );
}

function CountdownValue({ d }: { d: Date | string }) {
  return <span>{useCountdown(d, () => Date.parse("2026-11-07T00:00:00Z"))}</span>;
}

function ModalHarness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Refund payment</Button>
      <Modal
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="Refund NP–10482"
        description="Returns to the original payer."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button>Review in wallet</Button>
          </>
        }
      >
        <p>Body</p>
      </Modal>
    </>
  );
}

function ToastTrigger() {
  const t = useToast();
  return (
    <>
      <Button onClick={() => t.show({ title: "Payment link copied", tone: "success" })}>Copy</Button>
      <Button onClick={() => t.show({ title: "Sticky", body: "Stays", duration: 0, tone: "danger" })}>Sticky</Button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Button", () => {
  it("renders variants as native buttons with type=button", () => {
    render(<Button variant="secondary">Export</Button>);
    const b = screen.getByRole("button", { name: "Export" });
    expect(b.getAttribute("type")).toBe("button");
    expect(b.className).toContain("np-button--secondary");
  });
  it("loading: announces busy, shows Processing…, stays focusable and swallows clicks", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Pay 49.49 USDC
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Processing…" });
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.hasAttribute("disabled")).toBe(false);
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
  it("aria-disabled buttons do not fire", async () => {
    const onClick = vi.fn();
    render(
      <Button aria-disabled="true" onClick={onClick}>
        Send
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onClick).not.toHaveBeenCalled();
  });
  it("disabled buttons are disabled; enabled ones fire", async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button disabled>Continue</Button>
        <Button onClick={onClick} fullWidth size="sm" variant="mint">
          Go
        </Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
  it("exposes the look for links", () => {
    expect(buttonClassName({ variant: "secondary", fullWidth: true })).toBe(
      "np-button np-button--secondary np-button--full",
    );
  });
  it("IconButton requires and exposes a label", () => {
    render(<IconButton label="Open menu" icon={<CheckIcon />} />);
    expect(screen.getByRole("button", { name: "Open menu" })).toBeTruthy();
  });
});

describe("Field + controls", () => {
  it("wires label, hint and error to the input", () => {
    render(
      <Field label="Refund wallet address" hint="Use a wallet you control." error="Enter a Base address." required>
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: /Refund wallet address/ });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.hasAttribute("required")).toBe(true);
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    const texts = ids.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(["Use a wallet you control.", "Enter a Base address."]);
  });
  it("SearchInput is a labelled searchbox; Select a labelled combobox", () => {
    render(
      <>
        <Field label="Search networks" hideLabel>
          <SearchInput />
        </Field>
        <Field label="Currency">
          <Select options={[{ value: "usdc", label: "USDC" }]} placeholder="Choose" defaultValue="usdc" />
        </Field>
      </>,
    );
    expect(screen.getByRole("searchbox", { name: "Search networks" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Currency" })).toBeTruthy();
  });
  it("Input passes through adornments and numeric styling", () => {
    render(<Input aria-label="Price" leading="$" trailing="USD" numeric />);
    expect(screen.getByRole("textbox", { name: "Price" }).className).toContain("np-tabular");
  });
});

describe("Checkbox / OptionCard / SelectionCard", () => {
  it("tile checkbox toggles and keeps its label", async () => {
    render(<TileCheckbox />);
    const cb = screen.getByRole("checkbox", { name: "I’m sending on Base" });
    expect((cb as HTMLInputElement).checked).toBe(false);
    await userEvent.click(cb);
    expect((cb as HTMLInputElement).checked).toBe(true);
    expect(cb.getAttribute("aria-describedby")).toBeTruthy();
  });
  it("RadioCardGroup is a labelled radiogroup; selection is a check, not colour alone", async () => {
    render(<TokenGroup />);
    const group = screen.getByRole("radiogroup", { name: "Available for this payment" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: /ETH · Ethereum/ }));
    expect((screen.getByRole("radio", { name: /ETH · Ethereum/ }) as HTMLInputElement).checked).toBe(true);
    expect(radios[2]?.hasAttribute("disabled")).toBe(true);
  });
  it("OptionCard outside a group throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<OptionCard value="x" title="x" />)).toThrow(/RadioCardGroup/);
    spy.mockRestore();
  });
  it("SelectionCard states its selection in text", () => {
    render(
      <SelectionCard
        avatar="U"
        title="USDC · Base"
        description="Wallet 0x71…9A42"
        action={<button type="button">Change</button>}
      />,
    );
    expect(screen.getByRole("img", { name: "Selected" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });
});

describe("Combobox-lite", () => {
  const options = [
    { value: "usdc-base", label: "USDC · Base", description: "49.49 USDC", keywords: ["usd coin"] },
    { value: "usdc-eth", label: "USDC · Ethereum" },
    { value: "eth", label: "ETH · Ethereum", disabled: true },
    { value: "near", label: "NEAR · NEAR" },
  ];
  it("filters accent/case-insensitively on every word", () => {
    expect(filterOptions(options, "usdc eth").map((o) => o.value)).toEqual(["usdc-eth"]);
    expect(filterOptions(options, "USD COIN").map((o) => o.value)).toEqual(["usdc-base"]);
    expect(filterOptions(options, "  ")).toHaveLength(4);
    expect(filterOptions([{ value: "a", label: "Économie" }], "econ")).toHaveLength(1);
  });
  it("follows the combobox pattern: activedescendant, arrows skip disabled, Enter selects, Esc clears", async () => {
    const onChange = vi.fn();
    render(
      <Combobox
        label="Pay with"
        options={options}
        value="usdc-base"
        onChange={onChange}
        listLabel="Available for this payment"
      />,
    );
    const input = screen.getByRole("combobox", { name: "Pay with" });
    const list = screen.getByRole("listbox", { name: "Available for this payment" });
    expect(input.getAttribute("aria-controls")).toBe(list.id);
    expect(within(list).getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("option", { name: /USDC · Base/ }).getAttribute("aria-selected")).toBe("true");
    input.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.getElementById(input.getAttribute("aria-activedescendant") ?? "")?.textContent).toContain(
      "USDC · Ethereum",
    );
    await userEvent.keyboard("{ArrowDown}");
    expect(document.getElementById(input.getAttribute("aria-activedescendant") ?? "")?.textContent).toContain(
      "NEAR · NEAR",
    );
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{End}{Home}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("usdc-base");
    await userEvent.type(input, "near");
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("1 option available");
    await userEvent.keyboard("{Escape}");
    expect((input as HTMLInputElement).value).toBe("");
  });
  it("clicking an option selects it; disabled options do not; empty state renders", async () => {
    const onChange = vi.fn();
    render(
      <Combobox
        label="Choose a network"
        variant="rows"
        options={options}
        value={undefined}
        onChange={onChange}
        empty="No matching payment options"
      />,
    );
    await userEvent.click(screen.getByRole("option", { name: /NEAR · NEAR/ }));
    expect(onChange).toHaveBeenCalledWith("near");
    await userEvent.click(screen.getByRole("option", { name: /ETH · Ethereum/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    await userEvent.type(screen.getByRole("combobox"), "doge");
    expect(screen.getByText("No matching payment options")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("0 options available");
  });
  it("supports a controlled query", async () => {
    const onQueryChange = vi.fn();
    render(
      <Combobox
        label="Pay with"
        options={options}
        value={undefined}
        onChange={() => {}}
        query="eth"
        onQueryChange={onQueryChange}
      />,
    );
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await userEvent.type(screen.getByRole("combobox"), "x");
    expect(onQueryChange).toHaveBeenCalledWith("ethx");
  });
});

describe("Status and money display", () => {
  it("StatusBadge maps vocabulary to tones and always shows the word", () => {
    render(
      <>
        <StatusBadge>Paid</StatusBadge>
        <StatusBadge>Cooling off</StatusBadge>
        <StatusBadge>Failed</StatusBadge>
        <StatusBadge tone="info">Custom</StatusBadge>
        <ModePill mode="test" />
      </>,
    );
    expect(screen.getByText("Paid").className).toContain("np-badge--success");
    expect(screen.getByText("Cooling off").className).toContain("np-badge--warning");
    expect(screen.getByText("Failed").className).toContain("np-badge--danger");
    expect(screen.getByText("Custom").className).toContain("np-badge--info");
    expect(screen.getByText("Test").className).toContain("np-badge--warning");
    expect(statusTone("  UNDER REVIEW ")).toBe("warning");
    expect(statusTone("something new")).toBe("neutral");
  });
  it("Money renders formatted, tabular text", () => {
    const { container } = render(
      <>
        <Money amount="-4900" decimals={2} symbol="$" size="hero" />
        <Money amount="49485001" decimals={6} symbol="USDC" maxFraction={2} rounding="ceil" />
      </>,
    );
    const [refund, usdc] = Array.from(container.querySelectorAll(".np-money"));
    expect(refund?.textContent).toBe("−$49.00");
    expect(refund?.className).toContain("np-money--negative");
    expect(usdc?.textContent).toBe("49.49 USDC");
    expect(usdc?.getAttribute("data-rounded")).toBe("true");
  });
  it("Stat, KeyValueList render description lists", () => {
    const { container } = render(
      <>
        <StatGroup>
          <Stat label="Settled volume" value="$24,860.00" sub="+12.4% vs previous week" trend="up" />
        </StatGroup>
        <KeyValueList
          items={[
            { label: "Purchase", value: "$49.00" },
            { label: "Payment fees", value: "$0.49" },
            { label: "Total to send", value: "49.49 USDC", total: true },
          ]}
        />
        <KeyValueList layout="stacked" items={[{ label: "Destination", value: "USDC · Base" }]} />
      </>,
    );
    expect(container.querySelectorAll("dl")).toHaveLength(3);
    expect(screen.getByText("Total to send").tagName).toBe("DT");
    expect(screen.getByText("+12.4% vs previous week").className).toContain("np-stat__sub--up");
  });
  it("Callout: live callouts are status regions with title, body and reference", () => {
    render(
      <Callout tone="warning" title="Use the Base network" reference="Reference NP–10482" live icon>
        This address accepts USDC on Base only.
      </Callout>,
    );
    const s = screen.getByRole("status");
    expect(s.textContent).toContain("Use the Base network");
    expect(s.textContent).toContain("Reference NP–10482");
  });
});

describe("Table / Pager", () => {
  const rows = [
    { id: "NP–10482", status: "Paid", amount: "4900" },
    { id: "NP–10481", status: "Confirming", amount: "12900" },
  ];
  const columns = [
    { key: "id", header: "Payment", cell: (r: (typeof rows)[number]) => r.id, primary: true },
    {
      key: "amount",
      header: "Amount",
      cell: (r: (typeof rows)[number]) => <Money amount={r.amount} decimals={2} symbol="$" />,
      align: "end" as const,
      numeric: true,
    },
    {
      key: "status",
      header: "Status",
      cell: (r: (typeof rows)[number]) => <StatusBadge>{r.status}</StatusBadge>,
      hideOnNarrow: true,
    },
  ];
  it("renders a captioned table with column headers and row links", () => {
    render(
      <Table
        caption="Recent payments"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/payments/${r.id}`}
      />,
    );
    const table = screen.getByRole("table", { name: "Recent payments" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Payment", "Amount", "Status"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "NP–10482" }).getAttribute("href")).toBe("/payments/NP–10482");
  });
  it("loading state is busy and announced; empty state shows the message", () => {
    const { rerender } = render(
      <Table caption="Payments" columns={columns} rows={[]} rowKey={(r) => r.id} loading loadingRows={2} />,
    );
    expect(screen.getByRole("table").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Loading payments…");
    expect(screen.getAllByRole("row")).toHaveLength(3);
    rerender(<Table caption="Payments" columns={columns} rows={[]} rowKey={(r) => r.id} empty="No payments yet." />);
    expect(screen.getByText("No payments yet.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");
  });
  it("Pager: Next page disabled at the end; Previous shown when possible", async () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const { rerender } = render(<Pager summary="Showing 1–20 payments" hasNext onNext={onNext} />);
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    await userEvent.click(within(nav).getByRole("button", { name: "Next page" }));
    expect(onNext).toHaveBeenCalled();
    rerender(<Pager hasPrevious onPrevious={onPrevious} />);
    expect(screen.getByRole("button", { name: "Next page" }).hasAttribute("disabled")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPrevious).toHaveBeenCalled();
  });
});

describe("Tabs / SegmentedControl / Breadcrumb / PageHeader", () => {
  it("Tabs: roving tabindex and arrow keys", async () => {
    render(<TabsHarness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    tabs[0]?.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Notifications" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Notifications");
    expect(screen.getByRole("tabpanel").textContent).toBe("panel hooks");
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toBe("API keys");
    await userEvent.keyboard("{End}{Home}{ArrowLeft}{ArrowUp}{ArrowDown}");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(document.activeElement?.id);
  });
  it("SegmentedControl is a radiogroup with keyboard support", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Date range"
        value="7d"
        onChange={onChange}
        size="sm"
        items={[
          { id: "7d", label: "7 days" },
          { id: "30d", label: "30 days" },
        ]}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Date range" });
    const r = within(group).getAllByRole("radio");
    expect(r[0]?.getAttribute("aria-checked")).toBe("true");
    r[0]?.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("30d");
    await userEvent.click(r[1] as HTMLElement);
    await userEvent.keyboard("{a}");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
  it("Breadcrumb marks the current page; PageHeader is an h1", () => {
    render(
      <>
        <Breadcrumb
          items={[{ label: "Acme Studio", href: "/" }, { label: "Payments", href: "/p" }, { label: "NP–10482" }]}
        />
        <PageHeader
          title="Payments"
          subtitle="Track every payment."
          status={<StatusBadge>Paid</StatusBadge>}
          actions={<Button>Export</Button>}
        />
      </>,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
    expect(within(nav).getByText("NP–10482").getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { level: 1, name: "Payments" })).toBeTruthy();
  });
});

describe("Timeline / Steps / EmptyState / Skeleton / Card", () => {
  it("Timeline is an ordered, labelled list with machine-readable times and textual states", () => {
    render(
      <Timeline
        items={[
          {
            id: "1",
            time: "10:42:18",
            dateTime: "2026-11-07T10:42:18+05:30",
            title: "Payment complete",
            body: "Settlement verified.",
          },
          { id: "2", time: "10:42:30", title: "Refund pending", state: "pending" },
          { id: "3", time: "10:43", title: "Less than expected", state: "attention" },
          { id: "4", time: "10:44", title: "Note", state: "info" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Payment activity" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(list.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-07T10:42:18+05:30");
    expect(list.textContent).toContain("Completed:");
    expect(list.textContent).toContain("In progress:");
    expect(list.textContent).toContain("Needs attention:");
  });
  it("Steps: zero-padded numbers, aria-current step, completed steps say Complete", () => {
    render(
      <Steps
        items={[
          { id: "a", title: "Create your account", status: "complete" },
          {
            id: "b",
            title: "Choose where you receive payments",
            status: "current",
            action: <Button>Continue</Button>,
            description: "Pick a token.",
          },
          {
            id: "c",
            title: "Make a test payment",
            status: "upcoming",
            action: <Button variant="secondary">Try it</Button>,
          },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("01");
    expect(items[0]?.textContent).toContain("Complete");
    expect(items[1]?.getAttribute("aria-current")).toBe("step");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Continue", "Try it"]);
  });
  it("EmptyState, Skeleton, Card", () => {
    const { container } = render(
      <>
        <EmptyState
          title="No test payments yet"
          icon={<CheckIcon />}
          action={<Button>Create test payment link</Button>}
          footnote="Test mode · no real funds move"
          headingLevel={3}
        >
          Create a test payment link.
        </EmptyState>
        <Skeleton shape="circle" />
        <Card as="section" padding="sm" aria-label="Settlement">
          <CardTitle as="h3">Settlement</CardTitle>
        </Card>
      </>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "No test payments yet" })).toBeTruthy();
    expect(container.querySelector(".np-skeleton")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("region", { name: "Settlement" })).toBeTruthy();
  });
});

describe("CopyField", () => {
  it("copies the full value, announces it, and can reveal the full address", async () => {
    const writeText = vi.fn(async () => {});
    const value = "0x8f24a1B9c0E5d7F3a2b4C6d8E0f1A3b5C7c3D920";
    render(<CopyField label="Deposit address" value={value} writeText={writeText} footer="Expires in 14:32" />);
    expect(screen.getByText("0x8f24…c3D920").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText(value)).toBeTruthy(); // full value for assistive tech
    await userEvent.click(screen.getByRole("button", { name: "Copy full address" }));
    expect(writeText).toHaveBeenCalledWith(value);
    expect(screen.getByRole("status").textContent).toBe("Address copied");
    const reveal = screen.getByRole("button", { name: "Show full address" });
    await userEvent.click(reveal);
    expect(reveal.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByText("0x8f24…c3D920")).toBeNull();
  });
  it("on clipboard failure reveals the address and says how to copy", async () => {
    render(
      <CopyField
        label="Deposit address"
        value="0x8f24a1B9c0E5d7F3a2b4C6d8E0f1A3b5C7c3D920"
        writeText={() => Promise.reject(new Error("denied"))}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy full address" }));
    expect(screen.getByRole("status").textContent).toContain("Couldn’t copy");
    expect(screen.getByRole("button", { name: "Show shortened address" })).toBeTruthy();
  });
  it("short values are shown as-is without a reveal toggle", () => {
    render(
      <CopyField
        label="Reference"
        value="NP-10482"
        copyLabel="Copy payment reference"
        writeText={async () => {}}
        defaultRevealed
      />,
    );
    expect(screen.queryByRole("button", { name: /full address/ })).toBeNull();
  });
});

describe("Countdown", () => {
  it("ticks once a second and fires onExpire once", () => {
    vi.useFakeTimers();
    let now = 1_000_000;
    const clock = () => now;
    const onExpire = vi.fn();
    render(<Countdown deadline={now + 2_000} now={clock} onExpire={onExpire} />);
    const t = screen.getByRole("timer");
    expect(t.textContent).toBe("00:02");
    expect(t.getAttribute("aria-live")).toBe("off");
    act(() => {
      now += 1_000;
      vi.advanceTimersByTime(1_000);
    });
    expect(t.textContent).toBe("00:01");
    act(() => {
      now += 2_000;
      vi.advanceTimersByTime(2_000);
    });
    expect(t.textContent).toBe("00:00");
    expect(onExpire).toHaveBeenCalledOnce();
  });
  it("accepts Date and ISO deadlines", () => {
    render(
      <>
        <CountdownValue d={new Date("2026-11-07T00:01:00Z")} />
        <CountdownValue d="2026-11-07T00:00:30Z" />
      </>,
    );
    expect(screen.getByText("60")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
  });
});

describe("Modal", () => {
  it("is a labelled modal dialog; focuses the first action, traps Tab, Esc closes and restores focus", async () => {
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Refund payment" });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Refund NP–10482" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Cancel");
    expect(document.documentElement.classList.contains("np-scroll-locked")).toBe(true);
    await userEvent.tab();
    expect(document.activeElement?.textContent).toBe("Review in wallet");
    await userEvent.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close");
    await userEvent.tab({ shift: true });
    expect(document.activeElement?.textContent).toBe("Review in wallet");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.documentElement.classList.contains("np-scroll-locked")).toBe(false);
  });
  it("backdrop click closes unless not dismissible; dialog without focusables keeps focus", () => {
    const onClose = vi.fn();
    const { container, rerender } = render(<Modal open onClose={onClose} title="T" size="sm" />);
    fireEvent.click(container.querySelector(".np-modal-scrim") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<Modal open onClose={onClose} title="T" dismissible={false} />);
    fireEvent.click(container.querySelector(".np-modal-scrim") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("dialog");
    (screen.getByRole("button", { name: "Close" }) as HTMLElement).remove();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: "a" });
  });
  it("honours initialFocus", () => {
    render(
      <Modal open onClose={() => {}} title="T" initialFocus={() => document.getElementById("target")}>
        <input aria-label="first" />
        <input id="target" aria-label="target" />
      </Modal>,
    );
    expect(document.activeElement?.id).toBe("target");
  });
});

describe("Toasts and live regions", () => {
  it("announces politely, auto-dismisses, and can be dismissed", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(region.textContent).toContain("Payment link copied");
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(region.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Sticky" }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(region.textContent).toContain("Sticky");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(region.textContent).toBe("");
  });
  it("useToast outside the provider throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ToastTrigger />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
  it("LiveRegion is polite and atomic", () => {
    render(<LiveRegion visible>Payment detected</LiveRegion>);
    const r = screen.getByRole("status");
    expect(r.getAttribute("aria-atomic")).toBe("true");
    expect(r.className).toBe("");
  });
});

describe("AppShell", () => {
  it("has skip link, labelled navigation with current page, main landmark, mode and notifications", async () => {
    render(
      <AppShell
        workspace={{ name: "Acme Studio", subtitle: "acme.studio", onSwitch: () => {} }}
        nav={[
          {
            label: "Workspace",
            items: [
              { id: "o", label: "Overview", href: "/", current: true },
              { id: "p", label: "Payments", href: "/p" },
            ],
          },
          { items: [{ id: "s", label: "Settings", href: "/s" }] },
        ]}
        footerLinks={[{ label: "Help & support", href: "/help" }]}
        user={{ name: "Alex Morgan", role: "Owner" }}
        breadcrumb={<Breadcrumb items={[{ label: "Acme Studio" }]} />}
        mode="live"
        notifications={{ unread: 2 }}
      >
        <h1>Overview</h1>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toMatch(/^#np-main/);
    const nav = screen.getByRole("navigation", { name: "Workspace" });
    expect(within(nav).getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Notifications, 2 unread/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Switch workspace, current: Acme Studio/ })).toBeTruthy();
    expect(screen.getByText("Alex Morgan · Owner")).toBeTruthy();
    const menu = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close menu");
    await userEvent.keyboard("{Escape}");
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menu);
    await userEvent.click(menu);
    await userEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(menu.getAttribute("aria-expanded")).toBe("false");
  });
  it("without unread notifications says so", () => {
    render(
      <AppShell workspace={{ name: "NearPay Operations" }} nav={[]} notifications={{}} brand={<span>Ops</span>}>
        x
      </AppShell>,
    );
    expect(screen.getByRole("button", { name: /none unread/ })).toBeTruthy();
  });
});

describe("CheckoutFrame", () => {
  it("renders merchant, amount, back, test-mode banner and the trust footer", async () => {
    const onBack = vi.fn();
    render(
      <CheckoutFrame
        merchant={{ name: "Acme Studio", subtitle: "Pro plan · November" }}
        amount={<Money amount="4900" decimals={2} symbol="$" />}
        onBack={onBack}
        testMode
        links={{ help: "/help", privacy: "/privacy", terms: "/terms" }}
        summary={<p>Pro plan</p>}
      >
        <Button fullWidth>Pay 49.49 USDC</Button>
      </CheckoutFrame>,
    );
    expect(screen.getByText("Test mode — no real funds")).toBeTruthy();
    expect(screen.getByText("Secured by NearPay")).toBeTruthy();
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(["Help", "Privacy", "Terms"]);
    expect(screen.getByRole("region", { name: "Order summary" }).textContent).toContain("$49.00");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Back to Acme Studio" }));
    expect(onBack).toHaveBeenCalledTimes(2);
  });
  it("embed variant without header or links", () => {
    const { container } = render(
      <CheckoutFrame variant="embed" banner={<span>Custom banner</span>}>
        <p>Flow</p>
      </CheckoutFrame>,
    );
    expect(container.querySelector(".np-checkout--embed")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Order summary" })).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("Custom banner")).toBeTruthy();
  });
});

describe("ThemeRoot and icons", () => {
  it("applies theme and appearance overrides without a style attribute in the markup", () => {
    const html = renderToStaticMarkup(
      <ThemeRoot theme="dark" accent="#4f46e5" radius={12}>
        <Button>Pay</Button>
      </ThemeRoot>,
    );
    expect(html).not.toMatch(/style=/);
    expect(html).toContain('data-theme="dark"');
    const { container } = render(
      <ThemeRoot theme="dark" accent="#4f46e5" radius={12}>
        x
      </ThemeRoot>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--np-radius-control")).toBe("12px");
    expect(root.style.getPropertyValue("--np-color-on-accent")).toBeTruthy();
  });
  it("auto theme subscribes to prefers-color-scheme when an accent is set", () => {
    const listeners: Array<(e: { matches: boolean }) => void> = [];
    const mq = {
      matches: true,
      addEventListener: (_: string, f: (e: { matches: boolean }) => void) => listeners.push(f),
      removeEventListener: vi.fn(),
    };
    const orig = window.matchMedia;
    window.matchMedia = (() => mq) as unknown as typeof window.matchMedia;
    const { container, unmount } = render(<ThemeRoot theme="auto" accent="#65dfc0" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-theme")).toBe("auto");
    expect(root.style.getPropertyValue("--np-color-on-accent")).toBe("#102c30");
    act(() => listeners[0]?.({ matches: false }));
    expect(root.style.getPropertyValue("--np-color-on-accent")).toBe("#132d31");
    unmount();
    expect(mq.removeEventListener).toHaveBeenCalled();
    window.matchMedia = orig;
  });
  it("renders no markup-level inline styles anywhere (CSP)", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <AppShell
          workspace={{ name: "Acme" }}
          nav={[{ items: [{ id: "a", label: "A", href: "#" }] }]}
          mode="test"
          notifications={{}}
        >
          <CheckoutFrame merchant={{ name: "Acme" }} amount="$49.00" testMode onBack={() => {}}>
            <Field label="Search">
              <SearchInput />
            </Field>
            <Combobox label="Pay with" options={[{ value: "a", label: "USDC · Base" }]} value="a" onChange={() => {}} />
            <CopyField label="Deposit address" value="0x8f24a1B9c0E5d7F3a2b4C6d8E0f1A3b5C7c3D920" />
            <Countdown deadline={0} />
            <Skeleton />
            <Table caption="t" columns={[{ key: "a", header: "A", cell: () => "x" }]} rows={[1]} rowKey={String} />
            <Modal open onClose={() => {}} title="Dialog" />
          </CheckoutFrame>
        </AppShell>
      </ToastProvider>,
    );
    expect(html).not.toMatch(/\sstyle=/);
  });
  it("icons are hidden by default and labelled when titled", () => {
    const { container } = render(
      <>
        {Object.entries(icons).map(([name, Icon]) => (
          <Icon key={name} />
        ))}
        <NearPayMark title="NearPay" />
        <CheckIcon title="Done" className="x" />
      </>,
    );
    const hidden = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(hidden.length).toBe(Object.keys(icons).length);
    expect(screen.getByRole("img", { name: "NearPay" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Done" }).getAttribute("class")).toBe("np-icon x");
  });
});
