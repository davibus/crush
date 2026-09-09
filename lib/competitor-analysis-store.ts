import "server-only";

import { competitorAnalysisSchema, type CompetitorAnalysis } from "./competitor-analysis.ts";
import { requireWorkspaceId } from "./workspace-id.ts";

const TTL_MS = 30 * 60 * 1000;
const MAX_WORKSPACES = 100;
const analyses = new Map<string, { expiresAt: number; analysis: CompetitorAnalysis }>();

export function setWorkspaceCompetitorAnalysis(workspaceId: string, analysis: CompetitorAnalysis, now = Date.now()): void {
  const key = requireWorkspaceId(workspaceId);
  for (const [storedKey, stored] of analyses) if (stored.expiresAt <= now) analyses.delete(storedKey);
  if (!analyses.has(key) && analyses.size >= MAX_WORKSPACES) analyses.delete(analyses.keys().next().value!);
  analyses.set(key, { expiresAt: now + TTL_MS, analysis: competitorAnalysisSchema.parse(analysis) });
}

export function getWorkspaceCompetitorAnalysis(workspaceId: string, now = Date.now()): CompetitorAnalysis | undefined {
  const key = requireWorkspaceId(workspaceId);
  const stored = analyses.get(key);
  if (!stored) return undefined;
  if (stored.expiresAt <= now) { analyses.delete(key); return undefined; }
  return stored.analysis;
}

export function clearWorkspaceCompetitorAnalysis(workspaceId: string): void { analyses.delete(requireWorkspaceId(workspaceId)); }
export function clearWorkspaceCompetitorAnalyses(): void { analyses.clear(); }
