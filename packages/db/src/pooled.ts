import type pg from "pg";

/**
 * A pool client held for a long time (LISTEN, advisory locks). Listeners are attached through
 * `on` and removed before the client is destroyed, so nothing leaks to a later borrower of the
 * same pooled connection; `destroy` releases at most once and never throws.
 */
export interface HeldClient {
  readonly client: pg.PoolClient;
  on(event: "error" | "notification" | "end", fn: (...args: never[]) => void): void;
  /** Removes our listeners and drops the connection from the pool (never reused). */
  destroy(): void;
  readonly destroyed: boolean;
}

export function hold(client: pg.PoolClient): HeldClient {
  const attached: [string, (...args: never[]) => void][] = [];
  let destroyed = false;
  return {
    client,
    on(event, fn) {
      if (destroyed) return;
      attached.push([event, fn]);
      client.on(event as "error", fn as () => void);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const [event, fn] of attached.splice(0)) client.removeListener(event, fn as () => void);
      // A late socket error must not become an unhandled 'error' event.
      client.on("error", () => {});
      try {
        client.release(true);
      } catch {
        // already released: nothing left to do
      }
    },
    get destroyed() {
      return destroyed;
    },
  };
}
