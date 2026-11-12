# Changelog

All packages in this repository share one version. Breaking changes bump the major version and
carry a migration note here (semver, foundations §4).

## 0.6.0 — 2026-11-12 (resilience: backend audit 2026-11-12, KIT-1…KIT-7)

`auth`, `bus`, `db`, `http`, `service` and `testing` 0.6.0 (`testing` has no code change; it pins the new `auth` and
`service`). `ids`, `intents`, `chains`, `money` and `ui` are unchanged and not republished. Design:
`nearpay-brain/lld/00-foundations.md` §8, §10, §15 (version 1.8). Minor release: public APIs stay source-compatible for
normal use; the behaviour changes and caveats are listed under "Upgrading".

- **http (KIT-2)** — the half-open probe can no longer leak. The service token is fetched and the body serialised before
  the breaker grants a permit; the permit is settled in `finally` (verdict on success, 5xx, network error and timeout —
  the body read included; released without a verdict when the caller aborts). `beforeCall` now returns a
  `BreakerPermit` for `record(ok, permit)` / `release(permit)`; results from an earlier breaker period are ignored; a probe
  that never reports re-opens the breaker after `probeTimeoutMs` (default 30 s; the client uses max(30 s, 2 × timeout)).
  New: `CircuitBreaker` type, `onStateChange`, client `onBreakerStateChange`, `breakerStates()`.
- **bus (KIT-1)** — `subscribe` supervises its consume loop: when it ends or throws without `stop()` the error is reported
  and the durable is re-created after 1 s → 60 s jittered back-off (`restartBackoff`), until it consumes again; `stop()`
  interrupts the back-off. Consumers use `abort_on_missing_resource` (a deleted durable ends the iterator instead of
  spinning on "consumer not found" forever). Returns `running()` / `restarts()`; `onRunningChange`, `onRestart`,
  `consumerRunning()`, `restartDelayMs`. `heartbeat` (liveness) beats while the loop is alive, never while a handler hangs
  or once the connection is closed for good; `domainConsumersTask` declares `maxSilenceMs` 120 s.
- **auth (KIT-3)** — `serviceTokenClient` refreshes in the background from `exp − 60 s`, keeps serving the cached token
  until `exp − 5 s` while identity is unavailable, retries with 1 s → 30 s jittered back-off and logs
  `ALERT service_token_refresh_failing` once per streak (stderr JSON, or `onRefreshFailing` / `onRefreshRecovered`). Only
  a caller without a usable token waits for identity. Verifiers still enforce `exp`.
- **service (KIT-4)** — liveness from heartbeats. A `BackgroundTask` with `maxSilenceMs` receives a `Heartbeat` in
  `start(heartbeat)`; `service.heartbeat(name, maxSilenceMs)` registers other loops; `service.liveness()`. `/healthz`
  answers 503 `stalled: …` while a registered loop is active and silent beyond its budget; idle loops (leader followers)
  and dependency outages never fail it. New gauges `background_last_beat_seconds{task}`, `background_task_stalled{task}`,
  `http_breaker_open{target}` (KIT-2), `consumer_running{durable}` (KIT-1); `ALERT background_task_stalled` log.
- **db (KIT-5)** — pool `connectionTimeoutMs` 5 s (connect and pool wait), TCP `keepAlive`, server-side
  `idle_in_transaction_session_timeout` 60 s (`idleInTransactionTimeoutMs`, 0 disables). Leadership heartbeats race
  `heartbeatTimeoutMs` (2 × heartbeat) and give up leadership on timeout; a term shorter than `retryMs` is followed by
  `retryMs` + jitter (no hot re-election).
- **db (KIT-4)** — `outboxRelayTask` (120 s), `jobWorkerTask` (max(3 × lease, 120 s); `extendLease` beats),
  `leaderTask` (max(12 × heartbeat, 60 s), followers idle, `livenessFrom: "leadership" | "run"`, `run(signal, beat)`) and
  `recurringJobsTask` (max(3 × tick, 60 s)) declare `maxSilenceMs` (`false` opts out).
- **db (KIT-6)** — kit migration `0000_kit_outbox_attempts`. `relayOnce` counts failures per row; a `poison` row
  (payload over `max_payload`, invalid subject) is moved to `dead_letters` (source `outbox`) after `maxAttempts` (5), an
  `unroutable` one (no stream) after 5 attempts and 5 min of failing; later rows then publish. Transient errors are retried
  forever. `classifyPublishError`, `deadLetter` policy, `onDeadLetter` (default: `ALERT outbox_dead_lettered` via
  `onError`). `relayOnce(db, publish, n | options)`.
