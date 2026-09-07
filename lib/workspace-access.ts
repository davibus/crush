import "server-only";

import { auth } from "../auth.ts";
import { redirect } from "next/navigation";

import { getTenantRepository, type TenantRepository } from "./tenant-repository.ts";
import {
  listAuthorizedWorkspaceSummaries,
  resolveWorkspaceForIdentity,
  resolveWorkspaceMembership,
  type TenantIdentity,
  type WorkspaceResolution,
} from "./tenant-authorization.ts";

export type AuthenticatedUser = TenantIdentity;
export { listAuthorizedWorkspaceSummaries, resolveWorkspaceMembership };

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

export async function requireAuthenticatedPageUser(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function resolveApiWorkspace(
  workspaceId: unknown,
  dependencies: {
    getUser?: () => Promise<AuthenticatedUser | null>;
    repository?: TenantRepository;
  } = {},
): Promise<WorkspaceResolution> {
  const user = await (dependencies.getUser ?? getAuthenticatedUser)();
  return resolveWorkspaceForIdentity(
    user,
    workspaceId,
    dependencies.repository ?? getTenantRepository(),
  );
}
