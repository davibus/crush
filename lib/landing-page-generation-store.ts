import "server-only";

import { landingPageDraftResultSchema, type LandingPageDraftResult } from "./landing-page-generation.ts";
import { requireWorkspaceId } from "./workspace-id.ts";

const TTL_MS = 30 * 60 * 1_000;
const MAX_WORKSPACES = 100;
const drafts = new Map<string, { expiresAt: number; result: LandingPageDraftResult }>();

export function setWorkspaceLandingPageDraft(workspaceId: string, result: LandingPageDraftResult, now = Date.now()): void {
  const key = requireWorkspaceId(workspaceId);
  if (result.workspace.id !== key) throw new Error("Landing-page draft workspace does not match the storage key.");
  for (const [storedKey, stored] of drafts) if (stored.expiresAt <= now) drafts.delete(storedKey);
  if (!drafts.has(key) && drafts.size >= MAX_WORKSPACES) drafts.delete(drafts.keys().next().value!);
  drafts.set(key, { expiresAt: now + TTL_MS, result: landingPageDraftResultSchema.parse(result) });
}

export function getWorkspaceLandingPageDraft(workspaceId: string, now = Date.now()): LandingPageDraftResult | undefined {
  const key = requireWorkspaceId(workspaceId);
  const stored = drafts.get(key);
  if (!stored) return undefined;
  if (stored.expiresAt <= now) { drafts.delete(key); return undefined; }
  return stored.result;
}

export function clearWorkspaceLandingPageDraft(workspaceId: string): void { drafts.delete(requireWorkspaceId(workspaceId)); }
export function clearWorkspaceLandingPageDrafts(): void { drafts.clear(); }
