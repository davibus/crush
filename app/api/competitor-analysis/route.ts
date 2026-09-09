import "server-only";

import { applyOptionalCompetitorAi } from "@/lib/competitor-analysis-ai";
import { buildDeterministicCompetitorAnalysis, competitorAnalysisRequestSchema } from "@/lib/competitor-analysis";
import { clearWorkspaceCompetitorAnalysis, setWorkspaceCompetitorAnalysis } from "@/lib/competitor-analysis-store";
import { retrieveCompetitorDemoPages, retrieveCompetitorPages } from "@/lib/competitor-retrieval";
import { getWorkspaceLandingPageAnalysis } from "@/lib/landing-page-analysis-store";
import { LandingPageRetrievalError } from "@/lib/landing-page-retrieval";
import { resolveApiWorkspace } from "@/lib/workspace-access";

function errorResponse(error: string, status: number, code = "invalid_request") {
  return Response.json({ error, code }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("Request body must be valid JSON.", 400); }
  const parsed = competitorAnalysisRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Competitor-analysis request is invalid.", 400);
  const access = await resolveApiWorkspace(parsed.data.clientId);
  if (!access.ok) return access.response;
  clearWorkspaceCompetitorAnalysis(access.workspace.id);
  try {
    const results = parsed.data.mode === "demo" ? await retrieveCompetitorDemoPages(parsed.data.fixtureId) : await retrieveCompetitorPages(parsed.data.competitors);
    const deterministic = buildDeterministicCompetitorAnalysis(results, getWorkspaceLandingPageAnalysis(access.workspace.id));
    const analysis = await applyOptionalCompetitorAi(deterministic);
    setWorkspaceCompetitorAnalysis(access.workspace.id, analysis);
    return Response.json({ analysis }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof LandingPageRetrievalError) return errorResponse(error.message, 400, error.code);
    console.error("Competitor analysis failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return errorResponse("The competitor analysis could not be completed safely.", 500, "analysis_failed");
  }
}
