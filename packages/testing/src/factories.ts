/**
 * Factories for every Stage-1 aggregate (foundations §4 `testing`). Each result is parsed by its
 * spec schema, so tests can never build an object that violates the contract; pass overrides for
 * the fields a test cares about.
 */

import { newId, uuidv7 } from "@nearpay-internal/ids";
import {
  EventEnvelope,
  Execution,
  envelopeOf,
  InternalSettlementDestination,
  type Subject,
} from "@nearpay-internal/spec";
import {
  Account,
  AgentPayment,
  API_VERSION,
  BalanceTransaction,
  CheckoutSession,
  PaymentIntent,
  SettlementDestination,
} from "@nearpay-money/spec";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K];
};

function merge<T>(base: T, over: DeepPartial<T> | undefined): T {
  if (!over) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b)
        ? merge(b, v as never)
        : v;
  }
  return out as T;
}

export const USDC_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
export const USDC_BASE = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
const unix = () => Math.floor(Date.now() / 1000);
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

export function account(over?: DeepPartial<Account>): Account {
  return Account.parse(
    merge<Account>(
      {
        id: newId("acct"),
        object: "account",
        created: unix(),
        display_name: "Acme Test Shop",
        verified_legal_name: null,
        country: "DE",
        status: "active",
        kyb_status: "not_started",
        live_enabled: false,
        fee_bearer: "payer",
        api_version: API_VERSION,
        settings: {
          late_payments: false,
          underpay_tolerance_bps: 0,
          session_ttl_default: 3600,
          email_receipts: true,
          branding: { accent_color: null, logo_url: null },
        },
      },
      over,
    ),
  );
}

export function settlementDestination(over?: DeepPartial<SettlementDestination>): SettlementDestination {
  return SettlementDestination.parse(
    merge<SettlementDestination>(
      {
        id: newId("sd"),
        object: "settlement_destination",
        created: unix(),
        livemode: false,
        asset_id: USDC_NEAR,
        type: "intents_account",
        chain: "near:mainnet",
        address: "merchant.near",
        label: "Main",
        status: "active",
        verification: "test",
        fingerprint: "YZMN-R81Z-BR",
        is_default: true,
        active_at: unix(),
        min_payment_amount: { amount: 1, currency: "usd" },
        per_payment_cap: null,
        disabled_reason: null,
      },
      over,
    ),
  );
}

export function internalSettlementDestination(
  over?: DeepPartial<ReturnType<typeof InternalSettlementDestination.parse>>,
) {
  const base = settlementDestination();
  return InternalSettlementDestination.parse(
    merge(
      {
        ...base,
        account: newId("acct"),
        address_norm: base.address,
        attestation_hash: null,
        per_payment_cap_usd_micros: null,
      },
      over as never,
    ),
  );
}

export function paymentIntent(over?: DeepPartial<PaymentIntent>): PaymentIntent {
  return PaymentIntent.parse(
    merge<PaymentIntent>(
      {
        id: newId("pi"),
        object: "payment_intent",
        created: unix(),
        livemode: false,
        status: "requires_payment",
        amount: 200,
        currency: "usd",
        asset_id: null,
        description: "Test order",
        source: "checkout",
        checkout_session: newId("cs"),
        destination: {
          settlement_destination: newId("sd"),
          asset_id: USDC_NEAR,
          type: "intents_account",
          chain: "near:mainnet",
          address: "merchant.near",
        },
        fee: { bearer: "payer", total_bps: 50 },
        settlement_asset_id: USDC_NEAR,
        amount_settled: "0",
        amount_refunded: "0",
        succeeded_at: null,
        late: false,
        canceled_at: null,
        cancellation_reason: null,
        review_reason: null,
        attempts: [],
        overpayments: [],
        sequence: 1,
        metadata: {},
      },
      over,
    ),
  );
}

export function checkoutSession(over?: DeepPartial<CheckoutSession>): CheckoutSession {
  const pi = newId("pi");
  return CheckoutSession.parse(
    merge<CheckoutSession>(
      {
        id: newId("cs"),
        object: "checkout_session",
        created: unix(),
        livemode: false,
        status: "open",
        url: null,
        client_secret: null,
        expires_at: unix() + 3600,
        payment_intent: pi,
        amount: 200,
        currency: "usd",
        asset_id: null,
        settlement_destination: newId("sd"),
        ui_mode: "hosted",
        success_url: "https://merchant.example/thanks",
        cancel_url: null,
        description: "Test order",
        allowed_origins: [],
        late_payments: false,
        locale: null,
        completed_at: null,
        late: false,
        metadata: {},
      },
      over,
    ),
  );
}

