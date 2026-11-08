# Changelog

All packages in this repository share one version. Breaking changes bump the major version and
carry a migration note here (semver, foundations §4).

## Unreleased

### chains — Stage 4 helpers (for 0.4.0)

- `splAssetId(mint)`: NEAR Intents asset id of a Solana SPL mint,
  `nep141:sol-<hex(keccak256(raw 32 mint bytes)[12..32])>.omft.near`; throws on a non-32-byte/non-base58 mint.
- `bitcoinAddressType(address, caip2 = BITCOIN_MAINNET)`: `p2wpkh` | `p2tr` | `other` (P2PKH, P2SH, P2WSH,
  other witness versions) | null (invalid); uses the package's own bech32/bech32m decoder (no new dependency).
- `BITCOIN_MAINNET` constant. Tests check both against the spec 0.4.0 chain vectors (fixture copy in
  `packages/chains/test/fixtures/`; switch to `@nearpay/spec/test-vectors/chains-solana-bitcoin.json` after the
  spec bump). Spec dependency stays 0.3.1.

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
spec 0.3.0.

### spec 0.3.0

- Every package depends on `@nearpay/spec` / `@nearpay-internal/spec` **0.3.0**.

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

- Every package depends on `@nearpay/spec` / `@nearpay-internal/spec` **0.2.1** (additive builders'
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

- Every package depends on `@nearpay/spec` / `@nearpay-internal/spec` **0.2.0** (Stage 2 contract
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
- Every package depends on `@nearpay/spec` / `@nearpay-internal/spec` 0.1.1.

## 0.1.0 — Stage 1, step 1.1

First release of all ten packages: `ids`, `money`, `chains`, `intents`, `db`, `bus`, `auth`,
`http`, `service`, `testing`.
