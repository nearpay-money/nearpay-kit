/* Gallery demos for the 0.5.0 (design v2) components. */
import { useState } from "react";
import appleTouchIcon from "../../brand/apple-touch-icon.png";
import icon192 from "../../brand/icon-192.png";
import iconMaskable from "../../brand/icon-maskable-512.png";
import ogImage from "../../brand/og-image.png";
import {
  Button,
  Callout,
  Card,
  ConvergenceHero,
  IconButton,
  KeyValueList,
  KpiCard,
  KpiGrid,
  LOGO_SIZES,
  type LogoSize,
  logoSvg,
  MenuIcon,
  type Mode,
  ModeSwitch,
  Money,
  markSvg,
  NearPayLogo,
  NearPayMark,
  PickerTrigger,
  RouteDiagram,
  StatusBadge,
} from "../../src/index.js";

/** Brand: lock-ups, mark variants, favicon weights, raster assets. */
export function BrandDemo() {
  return (
    <div className="g-demo-stack">
      <div className="g-brand-row">
        {(Object.keys(LOGO_SIZES) as LogoSize[]).map((s) => (
          <NearPayLogo key={s} size={s} />
        ))}
      </div>
      <div className="g-brand-row">
        <NearPayMark size={48} title="Auto (follows the surface)" />
        <NearPayMark size={48} variant="light" title="Light" />
        <span className="g-navy-chip">
          <NearPayMark size={48} variant="dark" title="On navy" />
        </span>
        <span className="np-text-accent">
          <NearPayMark size={48} variant="mono" title="Mono, current colour" />
        </span>
        <NearPayMark size={64} variant="app-icon" title="App icon" />
        <NearPayMark size={32} title="32 px" />
        <NearPayMark size={16} title="16 px, favicon weights" />
      </div>
    </div>
  );
}

/** Brand files (light only: they are fixed-colour assets). */
export function BrandFilesDemo() {
  return (
    <div className="g-demo-stack">
      <div className="g-brand-files">
        <figure>
          <span
            className="g-brand-svg"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: package-generated SVG string
            dangerouslySetInnerHTML={{ __html: logoSvg({ variant: "light", height: 40 }) }}
          />
          <figcaption>logo-light.svg (outlined wordmark)</figcaption>
        </figure>
        <figure className="g-brand-files__navy">
          <span
            className="g-brand-svg"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: package-generated SVG string
            dangerouslySetInnerHTML={{ __html: logoSvg({ variant: "dark", height: 40 }) }}
          />
          <figcaption>logo-dark.svg</figcaption>
        </figure>
        <figure>
          <span
            className="g-brand-svg"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: package-generated SVG string
            dangerouslySetInnerHTML={{ __html: markSvg({ variant: "light", size: 40 }) }}
          />
          <figcaption>mark-light.svg</figcaption>
        </figure>
      </div>
      <div className="g-brand-files">
        <figure>
          <span>
            <img src={icon192} width={96} height={96} alt="icon-192.png" />
          </span>
          <figcaption>icon-192 / 512.png</figcaption>
        </figure>
        <figure>
          <span>
            <img src={iconMaskable} width={96} height={96} alt="icon-maskable-512.png" />
          </span>
          <figcaption>icon-maskable-512.png</figcaption>
        </figure>
        <figure>
          <span>
            <img src={appleTouchIcon} width={90} height={90} alt="apple-touch-icon.png" />
          </span>
          <figcaption>apple-touch-icon.png (180)</figcaption>
        </figure>
      </div>
      <figure className="g-og">
        <img
          src={ogImage}
          width={600}
          height={315}
          alt="Open Graph card: Get paid from any chain. Settle where you choose."
        />
        <figcaption>og-image.png · 1200 × 630</figcaption>
      </figure>
    </div>
  );
}

/** Logo do / don't. */
export function LogoRulesDemo() {
  return (
    <div className="g-rules">
      <figure className="g-rule g-rule--do">
        <div className="g-rule__art">
          <NearPayLogo size="lg" variant="light" />
        </div>
        <figcaption>Do: navy wordmark, teal routes and violet dot on white.</figcaption>
      </figure>
      <figure className="g-rule g-rule--do">
        <div className="g-rule__art g-rule__art--navy">
          <NearPayLogo size="lg" variant="dark" />
        </div>
        <figcaption>Do: the dark lock-up on navy (mint routes, light-violet dot).</figcaption>
      </figure>
      <figure className="g-rule g-rule--dont">
        <div className="g-rule__art">
          <span className="g-dont-recolor">
            <NearPayLogo size="lg" variant="mono" />
          </span>
        </div>
        <figcaption>Don’t: recolour the mark (mono is for one-colour print only, in navy or white).</figcaption>
      </figure>
      <figure className="g-rule g-rule--dont">
        <div className="g-rule__art g-rule__art--mint">
          <NearPayLogo size="lg" variant="light" />
        </div>
        <figcaption>
          Don’t: place it on mint or busy images, stretch it, or reset the wordmark in another font.
        </figcaption>
      </figure>
    </div>
  );
}

export function ButtonsV2Demo() {
  return (
    <div className="g-demo-stack">
      <div className="np-row">
        <Button>Create payment link</Button>
        <Button variant="secondary">Create invoice</Button>
        <Button variant="quiet">Cancel</Button>
        <Button variant="danger">Refund payment</Button>
      </div>
      <div className="np-row">
        <Button size="lg">Pay 2.005013 USDC</Button>
        <Button size="sm" variant="secondary">
          Dense 40 px
        </Button>
        <Button disabled>Disabled</Button>
        <Button loading>Pay</Button>
      </div>
      <div className="np-row">
        <Button pill size="lg">
          Start accepting payments
        </Button>
        <Button pill size="lg" variant="secondary">
          See a live checkout
        </Button>
        <Button pill size="sm" variant="navy">
          Start accepting payments
        </Button>
      </div>
      <div className="g-navy-band np-surface-navy">
        <Button variant="mint">Continue</Button>
        <Button variant="on-navy">Talk to sales</Button>
        <Button variant="quiet">Read the docs</Button>
        <IconButton label="Open menu" icon={<MenuIcon />} variant="on-navy" />
      </div>
    </div>
  );
}