- **db (KIT-7)** — `listDeadLetters`, `getDeadLetter`, `replayDeadLetter` (consumer: handler through the inbox; outbox:
  requeue under the event id; job: re-arm; custom `sources`), `dropDeadLetter`, `pendingOutbox`, `skipOutboxRow`,
  `requeueOutboxEnvelope`, and `runKitOps(db, "dead-letters" | "outbox", args, {actor, handlers})` + `DEAD_LETTER_USAGE`
  for every service's ops CLI.

### Upgrading

- **Run the service's `migrate` process before the new code** (Compose already does: `migrate-<svc>` completes first).
  Until `0000_kit_outbox_attempts` is applied, `/readyz` reports it pending and the relay fails. Rolling a service back to
  kit ≤ 0.5 after migrating: the old code reports that migration as drift — delete its `schema_migrations` row (the new
  columns are additive and harmless).
- `/healthz` can now fail (that is the point): kit tasks have budgets by default. Custom background tasks are unaffected
  until they declare `maxSilenceMs` and beat. Rails' poller/verifier and other hand-written loops should adopt it.
- A transaction left idle for 60 s is now terminated by Postgres. Pass `idleInTransactionTimeoutMs` if a service really
  needs longer.
- `ServiceMetrics` gained `collectBackground`: only custom implementations of that interface need to add it.
- `subscribe` no longer leaves a consumer that hit a terminal error idle; services that relied on restarting the process
  to recover need nothing.

## 0.5.0 — 2026-11-11 (public spec renamed to `@nearpay-money/spec`)

`auth`, `bus`, `db`, `http`, `ids`, `intents`, `service` and `testing` 0.5.0: depend on **`@nearpay-money/spec`
0.5.0** and `@nearpay-internal/spec` 0.5.0 (ADR-0025: the public packages moved from `@nearpay/*` to
`@nearpay-money/*`; the `@nearpay` npm scope belongs to an unrelated company). No code change beyond the import
specifier; contracts are identical to spec 0.4.2. `chains` and `money` (no spec dependency) stay at 0.4.0, `ui` at 0.5.0;
none of them is republished. Consumers still on kit ≤ 0.4.0 keep working with the pnpm override
`"@nearpay/spec": "npm:@nearpay-money/spec@0.5.0"` (those tarballs import the old name).

## ui 0.5.0 — 2026-11-11 (design v2, "Convergence")

`@nearpay-internal/ui` only; the other packages stay at 0.4.0 (unchanged, not republished). Visual redesign to the
owner-approved v2 identity (brief: design-v2, artboards Logo / Checkout-proposed / Dashboard-proposed / Main). Minor bump
on 0.x: token names, class names and component APIs are kept where possible; the few renames are listed below.

### Tokens v2

- Palette replaced: navy `#12263F` (dark surfaces, primary text), teal `#007A68` / hover `#005C4F` (actions, links),
  brand teal `#00A38C` (marks only), violet `#5B5BD6` (routes + focus ring; `#B4B4FF` on navy), mint `#8EF0D3`
  (accents on navy only), canvas `#F3F6F9`, borders `#E1E7EE`, outline `#C9D3DE`. Dark theme is navy-based.
- New semantic tokens: `text-tertiary`, `border-subtle`, `border-outline`, `route`, `info-bg/fg` (Confirming),
  `warning-subtle`, `warning-strong`, `navy`, `navy-raised`, `navy-border`, `navy-active`, `on-navy`,
  `on-navy-secondary`, `on-navy-muted`, `on-navy-accent`, `on-navy-route`; primitives `--np-navy*`, `--np-violet*`,
  `--np-teal-brand`, `--np-border-outline`, `--np-on-navy*`; `--np-radius-panel`, `--np-radius-pill`,
  `--np-focus-width`/`-offset`, `--np-shadow-on-navy`, `--np-text-title|stat|amount-hero`, `--np-weight-strong|bold`,
  `--np-tracking-title`.
- `.np-surface-navy` scope (tokens.css): re-maps every semantic colour for content on navy, in both themes.
- Focus ring: 3 px violet, offset 2 px, everywhere (inputs included). Merchant appearance (`applyAppearance`: accent,
  radius, theme) unchanged; card / panel / pill radii now derive from the merchant radius (12 → 16 / 24 / pill).
