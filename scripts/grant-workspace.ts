import { loadEnvConfig } from "@next/env";

import { getDatabasePool } from "../lib/database.ts";
import { requireWorkspaceId } from "../lib/workspace-id.ts";

loadEnvConfig(process.cwd());
const email = process.argv[2]?.trim().toLowerCase();
const workspaceId = requireWorkspaceId(process.argv[3]?.trim() || "demo");
if (!email) throw new Error("Usage: npm run db:grant -- <signed-in-email> [workspace-id]");

const pool = getDatabasePool();
try {
  const result = await pool.query(
    `INSERT INTO workspace_memberships (user_id, workspace_id, role)
     SELECT id, $2, 'owner' FROM users WHERE LOWER(email) = $1
     ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = EXCLUDED.role
     RETURNING workspace_id`,
    [email, workspaceId],
  );
  if (!result.rowCount) {
    throw new Error("No Auth.js user has that email. Sign in once, then run this command again.");
  }
  console.log(`Granted ${email} owner access to ${workspaceId}.`);
} finally {
  await pool.end();
}
