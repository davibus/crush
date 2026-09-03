import { timingSafeEqual } from "node:crypto";

import { runDailyMarketingAnalysis } from "@/lib/daily-analysis-runner";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization");
  if (!secret || !supplied?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json(
      { error: "Cron execution is not configured." },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await runDailyMarketingAnalysis();
    return Response.json({
      analysisDate: result.analysisDate,
      generatedAt: result.generatedAt,
      dataSourcesUsed: result.dataSourcesUsed,
      materialChangeCount: result.materialChanges.length,
    });
  } catch (error) {
    console.error("Scheduled Daily Analysis failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    return Response.json(
      { error: "Scheduled Daily Analysis could not complete." },
      { status: 500 },
    );
  }
}
