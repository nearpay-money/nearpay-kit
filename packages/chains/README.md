# @nearpay-internal/chains

Chain registry (CAIP-2 ↔ 1Click `blockchain` ↔ display), address validation and normalisation per chain family, finality rules, explorer URLs, destination fingerprints.

- `CHAINS`, `getChain`, `chainByBlockchain`, `evmChainId`, `finalityRule`
- `validateAddress`, `normalizeAddress` (EIP-55, NEAR, Solana, bech32/bech32m, base58check)
- `destinationKey`, `destinationFingerprint`, `explorerTxUrl`, `explorerAddressUrl`

Design: `nearpay-brain/lld/00-foundations.md` (foundations §4). Part of `nearpay-kit`; no domain rules (ADR-0001).
