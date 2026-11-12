/**
 * Singleton loops (foundations §7): leadership is `pg_try_advisory_lock(hashtext('<svc>:<loop>'))`
 * held on a dedicated connection. Losing the connection loses leadership; the loop's AbortSignal
 * fires and another replica takes over. The election loop itself never exits until `stop()`.
 *
 * KIT-5: the leadership heartbeat (`select 1` every `heartbeatMs`) must answer within
 * `heartbeatTimeoutMs` (default 2 × heartbeatMs), so a hung socket loses leadership instead of keeping
 * the lock forever; after a term shorter than `retryMs` (a `run` that returns or throws at once) the
 * elector waits `retryMs` (+ up to 20 % jitter) before competing again, so it never hot-loops.
 *
 * KIT-4: with a `heartbeat` (liveness), a follower is `idle()` (never fails `/healthz`); a leader beats
 * on every answered leadership heartbeat (`livenessFrom: "leadership"`, default) or whenever `run`
 * calls the `beat` it receives (`livenessFrom: "run"`, for loops that must prove progress).
 */
import type pg from "pg";
import { hold } from "./pooled.js";
import type { Heartbeat } from "./tasks.js";

export interface LeaderOptions {
  pool: pg.Pool;
  /** `<service>:<loop>`, e.g. `rails:explorer-feed`. */
  name: string;
  /** The leader's work; `beat` reports progress for `livenessFrom: "run"` (a no-op otherwise). */
  run: (signal: AbortSignal, beat: () => void) => Promise<void>;
  retryMs?: number;
  heartbeatMs?: number;
  /** A leadership heartbeat slower than this loses leadership (default 2 × heartbeatMs). */
  heartbeatTimeoutMs?: number;
  onError?: (e: unknown) => void;
  /** Liveness handle (`@nearpay-internal/service` hands one to background tasks with `maxSilenceMs`). */
  heartbeat?: Heartbeat;
  /** What proves a leader alive (default `leadership`). */
  livenessFrom?: "leadership" | "run";
  random?: () => number;
}

class HeartbeatTimeout extends Error {
  constructor(name: string, ms: number) {
    super(`${name}: leadership heartbeat did not answer within ${ms} ms; giving up leadership`);
    this.name = "HeartbeatTimeout";
  }
}

/** Resolves with the query result, or rejects after `ms` (the query itself cannot be cancelled here). */
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(onTimeout()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function advisoryLeader(o: LeaderOptions): { isLeader(): boolean; stop(): Promise<void> } {
  const retryMs = o.retryMs ?? 5_000;
  const heartbeatMs = o.heartbeatMs ?? 5_000;
  const heartbeatTimeoutMs = o.heartbeatTimeoutMs ?? 2 * heartbeatMs;
  const random = o.random ?? Math.random;
  const fromRun = o.livenessFrom === "run";
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
  const idle = () => o.heartbeat?.idle();
  const beatLeader = () => {
    if (leader) o.heartbeat?.beat();
  };

  /** One election attempt; resolves when leadership (if won) has ended. Returns the term length, or null if lost. */
  async function attempt(): Promise<number | null> {
    const client = await o.pool.connect();
    const timeout = () => new HeartbeatTimeout(o.name, heartbeatTimeoutMs);
    const got = await withTimeout(
      client.query<{ ok: boolean }>("select pg_try_advisory_lock(hashtext($1)) as ok", [o.name]),
      heartbeatTimeoutMs,
      timeout,
    ).catch((e) => {
      client.release(true);
      throw e;
    });
    if (!got.rows[0]?.ok) {
      client.release();
      return null;
    }
    const held = hold(client);
    const ac = new AbortController();
    const wonAt = Date.now();
    current = ac;
    leader = true;
    o.heartbeat?.beat();
    let hb: NodeJS.Timeout | undefined;
    try {
      const lost = new Promise<void>((resolve) => {
        held.on("error", () => resolve());
        held.on("end", () => resolve());
        // Sequential heartbeats (never overlapping); a slow or failed one ends the term.
        const tick = () => {
          hb = setTimeout(() => {
            withTimeout(client.query("select 1"), heartbeatTimeoutMs, timeout).then(
              () => {
                if (ac.signal.aborted) return;
                if (!fromRun) beatLeader();
                tick();
              },
              (e) => {
                if (e instanceof HeartbeatTimeout) report(e);
                resolve();
              },
            );
          }, heartbeatMs);
        };
        tick();
        ac.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      const work = Promise.resolve()
        .then(() => o.run(ac.signal, fromRun ? beatLeader : () => {}))
        .catch(report);
      await Promise.race([lost, work]);
      ac.abort();
      await work;
      if (stopped)
        await withTimeout(
          client.query("select pg_advisory_unlock(hashtext($1))", [o.name]),
          heartbeatTimeoutMs,
          timeout,
        ).catch(() => {});
    } finally {
      clearTimeout(hb);
      leader = false;
      current = null;
      held.destroy(); // never return a lock-holding connection to the pool
    }
    return Date.now() - wonAt;
  }

  const loop = (async () => {
    while (!stopped) {
      try {
        const term = await attempt();
        if (stopped) break;
        if (term === null) {
          idle();
          await sleep(retryMs);
        } else if (term < retryMs) {
          // a term that ended at once (run returned or threw): do not re-acquire in a tight loop
          idle();
          await sleep(retryMs * (1 + 0.2 * random()));
        } else {
          idle();
        }
      } catch (e) {
        report(e);
        idle(); // not leading (the DB is unreachable): readiness reports it, liveness does not
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
