/** Building Verifier messages (lld/00-foundations.md §14). */
import { INTENTS_CONTRACT, type IntentMessage, type IntentsRequirement, type TransferIntent } from "@nearpay/spec";
import { fromHex, toBase64 } from "./encoding.js";

export type TransferIntents = [TransferIntent, TransferIntent];

/** 32-byte nonce: 4-byte current salt (hex, from `current_salt`) ‖ 28 random bytes; base64. */
export function makeNonce(
  saltHex: string,
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  if (!/^[0-9a-f]{8}$/.test(saltHex)) throw new RangeError(`salt must be 4 bytes of lower-case hex, got ${saltHex}`);
  const nonce = new Uint8Array(32);
  nonce.set(fromHex(saltHex), 0);
  const r = random(28);
  if (r.length !== 28) throw new RangeError("random source must return 28 bytes");
  nonce.set(r, 4);
  return toBase64(nonce);
}

/** The two transfers a requirement asks for, in order: merchant, then NearPay fee; both memo = binding. */
export function buildTransferIntents(req: IntentsRequirement): TransferIntents {
  if (BigInt(req.amount) <= 0n) throw new RangeError("amount must be positive");
  return [
    { intent: "transfer", receiver_id: req.pay_to, tokens: { [req.token]: req.amount }, memo: req.binding },
    { intent: "transfer", receiver_id: req.fee_to, tokens: { [req.token]: req.fee_amount }, memo: req.binding },
  ];
}

/** Full message (ERC-191 / raw_ed25519 carry it as one JSON string). */
export function buildPayload(p: {
  signerId: string;
  deadline: string;
  nonce: string;
  intents: IntentMessage["intents"];
}): IntentMessage {
  return {
    signer_id: p.signerId,
    verifying_contract: INTENTS_CONTRACT,
    deadline: p.deadline,
    nonce: p.nonce,
    intents: p.intents,
  };
}

/** NEP-413 `message` field: the message without nonce and verifying_contract (they live in the NEP-413 payload). */
export function nep413Message(m: IntentMessage): string {
  return JSON.stringify({ signer_id: m.signer_id, deadline: m.deadline, intents: m.intents });
}
