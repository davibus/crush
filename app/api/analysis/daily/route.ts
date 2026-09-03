import { getLatestDailyAnalysis } from "@/lib/daily-analysis-storage";
import { runDailyMarketingAnalysis } from "@/lib/daily-analysis-runner";

export const runtime = "nodejs";

function failure(error: unknown) {
  console.error("Daily Analysis request failed.", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown failure",
  });
  return Response.json(
    {
      error:
        "Daily Analysis could not complete. Check the live integration, timezone, storage, and server logs, then try again.",
    },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const analysis = await getLatestDailyAnalysis();
    if (!analysis) {
      return Response.json(
        { error: "No saved Daily Analysis is available yet." },
        { status: 404 },
      );
    }
    return Response.json(analysis);
  } catch (error) {
    return failure(error);
  }
}

export async function POST() {
  try {
    return Response.json(await runDailyMarketingAnalysis());
  } catch (error) {
    return failure(error);
  }
}
