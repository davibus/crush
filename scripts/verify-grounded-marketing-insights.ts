import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  analyzeCampaignPerformance,
  prepareCampaignPerformanceAnalysis,
  validateCampaignAnalysisResponse,
  type CampaignAnalysisCandidate,
  type PreparedCampaignPerformanceAnalysis,
} from "../lib/campaign-performance-analyzer.ts";
import type {
  GoogleAdsDevice,
  GoogleAdsSampleData,
} from "../lib/google-ads.ts";
import type { MarketingInsight } from "../lib/marketing-insights.ts";

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(
    await readFile(new URL(path, import.meta.url), "utf8"),
  ) as T;
}

function insightFor(candidate: CampaignAnalysisCandidate): MarketingInsight {
  return {
    problemOpportunity: candidate.finding,
    severity: candidate.severity,
    affectedEntity: candidate.entity,
    evidence: structuredClone(candidate.requiredEvidence),
    recommendedAction: candidate.actionDirection,
    expectedImpact: candidate.expectedImpact,
    confidenceScore: 0.9,
  };
}

function validateOne(
  insight: MarketingInsight,
  analysis: PreparedCampaignPerformanceAnalysis,
) {
  return validateCampaignAnalysisResponse({ insights: [insight] }, analysis);
}

const campaignData = await loadJson<GoogleAdsSampleData>(
  "../data/google-ads-sample.json",
);
const analysis = prepareCampaignPerformanceAnalysis({ campaignData });
const candidate = analysis.candidates[0];
assert.ok(candidate, "The sample campaign data must produce a candidate.");

const supported = validateOne(insightFor(candidate), analysis);
assert.equal(supported.success, true, "A supported insight was rejected.");
assert.equal(
  supported.success && supported.status,
  "grounded_insights",
  "A supported insight did not receive grounded status.",
);

const inventedCampaign = insightFor(candidate);
inventedCampaign.affectedEntity = {
  type: "campaign",
  id: "invented-campaign",
  name: "Imaginary Competitor Campaign",
};
assert.equal(
  validateOne(inventedCampaign, analysis).success,
  false,
  "An invented campaign was accepted.",
);

const inventedMetric = insightFor(candidate);
inventedMetric.evidence[0] = {
  ...inventedMetric.evidence[0],
  metric: "Quality score",
};
assert.equal(
  validateOne(inventedMetric, analysis).success,
  false,
  "An invented metric was accepted.",
);

const alteredMetricValue = insightFor(candidate);
alteredMetricValue.evidence[0].value += 1;
assert.equal(
  validateOne(alteredMetricValue, analysis).success,
  false,
  "A materially altered metric value was accepted.",
);

const recommendationWithoutEvidence = insightFor(candidate);
recommendationWithoutEvidence.evidence = [];
assert.equal(
  validateOne(recommendationWithoutEvidence, analysis).success,
  false,
  "A recommendation without evidence was accepted.",
);

const unsupportedCause = insightFor(candidate);
unsupportedCause.problemOpportunity =
  `${candidate.finding} CPA is high because the landing page is bad.`;
assert.equal(
  validateOne(unsupportedCause, analysis).success,
  false,
  "An unsupported causal explanation was accepted.",
);

assert.deepEqual(
  analysis.dimensionAvailability,
  {
    campaigns: true,
    conversions: false,
    geographies: false,
    devices: false,
    keywords: false,
    searchTerms: false,
    webAnalytics: false,
  },
  "The incomplete dataset did not report unavailable dimensions.",
);
const inventedGeography = insightFor(candidate);
inventedGeography.affectedEntity = {
  type: "geography",
  id: "mars",
  name: "Mars",
};
assert.equal(
  validateOne(inventedGeography, analysis).success,
  false,
  "An unavailable geography was accepted from incomplete data.",
);

