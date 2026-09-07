import "server-only";

import {
  getTenantRepository,
  toWorkspaceSummary,
  type TenantRepository,
  type Workspace,
  type WorkspaceSummary,
} from "./tenant-repository.ts";

export type TenantIdentity = { id: string; name?: string | null; email?: string | null };

export async function resolveWorkspaceMembership(
  userId: string,
  workspaceId: string,
  repository: TenantRepository = getTenantRepository(),
): Promise<Workspace | null> {
  return repository.findWorkspaceForUser(userId, workspaceId);
}

export async function listAuthorizedWorkspaceSummaries(
  userId: string,
  repository: TenantRepository = getTenantRepository(),
): Promise<readonly WorkspaceSummary[]> {
  return (await repository.listWorkspacesForUser(userId)).map(toWorkspaceSummary);
}

export type WorkspaceResolution =
  | { ok: true; user: TenantIdentity; workspace: Workspace }
  | { ok: false; response: Response };

export async function resolveWorkspaceForIdentity(
  user: TenantIdentity | null,
  workspaceId: unknown,
  repository: TenantRepository = getTenantRepository(),
): Promise<WorkspaceResolution> {
  if (!user) {
    return { ok: false, response: Response.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  if (typeof workspaceId !== "string" || !workspaceId.trim()) {
    return {
      ok: false,
      response: Response.json({ error: "Client ID is required." }, { status: 400 }),
    };
  }
  const workspace = await resolveWorkspaceMembership(user.id, workspaceId, repository);
  if (!workspace) {
    return {
      ok: false,
      response: Response.json({ error: "Workspace not found." }, { status: 404 }),
    };
  }
  return { ok: true, user, workspace };
}
