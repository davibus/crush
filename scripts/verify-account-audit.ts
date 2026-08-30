import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ACCOUNT_AUDIT_CATEGORIES,
  runAccountAudit,
  type AccountAuditCategory,
} from "../lib/account-audit.ts";
import {
  aggregateGoogleAdsMetrics,
  type GoogleAdsConversion,
  type GoogleAdsDevice,
  type GoogleAdsGeography,
  type GoogleAdsKeyword,
  type GoogleAdsLandingPage,
  type GoogleAdsSampleData,
  type GoogleAdsSearchTerm,
} from "../lib/google-ads.ts";

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
const landingPages: GoogleAdsLandingPage[] = [
  {
    id: "page-waste",
    campaignId: "camp-002",
    campaignName: "Non-Brand Search",
    finalUrl: "https://example.test/ppc",
    impressions: 4_000,
    clicks: 200,
    cost: 700,
    conversions: 0,
    conversionValue: 0,
  },
];

const completeInput = {
  campaignData,
  conversions: conversionData.conversions,
  geographies: geographyData.locations,
  devices: deviceRows,
  keywords: keywordData.keywords,
  searchTerms: searchTermData.searchTerms,
  landingPages,
};
const firstRun = runAccountAudit(completeInput);
const secondRun = runAccountAudit(structuredClone(completeInput));

assert.deepEqual(
  firstRun,
  secondRun,
  "Identical source data did not produce an identical audit.",
);
assert.deepEqual(
  firstRun.categories.map(({ category }) => category),
  ACCOUNT_AUDIT_CATEGORIES,
  "The audit did not return all nine categories in the required order.",
);
assert.equal(firstRun.categories.length, 9);
assert.ok(
  firstRun.categories.every(({ status }) => status === "analyzed"),
  "A provided dataset was incorrectly marked unavailable.",
);
assert.ok(
  firstRun.categories.every(({ category, findings }) =>
    findings.every((item) => item.category === category),
  ),
  "A finding was grouped under the wrong category.",
);
assert.deepEqual(
  firstRun.findings,
  firstRun.categories.flatMap(({ findings }) => findings),
  "The flat finding list does not match the categorized findings.",
);
assert.deepEqual(
  firstRun.accountMetrics,
  aggregateGoogleAdsMetrics(
    campaignData.campaigns.map(({ metrics }) => metrics),
  ),
  "Audit account metrics do not match the shared calculation utility.",
);
assert.ok(
  firstRun.findings.every(
    ({ evidence }) =>
      evidence.length > 0 && evidence.every(({ value }) => Number.isFinite(value)),
  ),
  "Every finding must contain finite source evidence.",
);

const landingFinding = firstRun.categories
  .find(({ category }) => category === "landing_page_opportunities")
  ?.findings.find(({ affectedEntity }) => affectedEntity.id === "page-waste");
assert.ok(landingFinding, "Supported landing-page waste was not detected.");
assert.ok(
  landingFinding.evidence.some(
    ({ metric, value }) => metric === "Spend" && value === landingPages[0]?.cost,
  ),
  "Landing-page evidence did not use the source row.",
);
const deviceFinding = firstRun.categories
  .find(({ category }) => category === "device_performance")
  ?.findings.find(({ affectedEntity }) => affectedEntity.id === "device-desktop");
assert.ok(deviceFinding, "Supported device underperformance was not detected.");
assert.ok(
  deviceFinding.evidence.some(
    ({ metric, value }) => metric.toLowerCase().endsWith("clicks") && value === 500,
  ),
  "Device evidence did not use the source row.",
);
const searchTermFinding = firstRun.categories
  .find(({ category }) => category === "search_term_waste")
  ?.findings.find(({ affectedEntity }) => affectedEntity.id === "st-005");
assert.ok(searchTermFinding, "Supported search-term waste was not detected.");
assert.ok(
  searchTermFinding.evidence.some(
    ({ metric, value }) => metric === "Spend" && value === 379.6,
  ),
  "Search-term evidence did not use the source row.",
);

