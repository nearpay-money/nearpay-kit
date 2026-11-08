/** SSE helpers: resume cursor, backpressure, lifetime (lld/webhooks.md §5.1). */
import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { openSse, resumeCursor } from "../src/index.js";

class FakeRes extends EventEmitter {
  chunks: string[] = [];
  writableLength = 0;
  ended = false;
  writeHead() {
    return this;
  }
  write(c: string) {
    this.chunks.push(c);
    return true;
  }
  end() {
    this.ended = true;
    this.emit("close");
  }
}
const def = { events: { ping: z.object({ n: z.number() }) }, heartbeatSeconds: 0.02, retryMs: 3000 };
const open = (res: FakeRes, limits = {}) => openSse(res as unknown as ServerResponse, def, {}, limits);

describe("resumeCursor", () => {
  it("prefers Last-Event-ID over the query cursor and ignores blanks", () => {
    expect(resumeCursor({ "last-event-id": "evt_a" }, "evt_b")).toBe("evt_a");
    expect(resumeCursor({ "last-event-id": "  " }, "evt_b")).toBe("evt_b");
    expect(resumeCursor({ "last-event-id": ["evt_c"] })).toBe("evt_c");
    expect(resumeCursor({}, "")).toBeUndefined();
  });
});

describe("openSse limits", () => {
  it("writes id and event frames", () => {
    const res = new FakeRes();
    const s = open(res);
    expect(s.send("ping", { n: 1 }, "evt_1")).toBe(true);
    expect(res.chunks.at(-1)).toBe('id: evt_1\nevent: ping\ndata: {"n":1}\n\n');
    s.close();
    expect(s.send("ping", { n: 2 })).toBe(false);
  });
  it("closes a client that stays slow", async () => {
    const res = new FakeRes();
    const s = open(res, { maxBufferedBytes: 10, slowClientMs: 30 });
    res.writableLength = 100;
    await sleep(120);
    expect(s.closed).toBe(true);
    expect(res.ended).toBe(true);
  });
  it("keeps a client that catches up", async () => {
    const res = new FakeRes();
    const s = open(res, { maxBufferedBytes: 10, slowClientMs: 60 });
    res.writableLength = 100;
    await sleep(30);
    res.writableLength = 0;
    await sleep(80);
    expect(s.closed).toBe(false);
    s.close();
  });
  it("ends after maxDurationMs", async () => {
    const res = new FakeRes();
    const s = open(res, { maxDurationMs: 20 });
    await s.done;
    expect(res.ended).toBe(true);
  });
  it("drain resolves on drain or close", async () => {
    const res = new FakeRes();
    const s = open(res);
    await s.drain(); // empty buffer
    res.writableLength = 5;
    expect(s.buffered).toBe(5);
    const p = s.drain();
    res.writableLength = 0;
    res.emit("drain");
    await p;
    s.close();
  });
});
