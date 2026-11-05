/**
 * Live checks against NEAR mainnet (read-only view calls; no transactions, no funds).
 * Opt-in: NP_LIVE_NEAR=1 [NP_NEAR_RPC_URLS=url1,url2].
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import {
  buildPayload,
  buildTransferIntents,
  evmAddress,
  implicitAccountId,
  intentsRpc,
  makeNonce,
  signErc191,
  signNep413,
  signRawEd25519,
  VerifierError,
} from "../src/index.js";

const live = process.env.NP_LIVE_NEAR === "1";
const rpc = intentsRpc({
  rpcUrls: (process.env.NP_NEAR_RPC_URLS ?? "https://rpc.mainnet.near.org,https://free.rpc.fastnear.com").split(","),
  timeoutMs: 8_000,
});

describe.skipIf(!live)("intents.near on mainnet (read-only)", () => {
  const req = {
    pay_to: "merchant.near",
    token: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    amount: "1000",
    fee_to: "treasury.nearpay.near",
    fee_amount: "3",
    binding: `np1:${bs58.encode(crypto.getRandomValues(new Uint8Array(32)))}`,
    deadline: new Date(Date.now() + 300_000).toISOString(),
  };

  async function freshMessage(signerId: string) {
    const salt = await rpc.currentSalt();
    return buildPayload({
      signerId,
      deadline: req.deadline,
      nonce: makeNonce(salt),
      intents: buildTransferIntents(req),
    });
  }

  it("reads the current salt", async () => {
    expect(await rpc.currentSalt()).toMatch(/^[0-9a-f]{8}$/);
  });

  it.each([
    ["nep413", (sk: Uint8Array) => ({ id: implicitAccountId(ed25519.getPublicKey(sk)), sign: signNep413 })],
    ["raw_ed25519", (sk: Uint8Array) => ({ id: implicitAccountId(ed25519.getPublicKey(sk)), sign: signRawEd25519 })],
    ["erc191", (sk: Uint8Array) => ({ id: evmAddress(secp256k1.getPublicKey(sk)), sign: signErc191 })],
  ] as const)("%s signatures pass the Verifier (fails only on balance)", async (_name, make) => {
    const sk = _name === "erc191" ? secp256k1.utils.randomSecretKey() : crypto.getRandomValues(new Uint8Array(32));
    const { id, sign } = make(sk);
    const signed = sign(await freshMessage(id), sk);
    const err = await rpc.simulateIntents([signed]).catch((e) => e);
    expect(err).toBeInstanceOf(VerifierError);
    expect(err.reason).toBe("insufficient_funds");
  });

  it("classifies a corrupted signature and a reused nonce", async () => {
    const sk = crypto.getRandomValues(new Uint8Array(32));
    const signed = signNep413(await freshMessage(implicitAccountId(ed25519.getPublicKey(sk))), sk);
    const bad = structuredClone(signed);
    if (bad.standard !== "nep413") throw new Error("standard");
    const sig = bs58.decode(bad.signature.slice(8));
    sig[3] = (sig[3] as number) ^ 1;
    bad.signature = `ed25519:${bs58.encode(sig)}`;
    await expect(rpc.simulateIntents([bad])).rejects.toMatchObject({ reason: "invalid_signature" });
    const empty = signNep413(
      buildPayload({
        signerId: implicitAccountId(ed25519.getPublicKey(sk)),
        deadline: req.deadline,
        nonce: makeNonce(await rpc.currentSalt()),
        intents: [] as never,
      }),
      sk,
    );
    await expect(rpc.simulateIntents([empty, empty])).rejects.toMatchObject({ reason: "nonce_used" });
  });

  it("simulates a no-op payload and returns the documented shape", async () => {
    const sk = crypto.getRandomValues(new Uint8Array(32));
    const id = implicitAccountId(ed25519.getPublicKey(sk));
    const out = await rpc.simulateIntents([
      signNep413(
        buildPayload({
          signerId: id,
          deadline: req.deadline,
          nonce: makeNonce(await rpc.currentSalt()),
          intents: [] as never,
        }),
        sk,
      ),
    ]);
    expect(out.intents_executed[0]?.account_id).toBe(id);
    expect(out.state.current_salt).toMatch(/^[0-9a-f]{8}$/);
    expect(out.logs.some((l) => l.includes('"intents_executed"'))).toBe(true);
  });

  it("reads Intents balances", async () => {
    expect(await rpc.mtBatchBalanceOf(implicitAccountId(new Uint8Array(32).fill(9)), ["nep141:wrap.near"])).toEqual([
      0n,
    ]);
  });
});
