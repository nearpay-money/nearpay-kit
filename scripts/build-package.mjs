#!/usr/bin/env node
// Builds the package in the current directory: tsc (ESM + d.ts) and copies the license.
// Optional `kitBuild` in the package's package.json: `compilerOptions` merged into the build
// tsconfig (e.g. `jsx` for React packages) and `copy` — files under src/ copied verbatim to dist/.
import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = process.cwd();
const { kitBuild = {} } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
rmSync(join(pkg, "dist"), { recursive: true, force: true });
const tsconfig = join(pkg, "tsconfig.build.json");
writeFileSync(
  tsconfig,
  `${JSON.stringify(
    {
      extends: "../../tsconfig.base.json",
      compilerOptions: {
        rootDir: "src",
        outDir: "dist",
        types: ["node"],
        sourceMap: true,
        inlineSources: true,
        declarationMap: false,
        ...kitBuild.compilerOptions,
      },
      include: ["src"],
    },
    null,
    2,
  )}\n`,
);
execFileSync(join(root, "node_modules", ".bin", "tsc"), ["-p", tsconfig], { stdio: "inherit" });
for (const file of kitBuild.copy ?? []) cpSync(join(pkg, "src", file), join(pkg, "dist", file));
cpSync(join(root, "LICENSE"), join(pkg, "LICENSE"));
console.log(`built ${pkg.split("/").pop()}`);
