import { fileURLToPath } from "node:url";

const PACKAGES = ["ids", "money", "chains", "intents", "db", "bus", "auth", "http", "service", "testing", "ui"];

/** Tests import sibling kit packages from source. */
export const alias = Object.fromEntries(
  PACKAGES.map((p) => [
    `@nearpay-internal/${p}`,
    fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url)),
  ]),
);
