# @nearpay-internal/ui

NearPay design system — **design v2, "Convergence"** (0.5.0): tokens, brand assets, component CSS and thin, accessible
React 19 components for the checkout, dashboard, ops console and site. Navy surfaces, teal actions, violet for routes
and focus, mint as an accent on navy only, Instrument Sans everywhere.

```ts
import "@nearpay-internal/ui/fonts.css"; // Instrument Sans (OFL), self-hosted — CSP font-src 'self'
import "@nearpay-internal/ui/tokens.css"; // custom properties: light, dark, auto + .np-surface-navy
import "@nearpay-internal/ui/styles.css"; // np-* component classes in cascade layers
import "@nearpay-internal/ui/prose.css"; // optional: long-form text (np-prose, np-codeblock, np-toc)
import { ThemeRoot, AppShell, CheckoutFrame, Button, Money, NearPayLogo } from "@nearpay-internal/ui";
```

## Tokens

Themes via `data-theme="light|dark|auto"` on a `.np-root` (`<ThemeRoot>`); runtime merchant appearance with
`applyAppearance(el, {theme, accent, radius})` (CSSOM only — no inline `style=""`; accents are adjusted to keep WCAG AA;
cards, panels and pills follow the merchant radius). Every text/background pair below is ≥ 4.5:1 (UI pairs ≥ 3:1),
enforced by `test/tokens.test.ts` in both themes and inside `.np-surface-navy`.

| Token                           | Light     | Dark      | Use                                     |
| ------------------------------- | --------- | --------- | --------------------------------------- |
| `--np-color-bg`                 | `#f3f6f9` | `#0b1a2c` | page canvas                             |
| `--np-color-surface`            | `#ffffff` | `#12263f` | cards, inputs                           |
| `--np-color-surface-muted`      | `#f7f9fb` | `#0f2136` | table header, quiet panels              |
| `--np-color-text`               | `#12263f` | `#ffffff` | primary text                            |
| `--np-color-text-secondary`     | `#4a5b70` | `#c7d5e4` | secondary text                          |
| `--np-color-text-tertiary`      | `#5a6b80` | `#a9bbcf` | captions, placeholders (new)            |
| `--np-color-border`             | `#e1e7ee` | `#2e4b6c` | card borders                            |
| `--np-color-border-subtle`      | `#edf1f5` | `#223a57` | table row rules (new)                   |
| `--np-color-border-outline`     | `#c9d3de` | `#3d5b7e` | secondary button / picker outline (new) |
| `--np-color-border-control`     | `#7a8ca2` | `#7189a6` | text fields, checkboxes (≥ 3:1)         |
| `--np-color-accent`             | `#007a68` | `#8ef0d3` | primary button                          |
| `--np-color-accent-text`        | `#007a68` | `#8ef0d3` | links, checks                           |
| `--np-color-accent-subtle`      | `#e3f7f1` | `#17384a` | verified / info bg                      |
| `--np-color-accent-subtle-text` | `#00594c` | `#8ef0d3` | verified / info text                    |
| `--np-color-focus`              | `#5b5bd6` | `#b4b4ff` | focus ring (violet)                     |
| `--np-color-route`              | `#5b5bd6` | `#b4b4ff` | routes (new)                            |
| `--np-color-success-bg`         | `#ddf7ef` | `#133b3d` | Paid                                    |
| `--np-color-success-fg`         | `#00594c` | `#8ef0d3` | Paid                                    |
| `--np-color-info-bg`            | `#ececfd` | `#272c5e` | Confirming (new)                        |
| `--np-color-info-fg`            | `#3b3ba8` | `#c4c4ff` | Confirming (new)                        |
| `--np-color-warning-bg`         | `#fff1d6` | `#3a2f1c` | Review                                  |
| `--np-color-warning-fg`         | `#7a4b00` | `#ffd58a` | Review, warning text                    |
| `--np-color-warning-subtle`     | `#fff7e6` | `#2e2716` | warning callout / KPI (new)             |
| `--np-color-warning-strong`     | `#5c3900` | `#ffe3b0` | KPI figure on cream (new)               |
| `--np-color-danger-bg`          | `#fdecea` | `#45222a` | Failed                                  |
| `--np-color-danger-fg`          | `#b42318` | `#ffadad` | Failed                                  |
| `--np-color-neutral-bg`         | `#edf1f5` | `#24405f` | Not paid                                |
| `--np-color-neutral-fg`         | `#4a5b70` | `#c7d5e4` | Not paid                                |
| `--np-color-navy`               | `#12263f` | `#0f2136` | navy surfaces (new)                     |
| `--np-color-navy-raised`        | `#1a3150` | `#1a3150` | raised on navy (new)                    |
| `--np-color-navy-border`        | `#2e4b6c` | `#2e4b6c` | borders on navy (new)                   |
| `--np-color-navy-active`        | `#24405f` | `#24405f` | current nav item (new)                  |
| `--np-color-on-navy`            | `#ffffff` | `#ffffff` | text on navy (new)                      |
| `--np-color-on-navy-secondary`  | `#c7d5e4` | `#c7d5e4` | nav text (new)                          |
| `--np-color-on-navy-muted`      | `#a9bbcf` | `#a9bbcf` | muted on navy (new)                     |
| `--np-color-on-navy-accent`     | `#8ef0d3` | `#8ef0d3` | mint on navy (new)                      |
| `--np-color-on-navy-route`      | `#b4b4ff` | `#b4b4ff` | violet on navy (new)                    |

