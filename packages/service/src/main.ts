/**
 * Process runner (foundations §15): one image per service, the process type is the first
 * argument — `node dist/main.js api|worker|relay|migrate|<other>`. Long-running processes drain on
 * SIGTERM/SIGINT within 30 s (exit 0, or 1 when the drain overruns); one-shot processes exit 0
 * when they return. Invalid configuration and startup failures exit 1; an unknown process exits 2.
 *
 * `healthcheck` is built in (unless a service defines its own): it exits 0 when
 * `http://127.0.0.1:$NP_PORT/healthz` answers 200 within 2 s — the image's Docker `HEALTHCHECK`
 * (distroless images have no curl or wget).
 */
import { ConfigError } from "./config.js";

export interface Runnable {
  start(): Promise<unknown>;
  stop(): Promise<void>;
}

/** A long-running process returns a Runnable; a one-shot process (e.g. `migrate`) returns nothing. */
export type ProcessFactory = () => Promise<Runnable | undefined>;

export interface RunMainOptions {
  argv?: readonly string[];
  /** Drain budget on shutdown (default 30 s). */
  drainMs?: number;
  exit?: (code: number) => void;
  /** stderr writer for startup diagnostics (config errors happen before a logger exists). */
  stderr?: (line: string) => void;
  /** Process events to hook (tests pass an emitter). */
  events?: Pick<NodeJS.Process, "once" | "on">;
  /** Environment for the built-in healthcheck (default `process.env`). */
  env?: Record<string, string | undefined>;
}

/** GET /healthz on the local listener; 0 = healthy, 1 = not. */
export async function healthcheck(
  env: Record<string, string | undefined> = process.env,
  timeoutMs = 2_000,
): Promise<number> {
  const port = Number(env.NP_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return 1;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status === 200 ? 0 : 1;
  } catch {
    return 1;
  }
}

const isRunnable = (v: unknown): v is Runnable =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Runnable).start === "function" &&
  typeof (v as Runnable).stop === "function";

/** Runs the process named by `argv[2]`; resolves once it has started (long-running) or finished (one-shot). */
export async function runMain(
  processes: Readonly<Record<string, ProcessFactory>>,
  o: RunMainOptions = {},
): Promise<void> {
  const argv = o.argv ?? process.argv;
  const exit = o.exit ?? ((code: number) => process.exit(code));
  const stderr = o.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  const events = o.events ?? process;
  const drainMs = o.drainMs ?? 30_000;
  const name = argv[2];
  if (name === "healthcheck" && !Object.hasOwn(processes, "healthcheck")) {
    exit(await healthcheck(o.env ?? process.env));
    return;
  }
  const factory = name ? processes[name] : undefined;
  if (!name || !factory || !Object.hasOwn(processes, name)) {
    stderr(`usage: main.js <${Object.keys(processes).join("|")}>${name ? ` (unknown process "${name}")` : ""}`);
    exit(2);
    return;
  }

  let runnable: Runnable | undefined;
  const fail = (what: string, e: unknown) => {
    const detail = e instanceof ConfigError ? e.message : e instanceof Error ? (e.stack ?? e.message) : String(e);
    stderr(JSON.stringify({ level: "fatal", process: name, msg: what, err: detail }));
  };

  let shuttingDown = false;
  const shutdown = async (reason: string, code: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stderr(JSON.stringify({ level: "info", process: name, msg: `shutting down (${reason})` }));
    if (!runnable) return exit(code);
    let timer: NodeJS.Timeout | undefined;
    const overrun = new Promise<"overrun">((r) => {
      timer = setTimeout(() => r("overrun"), drainMs);
      timer.unref?.();
    });
    try {
      const r = await Promise.race([runnable.stop().then(() => "ok" as const), overrun]);
      clearTimeout(timer);
      if (r === "overrun") {
        stderr(JSON.stringify({ level: "error", process: name, msg: `drain exceeded ${drainMs} ms` }));
        return exit(1);
      }
      exit(code);
    } catch (e) {
      clearTimeout(timer);
      fail("shutdown failed", e);
      exit(1);
    }
  };

  try {
    const result = await factory();
    if (!isRunnable(result)) {
      exit(0);
      return;
    }
    runnable = result;
    await runnable.start();
  } catch (e) {
    fail(e instanceof ConfigError ? "invalid configuration" : "startup failed", e);
    if (runnable) await runnable.stop().catch(() => {});
    exit(1);
    return;
  }

  events.once("SIGTERM", () => void shutdown("SIGTERM", 0));
  events.once("SIGINT", () => void shutdown("SIGINT", 0));
  events.on("unhandledRejection", (e: unknown) => {
    fail("unhandled rejection", e);
    void shutdown("unhandled rejection", 1);
  });
  events.on("uncaughtException", (e: unknown) => {
    fail("uncaught exception", e);
    void shutdown("uncaught exception", 1);
  });
}
