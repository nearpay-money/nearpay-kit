import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { baseConfigShape, ConfigError, envName, flag, int, list, loadConfig, secret, url } from "../src/index.js";

const dir = mkdtempSync(join(tmpdir(), "np-config-"));
const file = (name: string, content: string) => {
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
};

const shape = {
  ...baseConfigShape,
  dbUrl: secret(),
  natsUrl: url(["nats:"]),
  serviceClientSecret: secret().optional(),
  pollMs: int(1000),
  liveEnabled: flag(false),
  origins: list().optional(),
};

const errorOf = (f: () => unknown): ConfigError => {
  try {
    f();
  } catch (e) {
    if (e instanceof ConfigError) return e;
    throw e;
  }
  throw new Error("expected a ConfigError");
};

describe("envName", () => {
  it("maps camelCase keys to NP_ names", () => {
    expect(envName("dbUrl")).toBe("NP_DB_URL");
    expect(envName("serviceClientSecret")).toBe("NP_SERVICE_CLIENT_SECRET");
    expect(envName("otelEndpoint")).toBe("NP_OTEL_ENDPOINT");
    expect(envName("env")).toBe("NP_ENV");
    expect(envName("kek2")).toBe("NP_KEK2");
  });
});

describe("loadConfig", () => {
  it("reads env vars and secret files, applies defaults and coercion", () => {
    const cfg = loadConfig(shape, {
      env: {
        NP_DB_URL_FILE: file("db_url", "postgres://u:p@postgres:5432/payments\n"),
        NP_NATS_URL: "nats://nats:4222",
        NP_POLL_MS: "250",
        NP_LIVE_ENABLED: "true",
        NP_ORIGINS: "https://a.example, https://b.example,",
        NP_LOG_LEVEL: "debug",
      },
    });
    expect(cfg).toMatchObject({
      env: "local",
      logLevel: "debug",
      host: "0.0.0.0",
      port: 8080,
      metricsPort: 9464,
      dbUrl: "postgres://u:p@postgres:5432/payments",
      natsUrl: "nats://nats:4222",
      pollMs: 250,
      liveEnabled: true,
      origins: ["https://a.example", "https://b.example"],
    });
    expect(cfg.serviceClientSecret).toBeUndefined();
    expect(cfg.otelEndpoint).toBeUndefined();
  });

  it("keeps multi-line secrets intact (PEM keys) and trims only trailing whitespace", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIA==\n-----END PRIVATE KEY-----\n\n";
    const cfg = loadConfig({ key: secret() }, { env: { NP_KEY_FILE: file("key.pem", pem) } });
    expect(cfg.key).toBe(pem.trimEnd());
  });

  it("refuses secrets from plain environment variables", () => {
    const e = errorOf(() =>
      loadConfig(shape, { env: { NP_DB_URL: "postgres://u:hunter2@x/db", NP_NATS_URL: "nats://n:4222" } }),
    );
    expect(e.issues).toEqual(["NP_DB_URL: secrets are read from files; set NP_DB_URL_FILE instead"]);
    expect(e.message).not.toContain("hunter2");
  });

  it("reports every problem by variable name without echoing values", () => {
    const e = errorOf(() =>
      loadConfig(shape, {
        env: {
          NP_NATS_URL: "http://wrong:1",
          NP_POLL_MS: "abc",
          NP_LIVE_ENABLED: "yes",
          NP_PORT: "70000",
          NP_SERVICE_CLIENT_SECRET_FILE: join(dir, "missing"),
        },
      }),
    );
    expect(e.issues).toContain(`NP_SERVICE_CLIENT_SECRET_FILE: cannot read ${join(dir, "missing")} (ENOENT)`);
    expect(e.issues).toContain("NP_DB_URL_FILE: is required");
    expect(e.issues.find((i) => i.startsWith("NP_NATS_URL:"))).toMatch(/must be a URL/);
    expect(e.issues.find((i) => i.startsWith("NP_POLL_MS:"))).toBeDefined();
    expect(e.issues.find((i) => i.startsWith("NP_LIVE_ENABLED:"))).toBeDefined();
    expect(e.issues.find((i) => i.startsWith("NP_PORT:"))).toBeDefined();
    expect(e.message).not.toContain("wrong");
  });

  it("rejects a variable given both ways", () => {
    const e = errorOf(() =>
      loadConfig(
        { natsUrl: url(["nats:"]) },
        { env: { NP_NATS_URL: "nats://a:1", NP_NATS_URL_FILE: file("n", "nats://b:1") } },
      ),
    );
    expect(e.issues).toEqual(["NP_NATS_URL: set either NP_NATS_URL or NP_NATS_URL_FILE, not both"]);
  });

  it("treats empty variables as unset and accepts overrides (tests)", () => {
    const cfg = loadConfig(
      { a: z.string().default("x"), b: secret() },
      { env: { NP_A: "" }, overrides: { b: "s3cret" } },
    );
    expect(cfg).toEqual({ a: "x", b: "s3cret" });
  });

  it("accepts a zod object and validates enums", () => {
    expect(() => loadConfig(z.object(baseConfigShape), { env: { NP_ENV: "prod" } })).toThrow(ConfigError);
    expect(
      loadConfig(z.object(baseConfigShape), { env: { NP_ENV: "server", NP_OTEL_ENDPOINT: "http://otel:4318" } }),
    ).toMatchObject({ env: "server", otelEndpoint: "http://otel:4318" });
  });
});
