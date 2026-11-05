import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { decodeSignedTransaction, encodeTransaction } from "@near-js/transactions";
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import { describe, expect, it, vi } from "vitest";
import {
  buildPayload,
  buildTransferIntents,
  classifyVerifierError,
  fromBase64,
  fromHex,
  intentsExecuted,
  intentsRpc,
  makeNonce,
  mtTransfers,
  nep413Hash,
  parseDip4Events,
  RpcError,
  signErc191,
  signNep413,
  signRawEd25519,
  VerifierError,
  verifySigned,
} from "../src/index.js";

const require = createRequire(import.meta.url);
const V = JSON.parse(readFileSync(require.resolve("@nearpay/spec/test-vectors/intents-payloads.json"), "utf8"));

describe("signers reproduce the spec vectors exactly", () => {
  it("NEP-413", () => {
    const mp = V.nep413.multipayload;
    const inner = JSON.parse(mp.payload.message);
    const msg = buildPayload({
      signerId: inner.signer_id,
      deadline: inner.deadline,
      nonce: mp.payload.nonce,
      intents: inner.intents,
    });
    expect(signNep413(msg, fromHex(V.nep413.seed_hex))).toEqual(mp);
    expect(
      Buffer.from(nep413Hash(mp.payload.message, fromBase64(mp.payload.nonce), "intents.near")).toString("hex"),
    ).toBe(V.nep413.hash_hex);
  });
  it("ERC-191", () => {
    const mp = V.erc191.multipayload;
    expect(signErc191(JSON.parse(mp.payload), fromHex(V.erc191.private_key_hex))).toEqual(mp);
  });
  it("raw ed25519", () => {
    const mp = V.raw_ed25519.multipayload;
    expect(signRawEd25519(JSON.parse(mp.payload), fromHex(V.raw_ed25519.seed_hex))).toEqual(mp);
  });
});

describe("verifySigned", () => {
  it("accepts every vector and reports the signer", () => {
    const n = verifySigned(V.nep413.multipayload);
    expect(n).toMatchObject({ ok: true, standard: "nep413", implicitMatch: true });
    if (n.ok) expect(n.message.nonce).toBe(V.nonce_base64);
    expect(verifySigned(V.erc191.multipayload)).toMatchObject({
      ok: true,
      signer: V.erc191.address,
      implicitMatch: true,
    });
    expect(verifySigned(V.raw_ed25519.multipayload)).toMatchObject({ ok: true, implicitMatch: true });
  });
  it("rejects tampered messages, signatures and keys", () => {
    const nep = structuredClone(V.nep413.multipayload);
    nep.payload.message = nep.payload.message.replace("2000000", "2000001");
    expect(verifySigned(nep)).toMatchObject({ ok: false, reason: "invalid_signature" });
    const erc = structuredClone(V.erc191.multipayload);
    erc.payload = erc.payload.replace("merchant.near", "attacker.near");
    const r = verifySigned(erc);
    expect(r.ok && r.signer !== V.erc191.address).toBe(true); // recovers a different address
    if (r.ok) expect(r.implicitMatch).toBe(false);
    const raw = structuredClone(V.raw_ed25519.multipayload);
    raw.public_key = V.nep413.multipayload.public_key;
    expect(verifySigned(raw)).toMatchObject({ ok: false, reason: "invalid_signature" });
  });
  it("rejects malformed inputs without throwing", () => {
    expect(verifySigned({})).toMatchObject({ ok: false, reason: "invalid_payload" });
    expect(verifySigned({ ...V.erc191.multipayload, payload: "not json" })).toMatchObject({
      ok: false,
      reason: "invalid_payload",
    });
    const badV = structuredClone(V.erc191.multipayload);
    const rsv = bs58.decode(badV.signature.slice(10));
    rsv[64] = 27;
    badV.signature = `secp256k1:${bs58.encode(rsv)}`;
    expect(verifySigned(badV)).toMatchObject({ ok: false, reason: "invalid_signature" });
    const wrongCurve = { ...V.raw_ed25519.multipayload, signature: V.erc191.multipayload.signature };
    expect(verifySigned(wrongCurve).ok).toBe(false);
    expect(
      verifySigned({
        ...V.nep413.multipayload,
        payload: { ...V.nep413.multipayload.payload, callbackUrl: "https://x" },
      }),
    ).toMatchObject({ ok: false });
  });
  it("rejects high-s ERC-191 signatures (malleability)", () => {
    const mp = structuredClone(V.erc191.multipayload);
    const rsv = bs58.decode(mp.signature.slice(10));
    const s = BigInt(`0x${Buffer.from(rsv.slice(32, 64)).toString("hex")}`);
    const highS = secp256k1.Point.CURVE().n - s;
    rsv.set(fromHex(highS.toString(16).padStart(64, "0")), 32);
    rsv[64] = (rsv[64] as number) ^ 1;
    mp.signature = `secp256k1:${bs58.encode(rsv)}`;
    expect(verifySigned(mp)).toMatchObject({ ok: false, reason: "invalid_signature" });
  });
});

