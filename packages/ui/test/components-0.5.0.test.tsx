import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { type ReactElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppShell,
  appIconBody,
  BRAND_COLORS,
  Button,
  buttonClassName,
  Callout,
  Card,
  CheckoutFrame,
  CONVERGENCE_ROUTES,
  ConvergenceHero,
  faviconSvg,
  IconButton,
  iconSvg,
  KpiCard,
  KpiGrid,
  LOGO_SIZES,
  logoSvg,
  MARK_ROUTES_PATH,
  type Mode,
  ModeSwitch,
  Money,
  markSvg,
  NearPayLogo,
  NearPayMark,
  NearPayMarkIcon,
  PickerTrigger,
  RouteDiagram,
  StatusBadge,
  statusTone,
  Table,
  WORDMARK,
  wordmarkTracking,
  wordmarkWidth,
} from "../src/index.js";

afterEach(cleanup);

const UI = existsSync(join(process.cwd(), "packages/ui")) ? join(process.cwd(), "packages/ui") : process.cwd();
const brandFile = (name: string) => readFileSync(join(UI, "brand", name));

/** Light a11y smoke: named buttons/links, SVGs either hidden or named, unique ids, no inline styles. */
function a11ySmoke(ui: ReactElement) {
  const html = renderToStaticMarkup(ui);
  expect(html, "inline style (CSP)").not.toMatch(/\sstyle=/);
  const { container, unmount } = render(ui);
  for (const el of Array.from(container.querySelectorAll("button, a[href]"))) {
    if (el.closest('[aria-hidden="true"]')) continue;
    const name =
      el.getAttribute("aria-label") ??
      (el.getAttribute("aria-labelledby") ? "labelled" : null) ??
      el.textContent?.trim();
    expect(name, el.outerHTML.slice(0, 120)).toBeTruthy();
  }
  for (const svg of Array.from(container.querySelectorAll("svg"))) {
    if (svg.closest('[aria-hidden="true"]')) continue;
    expect(svg.getAttribute("role"), svg.outerHTML.slice(0, 120)).toBe("img");
    expect(svg.getAttribute("aria-label") ?? svg.getAttribute("aria-labelledby")).toBeTruthy();
  }
  const ids = Array.from(container.querySelectorAll("[id]")).map((e) => e.id);
  expect(new Set(ids).size, "duplicate ids").toBe(ids.length);
  unmount();
  return html;
}

/* ------------------------------------------------------------------------------------------ */
/* Brand                                                                                        */
/* ------------------------------------------------------------------------------------------ */

describe("NearPayMark / NearPayLogo", () => {
  it("draws the exact Convergence geometry in each variant", () => {
    const light = renderToStaticMarkup(<NearPayMark variant="light" size={32} />);
    expect(light).toContain(`d="${MARK_ROUTES_PATH}"`);
    expect(light).toContain('stroke="#007A68"');
    expect(light).toContain('fill="#5B5BD6"');
    expect(light).toContain('stroke-width="4.5"');
    expect(light).toContain('cx="40.5" cy="24" r="4.5"');
    const dark = renderToStaticMarkup(<NearPayMark variant="onNavy" size={32} />);
    expect(dark).toContain('stroke="#8EF0D3"');
    expect(dark).toContain('fill="#B4B4FF"');
    const mono = renderToStaticMarkup(<NearPayMark variant="mono" size={32} />);
    expect(mono).toContain('stroke="currentColor"');
    expect(mono).toContain('fill="currentColor"');
    const tile = renderToStaticMarkup(<NearPayMark variant="app-icon" size={64} />);
    expect(tile).toContain('rx="12" fill="#007A68"');
    expect(tile).toContain('stroke="#FFFFFF"');
    expect(tile).toContain('stroke-width="5"');
    expect(tile).toContain('fill="#8EF0D3"');
  });
  it("switches to the favicon weights at ≤ 20 px (stroke 6, dot r 6)", () => {
    const small = renderToStaticMarkup(<NearPayMark size={16} />);
    expect(small).toContain('stroke-width="6"');
    expect(small).toContain('r="6"');
    expect(renderToStaticMarkup(<NearPayMark size={18} favicon={false} />)).toContain('stroke-width="4.5"');
  });
  it("auto marks carry hooks for surface-aware colours, with light fallbacks", () => {
    const auto = renderToStaticMarkup(<NearPayMark />);
    expect(auto).toContain('class="np-mark np-mark--auto"');
    expect(auto).toContain('class="np-mark__routes"');
    expect(auto).toContain('stroke="#007A68"');
  });
  it("is decorative unless titled", () => {
    render(
      <>
        <NearPayMark />
        <NearPayMark title="NearPay home" variant="app-icon" />
      </>,
    );
    expect(screen.getByRole("img", { name: "NearPay home" })).toBeTruthy();
    expect(document.querySelectorAll('svg[aria-hidden="true"]').length).toBe(1);
  });
  it("logo: one image named NearPay; label='' leaves the wordmark as text for a link", () => {
    render(
      <>
        <NearPayLogo size="lg" variant="dark" />
        <a href="/">
          <NearPayLogo label="" />
        </a>
      </>,
    );
    expect(screen.getByRole("img", { name: "NearPay" }).className).toContain("np-logo--lg");
    expect(screen.getByRole("link", { name: "NearPay" })).toBeTruthy();
    expect(LOGO_SIZES.xl).toEqual({ font: 64, mark: 88, tracking: -0.035 });
  });
  it("the one-colour icon twin keeps the geometry on the 24 px grid", () => {
    const svg = iconSvg("nearpay-mark");
    expect(svg).toContain('stroke-width="2.25"');
    expect(svg).toContain('cx="20.25"');
    expect(renderToStaticMarkup(<NearPayMarkIcon />)).toContain('stroke-width="2.25"');
  });
});

