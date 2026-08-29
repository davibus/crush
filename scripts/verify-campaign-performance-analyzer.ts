import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  analyzeCampaignPerformance,
  CAMPAIGN_ANALYSIS_CATEGORIES,
  prepareCampaignPerformanceAnalysis,
  validateCampaignAnalysisResponse,
  type CampaignAnalysisCategory,
} from "../lib/campaign-performance-analyzer.ts";
import {
  aggregateGoogleAdsMetrics,
  calculateGoogleAdsMetrics,
  type GoogleAdsConversion,
  type GoogleAdsDevice,
  type GoogleAdsGeography,
  type GoogleAdsKeyword,
  type GoogleAdsSampleData,
  type GoogleAdsSearchTerm,
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
const conversionData = await loadJson<{ conversions: GoogleAdsConversion[] }>(
  "../data/google-ads-conversions.json",
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
  conversions: conversionData.conversions,
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
assert.equal(sampleAnalysis.dimensionAvailability.conversions, true);
assert.deepEqual(
  sampleAnalysis.accountMetrics,
  aggregateGoogleAdsMetrics(
    campaignData.campaigns.map((campaign) => campaign.metrics),
  ),
  "Account evidence does not agree with the issue #4 aggregate metric function.",
);
for (const campaign of campaignData.campaigns) {
  assert.deepEqual(
    sampleAnalysis.campaigns.find((item) => item.id === campaign.id)?.metrics,
    calculateGoogleAdsMetrics(campaign.metrics),
    `Campaign evidence for ${campaign.name} does not agree with issue #4 metrics.`,
  );
}
for (const geography of geographyData.locations) {
  assert.deepEqual(
    sampleAnalysis.geographies.find((item) => item.id === geography.id)?.metrics,
    calculateGoogleAdsMetrics(geography),
    `Geography evidence for ${geography.location} does not agree with issue #4 metrics.`,
  );
}
for (const keyword of keywordData.keywords) {
  assert.deepEqual(
    sampleAnalysis.keywords.find((item) => item.id === keyword.id)?.metrics,
    calculateGoogleAdsMetrics(keyword),
    `Keyword evidence for ${keyword.keyword} does not agree with issue #4 metrics.`,
  );
}
for (const searchTerm of searchTermData.searchTerms) {
  assert.deepEqual(
    sampleAnalysis.searchTerms.find((item) => item.id === searchTerm.id)?.metrics,
    calculateGoogleAdsMetrics(searchTerm),
    `Search-term evidence for ${searchTerm.searchTerm} does not agree with issue #4 metrics.`,
  );
}
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
assert.ok(
  sampleAnalysis.candidates.every(
    (candidate) => candidate.finding.trim() && candidate.actionDirection.trim(),
  ),
  "Every sample finding must provide a specific recommendation direction.",
);
const negativeKeywordCandidate = sampleAnalysis.candidates.find(
  (candidate) => candidate.category === "negative_keyword_opportunity",
);
assert.ok(
  negativeKeywordCandidate?.evidence.some((item) =>
    item.context.includes(
      'Matched keyword "google ads management" is enabled phrase match.',
    ),
  ),
  "Negative-keyword evidence did not use the matching keyword dataset.",
);
assert.ok(
  sampleAnalysis.candidates.some((candidate) =>
    candidate.evidence.some((item) =>
      item.metric.endsWith("conversion value"),
    ),
  ),
  "Campaign evidence did not use the conversion-action dataset.",
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

const usefulCandidates = [
  "high_cpa",
  "strong_performer",
  "budget_opportunity",
  "geographic_opportunity",
  "negative_keyword_opportunity",
].map((category) => {
  const selected = sampleAnalysis.candidates.find(
    (candidate) => candidate.category === category,
  );
  assert.ok(selected, `No sample candidate was available for ${category}.`);
  return selected;
});
const usefulRecommendations = await analyzeCampaignPerformance(
  sampleAnalysis,
  "Return the most useful recommendations.",
  async () => ({
    insights: usefulCandidates.map((item) => ({
      problemOpportunity: item.finding,
      severity: item.severity,
      affectedEntity: item.entity,
      evidence: item.evidence.slice(0, 3),
      recommendedAction: item.actionDirection,
      expectedImpact:
        "Improve measured efficiency or scale while monitoring the cited evidence.",
      confidenceScore: 0.9,
    })),
  }),
);
assert.ok(
  usefulRecommendations.success && usefulRecommendations.insights.length === 5,
  "The sample did not produce five useful, schema-valid recommendations.",
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

const fabricatedContext = structuredClone(validPayload);
fabricatedContext.insights[0].evidence[0].context = "Unsupported comparison.";
assert.equal(
  validateCampaignAnalysisResponse(fabricatedContext, sampleAnalysis).success,
  false,
  "Fabricated evidence context was accepted.",
);

const unsupportedSeverity = structuredClone(validPayload);
unsupportedSeverity.insights[0].severity = "critical";
assert.equal(
  validateCampaignAnalysisResponse(unsupportedSeverity, sampleAnalysis).success,
  false,
  "A severity unsupported by deterministic rules was accepted.",
);

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
const zeroConversionCandidate = zeroConversionAnalysis.candidates.find(
  (candidate) => candidate.category === "high_spend_low_conversions",
);
assert.ok(
  zeroConversionCandidate,
  "High-spend zero-conversion data was not detected.",
);
assert.equal(zeroConversionCandidate.severity, "critical");
assert.match(zeroConversionCandidate.actionDirection, /stop or constrain waste/i);
assert.ok(
  zeroConversionCandidate.evidence.some(
    (item) => item.metric === "Spend" && item.value === 2_000,
  ) &&
    zeroConversionCandidate.evidence.some(
      (item) => item.metric === "Conversions" && item.value === 0,
    ),
  "The zero-conversion recommendation lacks concrete spend and conversion evidence.",
);
assert.ok(
  Object.values(zeroConversionAnalysis.accountMetrics).every(Number.isFinite),
  "Zero conversions produced a non-finite calculated metric.",
);

const zeroSpendAnalysis = prepareCampaignPerformanceAnalysis({
  campaignData: {
    account: { id: "zero-spend", name: "Zero Spend Test", currency: "USD" },
    campaigns: [
      {
        id: "no-spend-campaign",
        name: "No Spend Campaign",
        status: "ENABLED",
        channel: "SEARCH",
        dailyBudget: 50,
        metrics: {
          impressions: 1_000,
          clicks: 100,
          cost: 0,
          conversions: 0,
          conversionValue: 0,
        },
      },
    ],
  },
});
assert.ok(
  Object.values(zeroSpendAnalysis.accountMetrics).every(Number.isFinite),
  "Zero spend produced a non-finite calculated metric.",
);
assert.equal(
  zeroSpendAnalysis.candidates.some(
    (candidate) => candidate.category === "high_spend_low_conversions",
  ),
  false,
  "A zero-spend campaign was incorrectly labeled high spend.",
);
assert.deepEqual(
  zeroSpendAnalysis.dimensionAvailability,
  {
    campaigns: true,
    conversions: false,
    geographies: false,
    devices: false,
    keywords: false,
    searchTerms: false,
  },
  "Missing optional datasets were not handled safely.",
);

const lowVolumeAnalysis = prepareCampaignPerformanceAnalysis({
  campaignData: {
    account: { id: "low-volume", name: "Low Volume Test", currency: "USD" },
    campaigns: [
      {
        id: "low-volume-campaign",
        name: "Low Volume Campaign",
        status: "ENABLED",
        channel: "SEARCH",
        dailyBudget: 50,
        metrics: {
          impressions: 10,
          clicks: 1,
          cost: 100,
          conversions: 0,
          conversionValue: 0,
        },
      },
    ],
  },
});
assert.deepEqual(
  lowVolumeAnalysis.candidates,
  [],
  "Very-low-volume data generated an unsupported recommendation.",
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
    conversions: 0,
    conversionValue: 0,
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
  `Campaign analyzer verification passed: ${sampleAnalysis.candidates.length} sample candidates across ${sampleCategories.size} supported categories, plus metric parity, device, zero-conversion, zero-spend, low-volume, missing-dataset, malformed-output, fabricated-evidence, empty-data, and API-failure paths.`,
);
