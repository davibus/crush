const WORKSPACE_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function requireWorkspaceId(workspaceId: string): string {
  if (!WORKSPACE_ID.test(workspaceId)) {
    throw new Error("Invalid workspace ID.");
  }
  return workspaceId;
}

export function getWorkspaceCacheKey(
  workspaceId: string,
  source: "google-ads" | "ga4",
  identity: readonly string[],
): string {
  return ["workspace", requireWorkspaceId(workspaceId), source, ...identity].join(":");
}
