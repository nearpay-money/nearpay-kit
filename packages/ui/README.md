# @nearpay-internal/ui

NearPay design system: tokens, component CSS and thin, accessible React 19 components for checkout, dashboard, ops console and site. Built from the owner's Figma ("NearPay — Payments Product Design").

```ts
import "@nearpay-internal/ui/fonts.css"; // DM Sans (OFL), self-hosted — CSP font-src 'self'
import "@nearpay-internal/ui/tokens.css"; // custom properties: light, dark, auto
import "@nearpay-internal/ui/styles.css"; // np-* component classes in cascade layers
import "@nearpay-internal/ui/prose.css"; // optional: long-form text (np-prose, np-codeblock, np-toc)
import { ThemeRoot, CheckoutFrame, Button, Money } from "@nearpay-internal/ui";
```

- **Tokens**: `tokens.css` + typed `tokens.ts` (`palette`, `color.light|dark`, `fontSize`, `space`, `size`, `radius`, …). Themes via `data-theme="light|dark|auto"` on a `.np-root`; runtime merchant appearance with `applyAppearance(el, {theme, accent, radius})` / `<ThemeRoot>` (CSSOM only — no inline `style=""`; accents are adjusted to keep WCAG AA).
- **Components**: `Button`, `IconButton`, `Field`, `Input`, `SearchInput`, `Select`, `Combobox`, `Checkbox` (incl. `tile`), `RadioCardGroup` + `OptionCard`, `SelectionCard`, `Avatar`, `Card`, `Callout`, `StatusBadge`, `ModePill`, `Stat` / `StatGroup`, `KeyValueList`, `Money`, `Table` + `Pager`, `Tabs`, `SegmentedControl`, `Timeline`, `Steps`, `CopyField`, `Countdown` / `useCountdown`, `Modal`, `ToastProvider` / `useToast`, `LiveRegion`, `Skeleton`, `EmptyState`, `PageHeader`, `Breadcrumb`, `AppShell` (menu/button/static workspace switcher, controlled `navOpen`, `onNavigate`, `renderLink`, `footerActions`, `modeSwitch`), `CheckoutFrame`, icons (`*Icon`, `NearPayMark`).
- **0.2.1**: `Textarea`, `FieldError` (+ `error={true}`, `aria-errormessage`), `ErrorState`, `CopyText`, `IdText`, `FilterBar` + `FilterPill`, `Popover`, `Menu` / `MenuButton`, stacked `Modal`s (`priority="step-up"`), `OptionButton`, `StateScreen`, `PageLayout` / `Section` / `TwoColumnLayout`, `LineChart` (dependency-free SVG, bigint/integer-string values), `renderLink` (`LinkRenderer`) on `Table` / `Breadcrumb` / `AppShell` / `MenuButton`, `beforeList` slot on `Combobox`, `data-testid` pass-through on `CheckoutFrame` / `CopyField` / `Combobox` / `Modal` / `Table`.
- **React-free subpaths**: `@nearpay-internal/ui/money` (`formatMoney`, `formatMoneyParts`, `truncateMiddle`, `formatCountdown`) and `@nearpay-internal/ui/icons-svg` (`iconSvg(name, {size, title})` → SVG string, for Astro/static pages).
- **Pure helpers**: `formatMoney` / `formatMoneyParts` (bigint or integer string + decimals → text; no floats, INV-5), `truncateMiddle`, `formatCountdown`, `contrastRatio`, `deriveAccent`.
- **Budget**: zero dependencies besides the React peer and the font package; `sideEffects` is limited to CSS, so unused components tree-shake away.
- **Gallery** (not published): `pnpm --filter @nearpay-internal/ui gallery:build` → `gallery/dist/index.html` (single self-contained file); `gallery:dev` for a dev server.

Design rules, copy guidelines and status vocabulary: `nearpay-brain/product/design-system.md`. Part of `nearpay-kit`; no domain rules (ADR-0001).
