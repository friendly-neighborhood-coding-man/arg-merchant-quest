#!/usr/bin/env node
/**
 * Portable test runner for Windows, macOS and Linux.
 *
 * Compiles the focused test tsconfig, then enumerates the compiled
 * `*.test.js` files and passes their explicit paths to Node's built-in test
 * runner. Node 22 does not accept a bare directory as a positional argument,
 * and a glob would need a shell, so the file list is built here instead. No
 * extra dependencies.
 */
import { readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const out = path.join(root, ".tmp", "test-build");
rmSync(out, { recursive: true, force: true });

const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
const compile = spawnSync(process.execPath, [tsc, "-p", "tsconfig.test.json"], {
  stdio: "inherit",
});
if (compile.status !== 0) process.exit(compile.status ?? 1);

function findTests(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findTests(full));
    else if (entry.isFile() && entry.name.endsWith(".test.js")) files.push(full);
  }
  return files;
}

let testFiles;
try {
  testFiles = findTests(out).sort();
} catch (error) {
  console.error(`The compiled test directory ${out} is missing: ${error.message}`);
  process.exit(1);
}

if (testFiles.length === 0) {
  console.error(`No compiled *.test.js files were found in ${out}.`);
  process.exit(1);
}

const run = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
});
process.exit(run.status ?? 1);
