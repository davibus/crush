import { handlePdfReportRequest } from "@/lib/pdf-report-handler";
import { resolveApiWorkspace } from "@/lib/workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    return await handlePdfReportRequest(clientId, { resolveWorkspace: resolveApiWorkspace });
  } catch (error) {
    console.error("PDF marketing report generation failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    return Response.json(
      { error: "The PDF report could not be generated. Please try again." },
      { status: 500 },
    );
  }
}
