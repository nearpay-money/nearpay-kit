/**
 * NEP-297 event logs (`EVENT_JSON:` lines) emitted by intents.near: DIP-4 (`intents_executed`,
 * `transfer`, `token_diff`, …) and NEP-245 (`mt_transfer`, `mt_mint`, `mt_burn`).
 * Versions are not pinned: mainnet emits DIP-4 0.4.3 as of 2026-11-05 (the brain lists 0.3.0).
 */
export interface Nep297Event {
  readonly standard: string;
  readonly version: string;
  readonly event: string;
  readonly data: unknown;
}

export interface IntentExecuted {
  readonly intent_hash: string;
  readonly account_id: string;
  readonly nonce: string;
}

export interface MtTransfer {
  readonly old_owner_id: string;
  readonly new_owner_id: string;
  readonly token_ids: readonly string[];
  readonly amounts: readonly string[];
  readonly memo?: string;
  readonly authorized_id?: string;
}

const PREFIX = "EVENT_JSON:";

/** Parses every well-formed `EVENT_JSON:` line; malformed or non-event lines are skipped. */
export function parseEventLogs(logs: readonly string[]): Nep297Event[] {
  const out: Nep297Event[] = [];
  for (const line of logs) {
    if (!line.startsWith(PREFIX)) continue;
    try {
      const e = JSON.parse(line.slice(PREFIX.length)) as Record<string, unknown>;
      if (typeof e.standard === "string" && typeof e.version === "string" && typeof e.event === "string") {
        out.push({ standard: e.standard, version: e.version, event: e.event, data: e.data });
      }
    } catch {
      /* not JSON: skip */
    }
  }
  return out;
}

/** DIP-4 events only. */
export function parseDip4Events(logs: readonly string[]): Nep297Event[] {
  return parseEventLogs(logs).filter((e) => e.standard === "dip4");
}

/** `intents_executed` entries (agentpay matches them by (account_id, nonce)). */
export function intentsExecuted(logs: readonly string[]): IntentExecuted[] {
  return parseDip4Events(logs)
    .filter((e) => e.event === "intents_executed" && Array.isArray(e.data))
    .flatMap((e) => (e.data as unknown[]).filter(isIntentExecuted));
}

/** NEP-245 `mt_transfer` entries (indexer attribution by memo/binding, SP-14). */
export function mtTransfers(logs: readonly string[]): MtTransfer[] {
  return parseEventLogs(logs)
    .filter((e) => e.standard === "nep245" && e.event === "mt_transfer" && Array.isArray(e.data))
    .flatMap((e) => (e.data as unknown[]).filter(isMtTransfer));
}

function isIntentExecuted(x: unknown): x is IntentExecuted {
  const o = x as Record<string, unknown>;
  return typeof o?.intent_hash === "string" && typeof o.account_id === "string" && typeof o.nonce === "string";
}

function isMtTransfer(x: unknown): x is MtTransfer {
  const o = x as Record<string, unknown>;
  return (
    typeof o?.old_owner_id === "string" &&
    typeof o.new_owner_id === "string" &&
    Array.isArray(o.token_ids) &&
    Array.isArray(o.amounts) &&
    o.token_ids.length === o.amounts.length &&
    (o.memo === undefined || typeof o.memo === "string")
  );
}