- Contrast test extended to every new pair (both themes) and to the navy scope: all text ≥ 4.5:1, UI ≥ 3:1. Text-field
  borders stay ≥ 3:1 (`#7A8CA2`); the lighter artboard outline `#C9D3DE` is `border-outline`, used only on labelled
  controls (secondary buttons, picker cards).

### Type

- Instrument Sans (OFL) self-hosted from `@fontsource-variable/instrument-sans` (variable 400–700, so 650 headings);
  DM Sans removed. Headings tight (−0.02…−0.045em), tabular numerals on amounts (`np-tabular`, alias `np-num`).

### Brand

- `NearPayMark` (variants `auto`, `light`, `dark`/`onNavy`, `mono`, `app-icon`; favicon weights ≤ 20 px) and
  `NearPayLogo` (`sm|md|lg|xl`) with the exact Convergence geometry; React-free `@nearpay-internal/ui/brand`
  (`markSvg`, `logoSvg` with an outlined 650 wordmark, `faviconSvg`, constants).
- `brand/` ships in the package (`@nearpay-internal/ui/brand/*`): SVG marks/logos, `favicon.svg`, `favicon.ico`
  (16/32/48), `apple-touch-icon.png`, `icon-192/512.png`, `icon-maskable-512.png`, `og-image.png` (1200 × 630). Built by
  `scripts/build-brand.ts` (`pnpm brand`; dev-only: opentype.js, wawoff2, @resvg/resvg-js, @fontsource/instrument-sans).

### Components

- New: `KpiCard` / `KpiGrid`, `ModeSwitch`, `PickerTrigger` + `np-picker*` styles (same structure as the checkout's
  picker), `RouteDiagram` / `RouteChip` / `RouteArrow`, `ConvergenceHero` (SMIL `animateMotion` + `beginElement`, one dot
  every ~2.4 s on a random route with an arrival pulse, static under `prefers-reduced-motion`, no inline styles),
  `NearPayMarkIcon`, `ChevronUpDownIcon`.
- `Button`: `quiet` (= 0.4 `ghost`, kept), `on-navy`, `navy`, `lg`, `pill`. `IconButton`: `on-navy`.
- `AppShell` v2: navy sidebar, avatar workspace switcher (`workspace.initial`), sentence-case / hidden group labels
  (`NavGroup.hideLabel`), top-bar `search`, `mode` + `onModeChange` (Live/Test switch), stacked navy bar on mobile.
- `StatusBadge` v2 pairs (`progress` tone), `Callout` (`verified`, `progress`, `compact`, custom icon), `Card` (`variant`
  `outline|flat|navy`, radius 16), `Table` (`title`, `actions`, `variant="flat"`, `muted` columns; 14 px rows, quiet
  header), `CheckoutFrame` (hosted order summary on navy; split layout ≥ 880 px; `securedLabel`; mark in the footer).
- Gallery redrawn: every component light/dark, brand page, and the three references (checkout review, dashboard home,
  landing hero). `Money` untouched.

### Migration (consumers)

| 0.4                                                                                                     | 0.5                                                               | Action                                                             |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `NearPayMark` (icon: filled "N", `currentColor`)                                                        | `NearPayMark` brand component (brand colours, `variant`)          | For one-colour use pass `variant="mono"` or use `NearPayMarkIcon`. |
| `iconSvg("nearpay-mark")` "N"                                                                           | Convergence mark (one colour)                                     | None; for brand colours use `markSvg()` from `/brand`.             |
| `NearPayLogo` exported from `AppShell`                                                                  | exported from `Brand` (same import path `@nearpay-internal/ui`)   | None; optional `size`, `variant`, `label`.                         |
| `Button variant="ghost"`                                                                                | `variant="quiet"`                                                 | Optional (ghost still works and still emits `np-button--ghost`).   |
| `statusTone("Confirming" \| "Payment detected" \| "Pending")` = `warning`                               | `progress` (`np-badge--progress`, violet)                         | Update CSS/tests that expect `np-badge--warning` for these.        |
| `statusTone("Not paid" \| "Not submitted")` = `warning`                                                 | `neutral`                                                         | Same.                                                              |
| `Tone` union                                                                                            | adds `"progress"`                                                 | Add a case to exhaustive switches.                                 |
| `Callout icon?: boolean`                                                                                | `boolean \| ReactNode`; tone `verified` shows a shield by default | Pass `icon={false}` to hide it.                                    |
| Table body cells in secondary colour                                                                    | primary text colour                                               | Mark secondary columns `muted: true`.                              |
| `--np-color-focus` = accent                                                                             | violet `#5B5BD6` (merchant accent still overrides it)             | None.                                                              |
| `--np-size-field` 56, `--np-size-sidebar` 224, `--np-size-gutter-workspace` 48, `--np-radius-control` 8 | 52, 248, 40, 12                                                   | Check layouts that hard-code the old sizes.                        |
| `"DM Sans Variable"`                                                                                    | `"Instrument Sans Variable"`                                      | Replace any hard-coded font name; keep importing `fonts.css`.      |
| AppShell menu button in the top bar                                                                     | in `.np-shell__mobilebar` (label "Open menu" unchanged)           | Update CSS that targets `.np-shell__topbar .np-shell__menu`.       |
| Nav group / menu headings uppercase                                                                     | sentence case                                                     | None.                                                              |

