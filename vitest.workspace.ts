import { defineWorkspace } from "vitest/config";
import { alias } from "./vitest.shared.js";

export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: "unit",
      include: ["packages/*/test/**/*.test.{ts,tsx}"],
      exclude: ["packages/*/test/**/*.int.test.ts", "**/node_modules/**"],
      // React components render in jsdom; everything else stays on node.
      environmentMatchGlobs: [["packages/ui/test/**/*.test.tsx", "jsdom"]],
    },
  },
  {
    resolve: { alias },
    test: {
      name: "integration",
      include: ["packages/*/test/**/*.int.test.ts"],
      testTimeout: 120_000,
      hookTimeout: 180_000,
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
    },
  },
]);
