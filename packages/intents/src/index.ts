/** @nearpay-internal/intents — NEAR Intents payloads (lld/00-foundations.md §4, §14). */
export { erc191Hash, fromBase64, fromHex, hex, NEP413_TAG, nep413Hash, toBase64 } from "./encoding.js";
export {
  type IntentExecuted,
  intentsExecuted,
  type MtTransfer,
  mtTransfers,
  type Nep297Event,
  parseDip4Events,
  parseEventLogs,
} from "./events.js";
export { buildPayload, buildTransferIntents, makeNonce, nep413Message, type TransferIntents } from "./payload.js";
export {
  classifyVerifierError,
  type ExecuteResult,
  type IntentsRpc,
  type IntentsRpcOptions,
  intentsRpc,
  type RelayerSigner,
  RpcError,
  type SimulateIntentsOutput,
  VerifierError,
  type VerifierFailure,
} from "./rpc.js";
export { evmAddress, implicitAccountId, nearPublicKey, signErc191, signNep413, signRawEd25519 } from "./sign.js";
export { type VerifyFailure, type VerifyResult, verifySigned } from "./verify.js";
