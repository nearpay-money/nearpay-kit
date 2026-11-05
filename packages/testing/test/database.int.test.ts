import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionServiceDatabase, type Started, startPostgres } from "../src/index.js";

let pgc: Started;
beforeAll(async () => {
  pgc = await startPostgres();
});
afterAll(async () => {
  await pgc?.stop();
});

async function run(url: string, sql: string): Promise<unknown> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await c.query(sql);
  } finally {
    await c.end();
  }
}

describe("provisionServiceDatabase", () => {
  it("gives the migrator DDL and the app role DML only, like postgres-init", async () => {
    const db = await provisionServiceDatabase(pgc.url, "orders", { roles: ["orders_ro"] });
    await run(db.migratorUrl, "create table t (id int primary key); create sequence s");
    await run(db.appUrl, "insert into t values (1); select nextval('s')");
    await expect(run(db.appUrl, "create table x (id int)")).rejects.toThrow(/permission denied/);
    await expect(run(db.appUrl, "drop table t")).rejects.toThrow(/must be owner/);
    await expect(run(db.roleUrl("orders_ro"), "select 1")).rejects.toThrow(/permission denied/);
    const rows = (await run(db.adminUrl, "select count(*)::int as n from t")) as { rows: { n: number }[] };
    expect(rows.rows[0]?.n).toBe(1);
  });

  it("keeps databases of different services apart", async () => {
    const a = await provisionServiceDatabase(pgc.url, "alpha");
    const b = await provisionServiceDatabase(pgc.url, "beta");
    const cross = new URL(a.appUrl);
    cross.pathname = "/beta";
    await expect(run(cross.toString(), "select 1")).rejects.toThrow(/permission denied/);
    await run(b.appUrl, "select 1");
  });

  it("rejects unsafe identifiers", async () => {
    await expect(provisionServiceDatabase(pgc.url, "bad;drop")).rejects.toThrow(/invalid identifier/);
  });
});
