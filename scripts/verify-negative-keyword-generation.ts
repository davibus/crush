import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { applyOptionalNegativeKeywordAi } from "../lib/negative-keyword-ai.ts";
import { handleNegativeKeywordProposalRequest } from "../lib/negative-keyword-handler.ts";
import { generateNegativeKeywordProposals, NEGATIVE_KEYWORD_MATCH_TYPES, negativeKeywordProposalResultSchema, type NegativeKeywordGenerationInput } from "../lib/negative-keyword-proposals.ts";

const campaign = { id: "campaign-1", name: "Non-Brand Search", status: "ENABLED" as const, channel: "SEARCH", dailyBudget: 100, metrics: { impressions: 10_000, clicks: 500, cost: 2_000, conversions: 20, conversionValue: 4_000 } };
const row = (overrides: Record<string, unknown> = {}) => ({ id: "row-1", campaignId: campaign.id, campaignName: campaign.name, adGroup: "Services", searchTerm: "remote advertising jobs", matchedKeyword: "advertising management", matchType: "BROAD" as const, impressions: 900, clicks: 80, cost: 240, conversions: 0, conversionValue: 0, ...overrides });
const base = (overrides: Partial<NegativeKeywordGenerationInput> = {}): NegativeKeywordGenerationInput => ({ workspace: { id: "workspace-a", name: "Workspace A" }, source: "sample", sourceLabel: "Demo Google Ads data", dateRangeLabel: "Aug 18–24, 2025", completedPeriod: true, campaigns: [campaign], searchTerms: [row()], keywords: [{ id: "keyword-1", campaignId: campaign.id, campaignName: campaign.name, adGroup: "Services", keyword: "advertising management", matchType: "PHRASE", status: "ENABLED", impressions: 1_000, clicks: 100, cost: 400, conversions: 10, conversionValue: 2_000 }], generatedAt: "2026-09-08T12:00:00.000Z", ...overrides });

const strong = generateNegativeKeywordProposals(base());
assert.equal(strong.status, "ready");
assert.equal(strong.proposals.length, 1, "Strong waste candidate produces one proposal.");
assert.ok(NEGATIVE_KEYWORD_MATCH_TYPES.includes(strong.proposals[0]!.matchType));
assert.equal(strong.proposals[0]!.matchType, "exact", "Automatic match selection is conservative.");
for (const matchType of NEGATIVE_KEYWORD_MATCH_TYPES) assert.equal(negativeKeywordProposalResultSchema.safeParse({ ...strong, proposals: [{ ...strong.proposals[0]!, matchType }] }).success, true, `${matchType} is an explicit supported schema value.`);
assert.ok(strong.proposals[0]!.evidenceIds.length > 0);
assert.equal(strong.proposals[0]!.historicalAffectedTraffic.spend, 240);
assert.equal(strong.proposals[0]!.historicalAffectedTraffic.clicks, 80);
assert.equal(strong.proposals[0]!.historicalAffectedTraffic.conversions, 0);
assert.equal(strong.googleAdsChangesMade, false);
assert.equal(strong.recommendationOnly, true);
assert.equal(negativeKeywordProposalResultSchema.safeParse(strong).success, true);

assert.equal(generateNegativeKeywordProposals(base({ searchTerms: [row({ clicks: 1, cost: 3 })] })).proposals.length, 0, "Trivial zero-conversion traffic is withheld.");
assert.equal(generateNegativeKeywordProposals(base({ searchTerms: [row({ conversions: 1, conversionValue: 200 })] })).proposals.length, 0, "Converted traffic is protected.");
assert.equal(generateNegativeKeywordProposals(base({ protectedTerms: ["remote advertising jobs"] })).proposals.length, 0, "Allowlisted terms are protected.");
assert.equal(generateNegativeKeywordProposals(base({ protectedTerms: ["advertising"] })).proposals.length, 0, "A protected brand/business phrase inside a query is protected.");
assert.equal(generateNegativeKeywordProposals(base({ searchTerms: [row({ searchTerm: "advertising management" })] })).proposals.length, 0, "Intentionally targeted keywords are protected.");

const duplicateRows = generateNegativeKeywordProposals(base({ searchTerms: [row(), row({ id: "row-2", cost: 160, clicks: 40, impressions: 500 })] }));
assert.equal(duplicateRows.proposals.length, 1, "Duplicate normalized candidates are collapsed.");
assert.equal(duplicateRows.exclusions.duplicate, 1);
assert.equal(duplicateRows.proposals[0]!.historicalAffectedTraffic.spend, 400, "Historical spend is the deterministic sum of affected rows.");
assert.equal(duplicateRows.proposals[0]!.historicalAffectedTraffic.clicks, 120);
assert.equal(duplicateRows.proposals[0]!.evidenceIds.length, 2);

const existingDuplicate = generateNegativeKeywordProposals(base({ existingNegativeKeywords: [{ text: "remote advertising jobs", matchType: "exact", campaignId: campaign.id, adGroup: "Services" }] }));
assert.equal(existingDuplicate.proposals.length, 0);
assert.equal(existingDuplicate.existingNegativeKeywordCoverage, "available");

const missingValue = generateNegativeKeywordProposals(base({ searchTerms: [row({ conversionValue: undefined })] }));
assert.equal(missingValue.proposals.length, 1, "Missing optional conversion value does not break generation.");
assert.equal(missingValue.proposals[0]!.metrics.conversionValue, null);
assert.equal(generateNegativeKeywordProposals(base({ searchTerms: [row({ cost: 0 })] })).proposals.length, 0, "Zero-spend rows are safe.");
assert.equal(generateNegativeKeywordProposals(base({ searchTerms: [] })).status, "insufficient_evidence");
assert.deepEqual(generateNegativeKeywordProposals(base({ searchTerms: [] })).proposals, []);