describe("payload building", () => {
  it("makes salted nonces", () => {
    const n = makeNonce("252812b3", (k) => new Uint8Array(k).fill(7));
    const b = fromBase64(n);
    expect(b.length).toBe(32);
    expect(Buffer.from(b.slice(0, 4)).toString("hex")).toBe("252812b3");
    expect(b.slice(4).every((x) => x === 7)).toBe(true);
    expect(() => makeNonce("XYZ")).toThrow();
    expect(() => makeNonce("252812b3", () => new Uint8Array(3))).toThrow();
  });
  it("builds the two bound transfers in order", () => {
    const req = {
      pay_to: "merchant.near",
      token: "nep141:wrap.near",
      amount: "100",
      fee_to: "treasury.nearpay.near",
      fee_amount: "1",
      binding: V.binding,
      deadline: "2026-11-05T10:02:00.000Z",
    };
    expect(buildTransferIntents(req)).toEqual([
      { intent: "transfer", receiver_id: "merchant.near", tokens: { "nep141:wrap.near": "100" }, memo: V.binding },
      {
        intent: "transfer",
        receiver_id: "treasury.nearpay.near",
        tokens: { "nep141:wrap.near": "1" },
        memo: V.binding,
      },
    ]);
    expect(() => buildTransferIntents({ ...req, amount: "0" })).toThrow();
  });
});

// Logs recorded from mainnet simulate_intents on 2026-11-05 (DIP-4 0.4.3).
const MAINNET_LOGS = [
  'EVENT_JSON:{"standard":"dip4","version":"0.4.3","event":"public_key_added","data":{"intent_hash":"Fxcyx6R2Mmh2KLSw9B5wVSd5KFLnqYPDXZxBr57s8HTv","account_id":"f176820aed7018e88373e4ab56c7222aa189b722b9a3d4c4da3910e91a917e34","public_key":"ed25519:7QuEtLgNwRcdzV8yRCsSuvNuAwFYB7BWZAK9Y14wWHja"}}',
  'EVENT_JSON:{"standard":"dip4","version":"0.4.3","event":"intents_executed","data":[{"intent_hash":"Fxcyx6R2Mmh2KLSw9B5wVSd5KFLnqYPDXZxBr57s8HTv","account_id":"f176820aed7018e88373e4ab56c7222aa189b722b9a3d4c4da3910e91a917e34","nonce":"JSgSs4IC1nxUs9MuMp5TuDnyeaf/AF+TR6bG1IgfHeE="}]}',
];

describe("event parsing", () => {
  it("parses recorded mainnet DIP-4 logs without pinning the version", () => {
    expect(parseDip4Events(MAINNET_LOGS).map((e) => e.event)).toEqual(["public_key_added", "intents_executed"]);
    expect(intentsExecuted(MAINNET_LOGS)).toEqual([
      {
        intent_hash: "Fxcyx6R2Mmh2KLSw9B5wVSd5KFLnqYPDXZxBr57s8HTv",
        account_id: "f176820aed7018e88373e4ab56c7222aa189b722b9a3d4c4da3910e91a917e34",
        nonce: "JSgSs4IC1nxUs9MuMp5TuDnyeaf/AF+TR6bG1IgfHeE=",
      },
    ]);
  });
  it("parses NEP-245 mt_transfer and skips junk", () => {
    const logs = [
      "not an event",
      "EVENT_JSON:{broken",
      'EVENT_JSON:{"standard":"nep245","version":"1.0.0","event":"mt_transfer","data":[{"old_owner_id":"payer.near","new_owner_id":"merchant.near","token_ids":["nep141:wrap.near"],"amounts":["100"],"memo":"np1:x"},{"old_owner_id":"a","new_owner_id":"b","token_ids":["x"],"amounts":[]}]}',
    ];
    expect(mtTransfers(logs)).toEqual([
      {
        old_owner_id: "payer.near",
        new_owner_id: "merchant.near",
        token_ids: ["nep141:wrap.near"],
        amounts: ["100"],
        memo: "np1:x",
      },
    ]);
  });
});

describe("Verifier error classification (mainnet messages)", () => {
  it.each([
    ["insufficient balance or overflow", "insufficient_funds"],
    ["invalid signature", "invalid_signature"],
    [
      "public key 'ed25519:CkHm2xdgtLttps67wRKhWSuqNN5995aAXXknP6QuYX2t' doesn't exist for account 'merchant.near'",
      "invalid_signature",
    ],
    ["nonce was already used", "nonce_used"],
    ["deadline has expired", "deadline_invalid"],
    ["something new", "invalid_payload"],
  ])("%s → %s", (msg, reason) => expect(classifyVerifierError(msg)).toBe(reason));
});