const misleadingCampaignData: GoogleAdsSampleData = {
  account: {
    id: "misleading-account",
    name: "Misleading Device Data",
    currency: "USD",
  },
  campaigns: [
    {
      id: "device-campaign",
      name: "Device Comparison",
      status: "ENABLED",
      channel: "SEARCH",
      dailyBudget: 100,
      metrics: {
        impressions: 20_000,
        clicks: 1_000,
        cost: 2_000,
        conversions: 55,
        conversionValue: 5_500,
      },
    },
  ],
};
const deviceRows: GoogleAdsDevice[] = [
  {
    id: "mobile",
    campaignId: "device-campaign",
    campaignName: "Device Comparison",
    device: "Mobile",
    impressions: 10_000,
    clicks: 500,
    cost: 1_000,
    conversions: 5,
    conversionValue: 500,
  },
  {
    id: "desktop",
    campaignId: "device-campaign",
    campaignName: "Device Comparison",
    device: "Desktop",
    impressions: 10_000,
    clicks: 500,
    cost: 1_000,
    conversions: 50,
    conversionValue: 5_000,
  },
];
const misleadingAnalysis = prepareCampaignPerformanceAnalysis({
  campaignData: misleadingCampaignData,
  devices: deviceRows,
});
const deviceCandidate = misleadingAnalysis.candidates.find(
  (item) => item.category === "device_performance_difference",
);
assert.ok(deviceCandidate, "The misleading dataset needs a device candidate.");
const misleadingConclusion = insightFor(deviceCandidate);
misleadingConclusion.problemOpportunity =
  "Mobile converts worse because mobile users have lower intent and the audience is fatigued.";
misleadingConclusion.recommendedAction =
  "Replace the mobile landing page because it is causing the performance gap.";
assert.equal(
  validateOne(misleadingConclusion, misleadingAnalysis).success,
  false,
  "A tempting but unsupported explanation was accepted.",
);
assert.equal(
  validateOne(insightFor(deviceCandidate), misleadingAnalysis).success,
  true,
  "The supported observation in the misleading dataset was rejected.",
);

const lowVolumeAnalysis = prepareCampaignPerformanceAnalysis({
  campaignData: {
    account: { id: "sparse", name: "Sparse Data", currency: "USD" },
    campaigns: [
      {
        id: "sparse-campaign",
        name: "Sparse Campaign",
        status: "ENABLED",
        channel: "SEARCH",
        dailyBudget: 25,
        metrics: {
          impressions: 10,
          clicks: 1,
          cost: 2,
          conversions: 0,
          conversionValue: 0,
        },
      },
    ],
  },
});
let generatorCalled = false;
const insufficient = await analyzeCampaignPerformance(
  lowVolumeAnalysis,
  "Force a recommendation despite the sparse data.",
  async () => {
    generatorCalled = true;
    return { insights: [insightFor(candidate)] };
  },
);
assert.equal(generatorCalled, false, "The generator ran without any candidates.");
assert.equal(insufficient.success, true);
assert.equal(
  insufficient.success && insufficient.status,
  "insufficient_data",
  "Sparse data did not return explicit insufficient-data status.",
);
assert.deepEqual(insufficient.insights, []);

const roundingCandidate = analysis.candidates.find((item) =>
  item.requiredEvidence.some(
    (evidence) =>
      evidence.unit !== "count" &&
      Math.abs(evidence.value - Number(evidence.value.toFixed(2))) > 1e-9 &&
      Math.abs(evidence.value - Number(evidence.value.toFixed(2))) <= 0.005,
  ),
);
assert.ok(roundingCandidate, "No candidate exercised decimal rounding.");
const roundedInsight = insightFor(roundingCandidate);
const roundedEvidence = roundedInsight.evidence.find(
  (evidence) =>
    evidence.unit !== "count" &&
    Math.abs(evidence.value - Number(evidence.value.toFixed(2))) > 1e-9,
);
assert.ok(roundedEvidence, "No evidence value was available to round.");
const calculatedValue = roundedEvidence.value;
roundedEvidence.value = Number(roundedEvidence.value.toFixed(2));
const roundedResult = validateOne(roundedInsight, analysis);
assert.equal(roundedResult.success, true, "Valid two-decimal rounding was rejected.");
assert.equal(
  roundedResult.success && roundedResult.insights[0]?.evidence.find(
    (item) => item.metric === roundedEvidence.metric,
  )?.value,
  calculatedValue,
  "Rounded evidence was not normalized to the deterministic value.",
);

console.log(
  "Grounded marketing insight verification passed: supported output, invented entity, invented metric, altered value, missing evidence, unsupported cause, incomplete data, misleading data, insufficient data, and floating-point rounding.",
);
