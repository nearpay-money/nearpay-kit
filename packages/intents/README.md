# @nearpay-internal/intents

NEAR Intents payloads: build, sign (NEP-413, ERC-191, raw Ed25519), verify, parse DIP-4/NEP-245 events, and call the Verifier contract over RPC. Signing formats are checked against the live `intents.near` contract (read-only simulation).

- `makeNonce`, `buildTransferIntents`, `buildPayload`, `nep413Message`
- `signNep413`, `signErc191`, `signRawEd25519`, `verifySigned` (rejects high-s)
- `parseDip4Events`, `intentsExecuted`, `mtTransfers`
- `intentsRpc({rpcUrls})`: `currentSalt`, `simulateIntents`, `mtBatchBalanceOf`, `executeIntents` (function-call keys only), `txStatus`; `classifyVerifierError`

Design: `nearpay-brain/lld/00-foundations.md` (foundations §14). Part of `nearpay-kit`; no domain rules (ADR-0001).
