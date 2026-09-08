import "server-only";

import { landingPageAnalysisSchema, type LandingPageAnalysis } from "./landing-page-analysis.ts";
import { requireWorkspaceId } from "./workspace-id.ts";

const TTL_MS = 30 * 60 * 1000;
const MAX_WORKSPACES = 100;
const analyses = new Map<string, { expiresAt: number; analysis: LandingPageAnalysis }>();

export function setWorkspaceLandingPageAnalysis(workspaceId: string, analysis: LandingPageAnalysis, now = Date.now()): void {
  const key = requireWorkspaceId(workspaceId);
  for (const [storedKey, stored] of analyses) if (stored.expiresAt <= now) analyses.delete(storedKey);
  if (!analyses.has(key) && analyses.size >= MAX_WORKSPACES) analyses.delete(analyses.keys().next().value!);
  analyses.set(key, { expiresAt: now + TTL_MS, analysis: landingPageAnalysisSchema.parse(analysis) });
}

export function getWorkspaceLandingPageAnalysis(workspaceId: string, now = Date.now()): LandingPageAnalysis | undefined {
  const key = requireWorkspaceId(workspaceId);
  const stored = analyses.get(key);
  if (!stored) return undefined;
  if (stored.expiresAt <= now) { analyses.delete(key); return undefined; }
  return stored.analysis;
}

export function clearWorkspaceLandingPageAnalysis(workspaceId: string): void {
  analyses.delete(requireWorkspaceId(workspaceId));
}

export function clearWorkspaceLandingPageAnalyses(): void { analyses.clear(); }
