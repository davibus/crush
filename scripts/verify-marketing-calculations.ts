import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { prepareCampaignPerformanceAnalysis } from "../lib/campaign-performance-analyzer.ts";
import {
  calculateGoogleAdsMetric,
  type GoogleAdsMetricKey,
  type GoogleAdsMetrics,
  type GoogleAdsSampleData,
} from "../lib/google-ads.ts";
import {
  resolveDeterministicCalculation,
  validateGroundedChatResponse,
} from "../lib/marketing-data-chat.ts";

const campaignData = JSON.parse(
  await readFile(
    new URL("../data/google-ads-sample.json", import.meta.url),
    "utf8",
  ),
) as GoogleAdsSampleData;
const analysis = prepareCampaignPerformanceAnalysis({ campaignData });
const brand = campaignData.campaigns.find(({ id }) => id === "camp-001");
assert.ok(brand, "The Brand Search fixture is missing.");

const expectedValues: Partial<Record<GoogleAdsMetricKey, number>> = {
  ctr: (1_245 / 12_840) * 100,
  cpc: 1_867.5 / 1_245,
  conversionRate: (96 / 1_245) * 100,
  cpa: 1_867.5 / 96,
  roas: 12_480 / 1_867.5,
};

for (const [metric, expected] of Object.entries(expectedValues) as Array<
  [GoogleAdsMetricKey, number]
>) {
  const calculation = calculateGoogleAdsMetric(brand.metrics, metric);
  assert.equal(calculation.status, "calculated", `${metric} was unavailable.`);
  assert.equal(
    calculation.status === "calculated" ? calculation.value : null,
    expected,
    `${metric} did not equal the arithmetic from the source fixture.`,
  );
}

function expectInsufficient(
  metric: GoogleAdsMetricKey,
  metrics: GoogleAdsMetrics | (Omit<GoogleAdsMetrics, "conversionValue"> & { conversionValue?: number }),
  reasonPattern: RegExp,
) {
  const calculation = calculateGoogleAdsMetric(metrics, metric);
  assert.equal(calculation.status, "insufficient_data", `${metric} should be undefined.`);
  assert.match(
    calculation.status === "insufficient_data" ? calculation.reason : "",
    reasonPattern,
  );
  assert.equal("value" in calculation, false, `${metric} exposed a misleading result.`);
}

expectInsufficient(
  "ctr",
  { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 },
  /Impressions is zero/,
);
expectInsufficient(
  "cpc",
  { impressions: 100, clicks: 0, cost: 50, conversions: 0, conversionValue: 0 },
  /Clicks is zero/,
);
expectInsufficient(
  "conversionRate",
  { impressions: 100, clicks: 0, cost: 50, conversions: 0, conversionValue: 0 },
  /Clicks is zero/,
);
expectInsufficient(
  "cpa",
  { impressions: 100, clicks: 10, cost: 50, conversions: 0, conversionValue: 0 },
  /Conversions is zero/,
);
expectInsufficient(
  "roas",
  { impressions: 100, clicks: 10, cost: 0, conversions: 2, conversionValue: 50 },
  /Spend is zero/,
);
expectInsufficient(
  "roas",
  { impressions: 100, clicks: 10, cost: 50, conversions: 2 },
  /Conversion value is not available/,
);

const zeroConversions = calculateGoogleAdsMetric(
  { impressions: 100, clicks: 10, cost: 50, conversions: 0, conversionValue: 0 },
  "conversionRate",
);
assert.equal(zeroConversions.status, "calculated");
assert.equal(
  zeroConversions.status === "calculated" ? zeroConversions.value : null,
  0,
  "Zero conversions with nonzero clicks should produce a real 0% conversion rate.",
);
const zeroSpend = calculateGoogleAdsMetric(
  { impressions: 100, clicks: 10, cost: 0, conversions: 2, conversionValue: 50 },
  "spend",
);
assert.equal(zeroSpend.status, "calculated");
assert.equal(zeroSpend.status === "calculated" ? zeroSpend.value : null, 0);

const chatCases = [
  ["What is my CPA?", "cpa", analysis.accountMetrics.cpa],
  ["What percentage of clicks converted?", "conversionRate", analysis.accountMetrics.conversionRate],
  ["What is my ROAS?", "roas", analysis.accountMetrics.roas],
  ["How much did each conversion cost?", "cpa", analysis.accountMetrics.cpa],
  ["What is the CTR for Brand Search?", "ctr", expectedValues.ctr],
] as const;

for (const [question, metric, expected] of chatCases) {
  const candidate = resolveDeterministicCalculation(question, analysis);
  assert.ok(candidate, `No deterministic answer was resolved for: ${question}`);
  assert.equal(candidate.response.status, "supported");
  const calculation = candidate.response.calculations?.[0];
  assert.equal(calculation?.metric, metric);
  assert.equal(calculation?.result?.value, expected);
  assert.ok(calculation?.inputs.length, `${question} did not expose calculation inputs.`);
  assert.ok(calculation?.formula, `${question} did not expose a formula.`);
  assert.equal(validateGroundedChatResponse(candidate.response, [candidate]).success, true);
}

const campaignCtr = resolveDeterministicCalculation(
  "What is the CTR for Brand Search?",
  analysis,
);
assert.equal(campaignCtr?.response.referencedEntities[0]?.id, "camp-001");
assert.deepEqual(
  campaignCtr?.response.calculations?.[0]?.inputs.map(({ label, value }) => [label, value]),
  [
    ["Clicks", 1_245],
    ["Impressions", 12_840],
  ],
  "The campaign-specific answer did not use Brand Search source values.",
);

const lowestCpa = resolveDeterministicCalculation(
  "Which campaign has the lowest CPA?",
  analysis,
);
assert.match(lowestCpa?.response.answer ?? "", /Brand Search/);
assert.equal(lowestCpa?.response.calculations?.length, 4);

const roasComparison = resolveDeterministicCalculation(
  "How does Non-Brand Search's ROAS compare with Performance Max?",
  analysis,
);
assert.deepEqual(
  roasComparison?.response.calculations?.map(({ entity, result }) => [
    entity.id,
    result?.value,
  ]),
  [
    ["camp-002", 17_420 / 4_986.4],
    ["camp-003", 31_920 / 7_248.8],
  ],
  "The comparison did not use the two requested campaigns.",
);

const altered = structuredClone(campaignCtr!.response);
altered.calculations![0]!.result!.value += 0.01;
assert.equal(
  validateGroundedChatResponse(altered, [campaignCtr!]).success,
  false,
  "A chat response was allowed to alter a deterministic calculation.",
);

const zeroAnalysis = prepareCampaignPerformanceAnalysis({
  campaignData: {
    account: { id: "zero", name: "Zero Account", currency: "USD" },
    campaigns: [
      {
        id: "zero-campaign",
        name: "Zero Campaign",
        status: "ENABLED",
        channel: "SEARCH",
        dailyBudget: 10,
        metrics: {
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
          conversionValue: 0,
        },
      },
    ],
  },
});
for (const question of ["What is my CTR?", "What is my CPC?", "What is my CPA?", "What is my ROAS?"]) {
  const candidate = resolveDeterministicCalculation(question, zeroAnalysis);
  assert.equal(candidate?.response.status, "insufficient_data", question);
  assert.equal(candidate?.response.calculations?.[0]?.result, null, question);
  assert.ok(candidate?.response.limitations.length, question);
}

console.log(
  "Verified deterministic CTR, CPC, conversion rate, CPA, ROAS, zero denominators, missing conversion value, grounded chat validation, campaign scope, ranking, and comparison arithmetic.",
);
