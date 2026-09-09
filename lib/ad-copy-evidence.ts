import "server-only";

import type { ClientWorkspace } from "./clients.ts";
import type { CompetitorAnalysis } from "./competitor-analysis.ts";
import { AD_COPY_SCHEMA_VERSION, adCopyEvidencePackSchema, type AdCopyEvidence, type AdCopyEvidencePack } from "./ad-copy-generation.ts";
import type { LandingPageAnalysis } from "./landing-page-analysis.ts";
import type { MarketingDataSet } from "./marketing-data-source.ts";

function textValue(value: string | number | boolean | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 300) : undefined;
}

function reusableBusinessText(value: string | number | boolean | undefined): string | undefined {
  const normalized = textValue(value);
  if (!normalized || /\b(?:ignore (?:all |any )?(?:previous|prior) instructions?|system prompt|developer message|reveal (?:a |the )?secret|api key|other tenants?|execute (?:a |the )?tool|publish (?:the |these )?ads?|upload (?:the |these )?ads?)\b/i.test(normalized)) return undefined;
  return normalized;
}

export function buildAdCopyEvidencePack(input: { workspace: ClientWorkspace; marketingData: MarketingDataSet; landingPage?: LandingPageAnalysis; competitorAnalysis?: CompetitorAnalysis; objective?: string; builtAt?: string }): AdCopyEvidencePack {
  const { workspace, marketingData, landingPage, competitorAnalysis } = input;
  const fictional = marketingData.source === "sample" || landingPage?.retrieval.source === "demo_fixture";
  const evidence: AdCopyEvidence[] = [];
  const add = (item: AdCopyEvidence | undefined) => { if (item && !evidence.some((existing) => existing.id === item.id)) evidence.push(item); };
  if (landingPage) {
    const mappings = [["lp:page:title", "title", "business_language"], ["lp:page:meta_description", "meta", "business_language"], ["lp:page:h1", "h1", "business_language"], ["lp:page:h2", "h2", "business_language"], ["lp:page:ctas", "ctas", "cta"]] as const;
    for (const [sourceId, suffix, kind] of mappings) {
      const value = reusableBusinessText(landingPage.evidence.find((item) => item.id === sourceId)?.value);
      if (value) add({ id: `ac:first_party:landing:${suffix}`, scope: "first_party", source: "workspace_landing_page", kind, text: value, reusePolicy: "claim_and_theme", observed: true, fictional: landingPage.retrieval.source === "demo_fixture" });
    }
  }
  [...marketingData.keywords].sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks).slice(0, 6).forEach((row) => add({ id: `ac:first_party:ads:keyword:${row.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`, scope: "first_party", source: "google_ads_keyword", kind: "search_theme", text: row.keyword.slice(0, 300), reusePolicy: "theme_only", observed: true, fictional: marketingData.source === "sample" }));
  [...marketingData.searchTerms].sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks).slice(0, 6).forEach((row) => add({ id: `ac:first_party:ads:search-term:${row.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`, scope: "first_party", source: "google_ads_search_term", kind: "search_theme", text: row.searchTerm.slice(0, 300), reusePolicy: "theme_only", observed: true, fictional: marketingData.source === "sample" }));
  marketingData.campaignData.campaigns.filter((row) => row.channel === "SEARCH").slice(0, 4).forEach((row) => add({ id: `ac:first_party:ads:campaign:${row.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`, scope: "first_party", source: "google_ads_campaign", kind: "campaign_context", text: row.name.slice(0, 300), reusePolicy: "theme_only", observed: true, fictional: marketingData.source === "sample" }));
  if (marketingData.searchConsole.status === "available") marketingData.searchConsole.data.reports.find((report) => report.dimension === "query")?.rows.filter((row) => row.query).sort((a, b) => b.impressions - a.impressions).slice(0, 5).forEach((row, index) => add({ id: `ac:first_party:seo:query:${index + 1}`, scope: "first_party", source: "search_console_query", kind: "search_theme", text: row.query!.slice(0, 300), reusePolicy: "theme_only", observed: true, fictional: false }));
  if (competitorAnalysis) [...competitorAnalysis.patterns, ...competitorAnalysis.opportunities].slice(0, 5).forEach((finding, index) => add({ id: `ac:external:competitor:pattern:${index + 1}`, scope: "competitor", source: "competitor_page", kind: "competitor_pattern", text: finding.statement.slice(0, 300), reusePolicy: "differentiation_only", observed: true, fictional: competitorAnalysis.demo }));
  return adCopyEvidencePackSchema.parse({
    schemaVersion: AD_COPY_SCHEMA_VERSION,
    workspace: { id: workspace.id, name: workspace.name },
    builtAt: input.builtAt ?? new Date().toISOString(),
    objective: input.objective?.trim() || null,
    fictional,
    sourceStatus: [
      { source: "workspace_landing_page", status: landingPage ? "available" : "unavailable", detail: landingPage ? "Validated workspace landing-page language is available for factual reuse." : "No recent validated workspace landing-page analysis is stored." },
      { source: "google_ads", status: marketingData.keywords.length || marketingData.searchTerms.length ? "available" : "unavailable", detail: marketingData.keywords.length || marketingData.searchTerms.length ? `${marketingData.sourceLabel}; keyword and paid search-term themes remain distinct.` : "No normalized keyword or search-term rows are available." },
      { source: "search_console", status: marketingData.searchConsole.status === "available" ? "available" : "unavailable", detail: marketingData.searchConsole.status === "available" ? "Organic query language is available as an organic theme, not a paid keyword." : "Search Console organic query evidence is unavailable." },
      { source: "competitor_analysis", status: competitorAnalysis ? "available" : "unavailable", detail: competitorAnalysis ? "Competitor patterns are differentiation-only and cannot substantiate first-party claims." : "No recent validated competitor analysis is stored." },
    ],
    evidence: evidence.slice(0, 40),
  });
}
