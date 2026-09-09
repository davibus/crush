import "server-only";

import { generateAdCopyResult } from "@/lib/ad-copy-ai";
import { buildAdCopyEvidencePack } from "@/lib/ad-copy-evidence";
import { adCopyDraftRequestSchema } from "@/lib/ad-copy-generation";
import { setWorkspaceAdCopyDraft } from "@/lib/ad-copy-store";
import { getWorkspaceCompetitorAnalysis } from "@/lib/competitor-analysis-store";
import { getWorkspaceLandingPageAnalysis } from "@/lib/landing-page-analysis-store";
import { getMarketingData } from "@/lib/marketing-data-source";
import { resolveApiWorkspace } from "@/lib/workspace-access";

function errorResponse(error: string, status: number) { return Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } }); }

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("Request body must be valid JSON.", 400); }
  const parsed = adCopyDraftRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Ad-copy request is invalid.", 400);
  const access = await resolveApiWorkspace(parsed.data.clientId);
  if (!access.ok) return access.response;
  try {
    const marketingData = await getMarketingData(access.workspace);
    const pack = buildAdCopyEvidencePack({ workspace: access.workspace, marketingData, landingPage: getWorkspaceLandingPageAnalysis(access.workspace.id), competitorAnalysis: getWorkspaceCompetitorAnalysis(access.workspace.id), objective: parsed.data.objective });
    const result = await generateAdCopyResult(pack);
    setWorkspaceAdCopyDraft(access.workspace.id, result);
    return Response.json({ result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Ad-copy generation failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return errorResponse("Ad-copy drafts could not be generated safely.", 500);
  }
}