Other scales: `--np-text-display` 76 · `h1` 48 · `h2` 34 · `title` 30 · `stat` 32 · `h3` 24 · `h4` 18 · `body` 16 ·
`small` 14 · `caption` 13 · `amount` 48 · `amount-hero` 80; weights `regular` 400 · `medium` 500 · `semibold` 600 ·
`strong` 650 (headings, wordmark) · `bold` 700; radii `control` 12 · `card` 16 · `panel` 24 · `pill`; focus ring
`--np-focus-width` 3px violet, `--np-focus-offset` 2px; `--np-shadow-on-navy` for floating cards on navy. Brand primitives
(`--np-navy`, `--np-navy-raised`, `--np-navy-chip`, `--np-navy-border`, `--np-navy-active`, `--np-teal`, `--np-teal-brand`,
`--np-violet`, `--np-violet-on-navy`, `--np-mint`, …) are fixed in every theme. Utilities: `np-tabular` / `np-num`
(tabular numerals), `np-text-tertiary`, `np-text-title`.

**Navy surfaces.** Add `np-surface-navy` to any container (the AppShell sidebar, the checkout order side and
`Card variant="navy"` do it for you): the semantic colours re-map so every kit component inside reads on navy, and
merchant accents never reach it.

## Brand — logo usage

- **Components**: `<NearPayMark variant="auto | light | dark | onNavy | mono | app-icon" size title />` (≤ 20 px switches
  to the favicon weights: stroke 6, dot r 6) and `<NearPayLogo size="sm | md | lg | xl" variant="auto | light | dark | mono" />`.
- **Strings** (React-free, `@nearpay-internal/ui/brand`): `markSvg()`, `logoSvg()` (outlined wordmark — no font needed),
  `faviconSvg()`, geometry constants (`MARK_ROUTES_PATH`, `MARK_DOT`, `BRAND_COLORS`).
- **Files** (`@nearpay-internal/ui/brand/*`): `mark-light.svg`, `mark-dark.svg`, `mark-mono.svg`, `app-icon.svg`,
  `logo-light.svg`, `logo-dark.svg`, `favicon.svg` (follows the colour scheme), `favicon.ico` (16/32/48),
  `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `og-image.png` (1200 × 630).
  Regenerate with `pnpm --filter @nearpay-internal/ui brand` (`scripts/build-brand.ts`: Instrument Sans 650 outlines,
  resvg renders); a test fails if the committed SVGs drift from the functions.

```html
<link rel="icon" href="/favicon.ico" sizes="48x48" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta property="og:image" content="https://nearpay.money/og-image.png" />
```

| Do                                                                                               | Don't                                                             |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Teal routes + violet dot on white; mint + light violet on navy (`variant="auto"` picks for you). | Recolour the mark or use brand teal `#00A38C` for text.           |
| Keep clear space of at least the dot's diameter around the lock-up.                              | Put the logo on mint, photos or busy gradients.                   |
| Use `mono` only for one-colour reproduction (navy or white).                                     | Stretch, rotate, outline or add effects to the mark.              |
| Use the app icon (teal tile) where a square icon is required.                                    | Retype the wordmark in another font or weight.                    |
| Use `NearPayLogo label=""` inside a link that already says "NearPay".                            | Shrink the full lock-up below 19 px wordmark size (use the mark). |

## Components

`Button` (`primary`, `secondary`, `quiet`/`ghost`, `danger`, `on-navy`, `navy`, `mint`; `lg`/`md`/`sm`; `pill`),
`IconButton` (+ `on-navy`), `AppShell` v2 (navy sidebar, avatar workspace switcher, nav groups with `hideLabel`, top-bar
`search`, `mode` + `onModeChange` → Live/Test switch; stacks on mobile), `ModeSwitch`, `KpiCard` / `KpiGrid` (incl.
`tone="warning"`), `Stat` / `StatGroup`, `StatusBadge` (v2 pairs; new `progress` tone), `Table` (`title`, `actions`,
`variant="flat"`, `muted` columns), `Card` (`outline`/`flat`/`navy`, radius 16), `Callout` (`verified`, `progress`,
`compact`), `PickerTrigger` + `np-picker*` styles (drop-in for the checkout picker: `ck-picker__x` → `np-picker__x`),
`RouteDiagram` / `RouteChip` / `RouteArrow`, `ConvergenceHero` (SMIL, no dependencies, static under reduced motion),
`CheckoutFrame` (navy order side, split from 880 px; `securedLabel`), plus everything from 0.2–0.4: `Field`, `Input`,
`SearchInput`, `Select`, `Textarea`, `Combobox`, `Checkbox`, `RadioCardGroup` / `OptionCard`, `SelectionCard`,
`OptionButton`, `Avatar`, `KeyValueList`, `Money`, `Pager`, `Tabs`, `SegmentedControl`, `Timeline`, `Steps`, `CopyField`,
`CopyText`, `IdText`, `Countdown`, `Modal`, `ToastProvider`, `LiveRegion`, `Skeleton`, `EmptyState`, `ErrorState`,
`StateScreen`, `PageHeader`, `Breadcrumb`, `FilterBar`, `Popover`, `Menu` / `MenuButton`, `PageLayout`, `Section`,
`TwoColumnLayout`, `LineChart`, icons (`*Icon`, `NearPayMarkIcon`).

- **React-free subpaths**: `@nearpay-internal/ui/money`, `@nearpay-internal/ui/icons-svg`, `@nearpay-internal/ui/brand`.
- **Budget**: zero runtime dependencies besides the React peer and the font package; `sideEffects` is limited to CSS.
- **Gallery** (not published): `pnpm --filter @nearpay-internal/ui gallery:build` → `gallery/dist/index.html` (single
  self-contained file: every component in light and dark, plus the three v2 reference screens).

Copy rules and status vocabulary: `nearpay-brain/product/design-system.md`. Part of `nearpay-kit`; no domain rules
(ADR-0001).
