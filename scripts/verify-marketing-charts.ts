import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildCampaignComparisonData,
  buildGeographicPerformanceData,
  buildTimeSeriesData,
  getTimeSeriesTotals,
} from "../lib/chart-data.ts";
import {
  aggregateGoogleAdsMetrics,
  type GoogleAdsDailyMetric,
  type GoogleAdsGeography,
  type GoogleAdsSampleData,
} from "../lib/google-ads.ts";

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(
    await readFile(new URL(path, import.meta.url), "utf8"),
  ) as T;
}

const sampleData = await loadJson<GoogleAdsSampleData>(
  "../data/google-ads-sample.json",
);
const dailyData = await loadJson<{ dailyMetrics: GoogleAdsDailyMetric[] }>(
  "../data/google-ads-daily.json",
);
const geographyData = await loadJson<{ locations: GoogleAdsGeography[] }>(
  "../data/google-ads-geography.json",
);

const timeSeries = buildTimeSeriesData(dailyData.dailyMetrics);
assert.deepEqual(
  timeSeries.map(({ date }) => date),
  [
    "2025-08-18",
    "2025-08-19",
    "2025-08-20",
    "2025-08-21",
    "2025-08-22",
    "2025-08-23",
    "2025-08-24",
  ],
  "Daily trend rows must be chronological.",
);
assert.deepEqual(
  timeSeries.map(({ spend }) => spend),
  [1980.5, 2150.2, 2075.4, 2250.6, 2436, 2579.2, 2166.8],
  "Spend trend must match the daily source rows.",
);
assert.deepEqual(
  timeSeries.map(({ conversions }) => conversions),
  [58, 67, 61, 72, 79, 82, 60],
  "Conversion trend must match the daily source rows.",
);

for (const [index, point] of timeSeries.entries()) {
  const source = dailyData.dailyMetrics[index];
  assert.ok(source, `Missing daily source row ${index}.`);
  assert.equal(point.cpa, source.cost / source.conversions);
  assert.equal(point.roas, source.conversionValue / source.cost);
}

const campaignTotals = aggregateGoogleAdsMetrics(
  sampleData.campaigns.map(({ metrics }) => metrics),
);
const dailyTotals = getTimeSeriesTotals(dailyData.dailyMetrics);
assert.deepEqual(
  dailyTotals,
  campaignTotals,
  "Daily chart totals must reconcile exactly with the KPI account totals.",
);

const campaignComparison = buildCampaignComparisonData(sampleData.campaigns);
assert.deepEqual(
  campaignComparison.map(({ id, spend, conversions, conversionValue }) => ({
    id,
    spend,
    conversions,
    conversionValue,
  })),
  [
    { id: "camp-003", spend: 7248.8, conversions: 228, conversionValue: 31920 },
    { id: "camp-002", spend: 4986.4, conversions: 134, conversionValue: 17420 },
    { id: "camp-001", spend: 1867.5, conversions: 96, conversionValue: 12480 },
    { id: "camp-004", spend: 1536, conversions: 21, conversionValue: 2730 },
  ],
  "Campaign comparison must use source campaign metrics and value ordering.",
);

const geographicPerformance = buildGeographicPerformanceData(
  geographyData.locations,
);
assert.equal(geographicPerformance.length, 5);
assert.deepEqual(
  Object.fromEntries(
    geographicPerformance.map(({ name, spend, conversions }) => [
      name,
      { spend, conversions },
    ]),
  ),
  {
    "Provo, UT": { spend: 1416.16, conversions: 51 },
    "Orem, UT": { spend: 1153.28, conversions: 42 },
    "Salt Lake City, UT": { spend: 1187.84, conversions: 39 },
    "Lehi, UT": { spend: 922.3, conversions: 31 },
    "Ogden, UT": { spend: 453, conversions: 4 },
  },
  "Geographic comparison must aggregate the geographic sample rows.",
);

const repeatedLocation = buildGeographicPerformanceData([
  geographyData.locations[0]!,
  {
    ...geographyData.locations[0]!,
    id: "geo-repeat",
    cost: 12.16,
    conversions: 1,
    conversionValue: 130,
  },
]);
assert.equal(repeatedLocation.length, 1);
assert.equal(repeatedLocation[0]?.spend, 1200);
assert.equal(repeatedLocation[0]?.conversions, 40);

const zeroDenominators = buildTimeSeriesData([
  {
    date: "2025-08-25",
    impressions: 100,
    clicks: 10,
    cost: 50,
    conversions: 0,
    conversionValue: 0,
  },
  {
    date: "2025-08-26",
    impressions: 100,
    clicks: 10,
    cost: 0,
    conversions: 2,
    conversionValue: 50,
  },
]);
assert.equal(zeroDenominators[0]?.cpa, null);
assert.equal(zeroDenominators[1]?.roas, null);
assert.ok(
  zeroDenominators.every(({ cpa, roas }) =>
    [cpa, roas].every((value) => value === null || Number.isFinite(value)),
  ),
  "Chart ratios must never contain Infinity or NaN.",
);

console.log(
  "Verified spend and conversion trends, KPI total reconciliation, CPA, ROAS, campaign comparison, geographic aggregation, and zero-denominator chart states.",
);