export function execution(over?: DeepPartial<Execution>): Execution {
  return Execution.parse(
    merge<Execution>(
      {
        id: newId("ex"),
        version: 1,
        account_id: newId("acct"),
        livemode: false,
        kind: "payment",
        method: "route_quote",
        provider: "sandbox",
        state: "awaiting_deposit",
        provider_status: "PENDING_DEPOSIT",
        route_class: "stable_pair",
        applied_fee_bps: 50,
        origin: {
          asset_id: USDC_BASE,
          chain: "eip155:8453",
          refund_to: "0x52908400098527886e0f7030069857d2e4169ee7",
          refund_type: "origin_chain",
        },
        settlement: {
          asset_id: USDC_NEAR,
          amount_base: "2000000",
          tag: "17",
          expected: "2000017",
          recipient: "merchant.near",
          recipient_type: "intents",
          chain: "near:mainnet",
        },
        price_snapshot: { primary_usd: "1", secondary_usd: "1", fx: null, par: true, as_of: iso() },
        deposit: {
          address: "0x76b4c56085ed136a8744d52be956396624a730e8",
          memo: null,
          amount_in: "2010030",
          min_amount_in: "2000000",
          chain: "eip155:8453",
          deadline: iso(900_000),
        },
        intents_requirement: null,
        deposit_tx_hashes: [],
        settled_amount: null,
        refunded_amount: null,
        refund_reason: null,
        evidence: null,
        failure_code: null,
        held_reason: null,
        deadline: iso(900_000),
        terminal_at: null,
        created_at: iso(),
        updated_at: iso(),
      },
      over,
    ),
  );
}

export function agentPayment(over?: DeepPartial<AgentPayment>): AgentPayment {
  return AgentPayment.parse(
    merge<AgentPayment>(
      {
        id: newId("ap"),
        object: "agent_payment",
        created: unix(),
        livemode: false,
        kind: "x402",
        status: "settled",
        payer: "agent.near",
        pay_to: "merchant.near",
        asset_id: USDC_NEAR,
        amount: "10000",
        fee_amount: "30",
        binding: "np1:3yZe7d5Bcv1ZTkNe5U5w4mbR1XK8Wb1pXtZqYfVvR8c1",
        resource_url: "https://merchant.example/premium",
        checkout_session: null,
        tx_hash: "8Ld3Ap4zR2yK7uR3nVbXq1sH4cW9tE6mP2fJ5gD1aB7c",
        block_height: 160_000_000,
        error_reason: null,
        settled_at: unix(),
      },
      over,
    ),
  );
}

export function balanceTransaction(over?: DeepPartial<BalanceTransaction>): BalanceTransaction {
  return BalanceTransaction.parse(
    merge<BalanceTransaction>(
      {
        id: newId("txn"),
        object: "balance_transaction",
        created: unix(),
        livemode: false,
        type: "payment",
        payment_intent: newId("pi"),
        refund: null,
        gross: { amount: 200, currency: "usd" },
        settled: { amount: "2000000", asset_id: USDC_NEAR, decimals: 6, display: "2.00 USDC (NEAR)" },
        fee: { bps: 50, amount_estimated: "10000", asset_id: USDC_NEAR },
        evidence: {
          chain: "near:mainnet",
          tx_hash: "8Ld3Ap4zR2yK7uR3nVbXq1sH4cW9tE6mP2fJ5gD1aB7c",
          block_ref: "160000000",
          recipient: "merchant.near",
          asset_id: USDC_NEAR,
          amount: "2000000",
          finality: "final",
          tier: "A",
          source: "indexer",
          observed_at: iso(),
          explorer_url: null,
        },
      },
      over,
    ),
  );
}

/** A typed domain-event envelope for `subject` carrying `object`. */
export function domainEvent<S extends Subject>(
  subject: S,
  object: unknown,
  over: {
    accountUuid?: string | null;
    livemode?: boolean | null;
    version?: number;
    previous?: Record<string, unknown>;
  } = {},
) {
  const obj = object as { id?: string; object?: string; version?: number; sequence?: number };
  const env = {
    id: uuidv7(),
    subject,
    occurred_at: new Date().toISOString(),
    account_id: over.accountUuid === undefined ? uuidv7() : over.accountUuid,
    livemode: over.livemode === undefined ? false : over.livemode,
    aggregate: {
      type: subject.split(".")[2] as string,
      id: obj.id ?? newId("job"),
      version: over.version ?? obj.version ?? obj.sequence ?? 1,
    },
    data: { object, ...(over.previous ? { previous: over.previous } : {}) },
  };
  envelopeOf(subject).parse(env);
  return EventEnvelope.parse(env);
}
