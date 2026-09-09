import "server-only";

import { adCopyDraftResultSchema, type AdCopyDraftResult } from "./ad-copy-generation.ts";
import { requireWorkspaceId } from "./workspace-id.ts";

const TTL_MS = 30 * 60 * 1000;
const MAX_WORKSPACES = 100;
const drafts = new Map<string, { expiresAt: number; result: AdCopyDraftResult }>();

export function setWorkspaceAdCopyDraft(workspaceId: string, result: AdCopyDraftResult, now = Date.now()): void {
  const key = requireWorkspaceId(workspaceId);
  if (result.workspace.id !== key) throw new Error("Ad-copy result workspace does not match the storage key.");
  for (const [storedKey, stored] of drafts) if (stored.expiresAt <= now) drafts.delete(storedKey);
  if (!drafts.has(key) && drafts.size >= MAX_WORKSPACES) drafts.delete(drafts.keys().next().value!);
  drafts.set(key, { expiresAt: now + TTL_MS, result: adCopyDraftResultSchema.parse(result) });
}
export function getWorkspaceAdCopyDraft(workspaceId: string, now = Date.now()): AdCopyDraftResult | undefined {
  const key = requireWorkspaceId(workspaceId); const stored = drafts.get(key);
  if (!stored) return undefined;
  if (stored.expiresAt <= now) { drafts.delete(key); return undefined; }
  return stored.result;
}
export function clearWorkspaceAdCopyDraft(workspaceId: string): void { drafts.delete(requireWorkspaceId(workspaceId)); }
export function clearWorkspaceAdCopyDrafts(): void { drafts.clear(); }
