import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { ConfigError, type Runnable, runMain } from "../src/index.js";

function harness() {
  const codes: number[] = [];
  const lines: string[] = [];
  const events = new EventEmitter();
  return {
    codes,
    lines,
    events,
    opts: {
      exit: (c: number) => void codes.push(c),
      stderr: (l: string) => void lines.push(l),
      events: events as unknown as NodeJS.Process,
    },
  };
}

function runnable(o: { stopMs?: number; startFails?: boolean } = {}) {
  const calls: string[] = [];
  const r: Runnable = {
    async start() {
      calls.push("start");
      if (o.startFails) throw new Error("port in use");
    },
    async stop() {
      calls.push("stop");
      await sleep(o.stopMs ?? 0);
    },
  };
  return { r, calls };
}

describe("runMain", () => {
  it("rejects a missing or unknown process type with usage and exit 2", async () => {
    const h = harness();
    await runMain({ api: async () => undefined }, { ...h.opts, argv: ["node", "main.js", "toString"] });
    await runMain({ api: async () => undefined }, { ...h.opts, argv: ["node", "main.js"] });
    expect(h.codes).toEqual([2, 2]);
    expect(h.lines[0]).toBe('usage: main.js <api> (unknown process "toString")');
  });

  it("exits 0 after a one-shot process", async () => {
    const h = harness();
    let ran = false;
    const migrate = async () => {
      ran = true;
      return undefined;
    };
    await runMain({ migrate }, { ...h.opts, argv: ["node", "main.js", "migrate"] });
    expect([ran, h.codes]).toEqual([true, [0]]);
  });

  it("exits 1 on invalid configuration with the variable names", async () => {
    const h = harness();
    await runMain(
      {
        api: async () => {
          throw new ConfigError(["NP_DB_URL_FILE: is required"]);
        },
      },
      { ...h.opts, argv: ["node", "main.js", "api"] },
    );
    expect(h.codes).toEqual([1]);
    expect(JSON.parse(h.lines[0] as string)).toMatchObject({
      level: "fatal",
      process: "api",
      msg: "invalid configuration",
      err: expect.stringContaining("NP_DB_URL_FILE: is required"),
    });
  });

  it("stops a process whose start failed and exits 1", async () => {
    const h = harness();
    const { r, calls } = runnable({ startFails: true });
    await runMain({ api: async () => r }, { ...h.opts, argv: ["node", "main.js", "api"] });
    expect(calls).toEqual(["start", "stop"]);
    expect(h.codes).toEqual([1]);
  });

  it("drains on SIGTERM and exits 0", async () => {
    const h = harness();
    const { r, calls } = runnable();
    await runMain({ worker: async () => r }, { ...h.opts, argv: ["node", "main.js", "worker"] });
    expect(calls).toEqual(["start"]);
    expect(h.codes).toEqual([]);
    h.events.emit("SIGTERM");
    h.events.emit("SIGINT");
    await sleep(20);
    expect(calls).toEqual(["start", "stop"]);
    expect(h.codes).toEqual([0]);
  });

  it("exits 1 when the drain overruns its budget", async () => {
    const h = harness();
    const { r } = runnable({ stopMs: 200 });
    await runMain({ api: async () => r }, { ...h.opts, argv: ["node", "main.js", "api"], drainMs: 30 });
    h.events.emit("SIGTERM");
    await sleep(80);
    expect(h.codes).toEqual([1]);
    expect(h.lines.some((l) => l.includes("drain exceeded 30 ms"))).toBe(true);
  });

  it("shuts down with exit 1 on an uncaught exception", async () => {
    const h = harness();
    const { r, calls } = runnable();
    await runMain({ api: async () => r }, { ...h.opts, argv: ["node", "main.js", "api"] });
    h.events.emit("uncaughtException", new Error("boom"));
    await sleep(20);
    expect(calls).toEqual(["start", "stop"]);
    expect(h.codes).toEqual([1]);
    expect(h.lines.some((l) => l.includes("uncaught exception") && l.includes("boom"))).toBe(true);
  });

  it("has a built-in healthcheck process for container HEALTHCHECKs", async () => {
    let status = 200;
    const server = createServer((req, res) => res.writeHead(req.url === "/healthz" ? status : 404).end());
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = String((server.address() as AddressInfo).port);
    const h = harness();
    const run = (env: Record<string, string>) =>
      runMain({ api: async () => undefined }, { ...h.opts, argv: ["node", "main.js", "healthcheck"], env });
    await run({ NP_PORT: port });
    status = 503;
    await run({ NP_PORT: port });
    await new Promise<void>((r) => server.close(() => r()));
    await run({ NP_PORT: port });
    await run({ NP_PORT: "not-a-port" });
    expect(h.codes).toEqual([0, 1, 1, 1]);
    let own = false;
    await runMain(
      {
        healthcheck: async () => {
          own = true;
          return undefined;
        },
      },
      { ...h.opts, argv: ["node", "main.js", "healthcheck"] },
    );
    expect(own).toBe(true);
  });
});
