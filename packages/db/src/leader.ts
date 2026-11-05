/**
 * Singleton loops (foundations §7): leadership is `pg_try_advisory_lock(hashtext('<svc>:<loop>'))`
 * held on a dedicated connection. Losing the connection loses leadership; the loop's AbortSignal
 * fires and another replica takes over. The election loop itself never exits until `stop()`.
 */
import type pg from "pg";
import { hold } from "./pooled.js";

export interface LeaderOptions {
  pool: pg.Pool;
  /** `<service>:<loop>`, e.g. `rails:explorer-feed`. */
  name: string;
  run: (signal: AbortSignal) => Promise<void>;
  retryMs?: number;
  heartbeatMs?: number;
  onError?: (e: unknown) => void;
}

export function advisoryLeader(o: LeaderOptions): { isLeader(): boolean; stop(): Promise<void> } {
  const retryMs = o.retryMs ?? 5_000;
  const heartbeatMs = o.heartbeatMs ?? 5_000;
  const report = (e: unknown) => {
    try {
      o.onError?.(e);
    } catch {
      // an error reporter must not break the election loop
    }
  };
  let stopped = false;
  let leader = false;
  let current: AbortController | null = null;
  let wake: (() => void) | null = null;
  const sleep = (ms: number) =>
    new Promise<void>((r) => {
      const t = setTimeout(r, ms);
      wake = () => {
        clearTimeout(t);
        r();
      };
    });

  /** One election attempt; resolves when leadership (if won) has ended. */
  async function attempt(): Promise<boolean> {
    const client = await o.pool.connect();
    const got = await client
      .query<{ ok: boolean }>("select pg_try_advisory_lock(hashtext($1)) as ok", [o.name])
      .catch((e) => {
        client.release(true);
        throw e;
      });
    if (!got.rows[0]?.ok) {
      client.release();
      return false;
    }
    const held = hold(client);
    const ac = new AbortController();
    current = ac;
    leader = true;
    let hb: NodeJS.Timeout | undefined;
    try {
      const lost = new Promise<void>((resolve) => {
        held.on("error", () => resolve());
        held.on("end", () => resolve());
        hb = setInterval(() => {
          client.query("select 1").catch(() => resolve());
        }, heartbeatMs);
        ac.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      const work = Promise.resolve()
        .then(() => o.run(ac.signal))
        .catch(report);
      await Promise.race([lost, work]);
      ac.abort();
      await work;
      if (stopped) await client.query("select pg_advisory_unlock(hashtext($1))", [o.name]).catch(() => {});
    } finally {
      clearInterval(hb);
      leader = false;
      current = null;
      held.destroy(); // never return a lock-holding connection to the pool
    }
    return true;
  }

  const loop = (async () => {
    while (!stopped) {
      try {
        const led = await attempt();
        if (!led && !stopped) await sleep(retryMs);
      } catch (e) {
        report(e);
        if (!stopped) await sleep(retryMs);
      }
    }
  })();

  return {
    isLeader: () => leader,
    async stop() {
      stopped = true;
      current?.abort();
      (wake as (() => void) | null)?.();
      await loop;
    },
  };
}
