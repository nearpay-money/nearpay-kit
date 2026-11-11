/**
 * NEAR JSON-RPC client for the Verifier (foundations §14, agentpay §7, rails §8.6).
 * Reads fail over across `rpcUrls` (≥ 3 providers in production); `execute_intents` is sent as a
 * function call signed by a relayer function-call key (INV-1: zero deposit, payload executed as
 * signed). Resending the same signed transaction to another provider is safe (same hash).
 */

import { PublicKey } from "@near-js/crypto";
import { actionCreators, createTransaction, Signature, SignedTransaction } from "@near-js/transactions";
import type { MultiPayload } from "@nearpay-money/spec";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import { toBase64 } from "./encoding.js";
import { type IntentExecuted, intentsExecuted } from "./events.js";
import { nearPublicKey } from "./sign.js";

export type VerifierFailure =
  | "insufficient_funds"
  | "invalid_signature"
  | "nonce_used"
  | "deadline_invalid"
  | "invalid_payload";

/** The Verifier rejected a payload (contract panic). Not retryable with the same payload. */
export class VerifierError extends Error {
  constructor(
    readonly reason: VerifierFailure,
    message: string,
  ) {
    super(message);
    this.name = "VerifierError";
  }
}

/** Transport or provider failure (timeouts, 5xx, JSON-RPC errors). Retryable. */
export class RpcError extends Error {
  constructor(
    message: string,
    readonly causes: readonly string[] = [],
  ) {
    super(message);
    this.name = "RpcError";
  }
}

/** Maps Verifier panic messages (observed on mainnet 2026-11-05) to failure reasons. */
export function classifyVerifierError(message: string): VerifierFailure {
  const m = message.toLowerCase();
  if (m.includes("insufficient balance")) return "insufficient_funds";
  if (m.includes("invalid signature") || (m.includes("public key") && m.includes("doesn't exist")))
    return "invalid_signature";
  if (m.includes("nonce was already used") || m.includes("nonce")) return "nonce_used";
  if (m.includes("deadline")) return "deadline_invalid";
  return "invalid_payload";
}

export interface SimulateIntentsOutput {
  intents_executed: IntentExecuted[];
  logs: string[];
  min_deadline: string;
  state: { fee: number; current_salt: string };
}

export interface ExecuteResult {
  txHash: string;
  status: "success" | "failure";
  failure: string | null;
  logs: string[];
  intentsExecuted: IntentExecuted[];
  gasBurnt: bigint;
  /** Hash of the block that included the transaction (`transaction_outcome.block_hash`), when the RPC returns it. */
  blockHash?: string;
}

/** `send_tx` / `tx_status` wait levels (NEAR JSON-RPC `wait_until`). */
export type TxWaitUntil = "INCLUDED" | "INCLUDED_FINAL" | "EXECUTED_OPTIMISTIC" | "EXECUTED" | "FINAL";

export interface RelayerSigner {
  accountId: string;
  /** 32-byte ed25519 seed, or a NEAR secret key string `ed25519:<base58 64 bytes>`. */
  secretKey: Uint8Array | string;
}

export interface IntentsRpcOptions {
  rpcUrls: readonly string[];
  contract?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

function seedOf(k: Uint8Array | string): Uint8Array {
  if (typeof k !== "string") {
    if (k.length !== 32) throw new RangeError("ed25519 seed must be 32 bytes");
    return k;
  }
  if (!k.startsWith("ed25519:")) throw new RangeError("secret key must be ed25519:<base58>");
  const raw = bs58.decode(k.slice(8));
  if (raw.length !== 64 && raw.length !== 32) throw new RangeError("secret key must be 32 or 64 bytes");
  return raw.slice(0, 32);
}

const PANIC_RE = /panic_msg: "((?:[^"\\]|\\.)*)"/;

