import "server-only";

import { applyOptionalNegativeKeywordAi } from "./negative-keyword-ai.ts";
import { generateNegativeKeywordProposals } from "./negative-keyword-proposals.ts";
import type { MarketingDataSet } from "./marketing-data-source.ts";
import type { WorkspaceResolution } from "./tenant-authorization.ts";

export type NegativeKeywordHandlerDependencies = {
  resolveWorkspace: (workspaceId: unknown) => Promise<WorkspaceResolution>;
  loadData: (workspace: Extract<WorkspaceResolution, { ok: true }>["workspace"]) => Promise<MarketingDataSet>;
  prioritize?: typeof applyOptionalNegativeKeywordAi;
};

function brandTokens(...names: string[]): string[] {
  const generic = new Set(["co", "company", "inc", "llc", "workspace", "demo", "paid", "media", "account"]);
  return [...new Set(names.flatMap((name) => name.toLocaleLowerCase("en-US").match(/[a-z0-9]+/g) ?? []).filter((token) => token.length >= 4 && !generic.has(token)))];
}

export async function handleNegativeKeywordProposalRequest(workspaceId: unknown, dependencies: NegativeKeywordHandlerDependencies): Promise<Response> {
  const access = await dependencies.resolveWorkspace(workspaceId);
  if (!access.ok) return access.response;
  const data = await dependencies.loadData(access.workspace);
  const protectedTerms = (process.env.NEGATIVE_KEYWORD_PROTECTED_TERMS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const deterministic = generateNegativeKeywordProposals({
    workspace: { id: access.workspace.id, name: access.workspace.name }, source: data.source, sourceLabel: data.sourceLabel,
    dateRangeLabel: data.dateRangeLabel, completedPeriod: data.source === "sample", campaigns: data.campaignData.campaigns,
    searchTerms: data.searchTerms, keywords: data.keywords,
    protectedTerms: [...protectedTerms, ...brandTokens(access.workspace.name, data.campaignData.account.name)],
  });
  const result = await (dependencies.prioritize ?? applyOptionalNegativeKeywordAi)(deterministic);
  return Response.json({ result }, { headers: { "Cache-Control": "private, no-store" } });
}
