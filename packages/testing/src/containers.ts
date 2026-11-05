/** Testcontainers fixtures (foundations §16): the same pinned images as the Compose stack. */
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";

export const IMAGES = {
  postgres: "postgres:17.11",
  nats: "nats:2.10.29-alpine",
  valkey: "valkey/valkey:8.1.11-alpine",
} as const;

export interface Started {
  readonly url: string;
  readonly container: StartedTestContainer;
  stop(): Promise<void>;
}

export async function startPostgres(opts: { database?: string; password?: string } = {}): Promise<Started> {
  const database = opts.database ?? "nearpay";
  const password = opts.password ?? "postgres";
  const container = await new GenericContainer(IMAGES.postgres)
    .withEnvironment({ POSTGRES_PASSWORD: password, POSTGRES_DB: database })
    .withExposedPorts(5432)
    .withCommand(["postgres", "-c", "fsync=off", "-c", "max_connections=200"])
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .withStartupTimeout(120_000)
    .start();
  const url = `postgres://postgres:${password}@${container.getHost()}:${container.getMappedPort(5432)}/${database}`;
  return { url, container, stop: async () => void (await container.stop()) };
}

export async function startNats(): Promise<Started & { monitorUrl: string }> {
  const container = await new GenericContainer(IMAGES.nats)
    .withCommand(["-js", "-sd", "/data", "-m", "8222"])
    .withExposedPorts(4222, 8222)
    .withWaitStrategy(Wait.forHttp("/healthz?js-enabled-only=true", 8222).forStatusCode(200))
    .withStartupTimeout(60_000)
    .start();
  return {
    url: `nats://${container.getHost()}:${container.getMappedPort(4222)}`,
    monitorUrl: `http://${container.getHost()}:${container.getMappedPort(8222)}`,
    container,
    stop: async () => void (await container.stop()),
  };
}

export async function startValkey(): Promise<Started> {
  const container = await new GenericContainer(IMAGES.valkey)
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .withStartupTimeout(60_000)
    .start();
  return {
    url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
    container,
    stop: async () => void (await container.stop()),
  };
}
