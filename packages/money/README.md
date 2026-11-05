# @nearpay-internal/money

Integer money: `bigint` base units only, exact rationals for prices and FX. Fees round up, settlement rounds down (INV-5, INV-6). Any `number` amount input throws.

- `assertAmount`, `parseUnits` / `formatUnits`, `fromBaseUnits` / `toBaseUnits`, `fiatFromJson` / `fiatToJson`, `minorUnits(currency)`
- `mulDivFloor`, `mulDivCeil`, `bpsOf` (ceil), `afterBps` (floor), `maxOf`, `minOf`
- `rational`, `parseDecimal`, `mul`, `div`, `add`, `sub`, `cmp`, `relativeDiff`, `floor`, `ceil`, `toDecimalString`

Design: `nearpay-brain/lld/00-foundations.md` (foundations §6). Part of `nearpay-kit`; no domain rules (ADR-0001).
