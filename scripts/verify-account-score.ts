import assert from "node:assert/strict";

import {
  ACCOUNT_SCORE_RULES,
  ACCOUNT_SCORE_WEIGHTS,
  calculateAccountScore,
  type AccountScoreComponent,
} from "../lib/account-score.ts";
import type {
  GoogleAdsCampaign,
  GoogleAdsConversion,
  GoogleAdsDevice,
  GoogleAdsGeography,
  GoogleAdsKeyword,
  GoogleAdsLandingPage,
  GoogleAdsSampleData,
  GoogleAdsSearchTerm,
} from "../lib/google-ads.ts";

function campaign(
  id: string,
  overrides: Partial<GoogleAdsCampaign["metrics"]> = {},
): GoogleAdsCampaign {
  return {
    id,
    name: `Campaign ${id}`,
    status: "ENABLED",
    channel: "SEARCH",
    dailyBudget: 100,
    metrics: {
      impressions: 10_000,
      clicks: 1_000,
      cost: 1_000,
      conversions: 100,
      conversionValue: 10_000,
      ...overrides,
    },
  };
}

function campaignData(campaigns: GoogleAdsCampaign[]): GoogleAdsSampleData {
  return {
    account: { id: "score-account", name: "Score fixture", currency: "USD" },
    campaigns,
  };
}

const strongCampaign = campaign("strong");
const conversions: GoogleAdsConversion[] = [
  {
    id: "lead",
    campaignId: strongCampaign.id,
    campaignName: strongCampaign.name,
    conversionAction: "Qualified lead",
    conversions: strongCampaign.metrics.conversions,
    conversionValue: strongCampaign.metrics.conversionValue,
  },
];
const geographies: GoogleAdsGeography[] = [
  {
    id: "geo",
    campaignId: strongCampaign.id,
    campaignName: strongCampaign.name,
    location: "Denver",
    ...strongCampaign.metrics,
  },
];
const devices: GoogleAdsDevice[] = [
  {
    id: "device",
    campaignId: strongCampaign.id,
    campaignName: strongCampaign.name,
    device: "Desktop",
    ...strongCampaign.metrics,
  },
];
const keywords: GoogleAdsKeyword[] = [
  {
    id: "keyword",
    campaignId: strongCampaign.id,
    campaignName: strongCampaign.name,
    adGroup: "Core",
    keyword: "account scoring",
    matchType: "EXACT",
    status: "ENABLED",
    ...strongCampaign.metrics,
  },
];
const searchTerms: GoogleAdsSearchTerm[] = [
  {
    id: "term",
    campaignId: strongCampaign.id,
    campaignName: strongCampaign.name,
    adGroup: "Core",
    searchTerm: "account scoring",
    matchedKeyword: "account scoring",
    matchType: "EXACT",
    ...strongCampaign.metrics,
  },
];
const landingPages: GoogleAdsLandingPage[] = [
  {
    id: "page",
    campaignId: strongCampaign.id,
    campaignName: strongCampaign.name,
    finalUrl: "https://example.test/account-scoring",
    ...strongCampaign.metrics,
  },
];

const completeInput = {
  campaignData: campaignData([strongCampaign]),
  conversions,
  geographies,
  devices,
  keywords,
  searchTerms,
  landingPages,
};

const first = calculateAccountScore(completeInput);
const second = calculateAccountScore(structuredClone(completeInput));
assert.deepEqual(
  first,
  second,
  "Identical input did not produce deeply identical scoring output.",
);

assert.equal(
  Object.values(ACCOUNT_SCORE_WEIGHTS).reduce((total, weight) => total + weight, 0),
  100,
  "Account score weights do not total 100%.",
);
assert.ok(first.overallScore >= 0 && first.overallScore <= 100);
assert.equal(Object.keys(first.components).length, 5);
for (const [name, item] of Object.entries(first.components)) {
  assert.ok(
    item.score >= 0 && item.score <= 100,
    `${name} score is outside 0-100.`,
  );
  assert.ok(Number.isFinite(item.score), `${name} is not finite.`);
  assert.ok(item.explanation.length > 0, `${name} has no explanation.`);
}

function expectedComponentScore(item: AccountScoreComponent): number {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        item.baseScore -
          item.deductions.reduce((total, factor) => total + factor.points, 0) +
          item.opportunities.reduce((total, factor) => total + factor.points, 0),
      ),
    ),
  );
}
for (const item of Object.values(first.components)) {
  assert.equal(
    item.score,
    expectedComponentScore(item),
    "A component did not apply deductions and opportunities predictably.",
  );
}

const weak = calculateAccountScore({
  campaignData: campaignData([
    campaign("weak", {
      conversions: 5,
      conversionValue: 500,
    }),
  ]),
});
assert.ok(
  first.components.performance.score > weak.components.performance.score,
  "Stronger conversion rate and ROAS did not improve performance score.",
);
assert.equal(
  weak.components.performance.score,
  ACCOUNT_SCORE_RULES.performance.startingScore -
    ACCOUNT_SCORE_RULES.performance.lowConversionRate.belowOnePercent -
    ACCOUNT_SCORE_RULES.performance.lowRoas.belowOne,
  "Fixed performance deductions changed unexpectedly.",
);