export function intentsRpc(opts: IntentsRpcOptions) {
  if (opts.rpcUrls.length === 0) throw new RangeError("at least one RPC URL is required");
  const contract = opts.contract ?? "intents.near";
  const timeoutMs = opts.timeoutMs ?? 3_000;
  const f = opts.fetch ?? fetch;
  let id = 0;

  async function call(method: string, params: unknown, timeout = timeoutMs): Promise<unknown> {
    const errors: string[] = [];
    for (const url of opts.rpcUrls) {
      try {
        const res = await f(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
          signal: AbortSignal.timeout(timeout),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          result?: unknown;
          error?: { name?: string; cause?: { name?: string; info?: unknown }; data?: unknown; message?: string };
        };
        if (json.error) {
          const text = JSON.stringify(json.error);
          const panic = PANIC_RE.exec(text);
          if (panic) throw new VerifierError(classifyVerifierError(panic[1] as string), panic[1] as string);
          throw new Error(`JSON-RPC error: ${text.slice(0, 300)}`);
        }
        return json.result;
      } catch (e) {
        if (e instanceof VerifierError) throw e;
        errors.push(`${new URL(url).host}: ${(e as Error).message}`);
      }
    }
    throw new RpcError(`all RPC providers failed for ${method}`, errors);
  }

  async function view<T>(method: string, args: unknown): Promise<T> {
    const result = (await call("query", {
      request_type: "call_function",
      finality: "final",
      account_id: contract,
      method_name: method,
      args_base64: toBase64(new TextEncoder().encode(JSON.stringify(args))),
    })) as { result?: number[]; error?: string };
    if (typeof result?.error === "string") {
      const panic = PANIC_RE.exec(result.error);
      throw new VerifierError(
        classifyVerifierError(panic ? (panic[1] as string) : result.error),
        panic ? (panic[1] as string) : result.error,
      );
    }
    if (!Array.isArray(result?.result)) throw new RpcError(`unexpected view result for ${method}`);
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result))) as T;
  }

  return {
    /** Current 4-byte nonce salt (hex). */
    currentSalt(): Promise<string> {
      return view<string>("current_salt", {});
    },

    /** Dry-runs payloads; throws VerifierError when the Verifier would reject them. */
    simulateIntents(signed: readonly MultiPayload[]): Promise<SimulateIntentsOutput> {
      return view<SimulateIntentsOutput>("simulate_intents", { signed });
    },

    /** Intents balances of an account (base units). */
    async mtBatchBalanceOf(accountId: string, tokenIds: readonly string[]): Promise<bigint[]> {
      const r = await view<string[]>("mt_batch_balance_of", { account_id: accountId, token_ids: tokenIds });
      return r.map((x) => BigInt(x));
    },

    /** Builds and signs the relayer transaction (exported for tests and dry runs). */
    async buildExecuteTx(signed: readonly MultiPayload[], signer: RelayerSigner, gas: bigint, nonceOverride?: bigint) {
      const seed = seedOf(signer.secretKey);
      const pub = nearPublicKey(ed25519.getPublicKey(seed));
      const ak = (await call("query", {
        request_type: "view_access_key",
        finality: "final",
        account_id: signer.accountId,
        public_key: pub,
      })) as { nonce: number | string; block_hash: string; permission?: unknown };
      if (ak.permission === "FullAccess") throw new RangeError("relayer keys must be function-call keys (INV-1)");
      const nonce = nonceOverride ?? BigInt(ak.nonce) + 1n;
      const tx = createTransaction(
        signer.accountId,
        PublicKey.fromString(pub),
        contract,
        nonce,
        [actionCreators.functionCall("execute_intents", { signed }, gas, 0n)],
        bs58.decode(ak.block_hash),
      );
      const hash = sha256(tx.encode());
      const signedTx = new SignedTransaction({
        transaction: tx,
        signature: new Signature({ keyType: 0, data: ed25519.sign(hash, seed) }),
      });
      return { txHash: bs58.encode(hash), bytes: signedTx.encode(), nonce };
    },

    /**
     * Sends an already-signed transaction (from `buildExecuteTx`) and waits (default `FINAL`, 10 s).
     * The caller stores `txHash` before sending, so a timeout (RpcError) never loses the hash: poll
     * `txStatus(txHash, sender)` afterwards (agentpay §7; CR-15-16). Resending the same bytes is safe
     * (same hash). The outcome carries `blockHash` of the including block.
     */
    async sendSignedTx(p: {
      bytes: Uint8Array;
      txHash: string;
      waitUntil?: TxWaitUntil;
      timeoutMs?: number;
    }): Promise<ExecuteResult> {
      const outcome = (await call(
        "send_tx",
        { signed_tx_base64: toBase64(p.bytes), wait_until: p.waitUntil ?? "FINAL" },
        p.timeoutMs ?? 10_000,
      )) as FinalOutcome;
      const id = outcome?.transaction_outcome?.id;
      if (id !== undefined && id !== p.txHash)
        throw new RpcError(`send_tx returned outcome of ${id}, expected ${p.txHash}`);
      return summarize(p.txHash, outcome);
    },

    /** Submits `execute_intents` and waits for finality (default 10 s). Loses nothing only if the caller does not need the hash on timeout; prefer `buildExecuteTx` + `sendSignedTx`. */
    async executeIntents(p: {
      signed: readonly MultiPayload[];
      signer: RelayerSigner;
      gas: bigint;
      timeoutMs?: number;
    }): Promise<ExecuteResult> {
      const { txHash, bytes } = await this.buildExecuteTx(p.signed, p.signer, p.gas);
      return this.sendSignedTx({ bytes, txHash, timeoutMs: p.timeoutMs });
    },

    /** Final status of a submitted transaction. */
    async txStatus(txHash: string, senderId: string): Promise<ExecuteResult> {
      const outcome = (await call("EXPERIMENTAL_tx_status", {
        tx_hash: txHash,
        sender_account_id: senderId,
        wait_until: "FINAL",
      })) as FinalOutcome;
      return summarize(txHash, outcome);
    },
  };
}

interface FinalOutcome {
  status: { SuccessValue?: string; Failure?: unknown };
  transaction_outcome: { id?: string; block_hash?: string; outcome: { gas_burnt: number | string; logs: string[] } };
  receipts_outcome: { outcome: { gas_burnt: number | string; logs: string[]; status: { Failure?: unknown } } }[];
}

function summarize(txHash: string, o: FinalOutcome): ExecuteResult {
  const logs = [...o.transaction_outcome.outcome.logs, ...o.receipts_outcome.flatMap((r) => r.outcome.logs)];
  const failed =
    o.status.Failure !== undefined || o.receipts_outcome.some((r) => r.outcome.status.Failure !== undefined);
  const failure =
    o.status.Failure ?? o.receipts_outcome.find((r) => r.outcome.status.Failure !== undefined)?.outcome.status.Failure;
  const gasBurnt = [o.transaction_outcome, ...o.receipts_outcome].reduce((g, r) => g + BigInt(r.outcome.gas_burnt), 0n);
  return {
    txHash,
    status: failed ? "failure" : "success",
    failure: failed ? JSON.stringify(failure) : null,
    logs,
    intentsExecuted: intentsExecuted(logs),
    gasBurnt,
    ...(o.transaction_outcome.block_hash ? { blockHash: o.transaction_outcome.block_hash } : {}),
  };
}

export type IntentsRpc = ReturnType<typeof intentsRpc>;
