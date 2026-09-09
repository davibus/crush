import { z } from "zod";

import type {
  GoogleAdsCampaign,
  GoogleAdsKeyword,
  GoogleAdsSearchTerm,
} from "./google-ads.ts";

export const NEGATIVE_KEYWORD_SCHEMA_VERSION = "1.0" as const;
export const NEGATIVE_KEYWORD_MATCH_TYPES = ["exact", "phrase", "broad"] as const;
export const NEGATIVE_KEYWORD_THRESHOLDS = {
  completedPeriod: { minimumClicks: 30, minimumSpend: 100, minimumCampaignSpendShare: 0.02 },
  recentPeriod: { minimumClicks: 60, minimumSpend: 150, minimumCampaignSpendShare: 0.03 },
} as const;

const finiteNonnegative = z.number().finite().nonnegative();
const workspaceSchema = z.object({ id: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(200) }).strict();
const metricsSchema = z.object({
  spend: finiteNonnegative,
  clicks: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  conversions: finiteNonnegative,
  conversionValue: finiteNonnegative.nullable(),
  cpa: finiteNonnegative.nullable(),
}).strict();

export const negativeKeywordEvidenceSchema = z.object({
  id: z.string().trim().min(1).max(250),
  source: z.literal("google_ads_search_term"),
  sourceRowId: z.string().trim().min(1).max(150),
  searchTerm: z.string().trim().min(1).max(500),
  campaignId: z.string().trim().min(1).max(150),
  campaignName: z.string().trim().min(1).max(300),
  adGroup: z.string().trim().min(1).max(300).nullable(),
  metrics: metricsSchema,
  analysisPeriod: z.string().trim().min(1).max(200),
}).strict();

export const negativeKeywordProposalSchema = z.object({
  id: z.string().trim().min(1).max(300),
  schemaVersion: z.literal(NEGATIVE_KEYWORD_SCHEMA_VERSION),
  workspaceId: z.string().trim().min(1).max(100),
  sourceSearchTerm: z.object({ id: z.string().trim().min(1).max(150), text: z.string().trim().min(1).max(500), relatedRowIds: z.array(z.string().min(1)).min(1).max(50) }).strict(),
  proposedNegativeKeyword: z.string().trim().min(1).max(500),
  matchType: z.enum(NEGATIVE_KEYWORD_MATCH_TYPES),
  scope: z.discriminatedUnion("level", [
    z.object({ level: z.literal("campaign"), campaignId: z.string().min(1), campaignName: z.string().min(1) }).strict(),
    z.object({ level: z.literal("ad_group"), campaignId: z.string().min(1), campaignName: z.string().min(1), adGroup: z.string().min(1) }).strict(),
  ]),
  rationale: z.string().trim().min(1).max(1_000),
  evidenceIds: z.array(z.string().min(1)).min(1).max(50),
  metrics: metricsSchema,
  historicalAffectedTraffic: metricsSchema,
  strength: z.enum(["moderate", "strong"]),
  status: z.enum(["proposed", "accepted_for_future_review", "rejected"]),
  conflictChecks: z.array(z.string().min(1).max(300)).min(1).max(10),
  uncertainty: z.array(z.string().min(1).max(500)).max(10),
  generatedAt: z.string().datetime(),
  analysisPeriod: z.string().trim().min(1).max(200),
}).strict();