const wasteCampaign = campaign("waste-base", {
  conversions: 20,
  conversionValue: 2_000,
});
const cleanWasteScore = calculateAccountScore({
  campaignData: campaignData([wasteCampaign]),
  keywords: [],
  searchTerms: [],
}).components.waste.score;
const wasteScore = calculateAccountScore({
  campaignData: campaignData([wasteCampaign]),
  keywords: [
    {
      id: "broad-keyword",
      campaignId: wasteCampaign.id,
      campaignName: wasteCampaign.name,
      adGroup: "Waste",
      keyword: "free marketing",
      matchType: "BROAD",
      status: "ENABLED",
      impressions: 2_000,
      clicks: 100,
      cost: 200,
      conversions: 0,
      conversionValue: 0,
    },
  ],
  searchTerms: [
    {
      id: "waste-term",
      campaignId: wasteCampaign.id,
      campaignName: wasteCampaign.name,
      adGroup: "Waste",
      searchTerm: "free marketing help",
      matchedKeyword: "free marketing",
      matchType: "BROAD",
      impressions: 2_000,
      clicks: 100,
      cost: 200,
      conversions: 0,
      conversionValue: 0,
    },
  ],
}).components.waste;
assert.ok(
  wasteScore.score < cleanWasteScore,
  "Audit-supported search-term waste did not lower waste control score.",
);
assert.ok(
  wasteScore.deductions.some(
    ({ ruleId }) => ruleId === "analyzer-search_term_waste",
  ),
  "Search-term waste deduction does not identify its audit rule.",
);

const missingCoverage = calculateAccountScore({
  campaignData: completeInput.campaignData,
});
assert.ok(
  first.components.trackingDataQuality.score >
    missingCoverage.components.trackingDataQuality.score,
  "Missing optional datasets did not predictably lower tracking/data quality.",
);
assert.equal(first.components.trackingDataQuality.status, "scored");
assert.equal(missingCoverage.components.trackingDataQuality.status, "partial");
assert.ok(
  missingCoverage.components.trackingDataQuality.deductions.every(
    ({ explanation }) => explanation.includes("not provided"),
  ),
  "Missing-dataset deductions are not explained.",
);

const orderedCampaigns = [
  campaign("a", { cost: 1_200, conversions: 30, conversionValue: 3_000 }),
  campaign("b", { cost: 800, conversions: 70, conversionValue: 7_000 }),
];
const orderedInput = {
  campaignData: campaignData(orderedCampaigns),
  conversions: orderedCampaigns.map((item, index) => ({
    id: `conversion-${index}`,
    campaignId: item.id,
    campaignName: item.name,
    conversionAction: "Lead",
    conversions: item.metrics.conversions,
    conversionValue: item.metrics.conversionValue,
  })),
  geographies: geographies.map((item, index) => ({ ...item, id: `geo-${index}` })),
  devices: devices.map((item, index) => ({ ...item, id: `device-${index}` })),
  keywords: keywords.map((item, index) => ({ ...item, id: `keyword-${index}` })),
  searchTerms: searchTerms.map((item, index) => ({ ...item, id: `term-${index}` })),
  landingPages: landingPages.map((item, index) => ({ ...item, id: `page-${index}` })),
};
const reversedInput = structuredClone(orderedInput);
reversedInput.campaignData.campaigns.reverse();
reversedInput.conversions.reverse();
reversedInput.geographies.reverse();
reversedInput.devices.reverse();
reversedInput.keywords.reverse();
reversedInput.searchTerms.reverse();
reversedInput.landingPages.reverse();
assert.deepEqual(
  calculateAccountScore(orderedInput),
  calculateAccountScore(reversedInput),
  "Equivalent source-row ordering changed the score result.",
);

for (const deduction of wasteScore.deductions) {
  assert.ok(
    deduction.explanation.includes(`${deduction.points} points`),
    "A deduction does not explain why points were lost.",
  );
}

const zero = calculateAccountScore({
  campaignData: campaignData([
    campaign("zero", {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      conversionValue: 0,
    }),
  ]),
});
assert.ok(Number.isFinite(zero.overallScore));
for (const item of Object.values(zero.components)) {
  assert.ok(Number.isFinite(item.score));
  assert.ok(
    item.deductions
      .flatMap(({ evidence }) => evidence)
      .every(({ value }) => Number.isFinite(value)),
    "Zero spend/conversions produced NaN or Infinity evidence.",
  );
}

console.log(
  `Account score verification passed: deterministic ${first.overallScore}/100 complete-data score, five bounded components, 100% weights, predictable deductions, stronger performance, waste sensitivity, tracking coverage, order independence, explanations, and zero-denominator safety.`,
);
