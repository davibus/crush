import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

import { getDatabasePool } from "../lib/database.ts";

loadEnvConfig(process.cwd());
const migration = await readFile(
  path.join(process.cwd(), "migrations", "001_authenticated_tenants.sql"),
  "utf8",
);
const pool = getDatabasePool();

try {
  await pool.query(migration);
  console.log("Database migration completed.");
} finally {
  await pool.end();
}