describe("brand strings and files", () => {
  it("markSvg / logoSvg / faviconSvg: standalone, labelled, escaped, no style attributes", () => {
    const mark = markSvg({ variant: "dark", size: 40, title: 'N<"P">' });
    expect(mark).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 48 48" width="40" height="40"/);
    expect(mark).toContain('role="img" aria-label="N&lt;&quot;P&quot;&gt;"');
    expect(mark).toContain(BRAND_COLORS.dark.routes);
    expect(markSvg({ size: 16 })).toContain('stroke-width="6"');
    expect(markSvg({ variant: "app-icon" })).toContain('rx="12"');
    const logo = logoSvg({ variant: "light", height: 48 });
    expect(logo).toContain('height="48"');
    expect(logo).toContain(`fill="${BRAND_COLORS.wordmarkOnLight}"`);
    expect(logo).toContain('aria-hidden="true"');
    expect(logoSvg({ variant: "mono" })).toContain('fill="currentColor"');
    for (const s of [mark, logo, faviconSvg()]) expect(s).not.toMatch(/\sstyle=/);
    expect(faviconSvg()).toContain("prefers-color-scheme:dark");
  });
  it("wordmark: 650 outlines, tracking by size from the artboards", () => {
    expect(WORDMARK.weight).toBe(650);
    expect(WORDMARK.glyphs.map((g) => g.char).join("")).toBe("NearPay");
    expect(wordmarkTracking(19)).toBe(-0.02);
    expect(wordmarkTracking(30)).toBe(-0.03);
    expect(wordmarkTracking(64)).toBe(-0.035);
    expect(wordmarkTracking(120)).toBe(-0.035);
    expect(wordmarkTracking(47)).toBeCloseTo(-0.0325, 4);
    expect(wordmarkWidth(-0.03)).toBeLessThan(wordmarkWidth(0));
  });
  it("committed SVG files are exactly what the package functions produce (run `pnpm brand` after changes)", () => {
    expect(brandFile("mark-light.svg").toString()).toBe(
      `${markSvg({ variant: "light", size: 48, title: "NearPay" })}\n`,
    );
    expect(brandFile("mark-dark.svg").toString()).toBe(`${markSvg({ variant: "dark", size: 48, title: "NearPay" })}\n`);
    expect(brandFile("logo-light.svg").toString()).toBe(
      `${logoSvg({ variant: "light", height: 48, title: "NearPay" })}\n`,
    );
    expect(brandFile("logo-dark.svg").toString()).toBe(
      `${logoSvg({ variant: "dark", height: 48, title: "NearPay" })}\n`,
    );
    expect(brandFile("favicon.svg").toString()).toBe(`${faviconSvg()}\n`);
  });
  it("raster files have the promised sizes", () => {
    const pngSize = (b: Buffer) => {
      expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
      return [b.readUInt32BE(16), b.readUInt32BE(20)];
    };
    expect(pngSize(brandFile("apple-touch-icon.png"))).toEqual([180, 180]);
    expect(pngSize(brandFile("icon-192.png"))).toEqual([192, 192]);
    expect(pngSize(brandFile("icon-512.png"))).toEqual([512, 512]);
    expect(pngSize(brandFile("icon-maskable-512.png"))).toEqual([512, 512]);
    expect(pngSize(brandFile("og-image.png"))).toEqual([1200, 630]);
    const ico = brandFile("favicon.ico");
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
    const sizes = [0, 1, 2].map((i) => ico.readUInt8(6 + i * 16));
    expect(sizes).toEqual([16, 32, 48]);
    for (let i = 0; i < 3; i++) {
      const off = ico.readUInt32LE(6 + i * 16 + 12);
      const [w] = pngSize(ico.subarray(off));
      expect(w).toBe(sizes[i]);
    }
  });
});

