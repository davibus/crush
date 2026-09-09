import "server-only";

import type { AdCopyDraftResult } from "./ad-copy-generation.ts";
import type { ClientWorkspace } from "./clients.ts";
import type { CompetitorAnalysis } from "./competitor-analysis.ts";
import { LANDING_PAGE_DRAFT_VERSION, landingPageEvidencePackSchema, type LandingPageBrief, type LandingPageEvidence, type LandingPageEvidencePack } from "./landing-page-generation.ts";
import type { LandingPageAnalysis } from "./landing-page-analysis.ts";
import type { MarketingDataSet } from "./marketing-data-source.ts";

const instructionPattern = /\b(?:ignore (?:all |any )?(?:previous|prior) instructions?|system prompt|developer message|reveal (?:a |the )?(?:secret|api key)|other tenants?|execute (?:a |the )?tool|publish|deploy|change (?:ads?|bids?|budgets?))\b/i;

function clean(value: string | number | boolean | undefined, maximum = 600): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized && !instructionPattern.test(normalized) ? normalized.slice(0, maximum) : undefined;
}

function slug(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "item";
}

export function buildLandingPageEvidencePack(input: {
  workspace: ClientWorkspace;
  brief: LandingPageBrief;
  marketingData: MarketingDataSet;
  landingPage?: LandingPageAnalysis;
  competitorAnalysis?: CompetitorAnalysis;
  adCopyDraft?: AdCopyDraftResult;
  builtAt?: string;
}): LandingPageEvidencePack {
  const { workspace, brief, marketingData, landingPage, competitorAnalysis, adCopyDraft } = input;
  const evidence: LandingPageEvidence[] = [];
  const add = (item: LandingPageEvidence | undefined) => { if (item && !evidence.some((existing) => existing.id === item.id)) evidence.push(item); };
  const fictional = marketingData.source === "sample" || landingPage?.retrieval.source === "demo_fixture" || competitorAnalysis?.demo === true;
  const briefFacts = [
    ["page-name", "business_fact", brief.pageName, "claim_support"],
    ["offer", "business_fact", brief.offer, "claim_support"],
    ["audience", "audience", brief.targetAudience, "claim_support"],
    ["goal", "conversion_goal", brief.primaryConversionGoal, "claim_support"],
    ["brand", "brand_guidance", brief.brandGuidance, "theme_only"],
    ["cta", "cta", brief.ctaPreference, "theme_only"],
  ] as const;
  for (const [suffix, kind, value, reusePolicy] of briefFacts) {
    const text = value && clean(value);
    if (text) add({ id: `lpg:first_party:brief:${suffix}`, scope: "first_party", source: "user_brief", kind, text, reusePolicy, fictional: false });
  }
  brief.factualClaims.forEach((value, index) => {
    const text = clean(value);
    if (text) add({ id: `lpg:first_party:brief:claim:${index + 1}`, scope: "first_party", source: "user_brief", kind: "business_fact", text, reusePolicy: "claim_support", fictional: false });
  });

  if (landingPage) {
    const mappings = [["lp:page:title", "title"], ["lp:page:meta_description", "meta"], ["lp:page:h1", "h1"], ["lp:page:h2", "h2"], ["lp:page:ctas", "cta"]] as const;
    for (const [sourceId, suffix] of mappings) {
      const text = clean(landingPage.evidence.find((item) => item.id === sourceId)?.value);
      if (text && !/^(?:not present|none detected)$/i.test(text)) add({ id: `lpg:first_party:landing:${suffix}`, scope: "first_party", source: "landing_page_analysis", kind: suffix === "cta" ? "cta" : "page_observation", text, reusePolicy: "claim_support", fictional: landingPage.retrieval.source === "demo_fixture" });
    }
  }

  [...marketingData.campaignData.campaigns].sort((a, b) => b.metrics.conversions - a.metrics.conversions || b.metrics.clicks - a.metrics.clicks).slice(0, 4).forEach((campaign) => {
    const text = `${campaign.name}: ${campaign.metrics.clicks} clicks and ${campaign.metrics.conversions} conversions in ${marketingData.dateRangeLabel}.`;
    add({ id: `lpg:first_party:ads:campaign:${slug(campaign.id)}`, scope: "first_party", source: "google_ads", kind: "performance", text, reusePolicy: "claim_support", fictional: marketingData.source === "sample" });
  });
  [...marketingData.searchTerms].sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks).slice(0, 6).forEach((row) => add({ id: `lpg:first_party:ads:theme:${slug(row.id)}`, scope: "first_party", source: "google_ads", kind: "search_theme", text: row.searchTerm.slice(0, 600), reusePolicy: "theme_only", fictional: marketingData.source === "sample" }));

  if (marketingData.ga4.status === "available") {
    const { summary, dateRange } = marketingData.ga4.data;
    add({ id: "lpg:first_party:ga4:summary", scope: "first_party", source: "ga4", kind: "performance", text: `${summary.sessions} sessions and ${summary.keyEvents} key events from ${dateRange.startDate} through ${dateRange.endDate}.`, reusePolicy: "claim_support", fictional: false });
  }
  if (marketingData.searchConsole.status === "available") {
    marketingData.searchConsole.data.reports.find((report) => report.dimension === "query")?.rows.filter((row) => row.query).sort((a, b) => b.impressions - a.impressions).slice(0, 6).forEach((row, index) => add({ id: `lpg:first_party:search-console:query:${index + 1}`, scope: "first_party", source: "search_console", kind: "search_theme", text: row.query!.slice(0, 600), reusePolicy: "theme_only", fictional: false }));
  }
  if (competitorAnalysis) [...competitorAnalysis.patterns, ...competitorAnalysis.opportunities].slice(0, 6).forEach((finding, index) => {
    const text = clean(finding.statement);
    if (text) add({ id: `lpg:external:competitor:pattern:${index + 1}`, scope: "competitor", source: "competitor_analysis", kind: "competitor_pattern", text, reusePolicy: "differentiation_only", fictional: competitorAnalysis.demo });
  });
  if (adCopyDraft?.status === "ready" && adCopyDraft.draftOnly && !adCopyDraft.published) adCopyDraft.candidates[0]?.headlines.slice(0, 4).forEach((headline, index) => {
    const text = clean(headline);
    if (text) add({ id: `lpg:generated:ad-copy:headline:${index + 1}`, scope: "generated", source: "generated_ad_copy", kind: "generated_theme", text, reusePolicy: "theme_only", fictional: adCopyDraft.fictional });
  });

  const status = (available: boolean, yes: string, no: string) => ({ status: available ? "available" as const : "unavailable" as const, detail: available ? yes : no });
  return landingPageEvidencePackSchema.parse({
    schemaVersion: LANDING_PAGE_DRAFT_VERSION,
    workspace: { id: workspace.id, name: workspace.name },
    builtAt: input.builtAt ?? new Date().toISOString(),
    brief,
    fictional,
    sourceStatus: [
      { source: "user_brief", ...status(true, "Explicit user brief fields are available; only factual-claim fields may support business claims.", "The required brief is unavailable.") },
      { source: "landing_page_analysis", ...status(Boolean(landingPage), "Validated workspace landing-page observations are available as first-party evidence.", "No recent validated workspace landing-page analysis is stored.") },
      { source: "google_ads", ...status(marketingData.campaignData.campaigns.length > 0, "Workspace Google Ads performance and search themes are available with source boundaries.", "No normalized Google Ads evidence is available.") },
      { source: "ga4", ...status(marketingData.ga4.status === "available", "Workspace GA4 aggregate context is available.", "GA4 context is unavailable.") },
      { source: "search_console", ...status(marketingData.searchConsole.status === "available", "Workspace organic query themes are available.", "Search Console evidence is unavailable.") },
      { source: "competitor_analysis", ...status(Boolean(competitorAnalysis), "External competitor observations are differentiation-only inspiration.", "No recent validated competitor analysis is stored.") },
      { source: "generated_ad_copy", ...status(Boolean(adCopyDraft?.candidates.length), "A prior generated ad-copy draft is available as untrusted theme-only context, not factual evidence.", "No prior generated ad-copy draft is available.") },
    ],
    evidence: evidence.slice(0, 60),
  });
}
