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

function clientFromRequest(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId");
  return clientId ? getClientById(clientId) : getDefaultClient();
}

export async function GET(request: Request) {
  try {
    const client = clientFromRequest(request);
    if (!client) return Response.json({ error: "Unknown client workspace." }, { status: 404 });
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
    const client = clientFromRequest(request);
    if (!client) return Response.json({ error: "Unknown client workspace." }, { status: 404 });
    return Response.json(await runWeeklyMarketingReport(client.id));
  } catch (error) {
    return failure(error);
  }
}
import { getClientById, getDefaultClient } from "@/lib/clients";