const allCategoryFixture: GoogleAdsSampleData = {
  account: { id: "audit-account", name: "Audit Fixture", currency: "USD" },
  campaigns: [
    {
      id: "efficient",
      name: "Duplicate name",
      status: "ENABLED",
      channel: "SEARCH",
      dailyBudget: 50,
      metrics: {
        impressions: 10_000,
        clicks: 1_000,
        cost: 1_000,
        conversions: 100,
        conversionValue: 10_000,
      },
    },
    {
      id: "waste",
      name: "Duplicate name",
      status: "ENABLED",
      channel: "SEARCH",
      dailyBudget: 200,
      metrics: {
        impressions: 10_000,
        clicks: 1_000,
        cost: 4_000,
        conversions: 0,
        conversionValue: 0,
      },
    },
  ],
};
const allCategoryAudit = runAccountAudit({
  campaignData: allCategoryFixture,
  conversions: [
    {
      id: "conversion",
      campaignId: "efficient",
      campaignName: "Duplicate name",
      conversionAction: "Lead",
      conversions: 50,
      conversionValue: 5_000,
    },
  ],
  geographies: [
    {
      id: "bad-geo",
      campaignId: "waste",
      campaignName: "Duplicate name",
      location: "Expensive City",
      impressions: 2_000,
      clicks: 200,
      cost: 1_000,
      conversions: 1,
      conversionValue: 10,
    },
  ],
  devices: deviceRows,
  keywords: [
    {
      id: "bad-keyword",
      campaignId: "waste",
      campaignName: "Duplicate name",
      adGroup: "Waste",
      keyword: "expensive keyword",
      matchType: "BROAD",
      status: "ENABLED",
      impressions: 2_000,
      clicks: 200,
      cost: 1_000,
      conversions: 0,
      conversionValue: 0,
    },
    {
      id: "good-keyword",
      campaignId: "efficient",
      campaignName: "Duplicate name",
      adGroup: "Good",
      keyword: "good keyword",
      matchType: "EXACT",
      status: "ENABLED",
      impressions: 2_000,
      clicks: 200,
      cost: 200,
      conversions: 20,
      conversionValue: 2_000,
    },
  ],
  searchTerms: [
    {
      id: "bad-term",
      campaignId: "waste",
      campaignName: "Duplicate name",
      adGroup: "Waste",
      searchTerm: "free help",
      matchedKeyword: "expensive keyword",
      matchType: "BROAD",
      impressions: 1_000,
      clicks: 100,
      cost: 500,
      conversions: 0,
      conversionValue: 0,
    },
  ],
  landingPages,
});
const supportedCategories = new Set(
  allCategoryAudit.categories
    .filter(({ findings }) => findings.length > 0)
    .map(({ category }) => category),
);
for (const category of ACCOUNT_AUDIT_CATEGORIES) {
  assert.ok(
    supportedCategories.has(category),
    `The deterministic fixture did not exercise ${category}.`,
  );
}

const missingOptionalAudit = runAccountAudit({ campaignData });
const optionalCategories: AccountAuditCategory[] = [
  "keyword_performance",
  "search_term_waste",
  "geographic_performance",
  "device_performance",
  "landing_page_opportunities",
];
for (const category of optionalCategories) {
  const section = missingOptionalAudit.categories.find(
    (item) => item.category === category,
  );
  assert.equal(section?.status, "unavailable", category);
  assert.deepEqual(section?.findings, [], `${category} invented a finding.`);
}
assert.equal(
  missingOptionalAudit.categories
    .find(({ category }) => category === "account_structure")
    ?.findings.some(
      ({ ruleId }) => ruleId === "search-campaign-without-enabled-keywords",
    ),
  false,
  "A structural keyword gap was invented without keyword data.",
);

const emptyOptionalAudit = runAccountAudit({
  campaignData,
  conversions: [],
  geographies: [],
  devices: [],
  keywords: [],
  searchTerms: [],
  landingPages: [],
});
assert.equal(
  emptyOptionalAudit.categories.find(
    ({ category }) => category === "device_performance",
  )?.status,
  "insufficient_data",
);

const zeroAudit = runAccountAudit({
  campaignData: {
    account: { id: "zero", name: "Zero", currency: "USD" },
    campaigns: [
      {
        id: "zero-campaign",
        name: "Zero campaign",
        status: "ENABLED",
        channel: "PERFORMANCE_MAX",
        dailyBudget: 10,
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
  Object.values(zeroAudit.accountMetrics).every(Number.isFinite),
  "Zero spend/conversions produced a non-finite account metric.",
);
assert.ok(
  zeroAudit.findings
    .flatMap(({ evidence }) => evidence)
    .every(({ value }) => Number.isFinite(value)),
  "Zero spend/conversions produced non-finite finding evidence.",
);
assert.equal(
  zeroAudit.categories.find(({ category }) => category === "budget_allocation")
    ?.status,
  "insufficient_data",
);

const raisedThresholdAudit = runAccountAudit(completeInput, {
  thresholds: { minimumEntityClicks: 10_000 },
});
assert.equal(
  raisedThresholdAudit.categories
    .find(({ category }) => category === "landing_page_opportunities")
    ?.findings.length,
  0,
  "A configurable audit threshold was ignored.",
);

console.log(
  `Account audit verification passed: nine ordered categories, ${firstRun.summary.totalFindings} sample findings, deterministic output, source-metric parity, correct grouping, all-category rule coverage, configurable thresholds, zero denominators, and safe missing/empty dataset handling.`,
);
