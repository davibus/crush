import "server-only";

import { Pool } from "pg";

declare global {
  var crushPostgresPool: Pool | undefined;
}

export function hasDatabaseConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(environment.DATABASE_URL?.trim());
}

export function getDatabasePool(
  environment: NodeJS.ProcessEnv = process.env,
): Pool {
  const connectionString = environment.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required outside the explicitly enabled development tenant fixture mode.",
    );
  }

  if (environment !== process.env) {
    return new Pool({ connectionString, max: 5 });
  }

  if (!globalThis.crushPostgresPool) {
    globalThis.crushPostgresPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: environment.DATABASE_SSL === "disable"
        ? false
        : { rejectUnauthorized: environment.DATABASE_SSL !== "allow-self-signed" },
    });
  }
  return globalThis.crushPostgresPool;
}
