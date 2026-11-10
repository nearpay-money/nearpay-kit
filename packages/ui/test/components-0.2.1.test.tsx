import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppShell,
  Breadcrumb,
  Button,
  CheckIcon,
  CheckoutFrame,
  Combobox,
  CopyField,
  CopyText,
  ErrorState,
  Field,
  FieldError,
  FilterBar,
  FilterPill,
  ICON_NAMES,
  IdText,
  Input,
  iconSvg,
  icons,
  LineChart,
  type LinkRenderer,
  MenuButton,
  Modal,
  NearPayMark,
  OptionButton,
  openLayerCount,
  PageLayout,
  Popover,
  Section,
  StateScreen,
  Table,
  Textarea,
  TwoColumnLayout,
} from "../src/index.js";

const shellNavigate = vi.fn((_: unknown, e: { preventDefault(): void }) => e.preventDefault());

function FilterHarness() {
  const [v, setV] = useState("all");
  return (
    <FilterBar label="Payment filters" actions={<Button variant="ghost">Clear filters</Button>}>
      <FilterPill
        label="Status"
        value={v}
        onChange={setV}
        options={[
          { value: "all", label: "All" },
          { value: "paid", label: "Paid" },
          { value: "failed", label: "Failed" },
        ]}
      />
    </FilterBar>
  );
}

function StackHarness() {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  return (
    <>
      <Modal open={stepUp} onClose={() => setStepUp(false)} title="Confirm it’s you" priority="step-up">
        <button type="button">Use passkey</button>
      </Modal>
      <Modal open={outer} onClose={() => setOuter(false)} title="Outer">
        <button type="button" onClick={() => setInner(true)}>
          Open inner
        </button>
        <Modal open={inner} onClose={() => setInner(false)} title="Inner">
          <button type="button" onClick={() => setStepUp(true)}>
            Approve
          </button>
        </Modal>
      </Modal>
    </>
  );
}

