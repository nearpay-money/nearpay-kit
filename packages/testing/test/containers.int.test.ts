import { createConnection } from "node:net";
import { connect } from "@nats-io/transport-node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  domainEvent,
  eventProbe,
  execution,
  type Started,
  startNats,
  startPostgres,
  startValkey,
} from "../src/index.js";

describe("container fixtures", () => {
  let pg: Started;
  let nats: Started;
  let valkey: Started;
  beforeAll(async () => {
    [pg, nats, valkey] = await Promise.all([startPostgres(), startNats(), startValkey()]);
  });
  afterAll(async () => {
    await Promise.all([pg?.stop(), nats?.stop(), valkey?.stop()]);
  });

  it("starts Postgres 17", async () => {
    const pgmod = await import("pg");
    const c = new pgmod.default.Client({ connectionString: pg.url });
    await c.connect();
    const r = await c.query("show server_version");
    expect(r.rows[0].server_version).toMatch(/^17\./);
    await c.end();
  });

  it("starts Valkey and answers PING", async () => {
    const u = new URL(valkey.url);
    const reply = await new Promise<string>((resolve, reject) => {
      const s = createConnection(Number(u.port), u.hostname, () => s.write("PING\r\n"));
      s.on("data", (d) => {
        resolve(d.toString());
        s.end();
      });
      s.on("error", reject);
    });
    expect(reply).toBe("+PONG\r\n");
  });

  it("delivers events to a probe", async () => {
    const probe = await eventProbe(nats.url);
    const nc = await connect({ servers: nats.url });
    const e = domainEvent("evt.rails.execution.updated", execution());
    nc.publish(e.subject, JSON.stringify(e));
    await expect(probe.next("evt.rails.execution.updated", (x) => x.id === e.id)).resolves.toMatchObject({ id: e.id });
    await expect(probe.next("evt.rails.execution.settled", undefined, 200)).rejects.toThrow(
      /no evt.rails.execution.settled/,
    );
    await nc.drain();
    await probe.close();
  });
});
