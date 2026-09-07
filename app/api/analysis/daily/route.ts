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

function clientFromRequest(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId");
  return clientId ? getClientById(clientId) : getDefaultClient();
}

export async function GET(request: Request) {
  try {
    const client = clientFromRequest(request);
    if (!client) return Response.json({ error: "Unknown client workspace." }, { status: 404 });
    const analysis = await getLatestDailyAnalysis(client.id);
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

export async function POST(request: Request) {
  try {
    const client = clientFromRequest(request);
    if (!client) return Response.json({ error: "Unknown client workspace." }, { status: 404 });
    return Response.json(await runDailyMarketingAnalysis(client.id));
  } catch (error) {
    return failure(error);
  }
}
import { getClientById, getDefaultClient } from "@/lib/clients";
