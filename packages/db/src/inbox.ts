/** Consumer de-duplication (foundations §8): record the event id in the handler's transaction. */
import { sql, type Transaction } from "kysely";
import type { KitTables } from "./tables.js";

/** Returns true when the event is new (handle it), false when it was already consumed (skip). */
export async function consume<DB>(txIn: Transaction<DB>, eventId: string, subject: string): Promise<boolean> {
  const tx = txIn as unknown as Transaction<KitTables>;
  const r = await tx
    .insertInto("inbox")
    .values({ event_id: eventId, subject, received_at: sql`now()` as never })
    .onConflict((oc) => oc.column("event_id").doNothing())
    .executeTakeFirst();
  return Number(r.numInsertedOrUpdatedRows ?? 0n) === 1;
}
