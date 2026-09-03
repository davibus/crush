import { timingSafeEqual } from "node:crypto";

import { runWeeklyMarketingReport } from "@/lib/weekly-report-runner";

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
  if (!process.env.CRON_SECRET) return Response.json({ error: "Cron execution is not configured." }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const report = await runWeeklyMarketingReport();
    return Response.json({
      reportingPeriod: report.reportingPeriod,
      generatedAt: report.generatedAt,
      sourcesIncluded: report.dataSourceStatus.filter((source) => source.included).map((source) => source.source),
      aiEnrichmentStatus: report.aiEnrichment.status,
    });
  } catch (error) {
    console.error("Scheduled Weekly Marketing Report failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    return Response.json({ error: "Scheduled Weekly Marketing Report could not complete." }, { status: 500 });
  }
}
