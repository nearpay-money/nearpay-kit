/** SSE helpers: resume cursor, backpressure, lifetime (lld/webhooks.md §5.1). */
import { EventEmitter, once } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { openSse, resumeCursor } from "../src/index.js";

class FakeRes extends EventEmitter {
  chunks: string[] = [];
  writableLength = 0;
  writableNeedDrain = false;
  ended = false;
  destroyed = false;
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
  destroy() {
    this.destroyed = true;
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
    // more than maxBufferedBytes unsent: end() would wait forever for the reader, so destroy
    expect(res.destroyed).toBe(true);
    expect(res.ended).toBe(false);
  });
  it("ends (not destroys) a stream whose unsent bytes are within maxBufferedBytes", () => {
    const res = new FakeRes();
    const s = open(res, { maxBufferedBytes: 10 });
    res.writableLength = 10;
    s.close();
    expect(res.ended).toBe(true);
    expect(res.destroyed).toBe(false);
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
    res.writableNeedDrain = true;
    expect(s.buffered).toBe(5);
    const p = s.drain();
    res.writableLength = 0;
    res.writableNeedDrain = false;
    res.emit("drain");
    await p;
    res.writableNeedDrain = true;
    const q = s.drain();
    s.close();
    await q;
  });
  it("drain does not wait for small buffered data below the high-water mark (regression)", async () => {
    const res = new FakeRes();
    const s = open(res);
    res.writableLength = 42; // buffered, but no drain is pending: 'drain' will never be emitted
    const r = await Promise.race([s.drain().then(() => "resolved"), sleep(50).then(() => "hung")]);
    expect(r).toBe("resolved");
    s.close();
  });
});

describe("openSse with a real socket", () => {
  it("destroys a client that stops reading instead of waiting forever to flush (regression)", async () => {
    let res: ServerResponse | undefined;
    let stream: ReturnType<typeof open> | undefined;
    const server = createServer((_req, r) => {
      res = r;
      stream = openSse(r, def, {}, { maxBufferedBytes: 1024, slowClientMs: 60_000 });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as { port: number };
    const sock = connect(port, "127.0.0.1");
    sock.on("error", () => {});
    sock.write("GET / HTTP/1.1\r\nhost: x\r\n\r\n");
    sock.once("data", () => sock.pause()); // read the head, then never read again
    try {
      while (!stream || !res) await sleep(5);
      const s = stream;
      // schema-valid frames with extra bytes (the payload is written as given) until writes back up
      const pad = "x".repeat(64 * 1024);
      // fill until the kernel buffers are full too, i.e. the response still needs a drain after a pause
      for (let round = 0; round < 50; round++) {
        for (let i = 0; i < 64; i++) s.send("ping", { n: i, pad }); // ignores backpressure on purpose
        await sleep(30);
        if (res.writableNeedDrain || s.closed) break;
      }
      expect(res.writableNeedDrain).toBe(true);
      expect(s.buffered).toBeGreaterThan(1024);
      // drain waits while the reader is stuck…
      const drained = s.drain().then(() => "drained");
      expect(await Promise.race([drained, sleep(100).then(() => "pending")])).toBe("pending");
      // …and closing with more than maxBufferedBytes unsent destroys the socket and releases it
      s.close();
      expect(res.destroyed).toBe(true);
      expect(await Promise.race([drained, sleep(2000).then(() => "hung")])).toBe("drained");
      expect(await Promise.race([s.done.then(() => "done"), sleep(2000).then(() => "hung")])).toBe("done");
    } finally {
      sock.destroy();
      server.closeAllConnections();
      server.close();
    }
  });
});
