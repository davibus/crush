import { getLatestWeeklyReport } from "@/lib/weekly-report-storage";
import { runWeeklyMarketingReport } from "@/lib/weekly-report-runner";

export const runtime = "nodejs";

function failure(error: unknown) {
  console.error("Weekly Marketing Report request failed.", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown failure",
  });
  return Response.json(
    { error: "Weekly Marketing Report could not complete. Check the integrations, timezone, storage, and server logs, then try again." },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const report = await getLatestWeeklyReport();
    return report
      ? Response.json(report)
      : Response.json({ error: "No saved Weekly Marketing Report is available yet." }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}

export async function POST() {
  try {
    return Response.json(await runWeeklyMarketingReport());
  } catch (error) {
    return failure(error);
  }
}
