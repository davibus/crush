import "server-only";

import { z } from "zod";

import { handleNegativeKeywordProposalRequest } from "@/lib/negative-keyword-handler";
import { getMarketingData } from "@/lib/marketing-data-source";
import { resolveApiWorkspace } from "@/lib/workspace-access";

const requestSchema = z.object({ clientId: z.string().trim().min(1).max(100) }).strict();
const errorResponse = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("Request body must be valid JSON.", 400); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Negative-keyword request is invalid.", 400);
  try {
    return await handleNegativeKeywordProposalRequest(parsed.data.clientId, { resolveWorkspace: resolveApiWorkspace, loadData: getMarketingData });
  } catch (error) {
    console.error("Negative-keyword proposal generation failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return errorResponse("Negative-keyword proposals could not be generated safely.", 500);
  }
}
