#!/usr/bin/env node
/**
 * Portable test runner for Windows, macOS and Linux.
 * Compiles the focused test tsconfig, then runs Node's built-in test runner
 * against the output directory. No shell globs and no extra dependencies.
 */
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const out = path.join(root, ".tmp", "test-build");
rmSync(out, { recursive: true, force: true });

const tsc = path.join(
  root,
  "node_modules",
  "typescript",
  "bin",
  "tsc",
);
const compile = spawnSync(process.execPath, [tsc, "-p", "tsconfig.test.json"], {
  stdio: "inherit",
});
if (compile.status !== 0) process.exit(compile.status ?? 1);

const run = spawnSync(
  process.execPath,
  ["--test", path.join(out, "tests")],
  { stdio: "inherit" },
);
process.exit(run.status ?? 1);
