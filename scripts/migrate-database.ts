import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

import { getDatabasePool } from "../lib/database.ts";

loadEnvConfig(process.cwd());
const migrationDirectory = path.join(process.cwd(), "migrations");
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => /^\d+_.*\.sql$/.test(file))
  .sort();
const pool = getDatabasePool();

try {
  for (const file of migrationFiles) {
    await pool.query(await readFile(path.join(migrationDirectory, file), "utf8"));
  }
  console.log(`Database migrations completed (${migrationFiles.length}).`);
} finally {
  await pool.end();
}