## 0.4.0 — 2026-11-09

- chains: `splAssetId(mint)`, `bitcoinAddressType`; spec 0.4.1.

## Unreleased

### chains — Stage 4 helpers (for 0.4.0)

- `splAssetId(mint)`: NEAR Intents asset id of a Solana SPL mint,
  `nep141:sol-<hex(keccak256(raw 32 mint bytes)[12..32])>.omft.near`; throws on a non-32-byte/non-base58 mint.
- `bitcoinAddressType(address, caip2 = BITCOIN_MAINNET)`: `p2wpkh` | `p2tr` | `other` (P2PKH, P2SH, P2WSH,
  other witness versions) | null (invalid); uses the package's own bech32/bech32m decoder (no new dependency).
- `BITCOIN_MAINNET` constant. Tests check both against the spec 0.4.0 chain vectors (fixture copy in
  `packages/chains/test/fixtures/`; switch to `@nearpay-money/spec/test-vectors/chains-solana-bitcoin.json` after the
  spec bump). Spec dependency stays 0.3.0 (unchanged).

## 0.3.1 — 2026-11-08

Patch release (Stage 3.2 change requests from webhooks and billing). No API removed or changed;
packages still build against spec **0.3.0**.

### service — SSE backpressure fixes

- `SseStream.drain()` waits only while `res.writableNeedDrain` is true (the last write hit the
  high-water mark). 0.3.0 waited while `writableLength > 0`. A small buffered amount below the
  high-water mark never triggers `drain`, so the promise could hang forever.
- Closing a stream with more than `maxBufferedBytes` unsent calls `res.destroy()` instead of
  `res.end()`. This covers slow-client close, `maxDurationMs` and service shutdown. `end()` waited to
  flush to a reader that never reads, which kept the socket open. Streams without `maxBufferedBytes`,
  or within it, still end gracefully.
- Regression tests: a real socket whose client stops reading (drain pending, then close destroys
  the socket and releases drain); drain with small buffered data resolves at once.

### service — binary responses

