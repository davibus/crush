import "server-only";

import { generateLandingPageResult } from "@/lib/landing-page-generation-ai";
import { buildLandingPageEvidencePack } from "@/lib/landing-page-generation-evidence";
import { landingPageGenerationRequestSchema } from "@/lib/landing-page-generation";
import { setWorkspaceLandingPageDraft } from "@/lib/landing-page-generation-store";
import { getWorkspaceAdCopyDraft } from "@/lib/ad-copy-store";
import { getWorkspaceCompetitorAnalysis } from "@/lib/competitor-analysis-store";
import { getWorkspaceLandingPageAnalysis } from "@/lib/landing-page-analysis-store";
import { validateLandingPageUrl } from "@/lib/landing-page-retrieval";
import { getMarketingData } from "@/lib/marketing-data-source";
import { resolveApiWorkspace } from "@/lib/workspace-access";

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("Request body must be valid JSON.", 400); }
  const parsed = landingPageGenerationRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Landing-page generation request is invalid.", 400);
  if (parsed.data.brief.destinationUrl) {
    try { validateLandingPageUrl(parsed.data.brief.destinationUrl); } catch (error) { return errorResponse(error instanceof Error ? error.message : "Destination URL is unsafe.", 400); }
  }
  const access = await resolveApiWorkspace(parsed.data.clientId);
  if (!access.ok) return access.response;
  try {
    const marketingData = await getMarketingData(access.workspace);
    const pack = buildLandingPageEvidencePack({
      workspace: access.workspace,
      brief: parsed.data.brief,
      marketingData,
      landingPage: getWorkspaceLandingPageAnalysis(access.workspace.id),
      competitorAnalysis: getWorkspaceCompetitorAnalysis(access.workspace.id),
      adCopyDraft: getWorkspaceAdCopyDraft(access.workspace.id),
    });
    const result = await generateLandingPageResult(pack);
    setWorkspaceLandingPageDraft(access.workspace.id, result);
    return Response.json({ result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Landing-page generation failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return errorResponse("A landing-page draft could not be generated safely.", 500);
  }
}
