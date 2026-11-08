# @nearpay-internal/chains

Chain registry (CAIP-2 ↔ 1Click `blockchain` ↔ display), address validation and normalisation per chain family, finality rules, explorer URLs, destination fingerprints.

- `CHAINS`, `getChain`, `chainByBlockchain`, `evmChainId`, `finalityRule`
- `validateAddress`, `normalizeAddress` (EIP-55, NEAR, Solana, bech32/bech32m, base58check)
- `destinationKey`, `destinationFingerprint`, `explorerTxUrl`, `explorerAddressUrl`
- Stage 4: `splAssetId(mint)` (Solana SPL → `nep141:sol-<hex(keccak256(mint)[12..32])>.omft.near`), `bitcoinAddressType(address, caip2?)` (`p2wpkh` | `p2tr` | `other` | null), `BITCOIN_MAINNET`

Design: `nearpay-brain/lld/00-foundations.md` (foundations §4). Part of `nearpay-kit`; no domain rules (ADR-0001).