- `binary(bytes, contentType, headers?)` / `ctx.binary(…)` return raw bytes from routes with a spec
  `binaryResponse` (billing invoice PDFs, `application/pdf`). The body is sent with the route's
  status, `x-request-id` and an exact `content-length`. The content type must match the route's
  (media type only); a mismatch follows `responseValidation` (enforce → 500, log → logged). Returning
  bytes from a route without `binaryResponse` is a 500. Binary responses bypass `Idempotency-Key`
  storage. Handlers that write `ctx.reply` themselves (billing's 0.3.0 workaround) keep working.

## 0.3.0 — 2026-11-08

Stage 3 step 3.1 (agent-commerce). Additive; minor bump because every package now builds against
spec 0.4.1.

### spec 0.4.1

- Every package depends on `@nearpay-money/spec` / `@nearpay-internal/spec` **0.3.0**.

### service — SSE limits, resume cursor, `ctx.sse`

- `@nearpay-internal/service`: `openSse(res, def, headers, limits?)` and `ctx.sse(limits?)` take
  optional `SseLimits {maxDurationMs, maxBufferedBytes, slowClientMs}`. The stream closes itself
  after `maxDurationMs`. It also closes a client that keeps more than `maxBufferedBytes` unsent for
  `slowClientMs` (default 30 s; checked on each heartbeat). `SseStream.buffered` and
  `SseStream.drain()` let a replaying producer wait for the socket. `resumeCursor(headers, query?)`:
  `Last-Event-ID` wins over `starting_after`. For the webhooks event stream (lld/webhooks.md §5.1).
  The limits stay parametric; the service maps spec `EVENT_STREAM_MAX_SECONDS` /
  `EVENT_STREAM_MAX_CONCURRENT` onto them (heartbeat and retry come from the route's `stream`
  definition).

### intents — x402 `near-intents` binding, operation token, JCS

- `@nearpay-internal/intents`: x402 `near-intents` helpers for agentpay (lld/agentpay.md §3.1).
  - `nearIntentsBinding(input)`: `np1:` + base58(sha256(JCS)).
  - `mintOperationToken(key, kid, input)` and `verifyOperationToken(token, keys, input, now)`:
    `<kid>.<expiry>.<HMAC-SHA256 over JCS>`. Expiry is checked before the key, and the MAC
    compare is constant-time. Failure reasons: `malformed`, `expired`, `unknown_key`, `invalid`.
  - `jcs()` for string/integer/null/object values.
- `NearIntentsBindingInput` / `OperationTokenInput` are the declared fields of the spec's
  `X402NearIntentsBindingInput` / `X402OperationTokenInput`. Tests read the spec vectors
  `test-vectors/x402-near-intents.json` and compare the kit's output with the spec's own
  `parseOperationToken` and `quotedRequirements`.

## 0.2.1 — 2026-11-08

Stage 2 follow-up. Additive except the **`NP_ENV` behaviour change** below (deliberately shipped in
a patch on the lead's call: it only affects processes that were started without `NP_ENV`, which is
the misconfiguration being closed).

### spec 0.2.1

- Every package depends on `@nearpay-money/spec` / `@nearpay-internal/spec` **0.2.1** (additive builders'
  change requests). No kit code change was needed.

### service / testing — `NP_ENV` is required (audit finding 2 follow-up)

- **Behaviour change:** `@nearpay-internal/service` `baseConfigShape.env` no longer defaults to
  `local`. A process started without `NP_ENV` (or with an empty value) now fails at boot with
  `ConfigError`: `NP_ENV: is required — set it explicitly to one of local, server, test (there is no
  default; local/test enable development relaxations)`; `runMain` exits 1. Previously such a server
  silently got the development relaxations of `local`.
- New `isDevEnv(env)` — true only for `local` and `test` (anything else, including unknown or
  missing values, is treated as a real deployment). Services gate dev relaxations with it instead of
  comparing `config.env` by hand. Also exported: `ENVS`, type `Env`.
- `@nearpay-internal/testing`: `testEnv(vars)` (`NP_ENV=test` plus the given `NP_*` variables; refuses
  any other `NP_ENV`), `testConfig(overrides)` (a `BaseConfig` with `env: "test"`, silent logs,
  ephemeral loopback ports), `TEST_ENV`; `mockPeer` uses `testConfig()`.
- **Migration:** `nearpay-deploy` sets `NP_ENV` explicitly in every Compose profile (`local` for the
  laptop stack, `server` for the host). Testcontainers images of a service and test helpers that call
  `loadConfig`/`runMain` must pass `NP_ENV=test` (`testEnv()`); in-process `createService` tests can
  use `testConfig()`.

### ui — gaps reported by the Stage 2 UI builders

- New components: `Textarea`; `FieldError` and field-level error state (`Field error={true}` marks a
  field invalid without its own message; controls get `aria-errormessage`; composite controls inside an
  invalid field get the danger border); `ErrorState` (title, message, retry with busy state, reference;
  `role="alert"`); `CopyText` (short value + copy, polite announcement, selects the text on failure)
  and `IdText` (monospace id with copy, optional middle truncation that still reads/copies the full
  id); `Popover` (non-modal, CSS-positioned); `Menu` / `MenuButton` (WAI-ARIA menu button: arrows,
  Home/End, type-ahead, Esc/Tab, radio/checkbox items, link items via `renderLink`); `FilterBar` +
  `FilterPill` (select-style button `np-select-button`, active style when not at its default);
  `OptionButton` (option-card row that is a button); `StateScreen` (icon, title, lede, badge, callout
  with reference, actions); `PageLayout`, `Section`, `TwoColumnLayout` (form + side panel; container
  query on the outer element); `LineChart` (dependency-free SVG; values are bigint/integer strings,
  scaled with bigint arithmetic and converted to pixels for display only; nice whole-unit ticks via
  `formatMoney`; crosshair + tooltip on hover and ←/→/Home/End; hidden data table; 1–4 series with a
  validated categorical palette `--np-chart-1…4` / `chart` token, legend for ≥ 2 series).
- `Modal` stacking: open modals form a layer stack (`pushLayer`, `openLayerCount`, `topLayerId`);
  z-index via the CSSOM custom property `--np-layer` (CSP-safe); only the topmost modal handles Esc and
  Tab; the scroll lock lasts until the last one closes; `priority="step-up"` always sits above every
  other open modal.
- `Table`: `renderLink` (`LinkRenderer`) for SPA row links; the scroll container is
  `position: relative` so row-link overlays stay inside it. `Breadcrumb` also takes `renderLink`.
- `StatGroup`: column minimum `min(100%, 200px)` (overridable with `--np-stat-min`).
- `AppShell`: the sidebar colour runs the full page height (painted by the shell grid, not the sticky
  sidebar); controlled `navOpen` / `onNavOpenChange`; `onNavigate(item, event)` (drawer closes after
  navigation); `renderLink` for nav and footer links; `footerActions` slot (Sign out); workspace
  switcher in menu mode (`workspace.menu`), button mode (`onSwitch`) or — with neither — a static,
  non-interactive label (was a button that did nothing); `modeSwitch` slot replaces the static pill.
- `CheckoutFrame`: desktop background fixed — a container query cannot style its own container, so
  the background moved to a new `.np-checkout__canvas` child; `data-testid` pass-through. Also
  `CopyField`, `Combobox`, `Modal`, `Table` pass `data-testid` through.
- `Combobox`: `beforeList` slot between the search box and the list.
- Icons: geometry moved to `icons/shapes.ts`; new `RefreshIcon`, `LogOutIcon`, `MoreIcon`; React-free
  subpath **`@nearpay-internal/ui/icons-svg`** (`iconSvg(name, {size, title, className})`,
  `ICON_NAMES`, `ICON_SHAPES`) renders the same icons as SVG strings for Astro/static pages.
- **`@nearpay-internal/ui/money`**: React-free subpath export for `formatMoney` & co.
- Optional **`@nearpay-internal/ui/prose.css`**: long-form text (`np-prose`), code blocks
  (`np-codeblock`), table of contents (`np-toc`).
- Tokens: `--np-z-popover`, `--np-chart-1…4` (light/dark/auto) mirrored by `chart` in `tokens.ts`.
- Gallery: entries for every new component; Ref B uses `LineChart`, the menu workspace switcher and
  Sign out; checkout result states use `StateScreen`.

## 0.2.0 — 2026-11-07

Stage 2 kit release (step 2.1). Additive except the ops-principal tightening below (a 0.x minor;
see the migration note).

### spec 0.2.0

- Every package depends on `@nearpay-money/spec` / `@nearpay-internal/spec` **0.2.0** (Stage 2 contract
  freeze). No kit code reads the 1Click `OneClick*` fields that became nullish.
- `@nearpay-internal/service`: `ops` routes (`visibility: "ops"`, `/ops/…`) get the 10 s request
  budget of gateway-routed routes (internal routes keep 5 s).

### money / http / intents (rails-fx, CR-15-16)

- `@nearpay-internal/money`: `RoundingMode` (`floor`, `ceil`, `half_even` — banker's, `half_up`) and
  `roundRational`; `toDecimalString` accepts every mode; `toDisplayDecimal` (≤ 18 places, half-even,
  trailing zeros dropped — the spec `RateDecimal`); `ratioToWire` / `ratioFromWire` for the spec 0.1.6
  `Ratio` (`{num, den}` integer strings); `convertUnits(amount, fromExp, rate, toExp, mode)` (fiat↔fiat,
  fiat↔asset at an exact rate) and `toUsdMicros`; `parseJsonDecimals(text)` keeps every JSON number as
  its source text so feed prices (CoinGecko) never pass through a float (rails §8.2).
- `@nearpay-internal/http`: `call(route, {headers})` sends extra request headers a route declares (e.g.
  the payer's `X-NearPay-Client-Secret` forwarded by agentpay); a caller-supplied `X-NearPay-Token` is
  dropped so route calls always authenticate as the client (CR-15-16).
- `@nearpay-internal/intents`: `sendSignedTx({bytes, txHash, waitUntil?, timeoutMs?})` sends an
  already-signed transaction (from `buildExecuteTx`, whose hash the caller stored first) and returns
  the outcome; `ExecuteResult.blockHash` (optional) is the including block's hash; `TxWaitUntil` type;
  `executeIntents` now delegates to `sendSignedTx` (CR-15-16).

### ops principals (auth / service / testing)

- `@nearpay-internal/auth` `authorizeRoute` — which `@nearpay-internal/service` runs for every route —
  enforces console (ops) principals, fail closed: the token must carry a known `ops_role`
  (`OPS_ROLES`) and no other principal type may carry one; the route must list an `ops:<scope>` that
  the principal holds and its role is granted (`OPS_ROLE_SCOPES`); `ops_role` must be in the route's
  `opsRoles` (an `ops` route without `opsRoles` admits nobody; internal routes that declare
  `opsRoles`, e.g. `decideKyb`, are checked too); `stepUp` routes need a fresh `step_up_until`
  exactly as for sessions. `ops` routes refuse every non-ops principal (anonymous sign-in routes
  under `/ops/auth/` stay anonymous); non-ops routes admit ops principals only through an explicit
  `ops:` entry (e.g. `listEvidence` with `ops:rails.read`). New exported type `AuthorizableRoute`;
  `ClaimsInput` gains `ops_role`.
- **Migration:** ops tokens without `ops_role` (possible before spec 0.2.0) are now refused with
  `permission_denied`; identity mints `ops_role` for every `ptype=ops` token (identity §6.3).
- `@nearpay-internal/testing`: `opsClaims`, `mintOpsToken({role, scopes, stepUp, sub})`,
  `testOpsToken(...)` (a token provider for `httpClient({serviceToken})`), `opsHeaders(...)`;
  `mockPeer` serves console routes (`OPS_ROUTES`, also part of `INTERNAL_ROUTES`) with the same
  enforcement as production.

### new `@nearpay-internal/ui`

- New package `@nearpay-internal/ui` — the NearPay design system (tokens, component CSS, React 19
  components, money/countdown/contrast helpers) with a static gallery. Peer: `react@^19`. Decision:
  `nearpay-brain/decisions/0021-shared-ui-package.md`.
- Stat values never overflow their column: stat columns shrink (`minmax(min(200px, 100%), 1fr)`), each
  stat is an inline-size container, values step down to h3 below 180 px and h4 below 140 px, the
  suffix symbol may wrap (gallery Ref C · Payment detail fix).
- `scripts/build-package.mjs`: optional `kitBuild` in a package's `package.json` (`compilerOptions`
  merged into the build tsconfig, `copy` for non-TS assets such as CSS).
- Unit tests may be `.test.tsx`; `packages/ui` tests run in jsdom.

## 0.1.2 — Stage 1, step 1.2

Additive (no migration needed):

- `@nearpay-internal/db`: `inboxHandler(db, fn)` (inbox dedupe + apply in one transaction, foundations
  §8), `deadLetterSink(db, source)`, background tasks `outboxRelayTask`, `jobWorkerTask`, `leaderTask`
  and `recurringJobsTask` (leader-elected enqueue of hourly/daily jobs, one job per slot via the dedupe
  key) with `recurringSlot`.
- `@nearpay-internal/bus`: `startDomainConsumers` / `domainConsumersTask` (one durable per producing
  stream, filters from the handlers, refuses subjects the catalogue does not route to the service),
  `unhandledSubjects` for contract tests, `durablesOf` for consumer-lag metrics.
- `@nearpay-internal/testing`: `provisionServiceDatabase(adminUrl, service)` creates migrator/app roles
  exactly like `nearpay-deploy`'s `postgres-init` (`pg` is now a dependency).

## 0.1.1 — Stage 1, step 1.2

Additive (no migration needed):

- `@nearpay-internal/testing`: `mockPeer({service, routes})` serves a peer's spec routes through the
  real service bootstrap (request validation, token verification and route authorization, response
  validation), records calls and answers `500 not mocked` for routes without a handler;
  `mockError`, `mintServiceToken(service)` and `testServiceToken(service)` (catalogue scopes).
- Every package depends on `@nearpay-money/spec` / `@nearpay-internal/spec` 0.1.1.

## 0.1.0 — Stage 1, step 1.1

First release of all ten packages: `ids`, `money`, `chains`, `intents`, `db`, `bus`, `auth`,
`http`, `service`, `testing`.
