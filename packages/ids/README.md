# @nearpay-internal/ids

Prefixed identifiers: TypeID encoding of UUIDv7 (`cs_01jbz9…`, 26 lowercase Crockford base32 symbols).

- `newId(prefix)` — new id with a monotonic UUIDv7
- `toUuid(id, expectedPrefix?)` / `fromUuid(prefix, uuid)` — database ↔ API form
- `parseId(id)`, `isId(prefix, value)`, `uuidv7()`, `uuidTimestamp(uuid)`

Design: `nearpay-brain/lld/00-foundations.md` (foundations §5). Part of `nearpay-kit`; no domain rules (ADR-0001).