export const negativeKeywordProposalResultSchema = z.object({
  schemaVersion: z.literal(NEGATIVE_KEYWORD_SCHEMA_VERSION),
  workspace: workspaceSchema,
  generatedAt: z.string().datetime(),
  recommendationOnly: z.literal(true),
  googleAdsChangesMade: z.literal(false),
  status: z.enum(["ready", "no_candidates", "insufficient_evidence"]),
  source: z.object({ type: z.enum(["sample", "live"]), label: z.string().min(1), searchTermRowCount: z.number().int().nonnegative() }).strict(),
  analysisPeriod: z.object({ label: z.string().min(1), completionStatus: z.enum(["completed", "may_include_recent_data"]) }).strict(),
  existingNegativeKeywordCoverage: z.enum(["available", "unavailable"]),
  proposals: z.array(negativeKeywordProposalSchema).max(100),
  evidence: z.array(negativeKeywordEvidenceSchema).max(500),
  exclusions: z.object({ protected: z.number().int().nonnegative(), belowThreshold: z.number().int().nonnegative(), duplicate: z.number().int().nonnegative(), conflict: z.number().int().nonnegative() }).strict(),
  limitations: z.array(z.string().min(1).max(800)).min(1).max(15),
  ai: z.object({ status: z.enum(["not_configured", "applied", "invalid", "failed"]), detail: z.string().min(1).max(500) }).strict(),
}).strict().superRefine((result, context) => {
  const evidenceIds = new Set(result.evidence.map((item) => item.id));
  for (const [index, proposal] of result.proposals.entries()) {
    if (proposal.workspaceId !== result.workspace.id) context.addIssue({ code: "custom", message: "Proposal workspace does not match its result workspace.", path: ["proposals", index, "workspaceId"] });
    for (const id of proposal.evidenceIds) if (!evidenceIds.has(id)) context.addIssue({ code: "custom", message: `Unknown evidence ID: ${id}.`, path: ["proposals", index, "evidenceIds"] });
  }
});

export type NegativeKeywordProposal = z.infer<typeof negativeKeywordProposalSchema>;
export type NegativeKeywordProposalResult = z.infer<typeof negativeKeywordProposalResultSchema>;
export type NegativeKeywordMatchType = (typeof NEGATIVE_KEYWORD_MATCH_TYPES)[number];

type SearchTermInput = Omit<GoogleAdsSearchTerm, "conversionValue"> & { conversionValue?: number | null };
export type ExistingNegativeKeyword = { text: string; matchType: NegativeKeywordMatchType; campaignId: string; adGroup?: string };
export type NegativeKeywordGenerationInput = {
  workspace: { id: string; name: string };
  source: "sample" | "live";
  sourceLabel: string;
  dateRangeLabel: string;
  completedPeriod: boolean;
  campaigns: readonly GoogleAdsCampaign[];
  searchTerms: readonly SearchTermInput[];
  keywords?: readonly GoogleAdsKeyword[];
  protectedTerms?: readonly string[];
  existingNegativeKeywords?: readonly ExistingNegativeKeyword[];
  generatedAt?: string;
};

const normalize = (value: string) => value.toLocaleLowerCase("en-US").normalize("NFKC").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const slug = (value: string) => normalize(value).replaceAll(" ", "-").slice(0, 80) || "unknown";
const nonnegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
const optionalMetric = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

function termTokens(value: string): string[] { return normalize(value).split(" ").filter(Boolean); }
function containsNormalizedPhrase(text: string, phrase: string): boolean { return ` ${normalize(text)} `.includes(` ${normalize(phrase)} `); }
function substantiallyIdentical(left: string, right: string): boolean {
  const a = normalize(left); const b = normalize(right);
  return Boolean(a && b && (a === b || (termTokens(a).length > 1 && termTokens(b).length > 1 && new Set(termTokens(a)).size === new Set(termTokens(b)).size && termTokens(a).every((token) => termTokens(b).includes(token)))));
}
function wouldConflict(proposal: string, matchType: NegativeKeywordMatchType, keyword: string): boolean {
  const negative = normalize(proposal); const target = normalize(keyword);
  if (!negative || !target) return false;
  if (matchType === "exact") return negative === target;
  if (matchType === "phrase") return ` ${target} `.includes(` ${negative} `);
  return termTokens(negative).every((token) => termTokens(target).includes(token));
}