describe("packaging 0.5.0", () => {
  const pkg = JSON.parse(readFileSync(join(UI, "package.json"), "utf8"));
  it("ships brand/ and a React-free ./brand subpath; Instrument Sans replaces DM Sans", () => {
    expect(pkg.version).toBe("0.5.0");
    expect(pkg.files).toContain("brand");
    expect(pkg.exports["./brand"].import).toBe("./dist/brand.js");
    expect(pkg.exports["./brand/*"]).toBe("./brand/*");
    expect(pkg.dependencies).toEqual({ "@fontsource-variable/instrument-sans": expect.any(String) });
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of src.matchAll(/(?:import|export)[^"']*from\s*["']([^"']+)["']/g)) {
        const spec = m[1] as string;
        expect(spec.startsWith("."), `${file} imports ${spec}`).toBe(true);
        walk(`${resolve(dirname(file), spec.replace(/\.js$/, ""))}.ts`);
      }
    };
    walk(join(UI, "src/brand.ts"));
    expect(seen.size).toBe(2);
  });
});

function ControlledSearchShell() {
  const [q, setQ] = useState("pay");
  return (
    <AppShell workspace={{ name: "Acme" }} nav={[]} search={{ value: q, onChange: setQ, name: "query" }}>
      <p>q={q}</p>
    </AppShell>
  );
}

