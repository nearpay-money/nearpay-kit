import { baseConfigShape, isDevEnv, loadConfig } from "@nearpay-internal/service";
import { describe, expect, it } from "vitest";
import { TEST_ENV, testConfig, testEnv } from "../src/index.js";

describe("test-stack environment", () => {
  it("testEnv always sets NP_ENV=test and keeps the given variables", () => {
    expect(testEnv()).toEqual({ NP_ENV: "test" });
    expect(testEnv({ NP_PORT: "0", NP_OTEL_ENDPOINT: undefined })).toEqual({ NP_ENV: "test", NP_PORT: "0" });
    expect(testEnv({ NP_ENV: "test" })).toEqual({ NP_ENV: "test" });
    expect(() => testEnv({ NP_ENV: "local" })).toThrow(/NP_ENV must be "test"/);
    expect(loadConfig(baseConfigShape, { env: testEnv() }).env).toBe(TEST_ENV);
  });

  it("testConfig is a valid test BaseConfig (env cannot be overridden)", () => {
    const cfg = testConfig({ logLevel: "debug" });
    expect(cfg).toEqual({ env: "test", logLevel: "debug", host: "127.0.0.1", port: 0, metricsPort: 0 });
    expect(isDevEnv(cfg.env)).toBe(true);
    expect(testConfig({ env: "server" } as never).env).toBe("test");
  });
});