const recent = generateNegativeKeywordProposals(base({ source: "live", completedPeriod: false, searchTerms: [row({ clicks: 40, cost: 140 })] }));
assert.equal(recent.proposals.length, 0, "Potentially recent traffic uses the higher evidence floor.");
const recentStrong = generateNegativeKeywordProposals(base({ source: "live", completedPeriod: false }));
assert.equal(recentStrong.analysisPeriod.completionStatus, "may_include_recent_data");
assert.match(recentStrong.proposals[0]!.uncertainty.join(" "), /conversions have not yet been reported/i);

const unknownAi = await applyOptionalNegativeKeywordAi(strong, { selector: async () => ({ prioritizedProposalIds: ["invented-candidate"] }) });
assert.equal(unknownAi.ai.status, "invalid");
assert.deepEqual(unknownAi.proposals, strong.proposals, "AI cannot introduce unknown candidate IDs.");
const malformedAi = await applyOptionalNegativeKeywordAi(strong, { selector: async () => ({ proposal: "invented" }) });
assert.equal(malformedAi.ai.status, "invalid");
assert.deepEqual(malformedAi.proposals, strong.proposals, "Malformed AI output falls back safely.");
const failedAi = await applyOptionalNegativeKeywordAi(strong, { selector: async () => { throw new Error("offline"); } });
assert.equal(failedAi.ai.status, "failed");

const otherWorkspace = generateNegativeKeywordProposals(base({ workspace: { id: "workspace-b", name: "Workspace B" } }));
assert.notEqual(otherWorkspace.proposals[0]!.id, strong.proposals[0]!.id);
assert.ok(otherWorkspace.proposals.every((proposal) => proposal.workspaceId === "workspace-b"));
assert.throws(() => negativeKeywordProposalResultSchema.parse({ ...strong, workspace: { id: "workspace-b", name: "Workspace B" } }), /workspace/i);

const demoTerms = JSON.parse(await readFile("data/google-ads-search-terms.json", "utf8")) as { searchTerms: NegativeKeywordGenerationInput["searchTerms"] };
const demoCampaigns = JSON.parse(await readFile("data/google-ads-sample.json", "utf8")) as { campaigns: NegativeKeywordGenerationInput["campaigns"] };
const demo = generateNegativeKeywordProposals(base({ workspace: { id: "demo", name: "Northstar Outdoor Co." }, campaigns: demoCampaigns.campaigns, searchTerms: demoTerms.searchTerms, protectedTerms: ["northstar", "crush"] }));
assert.ok(demo.proposals.length >= 3, "The fictional Northstar data produces a few useful examples.");
assert.ok(demo.proposals.every((proposal) => proposal.historicalAffectedTraffic.conversions === 0));

let unauthorizedLoadCalled = false;
const unauthorized = await handleNegativeKeywordProposalRequest("workspace-a", { resolveWorkspace: async () => ({ ok: false, response: Response.json({ error: "Unauthorized." }, { status: 401 }) }), loadData: async () => { unauthorizedLoadCalled = true; throw new Error("must not load"); } });
assert.equal(unauthorized.status, 401, "Unauthorized route access is rejected.");
assert.equal(unauthorizedLoadCalled, false, "Unauthorized requests never reach workspace data.");
const foreign = await handleNegativeKeywordProposalRequest("workspace-b", { resolveWorkspace: async () => ({ ok: false, response: Response.json({ error: "Workspace not found." }, { status: 404 }) }), loadData: async () => { throw new Error("must not load"); } });
assert.equal(foreign.status, 404, "Foreign workspace references are rejected.");

const route = await readFile("app/api/negative-keyword-proposals/route.ts", "utf8");
const handler = await readFile("lib/negative-keyword-handler.ts", "utf8");
const aiSource = await readFile("lib/negative-keyword-ai.ts", "utf8");
const generatorSource = await readFile("lib/negative-keyword-proposals.ts", "utf8");
const googleApi = await readFile("lib/google-ads-api.ts", "utf8");
const panel = await readFile("app/components/negative-keyword-proposals-panel.tsx", "utf8");
assert.match(route, /resolveApiWorkspace/);
assert.match(handler, /generateNegativeKeywordProposals/);
assert.match(generatorSource, /googleAdsChangesMade:\s*false/);
assert.match(aiSource, /UNTRUSTED DATA/);
assert.match(aiSource, /store: false/);
assert.doesNotMatch([route, handler, aiSource, googleApi].join("\n"), /googleAds:mutate|mutateOperation|campaignOperation|adGroupCriterionOperation/i, "Proposal generation exposes no Google Ads mutation path.");
assert.doesNotMatch([route, handler, panel].join("\n"), /NEXT_PUBLIC_|refreshToken|developerToken|clientSecret/i);
assert.match(panel, /Recommendation only/i);
assert.match(panel, /No Google Ads changes have been made/i);
assert.doesNotMatch(panel, />\s*(?:Apply|Publish|Execute|Add to Google Ads)\b/i);

console.log("Negative-keyword generation verification passed: material waste candidates, low-volume/converted/protected/conflicting terms, duplicates, valid conservative match types, evidence and historical metrics, missing/zero/empty data, conversion lag, AI allowlisting/fallback, tenant authorization, secrets, and mutation-free recommendation boundaries.");
