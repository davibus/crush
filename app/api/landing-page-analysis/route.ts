import "server-only";

import { applyOptionalLandingPageAi } from "@/lib/landing-page-ai";
import { buildDeterministicLandingPageAnalysis, landingPageRequestSchema } from "@/lib/landing-page-analysis";
import { clearWorkspaceLandingPageAnalysis, setWorkspaceLandingPageAnalysis } from "@/lib/landing-page-analysis-store";
import { LandingPageRetrievalError, retrieveDemoLandingPage, retrieveLandingPage } from "@/lib/landing-page-retrieval";
import { getMarketingData } from "@/lib/marketing-data-source";
import { resolveApiWorkspace } from "@/lib/workspace-access";

function errorResponse(error: string, status: number, code?: string) {
  return Response.json({ error, ...(code ? { code } : {}) }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("Request body must be valid JSON.", 400, "invalid_request"); }
  const parsed = landingPageRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Landing-page request is invalid.", 400, "invalid_request");

  const access = await resolveApiWorkspace(parsed.data.clientId);
  if (!access.ok) return access.response;
  clearWorkspaceLandingPageAnalysis(access.workspace.id);

  try {
    const page = parsed.data.mode === "demo" ? await retrieveDemoLandingPage(parsed.data.fixtureId) : await retrieveLandingPage(parsed.data.url);
    const marketingData = await getMarketingData(access.workspace);
    const deterministic = buildDeterministicLandingPageAnalysis(page, {
      ga4: marketingData.ga4,
      adsLandingPages: marketingData.landingPages,
      adsCampaigns: marketingData.campaignData.campaigns,
      searchTerms: marketingData.searchTerms,
      ...(page.source === "demo_fixture" ? { explicitDemoCampaignId: "camp-002" } : {}),
    });
    const analysis = await applyOptionalLandingPageAi(deterministic);
    setWorkspaceLandingPageAnalysis(access.workspace.id, analysis);
    return Response.json({ analysis }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof LandingPageRetrievalError) {
      const status = error.code === "http_error" || error.code === "unreachable" || error.code === "timeout" ? 502 : error.code === "too_large" || error.code === "unsupported_content" ? 422 : 400;
      return errorResponse(error.message, status, error.code);
    }
    console.error("Landing-page analysis failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return errorResponse("The landing page could not be analyzed safely.", 500, "analysis_failed");
  }
}
