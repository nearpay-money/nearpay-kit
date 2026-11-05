/**
 * Local verification of a MultiPayload (agentpay §6 step 3, sandbox Verifier). Checks the
 * signature and parses the message; whether a named account has registered the key is only
 * known to the Verifier (simulate_intents covers it).
 */
import {
  type IntentMessage,
  IntentMessage as IntentMessageSchema,
  type MultiPayload,
  MultiPayload as MultiPayloadSchema,
  Nep413IntentMessage,
} from "@nearpay/spec";
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import bs58 from "bs58";
import { erc191Hash, fromBase64, hex, nep413Hash, utf8 } from "./encoding.js";
import { evmAddress, nearPublicKey } from "./sign.js";

export type VerifyFailure = "invalid_payload" | "invalid_signature";

export type VerifyResult =
  | {
      ok: true;
      standard: MultiPayload["standard"];
      /** Full message (for NEP-413, rebuilt with nonce and verifying_contract). */
      message: IntentMessage;
      /** Key that signed: `ed25519:…` or the recovered secp256k1 address `0x…`. */
      signer: string;
      /** True when signer_id is the implicit account of the signing key (no registration needed). */
      implicitMatch: boolean;
    }
  | { ok: false; reason: VerifyFailure; detail: string };

const fail = (reason: VerifyFailure, detail: string): VerifyResult => ({ ok: false, reason, detail });

function curve(s: string, expected: "ed25519" | "secp256k1"): Uint8Array {
  const i = s.indexOf(":");
  if (s.slice(0, i) !== expected) throw new Error(`expected ${expected} key/signature`);
  return bs58.decode(s.slice(i + 1));
}

function parseJson(s: string): unknown {
  return JSON.parse(s);
}

/** Verifies the signature of a MultiPayload and returns the parsed message. Never throws. */
export function verifySigned(input: unknown): VerifyResult {
  const parsed = MultiPayloadSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_payload", parsed.error.issues[0]?.message ?? "not a MultiPayload");
  const mp = parsed.data;
  try {
    if (mp.standard === "nep413") {
      const inner = Nep413IntentMessage.safeParse(parseJson(mp.payload.message));
      if (!inner.success) return fail("invalid_payload", "message is not a Verifier message");
      if (mp.payload.callbackUrl) return fail("invalid_payload", "callbackUrl is not supported");
      const nonce = fromBase64(mp.payload.nonce);
      const pk = curve(mp.public_key, "ed25519");
      const sig = curve(mp.signature, "ed25519");
      if (pk.length !== 32 || sig.length !== 64) return fail("invalid_signature", "bad key or signature length");
      if (!ed25519.verify(sig, nep413Hash(mp.payload.message, nonce, mp.payload.recipient), pk)) {
        return fail("invalid_signature", "ed25519 signature does not verify");
      }
      const message: IntentMessage = {
        signer_id: inner.data.signer_id,
        verifying_contract: "intents.near",
        deadline: inner.data.deadline,
        nonce: mp.payload.nonce,
        intents: inner.data.intents,
      };
      return {
        ok: true,
        standard: "nep413",
        message,
        signer: nearPublicKey(pk),
        implicitMatch: hex(pk) === message.signer_id,
      };
    }
    const msg = IntentMessageSchema.safeParse(parseJson(mp.payload));
    if (!msg.success) return fail("invalid_payload", "payload is not a Verifier message");
    if (mp.standard === "erc191") {
      const rsv = curve(mp.signature, "secp256k1");
      if (rsv.length !== 65) return fail("invalid_signature", "signature must be 65 bytes r‖s‖v");
      const v = rsv[64] as number;
      if (v !== 0 && v !== 1) return fail("invalid_signature", "v must be 0 or 1");
      const sigObj = secp256k1.Signature.fromBytes(rsv.slice(0, 64), "compact");
      if (sigObj.hasHighS()) return fail("invalid_signature", "high-s signature");
      const pub = secp256k1.recoverPublicKey(new Uint8Array([v, ...rsv.slice(0, 64)]), erc191Hash(mp.payload), {
        prehash: false,
      });
      const address = evmAddress(pub);
      return {
        ok: true,
        standard: "erc191",
        message: msg.data,
        signer: address,
        implicitMatch: address === msg.data.signer_id,
      };
    }
    const pk = curve(mp.public_key, "ed25519");
    const sig = curve(mp.signature, "ed25519");
    if (pk.length !== 32 || sig.length !== 64) return fail("invalid_signature", "bad key or signature length");
    if (!ed25519.verify(sig, utf8(mp.payload), pk))
      return fail("invalid_signature", "ed25519 signature does not verify");
    return {
      ok: true,
      standard: "raw_ed25519",
      message: msg.data,
      signer: nearPublicKey(pk),
      implicitMatch: hex(pk) === msg.data.signer_id,
    };
  } catch (e) {
    return fail("invalid_payload", (e as Error).message);
  }
}
