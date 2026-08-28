import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  aggregateGoogleAdsMetrics,
  calculateGoogleAdsMetrics,
} from "../lib/google-ads.ts";

const sampleData = JSON.parse(
  await readFile(new URL("../data/google-ads-sample.json", import.meta.url), "utf8"),
);

const expectedCampaignMetrics = {
  "camp-001": {
    spend: 1867.5,
    clicks: 1245,
    impressions: 12840,
    ctr: 9.69626168224299,
    cpc: 1.5,
    conversions: 96,
    conversionRate: 7.710843373493977,
    cpa: 19.453125,
    conversionValue: 12480,
    roas: 6.682730923694779,
  },
  "camp-002": {
    spend: 4986.4,
    clicks: 2168,
    impressions: 38420,
    ctr: 5.642894325871942,
    cpc: 2.3,
    conversions: 134,
    conversionRate: 6.180811808118081,
    cpa: 37.21194029850746,
    conversionValue: 17420,
    roas: 3.4935023263276115,
  },
  "camp-003": {
    spend: 7248.8,
    clicks: 3422,
    impressions: 68450,
    ctr: 4.99926953981008,
    cpc: 2.118293395675044,
    conversions: 228,
    conversionRate: 6.662770309760374,
    cpa: 31.79298245614035,
    conversionValue: 31920,
    roas: 4.403487473788765,
  },
  "camp-004": {
    spend: 1536,
    clicks: 512,
    impressions: 9410,
    ctr: 5.441020191285866,
    cpc: 3,
    conversions: 21,
    conversionRate: 4.1015625,
    cpa: 73.14285714285714,
    conversionValue: 2730,
    roas: 1.77734375,
  },
};

function assertMetrics(actual, expected, label) {
  for (const [metric, expectedValue] of Object.entries(expected)) {
    assert.ok(
      Math.abs(actual[metric] - expectedValue) < 1e-10,
      `${label} ${metric}: expected ${expectedValue}, received ${actual[metric]}`,
    );
    assert.equal(typeof actual[metric], "number", `${label} ${metric} must be numeric`);
    assert.ok(Number.isFinite(actual[metric]), `${label} ${metric} must be finite`);
  }
}

for (const campaign of sampleData.campaigns) {
  assertMetrics(
    calculateGoogleAdsMetrics(campaign.metrics),
    expectedCampaignMetrics[campaign.id],
    campaign.name,
  );
}

const totals = aggregateGoogleAdsMetrics(
  sampleData.campaigns.map((campaign) => campaign.metrics),
);
assertMetrics(
  totals,
  {
    spend: 15638.7,
    clicks: 7347,
    impressions: 129120,
    ctr: 5.690055762081784,
    cpc: 2.1285830951408737,
    conversions: 479,
    conversionRate: 6.519667891656458,
    cpa: 32.64864300626305,
    conversionValue: 64550,
    roas: 4.127580937034408,
  },
  "Account total",
);

const zeroMetrics = calculateGoogleAdsMetrics({
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  conversionValue: 0,
});
assertMetrics(zeroMetrics, {
  spend: 0,
  clicks: 0,
  impressions: 0,
  ctr: 0,
  cpc: 0,
  conversions: 0,
  conversionRate: 0,
  cpa: 0,
  conversionValue: 0,
  roas: 0,
}, "Zero metrics");

const zeroClickConversionMetrics = calculateGoogleAdsMetrics({
  impressions: 0,
  clicks: 0,
  cost: 25,
  conversions: 0,
  conversionValue: 100,
});
assert.equal(zeroClickConversionMetrics.ctr, 0);
assert.equal(zeroClickConversionMetrics.cpc, 0);
assert.equal(zeroClickConversionMetrics.conversionRate, 0);
assert.equal(zeroClickConversionMetrics.cpa, 0);
assert.ok(Object.values(zeroClickConversionMetrics).every(Number.isFinite));

const zeroSpendMetrics = calculateGoogleAdsMetrics({
  impressions: 100,
  clicks: 10,
  cost: 0,
  conversions: 2,
  conversionValue: 50,
});
assert.equal(zeroSpendMetrics.roas, 0);
assert.ok(Object.values(zeroSpendMetrics).every(Number.isFinite));

assertMetrics(aggregateGoogleAdsMetrics([]), zeroMetrics, "Empty aggregate");

console.log(
  "Verified 4 sample campaigns, weighted account totals, and zero-denominator edge cases.",
);