function observedMetrics(rows: readonly SearchTermInput[]) {
  const spend = rows.reduce((sum, row) => sum + nonnegative(row.cost), 0);
  const conversions = rows.reduce((sum, row) => sum + nonnegative(row.conversions), 0);
  const values = rows.map((row) => optionalMetric(row.conversionValue));
  return {
    spend,
    clicks: Math.round(rows.reduce((sum, row) => sum + nonnegative(row.clicks), 0)),
    impressions: Math.round(rows.reduce((sum, row) => sum + nonnegative(row.impressions), 0)),
    conversions,
    conversionValue: values.some((value) => value !== null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null,
    cpa: conversions > 0 ? spend / conversions : null,
  };
}

export function generateNegativeKeywordProposals(input: NegativeKeywordGenerationInput): NegativeKeywordProposalResult {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const thresholds = input.completedPeriod ? NEGATIVE_KEYWORD_THRESHOLDS.completedPeriod : NEGATIVE_KEYWORD_THRESHOLDS.recentPeriod;
  const campaigns = new Map(input.campaigns.map((campaign) => [campaign.id, campaign]));
  const enabledKeywords = (input.keywords ?? []).filter((item) => item.status === "ENABLED");
  const explicitProtected = [...(input.protectedTerms ?? [])].filter((item) => normalize(item));
  const existing = input.existingNegativeKeywords;
  const groups = new Map<string, SearchTermInput[]>();
  for (const row of input.searchTerms) {
    const key = [row.campaignId, normalize(row.adGroup), normalize(row.searchTerm)].join("|");
    const rows = groups.get(key) ?? []; rows.push(row); groups.set(key, rows);
  }
  const exclusions = { protected: 0, belowThreshold: 0, duplicate: input.searchTerms.length - groups.size, conflict: 0 };
  const proposals: NegativeKeywordProposal[] = [];
  const evidence: z.infer<typeof negativeKeywordEvidenceSchema>[] = [];
  const proposalKeys = new Set<string>();

  for (const rows of groups.values()) {
    const primary = rows[0]!; const text = primary.searchTerm.trim(); const normalizedText = normalize(text);
    const campaign = campaigns.get(primary.campaignId);
    const metrics = observedMetrics(rows);
    const normalizedCampaignName = normalize(primary.campaignName);
    const isBrand = termTokens(normalizedCampaignName).includes("brand") && !/(?:^| )non brand(?: |$)/.test(normalizedCampaignName);
    const explicitlyProtected = explicitProtected.some((term) => substantiallyIdentical(text, term) || containsNormalizedPhrase(text, term));
    const intentionallyTargeted = enabledKeywords.some((keyword) => keyword.campaignId === primary.campaignId && normalize(keyword.adGroup) === normalize(primary.adGroup) && substantiallyIdentical(text, keyword.keyword));
    if (isBrand || explicitlyProtected || intentionallyTargeted || metrics.conversions > 0 || (metrics.conversionValue ?? 0) > 0) { exclusions.protected++; continue; }
    const campaignSpend = nonnegative(campaign?.metrics.cost);
    const material = Boolean(campaign && metrics.clicks >= thresholds.minimumClicks && metrics.spend >= thresholds.minimumSpend && campaignSpend > 0 && metrics.spend >= campaignSpend * thresholds.minimumCampaignSpendShare);
    if (!material) { exclusions.belowThreshold++; continue; }

    // Exact is deliberately the automatic default. Phrase/broad remain valid schema values for a later human-authored workflow.
    const matchType: NegativeKeywordMatchType = "exact";
    const relatedTargets = enabledKeywords.filter((keyword) => keyword.campaignId === primary.campaignId && normalize(keyword.adGroup) === normalize(primary.adGroup));
    if (relatedTargets.some((keyword) => wouldConflict(text, matchType, keyword.keyword))) { exclusions.conflict++; continue; }
    if (existing?.some((item) => item.campaignId === primary.campaignId && normalize(item.adGroup ?? "") === normalize(primary.adGroup) && item.matchType === matchType && substantiallyIdentical(item.text, text))) { exclusions.duplicate++; continue; }
    const scopeKey = `${primary.campaignId}|${normalize(primary.adGroup)}|${normalizedText}|${matchType}`;
    if (proposalKeys.has(scopeKey)) { exclusions.duplicate++; continue; }
    proposalKeys.add(scopeKey);

    const evidenceIds = rows.map((row, index) => `negative-keyword:v1:evidence:${slug(input.workspace.id)}:${slug(row.campaignId)}:${slug(row.id || `${normalizedText}-${index}`)}`);
    rows.forEach((row, index) => evidence.push(negativeKeywordEvidenceSchema.parse({
      id: evidenceIds[index], source: "google_ads_search_term", sourceRowId: row.id, searchTerm: row.searchTerm,
      campaignId: row.campaignId, campaignName: row.campaignName, adGroup: row.adGroup.trim() || null,
      metrics: observedMetrics([row]), analysisPeriod: input.dateRangeLabel,
    })));
    const scope = primary.adGroup.trim()
      ? { level: "ad_group" as const, campaignId: primary.campaignId, campaignName: primary.campaignName, adGroup: primary.adGroup }
      : { level: "campaign" as const, campaignId: primary.campaignId, campaignName: primary.campaignName };
    const strong = metrics.clicks >= thresholds.minimumClicks * 2 && metrics.spend >= thresholds.minimumSpend * 2;
    const uncertainty = input.completedPeriod ? ["Historical performance does not guarantee future savings; intent and lead quality still require marketer review."] : ["This reporting window may include recent traffic whose conversions have not yet been reported.", "Historical performance does not guarantee future savings; intent and lead quality still require marketer review."];
    proposals.push(negativeKeywordProposalSchema.parse({
      id: `negative-keyword:v1:${slug(input.workspace.id)}:${slug(primary.campaignId)}:${slug(primary.adGroup || "campaign")}:${slug(text)}:${matchType}`,
      schemaVersion: NEGATIVE_KEYWORD_SCHEMA_VERSION, workspaceId: input.workspace.id,
      sourceSearchTerm: { id: primary.id, text, relatedRowIds: rows.map((row) => row.id) }, proposedNegativeKeyword: text, matchType, scope,
      rationale: `This search term recorded ${metrics.clicks} clicks and ${metrics.spend.toFixed(2)} in historical spend with no recorded conversions or conversion value. Exact match limits the proposal to this observed query while a marketer reviews intent.`,
      evidenceIds, metrics, historicalAffectedTraffic: metrics, strength: strong ? "strong" : "moderate", status: "proposed",
      conflictChecks: ["Not a Brand campaign term.", "Not substantially identical to an explicit protected term or enabled keyword in the same scope.", "No recorded conversions or conversion value.", existing ? "No duplicate found in the supplied existing-negative set." : "Existing negative-keyword coverage is unavailable; duplicate detection is incomplete."],
      uncertainty, generatedAt, analysisPeriod: input.dateRangeLabel,
    }));
  }

  proposals.sort((a, b) => b.historicalAffectedTraffic.spend - a.historicalAffectedTraffic.spend || a.id.localeCompare(b.id));
  const result = {
    schemaVersion: NEGATIVE_KEYWORD_SCHEMA_VERSION, workspace: input.workspace, generatedAt,
    recommendationOnly: true as const, googleAdsChangesMade: false as const,
    status: input.searchTerms.length === 0 ? "insufficient_evidence" as const : proposals.length ? "ready" as const : "no_candidates" as const,
    source: { type: input.source, label: input.sourceLabel, searchTermRowCount: input.searchTerms.length },
    analysisPeriod: { label: input.dateRangeLabel, completionStatus: input.completedPeriod ? "completed" as const : "may_include_recent_data" as const },
    existingNegativeKeywordCoverage: existing ? "available" as const : "unavailable" as const,
    proposals, evidence, exclusions,
    limitations: [
      "Recommendation only. No Google Ads changes have been made.",
      "Historical affected traffic is observed reporting-period traffic, not forecast or guaranteed future savings.",
      existing ? "Duplicate checks used the supplied existing-negative set." : "The normalized Google Ads adapter does not currently load existing negative keywords, so duplicate detection is limited to this generated set.",
      input.completedPeriod ? "The supplied analysis period is treated as completed, but attribution definitions and offline conversion imports still require review." : "The reporting period may include recent traffic; higher thresholds are used, but conversion lag remains unresolved.",
      "Exact-match proposals are intentionally conservative. Phrase and broad are supported schema values but are not selected automatically by this generator.",
      "Campaign and ad-group mapping reflects the source row; missing ad-group names fall back to campaign-level proposals only.",
    ],
    ai: { status: "not_configured" as const, detail: "Deterministic proposal order and application-owned rationale are shown." },
  };
  return negativeKeywordProposalResultSchema.parse(result);
}