export function KpiDemo() {
  return (
    <div className="g-kpi-canvas">
      <KpiGrid>
        <KpiCard
          label="Settled volume"
          value={<Money amount="83000" decimals={2} symbol="$" />}
          sub="Up from $105.00 last week"
          trend="up"
        />
        <KpiCard label="Successful payments" value="9" sub="of 12 started" />
        <KpiCard
          label="Refunds"
          value={<Money amount="-12900" decimals={2} symbol="$" />}
          sub="Down 3.1% from last week"
          trend="down"
        />
        <KpiCard label="Needs attention" value="2" tone="warning" sub={<a href="#review">1 to review, 1 delayed</a>} />
      </KpiGrid>
    </div>
  );
}

export function PickerDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="g-demo-stack">
      <div className="np-pickers">
        <PickerTrigger caption="Network" value="Base" avatar="B" aria-haspopup="listbox" />
        <PickerTrigger
          caption="Token"
          value="USDC"
          balance="4.52101"
          avatar="$"
          selected
          open={open}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
        />
      </div>
      <div className="np-pickers">
        <PickerTrigger caption="Network" placeholder="Choose a network" />
        <PickerTrigger caption="Token" value="USDC" description="Balance 4.52101" avatar="$" disabled />
      </div>
      <p className="np-text-caption np-text-secondary">
        Class structure matches the checkout picker (ck-picker__* → np-picker__*): label, trigger, panel, list, option.
      </p>
    </div>
  );
}

export function RouteDemo() {
  return (
    <div className="g-demo-stack">
      <RouteDiagram
        stops={["USDC on Base", "Acme’s wallet"]}
        note="Routed by NEAR Intents straight to the merchant. NearPay never holds your funds."
      />
      <div className="g-navy-pad np-surface-navy">
        <RouteDiagram
          stops={["SOL on Solana", "USDC on NEAR", "Acme’s wallet"]}
          note="Confirmed after one block on each chain."
        />
      </div>
    </div>
  );
}

export function CalloutsV2Demo() {
  return (
    <div className="g-demo-stack">
      <Callout tone="verified" compact title="Payout address verified for Acme GmbH" />
      <Callout tone="info" title="No account needed">
        You’ll see the total, including fees, before you pay.
      </Callout>
      <Callout tone="warning" title="Use the Base network" icon>
        This address accepts USDC on Base only.
      </Callout>
      <Callout tone="progress" title="Confirming your payment" icon>
        Keep this page open. One block on each chain.
      </Callout>
      <Callout tone="success" title="2.005013 USDC paid · Base" reference="Reference NP–10482 · Acme GmbH" />
      <Callout tone="danger" title="This address has expired. Don’t send to it." reference="Reference NP–10482" icon />
      <Callout tone="neutral" title="Wallet-only checkout" icon>
        A payer does not need an email or NearPay account.
      </Callout>
    </div>
  );
}

export function StatusPairsDemo() {
  return (
    <div className="g-demo-stack">
      <div className="g-badges">
        <StatusBadge>Paid</StatusBadge>
        <StatusBadge>Confirming</StatusBadge>
        <StatusBadge>Review</StatusBadge>
        <StatusBadge>Not paid</StatusBadge>
        <StatusBadge>Failed</StatusBadge>
        <StatusBadge tone="info">Default</StatusBadge>
      </div>
      <div className="g-navy-band np-surface-navy">
        <StatusBadge>Paid</StatusBadge>
        <StatusBadge>Confirming</StatusBadge>
        <StatusBadge>Review</StatusBadge>
        <StatusBadge>Not paid</StatusBadge>
        <StatusBadge>Failed</StatusBadge>
      </div>
    </div>
  );
}

export function ModeSwitchDemo() {
  const [mode, setMode] = useState<Mode>("live");
  return (
    <div className="np-row">
      <ModeSwitch value={mode} onChange={setMode} />
      <span className="np-text-small np-text-secondary">Mode: {mode === "live" ? "Live" : "Test"}</span>
    </div>
  );
}

export function NavySurfaceDemo() {
  return (
    <Card variant="navy">
      <div className="np-stack">
        <p className="np-card__title">Any kit component on navy</p>
        <p className="np-text-secondary">
          Put <code>np-surface-navy</code> on a container (or use <code>Card variant="navy"</code>) and the semantic
          colours re-map: white and slate text, mint accents, a light-violet focus ring.
        </p>
        <KeyValueList
          items={[
            { label: "Pro plan", value: <Money amount="200" decimals={2} symbol="$" /> },
            { label: "You send", value: <Money amount="2005013" decimals={6} symbol="USDC" />, total: true },
          ]}
        />
        <div className="np-row">
          <Button variant="mint" size="sm">
            Continue
          </Button>
          <a href="#navy">Read about navy surfaces</a>
        </div>
      </div>
    </Card>
  );
}

export function ConvergenceDemo() {
  return (
    <div className="g-hero-demo">
      <ConvergenceHero
        labels={["USDC on Base", "SOL on Solana", "ETH on Arbitrum", "BTC", "NEAR"]}
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
          </div>
        }
      />
    </div>
  );
}
