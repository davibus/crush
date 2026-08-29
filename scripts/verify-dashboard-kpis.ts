import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildDashboardKpis,
  hasUsableDashboardData,
} from "../lib/dashboard-kpis.ts";
import {
  aggregateGoogleAdsMetrics,
  calculateGoogleAdsMetrics,
  type GoogleAdsSampleData,
} from "../lib/google-ads.ts";

const sampleData = JSON.parse(
  await readFile(
    new URL("../data/google-ads-sample.json", import.meta.url),
    "utf8",
  ),
) as GoogleAdsSampleData;
const campaignMetrics = sampleData.campaigns.map(
  (campaign) => campaign.metrics,
);
const totals = aggregateGoogleAdsMetrics(campaignMetrics);
const kpis = buildDashboardKpis(totals, sampleData.account.currency);

assert.equal(kpis.length, 6);
assert.deepEqual(
  kpis.map(({ label }) => label),
  [
    "Spend",
    "Revenue / conversion value",
    "ROAS",
    "Conversions",
    "CPA",
    "Conversion rate",
  ],
);
assert.deepEqual(
  Object.fromEntries(kpis.map(({ id, formattedValue }) => [id, formattedValue])),
  {
    spend: "$15,638.70",
    "conversion-value": "$64,550.00",
    roas: "4.13x",
    conversions: "479",
    cpa: "$32.65",
    "conversion-rate": "6.52%",
  },
);
assert.deepEqual(
  Object.fromEntries(kpis.map(({ id, value }) => [id, value])),
  {
    spend: totals.spend,
    "conversion-value": totals.conversionValue,
    roas: totals.roas,
    conversions: totals.conversions,
    cpa: totals.cpa,
    "conversion-rate": totals.conversionRate,
  },
  "KPI values must come from the existing calculated account metrics",
);
assert.ok(
  kpis.every(
    ({ comparison }) =>
      comparison.status === "unavailable" &&
      comparison.label === "No comparison period",
  ),
  "Sample data must not fabricate comparison values",
);
assert.equal(hasUsableDashboardData(campaignMetrics), true);
assert.equal(hasUsableDashboardData([]), false);

const zeroConversionMetrics = calculateGoogleAdsMetrics({
  impressions: 100,
  clicks: 10,
  cost: 50,
  conversions: 0,
  conversionValue: 0,
});
const zeroConversionKpis = buildDashboardKpis(zeroConversionMetrics, "USD");
assert.equal(zeroConversionKpis.find(({ id }) => id === "cpa")?.value, null);
assert.equal(
  zeroConversionKpis.find(({ id }) => id === "cpa")?.formattedValue,
  "—",
);
assert.equal(
  zeroConversionKpis.find(({ id }) => id === "conversion-rate")
    ?.formattedValue,
  "0.00%",
);
assert.ok(
  zeroConversionKpis.every(
    ({ value }) => value === null || Number.isFinite(value),
  ),
);

const zeroSpendMetrics = calculateGoogleAdsMetrics({
  impressions: 100,
  clicks: 10,
  cost: 0,
  conversions: 2,
  conversionValue: 50,
});
const zeroSpendKpis = buildDashboardKpis(zeroSpendMetrics, "USD");
assert.equal(zeroSpendKpis.find(({ id }) => id === "roas")?.value, null);
assert.equal(
  zeroSpendKpis.find(({ id }) => id === "roas")?.formattedValue,
  "—",
);
assert.ok(
  zeroSpendKpis.every(({ value }) => value === null || Number.isFinite(value)),
);

const zeroClickKpis = buildDashboardKpis(
  calculateGoogleAdsMetrics({
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    conversionValue: 0,
  }),
  "USD",
);
assert.equal(
  zeroClickKpis.find(({ id }) => id === "conversion-rate")?.value,
  null,
);

const comparisonMetrics = calculateGoogleAdsMetrics({
  impressions: 1000,
  clicks: 100,
  cost: 1000,
  conversions: 25,
  conversionValue: 3000,
});
const comparedKpis = buildDashboardKpis(totals, "USD", comparisonMetrics);
assert.ok(
  comparedKpis.every(({ comparison }) => comparison.status === "change"),
  "A valid supplied prior period should produce comparisons",
);

const zeroPriorKpis = buildDashboardKpis(
  totals,
  "USD",
  calculateGoogleAdsMetrics({
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    conversionValue: 0,
  }),
);
assert.equal(
  zeroPriorKpis.find(({ id }) => id === "spend")?.comparison.status,
  "not-comparable",
);

console.log(
  "Verified six sample account KPIs, metric reuse, comparisons, empty detection, and safe zero-denominator display states.",
);
