/**
 * Test-stack environment (kit 0.2.1): `NP_ENV` is required by `@nearpay-internal/service`, so every
 * test stack must say it is `test`. Use `testEnv()` for code that reads the environment through
 * `loadConfig` (a service's own `config.ts`, `runMain`, child processes, Testcontainers images of a
 * service) and `testConfig()` where a test builds a `BaseConfig` by hand for `createService`.
 */
import type { BaseConfig } from "@nearpay-internal/service";

/** The environment value every test stack runs under. */
export const TEST_ENV = "test" as const;

/**
 * An environment for test stacks: `NP_ENV=test` plus the given `NP_*` variables (which may not
 * override `NP_ENV` with another value — tests never run as `local` or `server`).
 */
export function testEnv(vars: Record<string, string | undefined> = {}): Record<string, string> {
  if (vars.NP_ENV !== undefined && vars.NP_ENV !== TEST_ENV) {
    throw new Error(`testEnv: NP_ENV must be "${TEST_ENV}" in test stacks (got "${vars.NP_ENV}")`);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) out[k] = v;
  out.NP_ENV = TEST_ENV;
  return out;
}

/** A `BaseConfig` for in-process test services: `env: "test"`, silent logs, ephemeral ports on loopback. */
export function testConfig(overrides: Partial<Omit<BaseConfig, "env">> = {}): BaseConfig {
  return { logLevel: "silent", host: "127.0.0.1", port: 0, metricsPort: 0, ...overrides, env: TEST_ENV };
}