function rpcMock(handlers: Record<string, (params: unknown) => unknown>, failFirst = false) {
  return vi.fn(async (url: string, init: RequestInit) => {
    if (failFirst && url.includes("bad")) return new Response("down", { status: 503 });
    const { method, params } = JSON.parse(String(init.body));
    const h = handlers[method];
    if (!h) return Response.json({ jsonrpc: "2.0", id: 1, error: { message: `no ${method}` } });
    return Response.json({ jsonrpc: "2.0", id: 1, result: h(params) });
  }) as unknown as typeof fetch & { mock: unknown };
}

const viewResult = (v: unknown) => ({ result: [...new TextEncoder().encode(JSON.stringify(v))] });

describe("intentsRpc", () => {
  it("fails over to the next provider and decodes views", async () => {
    const f = rpcMock({ query: () => viewResult("252812b3") }, true);
    const rpc = intentsRpc({ rpcUrls: ["https://bad.example", "https://good.example"], fetch: f });
    expect(await rpc.currentSalt()).toBe("252812b3");
  });
  it("turns contract panics into VerifierError and outages into RpcError", async () => {
    const panic = rpcMock({
      query: () => ({
        error:
          'wasm execution failed with error: HostError(GuestPanic { panic_msg: "insufficient balance or overflow" })',
      }),
    });
    await expect(
      intentsRpc({ rpcUrls: ["https://a.example"], fetch: panic }).simulateIntents([]),
    ).rejects.toMatchObject({ name: "VerifierError", reason: "insufficient_funds" });
    const down = vi.fn(async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    const err = await intentsRpc({ rpcUrls: ["https://a.example", "https://b.example"], fetch: down })
      .currentSalt()
      .catch((e) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect(err.causes).toHaveLength(2);
    expect(err).not.toBeInstanceOf(VerifierError);
  });
  it("builds a correctly signed execute_intents transaction with a function-call key", async () => {
    const seed = sha256(new TextEncoder().encode("relayer test key"));
    const blockHash = bs58.encode(sha256(new TextEncoder().encode("block")));
    const f = rpcMock({
      query: () => ({
        nonce: 41,
        block_hash: blockHash,
        permission: { FunctionCall: { receiver_id: "intents.near", method_names: ["execute_intents"] } },
      }),
    });
    const rpc = intentsRpc({ rpcUrls: ["https://a.example"], fetch: f });
    const { bytes, txHash, nonce } = await rpc.buildExecuteTx(
      [V.nep413.multipayload],
      { accountId: "relayer.nearpay.near", secretKey: seed },
      30_000_000_000_000n,
    );
    expect(nonce).toBe(42n);
    const stx = decodeSignedTransaction(bytes);
    expect(stx.transaction.receiverId).toBe("intents.near");
    expect(stx.transaction.signerId).toBe("relayer.nearpay.near");
    const fc = stx.transaction.actions[0]?.functionCall;
    expect(fc?.methodName).toBe("execute_intents");
    expect(fc?.deposit).toBe(0n);
    expect(fc?.gas).toBe(30_000_000_000_000n);
    expect(JSON.parse(new TextDecoder().decode(Uint8Array.from(fc?.args ?? [])))).toEqual({
      signed: [V.nep413.multipayload],
    });
    const hash = sha256(encodeTransaction(stx.transaction));
    expect(bs58.encode(hash)).toBe(txHash);
    const sig = (stx.signature as unknown as { ed25519Signature: { data: number[] } }).ed25519Signature.data;
    expect(ed25519.verify(Uint8Array.from(sig), hash, ed25519.getPublicKey(seed))).toBe(true);
  });
  it("refuses full-access relayer keys (INV-1)", async () => {
    const f = rpcMock({
      query: () => ({ nonce: 1, block_hash: bs58.encode(new Uint8Array(32)), permission: "FullAccess" }),
    });
    await expect(
      intentsRpc({ rpcUrls: ["https://a.example"], fetch: f }).buildExecuteTx(
        [],
        { accountId: "r.near", secretKey: new Uint8Array(32).fill(1) },
        1n,
      ),
    ).rejects.toThrow(/function-call keys/);
  });
  it("summarises execution outcomes and failures", async () => {
    const outcome = (failure?: unknown) => ({
      status: failure ? { Failure: failure } : { SuccessValue: "" },
      transaction_outcome: { outcome: { gas_burnt: 100, logs: [] } },
      receipts_outcome: [
        { outcome: { gas_burnt: 200, logs: MAINNET_LOGS, status: failure ? { Failure: failure } : {} } },
      ],
    });
    const f = rpcMock({ EXPERIMENTAL_tx_status: () => outcome() });
    const ok = await intentsRpc({ rpcUrls: ["https://a.example"], fetch: f }).txStatus("tx", "relayer.near");
    expect(ok).toMatchObject({ status: "success", failure: null, gasBurnt: 300n });
    expect(ok.intentsExecuted).toHaveLength(1);
    const g = rpcMock({ EXPERIMENTAL_tx_status: () => outcome({ ActionError: { kind: "x" } }) });
    expect(await intentsRpc({ rpcUrls: ["https://a.example"], fetch: g }).txStatus("tx", "r.near")).toMatchObject({
      status: "failure",
    });
  });
});
