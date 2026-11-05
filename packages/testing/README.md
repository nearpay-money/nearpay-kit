# @nearpay-internal/testing

Test utilities: Testcontainers fixtures with the stack's pinned images, a fake clock, spec-validated factories for every Stage-1 aggregate, event probes and test tokens.

- `startPostgres`, `startNats`, `startValkey`, `IMAGES`
- `account`, `settlementDestination`, `internalSettlementDestination`, `paymentIntent`, `checkoutSession`, `balanceTransaction`, `execution`, `agentPayment`, `domainEvent`
- `eventProbe(natsUrl)`, `expectEvent(probe, subject, matcher)`
- `mintTestToken`, `testKeySource`, `testSigningKey`; `fakeClock`

Design: `nearpay-brain/lld/00-foundations.md` (foundations §16). Part of `nearpay-kit`; no domain rules (ADR-0001).