function ShellHarness() {
  const [open, setOpen] = useState(false);
  return (
    <AppShell
      workspace={{ name: "NearPay Operations" }}
      nav={[{ items: [{ id: "p", label: "Payments", href: "/p" }] }]}
      footerLinks={[{ label: "Help", href: "/help" }]}
      footerActions={<Button variant="ghost">Sign out</Button>}
      modeSwitch={<button type="button">Live / Test</button>}
      mode="live"
      navOpen={open}
      onNavOpenChange={setOpen}
      onNavigate={shellNavigate}
      renderLink={spaLink}
    >
      <p>{open ? "drawer open" : "drawer closed"}</p>
    </AppShell>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Package root (vitest runs from the repo root; jsdom's import.meta.url is not a file URL). */
const UI = existsSync(join(process.cwd(), "packages/ui")) ? join(process.cwd(), "packages/ui") : process.cwd();
const css = readFileSync(join(UI, "src/styles.css"), "utf8");
const prose = readFileSync(join(UI, "src/prose.css"), "utf8");

describe("Textarea and field-level error state", () => {
  it("Textarea picks up Field wiring; errors set aria-invalid, describedby and errormessage", () => {
    render(
      <Field label="Reason" hint="Shared with the approver." error="Add a reason.">
        <Textarea placeholder="Why?" />
      </Field>,
    );
    const ta = screen.getByRole("textbox", { name: "Reason" });
    expect(ta.tagName).toBe("TEXTAREA");
    expect(ta.getAttribute("rows")).toBe("4");
    expect(ta.getAttribute("aria-invalid")).toBe("true");
    const errId = ta.getAttribute("aria-errormessage") as string;
    expect(document.getElementById(errId)?.textContent).toBe("Add a reason.");
    expect(ta.getAttribute("aria-describedby")?.split(" ")).toContain(errId);
    expect(ta.closest(".np-field")?.classList.contains("np-field--invalid")).toBe(true);
  });
  it("error={true} marks the field invalid without a message; FieldError reuses the field's id", () => {
    render(
      <Field label="Amount" error>
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Amount" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-errormessage")).toBeNull();
    cleanup();
    render(<FieldError id="e1">Too low</FieldError>);
    expect(screen.getByText("Too low").closest("p")?.id).toBe("e1");
  });
  it("Textarea resize none", () => {
    const { container } = render(<Textarea aria-label="n" resize="none" rows={2} />);
    expect(container.querySelector(".np-textarea--fixed")).toBeTruthy();
  });
});

describe("ErrorState and StateScreen", () => {
  it("ErrorState is an alert with title, message, retry and reference", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <ErrorState
        title="Payments couldn’t load"
        message="Check your connection and try again."
        onRetry={onRetry}
        reference="Request req_123"
      />,
    );
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { level: 2, name: "Payments couldn’t load" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByText("Request req_123")).toBeTruthy();
    rerender(<ErrorState onRetry={onRetry} retrying />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retrying…" }).getAttribute("aria-busy")).toBe("true");
  });
  it("StateScreen composes icon, h1, lede, badge, live callout with reference and actions", () => {
    render(
      <StateScreen
        icon={<CheckIcon />}
        tone="success"
        title="Payment complete"
        badge="Paid"
        callout={{ title: "49.49 USDC paid · Base", reference: "Reference NP–10482" }}
        actions={<Button fullWidth>Return to Acme Studio</Button>}
        data-testid="state"
      >
        Acme Studio has received your payment.
      </StateScreen>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Payment complete" })).toBeTruthy();
    expect(screen.getByText("Paid").className).toContain("np-badge--success");
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Reference NP–10482");
    expect(screen.getByTestId("state").querySelector(".np-state__icon--success")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Return to Acme Studio" })).toBeTruthy();
  });
  it("StateScreen accepts a custom callout node and h2", () => {
    render(<StateScreen title="Link expired" headingLevel={2} callout={<p>custom</p>} />);
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
    expect(screen.getByText("custom")).toBeTruthy();
  });
});

describe("CopyText / IdText", () => {
  it("copies the full value and announces politely", async () => {
    const writeText = vi.fn(async () => {});
    render(<CopyText value="NP-10482" label="payment reference" writeText={writeText} data-testid="ct" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy payment reference" }));
    expect(writeText).toHaveBeenCalledWith("NP-10482");
    expect(screen.getByRole("status").textContent).toBe("Copied");
    expect(screen.getByTestId("ct")).toBeTruthy();
  });
  it("on failure selects the text and says so", async () => {
    render(<CopyText value="abc" writeText={() => Promise.reject(new Error("denied"))} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy abc" }));
    expect(screen.getByRole("status").textContent).toMatch(/selected/);
    expect(window.getSelection()?.toString()).toBe("abc");
  });
  it("IdText is monospace, truncates for display but reads and copies the full id", async () => {
    const writeText = vi.fn(async () => {});
    const id = "pi_01J9ZK3X4Q2ABCDEFGHJKMNPQR";
    const { container } = render(<IdText value={id} head={6} tail={4} label="payment ID" writeText={writeText} />);
    expect(container.querySelector(".np-copy-text--mono")).toBeTruthy();
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("pi_01J…NPQR");
    expect(container.querySelector(".np-sr-only")?.textContent).toBe(id);
    await userEvent.click(screen.getByRole("button", { name: "Copy payment ID" }));
    expect(writeText).toHaveBeenCalledWith(id);
  });
});

describe("Popover / MenuButton / FilterPill / FilterBar", () => {
  it("Popover opens a labelled non-modal dialog, focuses inside, Esc closes and refocuses", async () => {
    render(
      <>
        <Popover label="Date range" trigger={(p) => <button {...p}>Dates</button>}>
          {(close) => (
            <button type="button" onClick={close}>
              Last 7 days
            </button>
          )}
        </Popover>
        <button type="button">Elsewhere</button>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Dates" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    await userEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Date range" })).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Last 7 days");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("MenuButton follows the menu-button pattern (arrows, Home/End, type-ahead, Esc, select)", async () => {
    const onSelect = vi.fn();
    render(
      <MenuButton
        label="Row actions"
        variant="ghost"
        triggerLabel="Actions"
        onSelect={onSelect}
        items={[
          { id: "h", heading: "Payment" },
          { id: "view", label: "View payment" },
          { id: "copy", label: "Copy reference", disabled: true },
          { id: "s", separator: true },
          { id: "refund", label: "Refund payment", danger: true },
          { id: "docs", label: "Read the docs", href: "/docs" },
        ]}
      >
        …
      </MenuButton>,
    );
    const trigger = screen.getByRole("button", { name: "Actions" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    const menu = screen.getByRole("menu", { name: "Row actions" });
    expect(document.activeElement?.textContent).toBe("View payment");
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Refund payment");
    await userEvent.keyboard("{End}");
    expect(document.activeElement?.getAttribute("href")).toBe("/docs");
    await userEvent.keyboard("{Home}");
    expect(document.activeElement?.textContent).toBe("View payment");
    await userEvent.keyboard("r");
    expect(document.activeElement?.textContent).toBe("Refund payment");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(document.activeElement?.getAttribute("href")).toBe("/docs");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(4);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement?.getAttribute("href")).toBe("/docs");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Copy reference" }));
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.keyboard(" ");
    await userEvent.click(screen.getByRole("menuitem", { name: "Refund payment" }));
    expect(onSelect).toHaveBeenCalledWith("refund");
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("FilterPill is a select-style button with a single-choice menu; FilterBar is a labelled group", async () => {
    render(<FilterHarness />);
    expect(screen.getByRole("group", { name: "Payment filters" })).toBeTruthy();
    const pill = screen.getByRole("button", { name: "Status: All" });
    expect(pill.className).toContain("np-select-button");
    expect(pill.className).not.toContain("np-select-button--active");
    await userEvent.click(pill);
    const radios = screen.getAllByRole("menuitemradio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Paid" }));
    const active = screen.getByRole("button", { name: "Status: Paid" });
    expect(active.className).toContain("np-select-button--active");
  });
  it("multiple-choice menus stay open and use menuitemcheckbox", async () => {
    const onSelect = vi.fn();
    render(
      <MenuButton
        label="Networks"
        selectable="multiple"
        onSelect={onSelect}
        items={[{ id: "base", label: "Base", checked: true }]}
      >
        Networks
      </MenuButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Networks" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Base" }));
    expect(onSelect).toHaveBeenCalledWith("base");
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});

describe("Modal stacking", () => {
  it("nested modals stack; only the top one handles Esc; step-up sits above; scroll lock until the last closes", async () => {
    render(<StackHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Open inner" }));
    expect(openLayerCount()).toBe(2);
    const backdrops = () => Array.from(document.querySelectorAll<HTMLElement>(".np-modal-backdrop"));
    const level = (title: string) =>
      Number(
        backdrops()
          .find(
            (b) =>
              b.querySelector(".np-modal__title")?.textContent === title && b.querySelectorAll(".np-modal").length >= 1,
          )
          ?.style.getPropertyValue("--np-layer"),
      );
    expect(level("Inner")).toBeGreaterThan(level("Outer"));
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByRole("dialog", { name: "Confirm it’s you" })).toBeTruthy();
    expect(level("Confirm it’s you")).toBeGreaterThanOrEqual(50);
    expect(document.querySelector(".np-modal-backdrop--step-up")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Confirm it’s you" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Inner" })).toBeTruthy();
    expect(document.documentElement.classList.contains("np-scroll-locked")).toBe(true);
    screen.getByRole("button", { name: "Approve" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Inner" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Outer" })).toBeTruthy();
    expect(document.documentElement.classList.contains("np-scroll-locked")).toBe(true);
    screen.getByRole("button", { name: "Open inner" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(openLayerCount()).toBe(0);
    expect(document.documentElement.classList.contains("np-scroll-locked")).toBe(false);
  });
  it("passes data-testid through", () => {
    render(<Modal open onClose={() => {}} title="T" data-testid="m" />);
    expect(screen.getByTestId("m").classList.contains("np-modal-backdrop")).toBe(true);
  });
});

describe("OptionButton, Combobox slot, test ids", () => {
  it("OptionButton is a button row with title and description", async () => {
    const onClick = vi.fn();
    render(
      <OptionButton title="Connect a wallet" description="Pay from your browser wallet" avatar="W" onClick={onClick} />,
    );
    const b = screen.getByRole("button", { name: /Connect a wallet/ });
    expect(b.getAttribute("type")).toBe("button");
    await userEvent.click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });
  it("Combobox renders the slot between search and list; CopyField/CheckoutFrame pass test ids", () => {
    const { container } = render(
      <>
        <Combobox
          label="Pay with"
          options={[{ value: "a", label: "USDC" }]}
          value="a"
          onChange={() => {}}
          beforeList={<span>Chips</span>}
          data-testid="cb"
        />
        <CopyField label="Deposit address" value="0xabc" data-testid="cf" />
        <CheckoutFrame data-testid="co">x</CheckoutFrame>
      </>,
    );
    const cb = screen.getByTestId("cb");
    const kids = Array.from(cb.children).map((c) => c.className);
    expect(kids.indexOf("np-combobox__slot")).toBeGreaterThan(kids.findIndex((k) => k.includes("np-input")));
    expect(kids.indexOf("np-combobox__slot")).toBeLessThan(kids.indexOf("np-combobox__list"));
    expect(screen.getByTestId("cf").className).toContain("np-copy-field");
    expect(screen.getByTestId("co").className).toContain("np-checkout");
    expect(container.querySelector(".np-checkout > .np-checkout__canvas > .np-checkout__inner")).toBeTruthy();
  });
});

describe("Layout", () => {
  it("PageLayout, Section and TwoColumnLayout", () => {
    render(
      <PageLayout header={<h1>Settings</h1>} width="narrow">
        <Section title="Branding" description="How checkout looks." actions={<Button>Save</Button>} divided>
          <TwoColumnLayout aside={<p>Preview</p>} asideLabel="Preview" stickyAside>
            <p>Form</p>
          </TwoColumnLayout>
        </Section>
      </PageLayout>,
    );
    expect(screen.getByRole("region", { name: "Branding" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Preview" }).textContent).toBe("Preview");
    expect(document.querySelector(".np-page--narrow .np-section--divided .np-two-col--sticky")).toBeTruthy();
  });
});

describe("LineChart", () => {
  const labels = ["1 Nov", "2 Nov", "3 Nov", "4 Nov"];
  it("draws from integer inputs, lists every value in a table and reads values with arrow keys", async () => {
    render(
      <LineChart
        label="Payment volume"
        labels={labels}
        decimals={2}
        symbol="$"
        series={[{ id: "v", label: "Volume", values: ["200000", 350000n, null, "540000"] }]}
        data-testid="lc"
      />,
    );
    const table = screen.getByRole("table", { name: "Payment volume" });
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getByText("$5,400.00")).toBeTruthy();
    expect(within(table).getByText("No data")).toBeTruthy();
    // y ticks are whole-dollar, nice steps from zero
    const ticks = Array.from(document.querySelectorAll(".np-chart__y-label")).map((t) => t.textContent);
    expect(ticks[0]).toBe("$0");
    expect(ticks.at(-1)).toBe("$6,000");
    const path = document.querySelector(".np-chart__line")?.getAttribute("d") ?? "";
    expect(path.match(/M/g)).toHaveLength(2); // gap splits the line
    expect(screen.queryByRole("list", { name: "Legend" })).toBeNull();
    const plot = screen.getByRole("region", { name: /Payment volume/ });
    plot.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("status").textContent).toContain("1 Nov");
    expect(screen.getByRole("status").textContent).toContain("$2,000.00");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("status").textContent).toContain("$5,400.00");
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("status").textContent).toContain("—");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("multi-series shows a legend; huge values stay exact; bad input and > 4 series throw", () => {
    render(
      <LineChart
        label="NEAR"
        labels={["a", "b"]}
        decimals={24}
        symbol="NEAR"
        baseline="data"
        series={[
          { id: "x", label: "In", values: ["1000000000000000000000001", "2000000000000000000000000"] },
          { id: "y", label: "Out", values: ["1500000000000000000000000", "1"] },
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "Legend" }).textContent).toBe("InOut");
    expect(screen.getByText("1.000000000000000000000001 NEAR")).toBeTruthy();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), label: String(i), values: ["1"] }));
    expect(() => render(<LineChart label="x" labels={["a"]} decimals={0} series={s(5)} />)).toThrow(/at most 4/);
    expect(() =>
      render(<LineChart label="x" labels={["a"]} decimals={0} series={[{ id: "a", label: "a", values: ["1.5"] }]} />),
    ).toThrow(/integers/);
    spy.mockRestore();
  });
  it("hover snaps the crosshair to the nearest point", () => {
    const { container } = render(
      <LineChart
        label="V"
        labels={labels}
        decimals={0}
        series={[{ id: "v", label: "V", values: ["1", "2", "3", "4"] }]}
      />,
    );
    const plot = container.querySelector(".np-chart__plot") as HTMLElement;
    plot.getBoundingClientRect = () => ({
      left: 0,
      width: 300,
      top: 0,
      height: 200,
      right: 300,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON() {},
    });
    fireEvent.pointerMove(plot, { clientX: 290 });
    expect(container.querySelector(".np-chart__crosshair")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("4 Nov");
    fireEvent.pointerLeave(plot);
    expect(container.querySelector(".np-chart__crosshair")).toBeNull();
  });
});

const spaLink: LinkRenderer = ({ href, children, ...rest }) => (
  <a data-spa="1" href={href} {...rest}>
    {children}
  </a>
);

describe("Link renderers", () => {
  it("Table, Breadcrumb and AppShell links go through renderLink", () => {
    render(
      <>
        <Table
          caption="t"
          columns={[{ key: "a", header: "A", cell: (r: string) => r, primary: true }]}
          rows={["NP-1"]}
          rowKey={String}
          rowHref={(r) => `/p/${r}`}
          renderLink={spaLink}
        />
        <Breadcrumb items={[{ label: "Acme", href: "/" }, { label: "Payments" }]} renderLink={spaLink} />
      </>,
    );
    expect(screen.getByRole("link", { name: "NP-1" }).getAttribute("data-spa")).toBe("1");
    expect(screen.getByRole("link", { name: "NP-1" }).className).toBe("np-table__link");
    expect(screen.getByRole("link", { name: "Acme" }).getAttribute("data-spa")).toBe("1");
  });
});

describe("AppShell 0.2.1", () => {
  it("controlled drawer, onNavigate, link renderer, footer actions, static switcher, mode switch", async () => {
    shellNavigate.mockClear();
    render(<ShellHarness />);
    expect(screen.queryByRole("button", { name: /Switch workspace/ })).toBeNull();
    expect(screen.getByText("NearPay Operations").closest(".np-workspace-switcher--static")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Live / Test" })).toBeTruthy();
    expect(screen.queryByText("Live")).toBeNull();
    expect(screen.getByRole("link", { name: "Help" }).getAttribute("data-spa")).toBe("1");
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByText("drawer open")).toBeTruthy();
    await userEvent.click(screen.getByRole("link", { name: "Payments" }));
    expect(shellNavigate).toHaveBeenCalledOnce();
    expect(shellNavigate.mock.calls[0]?.[0]).toMatchObject({ id: "p" });
    expect(screen.getByText("drawer closed")).toBeTruthy();
  });
  it("menu-mode workspace switcher opens a menu", async () => {
    const onSelect = vi.fn();
    render(
      <AppShell
        workspace={{
          name: "Acme Studio",
          menu: { items: [{ id: "w2", label: "Globex" }], onSelect },
        }}
        nav={[]}
      >
        x
      </AppShell>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Switch workspace, current: Acme Studio" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Globex" }));
    expect(onSelect).toHaveBeenCalledWith("w2");
  });
});

