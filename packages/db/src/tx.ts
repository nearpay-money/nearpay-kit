/** Transactions with optional retry on serialization failures and deadlocks. */
import type { Kysely, Transaction } from "kysely";

export type Isolation = "read committed" | "repeatable read" | "serializable";

const RETRYABLE = new Set(["40001", "40P01"]);

export async function withTx<DB, T>(
  db: Kysely<DB>,
  fn: (tx: Transaction<DB>) => Promise<T>,
  opts: { isolation?: Isolation; retries?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? (opts.isolation === "serializable" ? 3 : 0);
  for (let i = 0; ; i++) {
    try {
      const b = db.transaction();
      return await (opts.isolation ? b.setIsolationLevel(opts.isolation) : b).execute(fn);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (i < retries && code && RETRYABLE.has(code)) {
        await new Promise((r) => setTimeout(r, 10 * 2 ** i + Math.random() * 10));
        continue;
      }
      throw e;
    }
  }
}
