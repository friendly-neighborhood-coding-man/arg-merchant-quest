#!/usr/bin/env node
/**
 * Deletes the local demo database and any stored evidence photos. The schema
 * and seed data are recreated the next time the app (or any page/API route)
 * opens the database.
 */
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.ARG_DATA_DIR ?? path.join(process.cwd(), ".data");
const dbPath = process.env.ARG_DB_PATH ?? path.join(dataDir, "arg.db");
const targets = ["", "-wal", "-shm", "-journal"].map((suffix) => `${dbPath}${suffix}`);
const removed = [];

for (const file of targets) {
  if (fs.existsSync(file)) {
    fs.rmSync(file, { force: true });
    removed.push(path.relative(process.cwd(), file) || file);
  }
}

const evidence = path.join(dataDir, "evidence");
if (fs.existsSync(evidence)) {
  fs.rmSync(evidence, { recursive: true, force: true });
  removed.push(`${path.relative(process.cwd(), evidence) || evidence}/`);
}

if (removed.length === 0) {
  console.log(`No database at ${dbPath} — nothing to reset.`);
} else {
  console.log(`Removed ${removed.join(", ")}.`);
}
console.log("Start the app again to recreate the schema and demo seed data.");