describe("Icons as SVG strings", () => {
  it("every React icon has a string twin with the same geometry and attributes", () => {
    for (const [name, Icon] of Object.entries(icons)) {
      const react = renderToStaticMarkup(<Icon />);
      const str = iconSvg(name as keyof typeof icons);
      const parse = (h: string) => new DOMParser().parseFromString(h, "image/svg+xml").documentElement;
      const a = parse(react);
      const b = parse(str);
      expect(b.getAttribute("width"), name).toBe(a.getAttribute("width"));
      expect(b.getAttribute("fill"), name).toBe(a.getAttribute("fill"));
      expect(b.getAttribute("aria-hidden"), name).toBe("true");
      expect(b.innerHTML, name).toBe(a.innerHTML);
    }
    expect(ICON_NAMES).toContain("nearpay-mark");
    expect(renderToStaticMarkup(<NearPayMark variant="mono" />)).toContain('fill="currentColor"');
  });
  it("titles are escaped and labelled; unknown names throw; no style attributes", () => {
    const svg = iconSvg("check", { size: 16, title: 'Done <"ok">', className: "x", titleId: "t1" });
    expect(svg).toContain('role="img" aria-labelledby="t1"');
    expect(svg).toContain('<title id="t1">Done &lt;&quot;ok&quot;&gt;</title>');
    expect(svg).toContain('class="np-icon x"');
    expect(svg).toContain('width="16"');
    expect(svg).not.toMatch(/style=/);
    expect(() => iconSvg("nope" as never)).toThrow(/unknown icon/);
  });
});

