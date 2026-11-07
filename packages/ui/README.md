# @nearpay-internal/ui

NearPay design system: tokens, component CSS and thin, accessible React 19 components for checkout, dashboard, ops console and site. Built from the owner's Figma ("NearPay — Payments Product Design").

```ts
import "@nearpay-internal/ui/fonts.css"; // DM Sans (OFL), self-hosted — CSP font-src 'self'
import "@nearpay-internal/ui/tokens.css"; // custom properties: light, dark, auto
import "@nearpay-internal/ui/styles.css"; // np-* component classes in cascade layers
import { ThemeRoot, CheckoutFrame, Button, Money } from "@nearpay-internal/ui";
```

- **Tokens**: `tokens.css` + typed `tokens.ts` (`palette`, `color.light|dark`, `fontSize`, `space`, `size`, `radius`, …). Themes via `data-theme="light|dark|auto"` on a `.np-root`; runtime merchant appearance with `applyAppearance(el, {theme, accent, radius})` / `<ThemeRoot>` (CSSOM only — no inline `style=""`; accents are adjusted to keep WCAG AA).
- **Components**: `Button`, `IconButton`, `Field`, `Input`, `SearchInput`, `Select`, `Combobox`, `Checkbox` (incl. `tile`), `RadioCardGroup` + `OptionCard`, `SelectionCard`, `Avatar`, `Card`, `Callout`, `StatusBadge`, `ModePill`, `Stat` / `StatGroup`, `KeyValueList`, `Money`, `Table` + `Pager`, `Tabs`, `SegmentedControl`, `Timeline`, `Steps`, `CopyField`, `Countdown` / `useCountdown`, `Modal`, `ToastProvider` / `useToast`, `LiveRegion`, `Skeleton`, `EmptyState`, `PageHeader`, `Breadcrumb`, `AppShell`, `CheckoutFrame`, icons (`*Icon`, `NearPayMark`).
- **Pure helpers**: `formatMoney` / `formatMoneyParts` (bigint or integer string + decimals → text; no floats, INV-5), `truncateMiddle`, `formatCountdown`, `contrastRatio`, `deriveAccent`.
- **Budget**: zero dependencies besides the React peer and the font package; `sideEffects` is limited to CSS, so unused components tree-shake away.
- **Gallery** (not published): `pnpm --filter @nearpay-internal/ui gallery:build` → `gallery/dist/index.html` (single self-contained file); `gallery:dev` for a dev server.

Design rules, copy guidelines and status vocabulary: `nearpay-brain/product/design-system.md`. Part of `nearpay-kit`; no domain rules (ADR-0001).
