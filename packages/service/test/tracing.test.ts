import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { currentContext, runWithContext } from "@nearpay-internal/http";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace";
import { describe, expect, it } from "vitest";
import { formatTraceparent, parseTraceparent, SpanKind, startSpan, startTracing, withSpan } from "../src/index.js";

const TP = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

describe("traceparent", () => {
  it("parses and formats W3C trace context", () => {
    const sc = parseTraceparent(TP);
    expect(sc).toEqual({
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
      traceFlags: 1,
      isRemote: true,
    });
    expect(formatTraceparent(sc as NonNullable<typeof sc>)).toBe(TP);
    expect(parseTraceparent(TP.toUpperCase())?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(parseTraceparent("01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-future")?.spanId).toBe(
      "00f067aa0ba902b7",
    );
  });

  it("rejects invalid headers", () => {
    for (const bad of [
      undefined,
      "",
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7",
      "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
      "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01",
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-extra",
      "00-a-b-01",
    ])
      expect(parseTraceparent(bad)).toBeNull();
  });
});

describe("spans", () => {
  it("continues the caller's trace and propagates child contexts", async () => {
    const exporter = new InMemorySpanExporter();
    const t = startTracing({ service: "payments", env: "test", exporter });
    const root = startSpan(t.tracer, "GET /x", { kind: SpanKind.SERVER, parent: TP });
    expect(root.spanContext().traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    const rootTp = formatTraceparent(root.spanContext());
    let inner = "";
    await runWithContext({ traceparent: rootTp }, () =>
      withSpan(t.tracer, "db.tx", async () => {
        inner = currentContext().traceparent ?? "";
      }),
    );
    await expect(
      runWithContext({ traceparent: rootTp }, () =>
        withSpan(t.tracer, "fails", async () => Promise.reject(new Error("boom"))),
      ),
    ).rejects.toThrow("boom");
    root.end();
    await t.flush();
    const spans = exporter.getFinishedSpans();
    expect(spans.map((s) => s.name).sort()).toEqual(["GET /x", "db.tx", "fails"]);
    const child = spans.find((s) => s.name === "db.tx");
    expect(child?.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
    expect(inner).toBe(formatTraceparent(child?.spanContext() as never));
    expect(spans.find((s) => s.name === "fails")?.status.code).toBe(2);
    expect(spans[0]?.resource.attributes["service.name"]).toBe("nearpay-payments");
    await t.shutdown();
  });

  it("starts a new root without a parent, and records nothing externally when not exporting", async () => {
    const t = startTracing({ service: "payments", env: "test" });
    expect(t.exporting).toBe(false);
    const s = startSpan(t.tracer, "x", { parent: null });
    expect(s.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(s.spanContext().traceId).not.toMatch(/^0+$/);
    s.end();
    await t.shutdown();
  });

  it("exports over OTLP/HTTP when an endpoint is configured", async () => {
    const received: { url: string; body: string }[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        received.push({ url: req.url ?? "", body });
        res.writeHead(200, { "content-type": "application/json" }).end("{}");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const t = startTracing({
      service: "rails",
      env: "test",
      endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    });
    expect(t.exporting).toBe(true);
    startSpan(t.tracer, "exported-span", { parent: TP }).end();
    await t.flush();
    await t.shutdown();
    await new Promise<void>((r) => server.close(() => r()));
    expect(received[0]?.url).toBe("/v1/traces");
    expect(received[0]?.body).toContain("exported-span");
    expect(received[0]?.body).toContain("nearpay-rails");
  });
});
