import { getLatestWeeklyReport } from "@/lib/weekly-report-storage";
import { runWeeklyMarketingReport } from "@/lib/weekly-report-runner";
import { resolveApiWorkspace } from "@/lib/workspace-access";

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

export async function GET(request: Request) {
  try {
    const access = await resolveApiWorkspace(new URL(request.url).searchParams.get("clientId"));
    if (!access.ok) return access.response;
    const client = access.workspace;
    const report = await getLatestWeeklyReport(client.id);
    return report
      ? Response.json(report)
      : Response.json({ error: "No saved Weekly Marketing Report is available yet." }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await resolveApiWorkspace(new URL(request.url).searchParams.get("clientId"));
    if (!access.ok) return access.response;
    const client = access.workspace;
    return Response.json(await runWeeklyMarketingReport(client.id));
  } catch (error) {
    return failure(error);
  }
}
