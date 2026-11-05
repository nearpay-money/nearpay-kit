/**
 * Signing helpers for the three standards (tests, sandbox and tooling; NearPay services never
 * hold payer keys — INV-1).
 */
import type { IntentMessage, MultiPayload } from "@nearpay/spec";
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import bs58 from "bs58";
import { erc191Hash, fromBase64, hex, nep413Hash, utf8 } from "./encoding.js";
import { nep413Message } from "./payload.js";

const INTENTS = "intents.near";

/** Implicit NEAR account of an ed25519 public key (hex of the key). */
export function implicitAccountId(publicKey: Uint8Array): string {
  return hex(publicKey);
}

/** `ed25519:<base58>` form of a public key. */
export function nearPublicKey(publicKey: Uint8Array): string {
  return `ed25519:${bs58.encode(publicKey)}`;
}

export function signNep413(m: IntentMessage, secretKey: Uint8Array): MultiPayload {
  const message = nep413Message(m);
  const nonce = fromBase64(m.nonce);
  const pk = ed25519.getPublicKey(secretKey);
  const sig = ed25519.sign(nep413Hash(message, nonce, INTENTS), secretKey);
  return {
    standard: "nep413",
    payload: { recipient: INTENTS, nonce: m.nonce, message },
    public_key: nearPublicKey(pk),
    signature: `ed25519:${bs58.encode(sig)}`,
  };
}

/** ERC-191 `personal_sign`; signature r ‖ s ‖ v with v ∈ {0, 1}. */
export function signErc191(m: IntentMessage, privateKey: Uint8Array): MultiPayload {
  const payload = JSON.stringify(m);
  const rec = secp256k1.sign(erc191Hash(payload), privateKey, { prehash: false, format: "recovered" });
  const rsv = new Uint8Array([...rec.slice(1), rec[0] as number]);
  return { standard: "erc191", payload, signature: `secp256k1:${bs58.encode(rsv)}` };
}

export function signRawEd25519(m: IntentMessage, secretKey: Uint8Array): MultiPayload {
  const payload = JSON.stringify(m);
  return {
    standard: "raw_ed25519",
    payload,
    public_key: nearPublicKey(ed25519.getPublicKey(secretKey)),
    signature: `ed25519:${bs58.encode(ed25519.sign(utf8(payload), secretKey))}`,
  };
}

/** Lower-case 0x address (eth-implicit Intents account) of a secp256k1 public key. */
export function evmAddress(publicKey: Uint8Array): string {
  const uncompressed = secp256k1.Point.fromBytes(publicKey).toBytes(false);
  return `0x${hex(keccak_256(uncompressed.slice(1)).slice(-20))}`;
}
