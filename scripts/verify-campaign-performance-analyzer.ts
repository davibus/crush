import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  analyzeCampaignPerformance,
  CAMPAIGN_ANALYSIS_CATEGORIES,
  prepareCampaignPerformanceAnalysis,
  validateCampaignAnalysisResponse,
  type CampaignAnalysisCategory,
} from "../lib/campaign-performance-analyzer.ts";
import type {
  GoogleAdsDevice,
  GoogleAdsGeography,
  GoogleAdsKeyword,
  GoogleAdsSampleData,
  GoogleAdsSearchTerm,
} from "../lib/google-ads.ts";
import { validateMarketingInsights } from "../lib/marketing-insights.ts";

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(
    await readFile(new URL(path, import.meta.url), "utf8"),
  ) as T;
}

const campaignData = await loadJson<GoogleAdsSampleData>(
  "../data/google-ads-sample.json",
);
const geographyData = await loadJson<{ locations: GoogleAdsGeography[] }>(
  "../data/google-ads-geography.json",
);
const keywordData = await loadJson<{ keywords: GoogleAdsKeyword[] }>(
  "../data/google-ads-keywords.json",
);
const searchTermData = await loadJson<{ searchTerms: GoogleAdsSearchTerm[] }>(
  "../data/google-ads-search-terms.json",
);

const sampleAnalysis = prepareCampaignPerformanceAnalysis({
  campaignData,
  geographies: geographyData.locations,
  keywords: keywordData.keywords,
  searchTerms: searchTermData.searchTerms,
});
const sampleCategories = new Set(
  sampleAnalysis.candidates.map((candidate) => candidate.category),
);
const expectedSampleCategories: CampaignAnalysisCategory[] = [
  "high_cpa",
  "low_conversion_rate",
  "high_spend_low_conversions",
  "strong_performer",
  "budget_opportunity",
  "geographic_opportunity",
  "search_term_waste",
  "negative_keyword_opportunity",
];

for (const category of expectedSampleCategories) {
  assert.ok(sampleCategories.has(category), `Sample did not detect ${category}.`);
}
assert.equal(
  sampleCategories.has("device_performance_difference"),
  false,
  "Device findings must not be fabricated without device data.",
);
assert.equal(sampleAnalysis.dimensionAvailability.devices, false);
assert.ok(
  sampleAnalysis.candidates.every((candidate) => candidate.evidence.length > 0),
  "Every candidate must include evidence.",
);
assert.ok(
  sampleAnalysis.candidates
    .flatMap((candidate) => candidate.evidence)
    .every((evidence) => Number.isFinite(evidence.value)),
  "Candidate evidence must contain only finite values.",
);

const firstCandidate = sampleAnalysis.candidates[0];
assert.ok(firstCandidate, "The sample must produce at least one candidate.");
const validPayload = {
  insights: [
    {
      problemOpportunity: firstCandidate.finding,
      severity: firstCandidate.severity,
      affectedEntity: firstCandidate.entity,
      evidence: firstCandidate.evidence.slice(0, 3),
      recommendedAction: firstCandidate.actionDirection,
      expectedImpact: "Improve efficiency while preserving measured conversion volume.",
      confidenceScore: 0.9,
    },
  ],
};
const successfulAnalysis = await analyzeCampaignPerformance(
  sampleAnalysis,
  "Find the strongest optimization opportunities.",
  async (prompt) => {
    assert.match(prompt, /already calculated all basic metrics/);
    assert.match(prompt, /negative_keyword_opportunity/);
    return validPayload;
  },
);
assert.ok(successfulAnalysis.success, "A valid generated insight was rejected.");
assert.ok(
  validateMarketingInsights({ insights: successfulAnalysis.insights }).success,
  "Generated insights failed the issue #6 schema.",
);

const malformed = await analyzeCampaignPerformance(
  sampleAnalysis,
  "Analyze",
  async () => ({ recommendations: [] }),
);
assert.equal(malformed.success, false, "Malformed AI output was accepted.");
assert.deepEqual(malformed.insights, []);

const fabricatedEvidence = structuredClone(validPayload);
fabricatedEvidence.insights[0].evidence[0].value += 1;
const unsupported = validateCampaignAnalysisResponse(
  fabricatedEvidence,
  sampleAnalysis,
);
assert.equal(unsupported.success, false, "Fabricated evidence was accepted.");
assert.deepEqual(unsupported.insights, []);

const failedRequest = await analyzeCampaignPerformance(
  sampleAnalysis,
  "Analyze",
  async () => {
    throw new Error("Simulated API failure");
  },
);
assert.equal(failedRequest.success, false, "AI failure was not handled safely.");
assert.deepEqual(failedRequest.insights, []);

const zeroConversionData: GoogleAdsSampleData = {
  account: { id: "zero-account", name: "Zero Conversion Test", currency: "USD" },
  campaigns: [
    {
      id: "zero-campaign",
      name: "High Spend Zero Conversions",
      status: "ENABLED",
      channel: "SEARCH",
      dailyBudget: 100,
      metrics: {
        impressions: 10_000,
        clicks: 500,
        cost: 2_000,
        conversions: 0,
        conversionValue: 0,
      },
    },
  ],
};
const zeroConversionAnalysis = prepareCampaignPerformanceAnalysis({
  campaignData: zeroConversionData,
});
assert.ok(
  zeroConversionAnalysis.candidates.some(
    (candidate) => candidate.category === "high_spend_low_conversions",
  ),
  "High-spend zero-conversion data was not detected.",
);
assert.ok(
  Object.values(zeroConversionAnalysis.accountMetrics).every(Number.isFinite),
  "Zero conversions produced a non-finite calculated metric.",
);

const deviceRows: GoogleAdsDevice[] = [
  {
    id: "device-mobile",
    campaignId: "camp-002",
    campaignName: "Non-Brand Search",
    device: "Mobile",
    impressions: 5_000,
    clicks: 500,
    cost: 1_000,
    conversions: 50,
    conversionValue: 6_500,
  },
  {
    id: "device-desktop",
    campaignId: "camp-002",
    campaignName: "Non-Brand Search",
    device: "Desktop",
    impressions: 5_000,
    clicks: 500,
    cost: 1_000,
    conversions: 10,
    conversionValue: 1_300,
  },
];
const deviceAnalysis = prepareCampaignPerformanceAnalysis({
  campaignData,
  devices: deviceRows,
});
assert.ok(
  deviceAnalysis.candidates.some(
    (candidate) => candidate.category === "device_performance_difference",
  ),
  "A supported device performance difference was not detected.",
);

const emptyAnalysis = prepareCampaignPerformanceAnalysis({
  campaignData: {
    account: { id: "empty", name: "Empty", currency: "USD" },
    campaigns: [],
  },
});
assert.deepEqual(emptyAnalysis.candidates, []);
assert.ok(
  Object.values(emptyAnalysis.accountMetrics).every(Number.isFinite),
  "Empty input produced a non-finite calculated metric.",
);

assert.equal(CAMPAIGN_ANALYSIS_CATEGORIES.length, 9);
console.log(
  `Campaign analyzer verification passed: ${sampleAnalysis.candidates.length} sample candidates across ${sampleCategories.size} supported categories, plus device, zero-conversion, malformed-output, fabricated-evidence, empty-data, and API-failure paths.`,
);