describe("Packaging: React-free subpaths, CSS fixes", () => {
  const pkg = JSON.parse(readFileSync(join(UI, "package.json"), "utf8"));
  /** Every relative import reachable from `file` (src paths), to prove a module never loads React. */
  function graph(file: string, seen = new Set<string>()): Set<string> {
    if (seen.has(file)) return seen;
    seen.add(file);
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const m of src.matchAll(/(?:import|export)[^"']*from\s*["']([^"']+)["']/g)) {
      const spec = m[1] as string;
      if (!spec.startsWith(".")) {
        seen.add(`bare:${spec}`);
        continue;
      }
      const base = resolve(dirname(file), spec.replace(/\.js$/, ""));
      graph(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`, seen);
    }
    return seen;
  }
  it("exports ./money, ./icons-svg and ./prose.css; the JS subpaths never import React", () => {
    expect(pkg.exports["./money"].import).toBe("./dist/money.js");
    expect(pkg.exports["./icons-svg"].import).toBe("./dist/icons/svg.js");
    expect(pkg.exports["./prose.css"]).toBe("./dist/prose.css");
    expect(pkg.kitBuild.copy).toContain("prose.css");
    for (const entry of ["src/money.ts", "src/icons/svg.ts"]) {
      const deps = [...graph(join(UI, entry))];
      expect(
        deps.filter((d) => d.startsWith("bare:")),
        entry,
      ).toEqual([]);
      expect(
        deps.some((d) => /\.tsx$/.test(d)),
        entry,
      ).toBe(false);
    }
  });
  it("CSS: stat min column, table scroll positioned, checkout canvas, modal layers, shell column", () => {
    expect(css).toContain("minmax(min(100%, var(--np-stat-min, 200px)), 1fr)");
    expect(css).toMatch(/\.np-table-scroll \{\s*position: relative;/);
    expect(css).toMatch(/@container np-checkout \(min-width: 880px\) \{\s*\.np-checkout--page > \.np-checkout__canvas/);
    expect(css).not.toMatch(/@container np-checkout[^{]*\{\s*\.np-checkout--page \{/);
    expect(css).toContain("calc(var(--np-z-overlay) + var(--np-layer, 0) * 2)");
    expect(css).toMatch(/\.np-shell \{[^}]*linear-gradient/);
    expect(css).toMatch(/\.np-two-col \{\s*container: np-two-col/);
  });
  it("prose.css is layered, scoped and asset-free", () => {
    expect(prose).toContain("@layer np-components");
    for (const cls of [".np-prose", ".np-codeblock", ".np-toc"]) expect(prose).toContain(cls);
    expect(prose).not.toMatch(/url\(/);
    expect(prose).not.toMatch(/!important/);
  });
  it("new components render no markup-level inline styles (CSP)", () => {
    const html = renderToStaticMarkup(
      <PageLayout header={<h1>x</h1>}>
        <Section title="s">
          <TwoColumnLayout aside={<ErrorState onRetry={() => {}} />}>
            <Field label="r" error="e">
              <Textarea />
            </Field>
            <CopyText value="v" />
            <IdText value="pi_0123456789" head={4} tail={4} />
            <FilterBar label="f">
              <FilterPill label="Status" value="a" onChange={() => {}} options={[{ value: "a", label: "A" }]} />
            </FilterBar>
            <Popover label="p" open trigger={(p) => <button {...p}>t</button>}>
              c
            </Popover>
            <OptionButton title="o" />
            <StateScreen title="t" badge="Paid" callout={{ title: "c" }} />
            <LineChart
              label="l"
              labels={["a", "b"]}
              decimals={2}
              series={[{ id: "a", label: "a", values: ["1", "2"] }]}
            />
            <Modal open onClose={() => {}} title="m" priority="step-up" />
          </TwoColumnLayout>
        </Section>
      </PageLayout>,
    );
    expect(html).not.toMatch(/\sstyle=/);
  });
});