describe("0.5.0 edge cases", () => {
  it("app icon shapes and logo variants", () => {
    expect(appIconBody()).toContain('rx="12"');
    expect(appIconBody({ shape: "square" })).not.toContain("rx=");
    expect(appIconBody({ shape: "maskable" })).toContain("scale(0.5)");
    expect(appIconBody({ favicon: true })).toContain('stroke-width="6"');
    expect(logoSvg({ variant: "onNavy" })).toContain(`fill="${BRAND_COLORS.wordmarkOnDark}"`);
    expect(logoSvg({ title: "NearPay", className: "x" })).toContain('class="x" role="img"');
    expect(markSvg({ xmlns: false })).not.toContain("xmlns");
    expect(wordmarkTracking(25)).toBeCloseTo(-0.0244, 4);
    const { container } = render(<NearPayLogo variant="onNavy" size="xl" />);
    expect(container.firstElementChild?.className).toContain("np-logo--dark");
  });
  it("controlled shell search, custom callout icon, picker nodes, table heading level, route title node", async () => {
    render(<ControlledSearchShell />);
    await userEvent.type(screen.getByRole("searchbox"), "s");
    expect(screen.getByText("q=pays")).toBeTruthy();
    cleanup();
    render(
      <>
        <Callout tone="neutral" icon={<span data-testid="ic" />} title="Custom" />
        <PickerTrigger value="USDC" avatar={<span data-testid="logo" />} description="Balance 4.52101" />
        <PickerTrigger avatar="U" />
        <Table
          caption="t"
          titleLevel={3}
          title="Payouts"
          columns={[{ key: "a", header: "A", cell: () => "x" }]}
          rows={[]}
          rowKey={String}
        />
        <Table caption="u" actions={<a href="#all">View all</a>} columns={[]} rows={[]} rowKey={String} />
        <RouteDiagram title={<strong>Route</strong>} stops={["A", "B", "C"]} />
        <IconButton label="Menu" size="sm" icon={<span />} />
      </>,
    );
    expect(screen.getByTestId("ic").parentElement?.className).toBe("np-callout__icon");
    expect(screen.getByTestId("logo")).toBeTruthy();
    expect(screen.getByText("Balance 4.52101").className).toBe("np-picker__sub");
    expect(screen.getByText("Choose").className).toContain("np-picker__placeholder");
    expect(screen.getByRole("heading", { level: 3, name: "Payouts" })).toBeTruthy();
    expect(screen.getAllByText("Nothing here yet.").length).toBe(2);
    expect(document.querySelectorAll(".np-route__arrow").length).toBe(2);
    expect(screen.getByRole("button", { name: "Menu" }).className).toContain("np-icon-button--sm");
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Buttons, badges, callouts, cards                                                             */
/* ------------------------------------------------------------------------------------------ */

describe("Button v2", () => {
  it("variants, sizes and pill", () => {
    expect(buttonClassName({ variant: "on-navy", size: "lg", pill: true })).toBe(
      "np-button np-button--on-navy np-button--lg np-button--pill",
    );
    expect(buttonClassName({ variant: "navy" })).toBe("np-button np-button--navy");
    expect(buttonClassName({ variant: "quiet", size: "sm" })).toBe("np-button np-button--quiet np-button--sm");
    // 0.4 `ghost` keeps working (and keeps its class for app CSS hooks).
    expect(buttonClassName({ variant: "ghost" })).toBe("np-button np-button--quiet np-button--ghost");
    render(
      <>
        <Button variant="mint" pill>
          Start accepting payments
        </Button>
        <IconButton label="Open menu" icon={<span />} variant="on-navy" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Start accepting payments" }).className).toContain("np-button--pill");
    expect(screen.getByRole("button", { name: "Open menu" }).className).toContain("np-icon-button--on-navy");
  });
});

describe("StatusBadge v2 pairs", () => {
  it("maps the payment vocabulary to the v2 tones", () => {
    expect(statusTone("Paid")).toBe("success");
    expect(statusTone("Confirming")).toBe("progress");
    expect(statusTone("Payment detected")).toBe("progress");
    expect(statusTone("Review")).toBe("warning");
    expect(statusTone("Not paid")).toBe("neutral");
    expect(statusTone("Failed")).toBe("danger");
    const html = renderToStaticMarkup(<StatusBadge>Confirming</StatusBadge>);
    expect(html).toBe('<span class="np-badge np-badge--progress">Confirming</span>');
  });
});

describe("Callout v2 and Card", () => {
  it("verified: soft mint with a shield, compact one-liner", () => {
    const { container } = render(<Callout tone="verified" compact title="Payout address verified for Acme GmbH" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toBe("np-callout np-callout--info np-callout--verified np-callout--icon np-callout--compact");
    expect(el.querySelector("svg.np-callout__icon")).toBeTruthy();
    cleanup();
    const plain = render(<Callout tone="warning" title="Use the Base network" />).container.firstElementChild;
    expect(plain?.className).toBe("np-callout np-callout--warning");
    expect(plain?.querySelector("svg")).toBeNull();
  });
  it("cards: outline (default), flat and navy surfaces", () => {
    const html = renderToStaticMarkup(
      <>
        <Card>a</Card>
        <Card variant="flat">b</Card>
        <Card variant="navy" padding="sm">
          c
        </Card>
      </>,
    );
    expect(html).toContain('class="np-card np-card--pad-md"');
    expect(html).toContain('class="np-card np-card--pad-md np-card--flat"');
    expect(html).toContain('class="np-card np-card--pad-sm np-card--navy np-surface-navy"');
  });
});

describe("KpiCard", () => {
  it("is a labelled group with a tabular value; warning tone and trend", () => {
    render(
      <KpiGrid>
        <KpiCard
          label="Settled volume"
          value={<Money amount="83000" decimals={2} symbol="$" />}
          sub="Up from $105.00 last week"
          trend="up"
        />
        <KpiCard label="Needs attention" value="2" tone="warning" sub={<a href="#review">1 to review, 1 delayed</a>} />
      </KpiGrid>,
    );
    const g = screen.getByRole("group", { name: "Settled volume" });
    expect(within(g).getByText("$830.00")).toBeTruthy();
    expect(g.querySelector(".np-kpi__sub--up")?.textContent).toBe("Up from $105.00 last week");
    expect(screen.getByRole("group", { name: "Needs attention" }).className).toContain("np-kpi--warning");
    expect(screen.getByRole("link", { name: "1 to review, 1 delayed" })).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Table, Picker, Route                                                                         */
/* ------------------------------------------------------------------------------------------ */

describe("Table v2", () => {
  it("renders a titled panel with actions, muted columns and the flat variant", () => {
    const { container } = render(
      <Table
        caption="Recent payments"
        title="Recent payments"
        actions={<a href="/payments">View all</a>}
        variant="flat"
        columns={[
          { key: "amt", header: "Amount", cell: (r: { a: string }) => r.a, primary: true, numeric: true },
          { key: "with", header: "Paid with", cell: () => "USDC on Base", muted: true },
        ]}
        rows={[{ a: "$49.00" }]}
        rowKey={(r) => r.a}
      />,
    );
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.className).toBe("np-table-wrap np-table-wrap--flat np-table-wrap--titled");
    expect(screen.getByRole("heading", { level: 2, name: "Recent payments" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View all" })).toBeTruthy();
    expect(screen.getByText("USDC on Base").className).toContain("np-table__cell--muted");
    expect(screen.getByRole("table", { name: "Recent payments" })).toBeTruthy();
  });
});

describe("PickerTrigger", () => {
  it("card trigger: caption, value, balance; selected border; placeholder when empty", async () => {
    const onClick = vi.fn();
    render(
      <div className="np-pickers">
        <PickerTrigger caption="Network" value="Base" avatar="B" aria-haspopup="listbox" onClick={onClick} />
        <PickerTrigger caption="Token" value="USDC" balance="4.52101" avatar="$" selected open={false} />
        <PickerTrigger caption="Token" placeholder="Choose a token" />
      </div>,
    );
    const network = screen.getByRole("button", { name: /Network\s*Base/ });
    expect(network.className).toBe("np-picker__trigger np-picker__trigger--card");
    await userEvent.click(network);
    expect(onClick).toHaveBeenCalledTimes(1);
    const token = screen.getByRole("button", { name: /USDC 4\.52101/ });
    expect(token.className).toContain("np-picker__trigger--selected");
    expect(token.getAttribute("aria-expanded")).toBe("false");
    expect(token.querySelector(".np-picker__balance")?.textContent).toBe("4.52101");
    expect(screen.getByText("Choose a token").className).toContain("np-picker__placeholder");
  });
});

describe("RouteDiagram", () => {
  it("lists the stops in order, with decorative arrows between them", () => {
    render(
      <div className="np-surface-navy">
        <RouteDiagram
          stops={["USDC on Base", "Acme's wallet"]}
          note="Routed by NEAR Intents straight to the merchant. NearPay never holds your funds."
        />
      </div>,
    );
    const region = screen.getByRole("region", { name: "How your payment travels" });
    const items = within(region).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["USDC on Base", "Acme's wallet"]);
    expect(region.querySelectorAll('.np-route__arrow[aria-hidden="true"]').length).toBe(1);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* ModeSwitch, AppShell v2, CheckoutFrame v2                                                    */
/* ------------------------------------------------------------------------------------------ */

function ShellHarness({ onSearch }: { onSearch: (q: string) => void }) {
  const [mode, setMode] = useState<Mode>("live");
  return (
    <AppShell
      workspace={{ name: "Acme Coffee", onSwitch: () => {} }}
      nav={[
        {
          label: "Workspace",
          hideLabel: true,
          items: [
            { id: "home", label: "Home", href: "/", current: true },
            { id: "payments", label: "Payments", href: "/payments" },
          ],
        },
        { label: "Build", hideLabel: true, items: [{ id: "dev", label: "Developers", href: "/dev" }] },
      ]}
      user={{ name: "owner@acme.example" }}
      search={{ placeholder: "Search payments, customers, links", onSubmit: onSearch }}
      mode={mode}
      onModeChange={setMode}
    >
      <p>Mode is {mode}</p>
    </AppShell>
  );
}

describe("AppShell v2", () => {
  it("navy sidebar with avatar switcher and labelled nav groups; top bar search and Live/Test switch", async () => {
    const onSearch = vi.fn();
    render(<ShellHarness onSearch={onSearch} />);
    const sidebar = document.querySelector(".np-shell__sidebar") as HTMLElement;
    expect(sidebar.className).toContain("np-surface-navy");
    const switcher = screen.getByRole("button", { name: "Switch workspace, current: Acme Coffee" });
    expect(switcher.querySelector(".np-workspace-switcher__avatar")?.textContent).toBe("A");
    expect(screen.getByRole("list", { name: "Workspace" })).toBeTruthy();
    expect(screen.getByText("Build").className).toContain("np-sr-only");
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");

    const search = screen.getByRole("searchbox", { name: "Search" });
    await userEvent.type(search, "acme{Enter}");
    expect(onSearch).toHaveBeenCalledWith("acme");

    const modes = screen.getByRole("radiogroup", { name: "Mode" });
    expect(within(modes).getByRole("radio", { name: "Live" }).getAttribute("aria-checked")).toBe("true");
    await userEvent.click(within(modes).getByRole("radio", { name: "Test" }));
    expect(screen.getByText("Mode is test")).toBeTruthy();
    fireEvent.keyDown(modes, { key: "ArrowLeft" });
    expect(screen.getByText("Mode is live")).toBeTruthy();
    // Stacked (mobile) bar keeps the menu button.
    expect(screen.getByRole("button", { name: "Open menu" }).closest(".np-shell__mobilebar")).toBeTruthy();
  });
  it("a static mode pill without onModeChange; breadcrumb moves under the top bar when search is on", () => {
    render(
      <AppShell
        workspace={{ name: "NearPay Operations", initial: "" }}
        nav={[]}
        mode="test"
        search={{ label: "Search accounts" }}
        breadcrumb={<nav aria-label="Breadcrumb">Accounts</nav>}
      >
        x
      </AppShell>,
    );
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByText("Test").className).toContain("np-mode-pill");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).closest(".np-shell__crumbs")).toBeTruthy();
    expect(document.querySelector(".np-workspace-switcher__avatar")).toBeNull();
  });
  it("ModeSwitch alone", async () => {
    const onChange = vi.fn();
    render(<ModeSwitch value="test" onChange={onChange} labels={{ live: "Live mode", test: "Test mode" }} />);
    await userEvent.click(screen.getByRole("radio", { name: "Live mode" }));
    expect(onChange).toHaveBeenCalledWith("live");
  });
});

describe("CheckoutFrame v2", () => {
  it("hosted summary is a navy surface; embedded is not; footer carries the mark", () => {
    const page = render(
      <CheckoutFrame merchant={{ name: "Acme GmbH" }} amount="$2.00" summary={<p>Pro plan</p>}>
        <p>flow</p>
      </CheckoutFrame>,
    );
    const summary = page.getByRole("region", { name: "Order summary" });
    expect(summary.className).toBe("np-checkout__summary np-surface-navy");
    expect(page.getByText("Secured by NearPay").parentElement?.querySelector("svg.np-mark")).toBeTruthy();
    cleanup();
    const embed = render(
      <CheckoutFrame variant="embed" merchant={{ name: "Acme GmbH" }} securedLabel="Powered by NearPay">
        <p>flow</p>
      </CheckoutFrame>,
    );
    expect(embed.getByRole("region", { name: "Order summary" }).className).toBe("np-checkout__summary");
    expect(embed.getByText("Powered by NearPay")).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------------------------ */
/* ConvergenceHero                                                                              */
/* ------------------------------------------------------------------------------------------ */

describe("ConvergenceHero", () => {
  const begin = vi.fn();
  let reduce = false;
  beforeEach(() => {
    vi.useFakeTimers();
    begin.mockClear();
    (SVGElement.prototype as unknown as { beginElement: () => void }).beginElement = function (this: SVGElement) {
      begin(this);
    };
    window.matchMedia = ((q: string) => ({
      matches: q.includes("reduce") ? reduce : false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (SVGElement.prototype as unknown as { beginElement?: unknown }).beginElement;
    reduce = false;
  });

  it("draws five routes into one point, labels from props, a text alternative and the light card", () => {
    render(
      <ConvergenceHero
        autoPlay={false}
        labels={["USDC on Base", "SOL on Solana", "ETH on Arbitrum", "BTC", "NEAR"]}
        card={<p>Payment received</p>}
      />,
    );
    const fig = screen.getByRole("figure");
    expect(fig.querySelectorAll(".np-convergence__route").length).toBe(CONVERGENCE_ROUTES.length);
    expect(
      within(fig)
        .getAllByRole("listitem")
        .map((l) => l.textContent),
    ).toEqual(["USDC on Base", "SOL on Solana", "ETH on Arbitrum", "BTC", "NEAR"]);
    expect(fig.querySelector(".np-convergence__card")?.getAttribute("data-theme")).toBe("light");
    expect(fig.querySelector("figcaption")?.textContent).toMatch(/settle in one place/);
    expect(fig.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(fig.getAttribute("data-motion")).toBe("off");
  });

  it("sends one dot at a time along a random route (never the same twice running), then pulses", () => {
    const seq = [0.1, 0.1, 0.5, 0.9, 0.9, 0.3];
    let n = 0;
    render(<ConvergenceHero random={() => seq[n++ % seq.length] as number} interval={2400} />);
    expect(screen.getByRole("figure").getAttribute("data-motion")).toBe("on");
    act(() => {
      vi.advanceTimersByTime(600);
    });
    // First payment: animateMotion + opacity on one route.
    expect(begin).toHaveBeenCalledTimes(2);
    const first = begin.mock.calls[0]?.[0] as SVGElement;
    expect(first.tagName.toLowerCase()).toBe("animatemotion");
    act(() => {
      vi.advanceTimersByTime(1450);
    });
    expect(begin).toHaveBeenCalledTimes(5); // arrival: ring r, ring opacity, core r
    const routeOf = (el: SVGElement) => el.querySelector("mpath")?.getAttribute("href");
    const routes: Array<string | null | undefined> = [routeOf(first)];
    for (let i = 0; i < 4; i++) {
      begin.mockClear();
      act(() => {
        vi.advanceTimersByTime(2400 - (i === 0 ? 1450 : 0));
      });
      const motion = begin.mock.calls
        .map((c) => c[0] as SVGElement)
        .find((e) => e.tagName.toLowerCase() === "animatemotion");
      routes.push(motion ? routeOf(motion) : undefined);
    }
    for (let i = 1; i < routes.length; i++) {
      if (routes[i] && routes[i - 1]) expect(routes[i]).not.toBe(routes[i - 1]);
    }
  });

  it("does not animate under prefers-reduced-motion", () => {
    reduce = true;
    render(<ConvergenceHero />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(begin).not.toHaveBeenCalled();
    expect(screen.getByRole("figure").getAttribute("data-motion")).toBe("off");
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Snapshots + a11y smoke                                                                       */
/* ------------------------------------------------------------------------------------------ */

describe("snapshot and a11y smoke (0.5.0 components)", () => {
  const cases: Array<[string, ReactElement]> = [
    ["NearPayLogo", <NearPayLogo key="l" size="md" />],
    ["KpiCard", <KpiCard key="k" label="Successful payments" value="9" sub="of 12 started" />],
    ["PickerTrigger", <PickerTrigger key="p" caption="Token" value="USDC" balance="4.52101" avatar="U" selected />],
    [
      "RouteDiagram",
      <RouteDiagram key="r" stops={["USDC on Base", "Acme's wallet"]} note="NearPay never holds your funds." />,
    ],
    ["Callout verified", <Callout key="c" tone="verified" compact title="Payout address verified for Acme GmbH" />],
    ["ModeSwitch", <ModeSwitch key="m" value="live" onChange={() => {}} />],
    ["ConvergenceHero", <ConvergenceHero key="h" autoPlay={false} card={<p>Payment received</p>} />],
  ];
  for (const [name, ui] of cases) {
    it(name, () => {
      const html = a11ySmoke(ui);
      expect(html.replace(/(id|href|aria-labelledby|filter|stroke)="[^"]*(«|:)[^"]*"/g, '$1="…"')).toMatchSnapshot();
    });
  }
  it("AppShell v2 + CheckoutFrame v2 pass the smoke test together", () => {
    a11ySmoke(
      <AppShell
        workspace={{ name: "Acme Coffee", menu: { items: [{ id: "g", label: "Globex" }], onSelect: () => {} } }}
        nav={[{ label: "Workspace", items: [{ id: "h", label: "Home", href: "/", current: true }] }]}
        search={{ placeholder: "Search" }}
        mode="live"
        onModeChange={() => {}}
        notifications={{ unread: 1 }}
      >
        <CheckoutFrame merchant={{ name: "Acme" }} amount="$2.00" summary={<RouteDiagram stops={["A", "B"]} />}>
          <Button size="lg" fullWidth>
            Pay 2.005013 USDC
          </Button>
        </CheckoutFrame>
      </AppShell>,
    );
  });
});
