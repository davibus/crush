import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  addIsoDays,
  compareMetricValues,
  comparePeriodSummaries,
  detectMaterialChanges,
  executeDailyAnalysis,
  getDailyAnalysisRanges,
  type DailyAnalysisAiInput,
  type DailyAnalysisResult,
  type DateRange,
  type MarketingPeriodSummary,
  type NormalizedGoogleAdsSummary,
} from "../lib/daily-analysis.ts";
import { analyzeDailyMarketingChanges } from "../lib/daily-analysis-ai.ts";
import {
  collectDailyMarketingData,
  type DailyAnalysisDataDependencies,
} from "../lib/daily-analysis-data.ts";
import {
  getDailyAnalysis,
  getLatestDailyAnalysis,
  listDailyAnalyses,
  saveDailyAnalysis,
} from "../lib/daily-analysis-storage.ts";

const utcRanges = getDailyAnalysisRanges(
  new Date("2026-08-31T05:30:00.000Z"),
  "UTC",
);
assert.deepEqual(utcRanges.yesterday, {
  startDate: "2026-08-30",
  endDate: "2026-08-30",
});
assert.deepEqual(utcRanges.previousDay, {
  startDate: "2026-08-29",
  endDate: "2026-08-29",
});
assert.deepEqual(utcRanges.rolling7Day, {
  startDate: "2026-08-24",
  endDate: "2026-08-30",
});
assert.deepEqual(utcRanges.previous7Day, {
  startDate: "2026-08-17",
  endDate: "2026-08-23",
});

const denverRanges = getDailyAnalysisRanges(
  new Date("2026-08-31T05:30:00.000Z"),
  "America/Denver",
);
assert.equal(
  denverRanges.yesterday.endDate,
  "2026-08-29",
  "The same instant must resolve against the configured application timezone.",
);
assert.throws(
  () => getDailyAnalysisRanges(new Date(), "Not/A_Timezone"),
  /valid IANA time zone/,
);

let googleAdsDateRange = "";
let activeGA4Requests = 0;
let maximumActiveGA4Requests = 0;
const ga4DateRanges: Array<{ startDate: string; endDate: string }> = [];
const dependencies: DailyAnalysisDataDependencies = {
  async fetchGoogleAdsData(config) {
    googleAdsDateRange = config.dateRange;
    const dailyMetrics = Array.from({ length: 14 }, (_, index) => ({
      date: addIsoDays(utcRanges.previous7Day.startDate, index),
      impressions: 100,
      clicks: 10,
      cost: 20,
      conversions: 2,
      conversionValue: 50,
    }));
    return {
      account: { id: "1234567890", name: "Live mock account", currency: "USD" },
      campaigns: [{
        id: "101",
        name: "Search",
        status: "ENABLED",
        channel: "SEARCH",
        dailyBudget: 50,
        metrics: {
          impressions: 1_400,
          clicks: 140,
          cost: 280,
          conversions: 28,
          conversionValue: 700,
        },
      }],
      dailyMetrics,
      geographies: [],
      devices: [],
      keywords: [],
      searchTerms: [],
      conversions: [],
    };
  },
  async fetchGA4Data(config) {
    ga4DateRanges.push({ startDate: config.startDate, endDate: config.endDate });
    activeGA4Requests += 1;
    maximumActiveGA4Requests = Math.max(maximumActiveGA4Requests, activeGA4Requests);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeGA4Requests -= 1;
    return {
      propertyId: config.propertyId,
      dateRange: { startDate: config.startDate, endDate: config.endDate },
      summary: {
        sessions: 100,
        totalUsers: 80,
        newUsers: 50,
        activeUsers: 75,
        keyEvents: 10,
        engagedSessions: 60,
        engagementRate: 0.6,
        totalRevenue: 200,
      },
      keyEvents: [],
      landingPages: [],
      trafficSources: [],
      googleAdsCampaigns: [],
    };
  },
};
const collected = await collectDailyMarketingData(
  utcRanges,
  {
    NODE_ENV: "test",
    GOOGLE_ADS_DATA_SOURCE: "live",
    GOOGLE_ADS_CLIENT_ID: "client-id",
    GOOGLE_ADS_CLIENT_SECRET: "client-secret",
    GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
    GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
    GOOGLE_ADS_CUSTOMER_ID: "1234567890",
    GA4_PROPERTY_ID: "123456789",
    GA4_CLIENT_EMAIL: "reader@example-project.iam.gserviceaccount.com",
    GA4_PRIVATE_KEY:
      "-----BEGIN PRIVATE KEY-----\\nTEST_KEY\\n-----END PRIVATE KEY-----\\n",
  } as NodeJS.ProcessEnv,
  dependencies,
);
assert.equal(googleAdsDateRange, "2026-08-17:2026-08-30");
assert.deepEqual(ga4DateRanges, [
  utcRanges.yesterday,
  utcRanges.previousDay,
  utcRanges.rolling7Day,
  utcRanges.previous7Day,
]);
assert.equal(
  maximumActiveGA4Requests,
  1,
  "Exact-period GA4 batches must run sequentially to avoid concurrent-request quota errors.",
);
assert.deepEqual(collected.dataSourcesUsed, ["google_ads", "ga4"]);
assert.equal(collected.yesterdaySummary.googleAds?.clicks, 10);
assert.equal(collected.rolling7DaySummary.googleAds?.clicks, 70);
assert.equal(collected.previous7DaySummary.googleAds?.clicks, 70);
assert.equal(collected.yesterdaySummary.ga4?.sessions, 100);
assert.deepEqual(collected.warnings, []);

assert.deepEqual(compareMetricValues(120, 100), {
  currentValue: 120,
  previousValue: 100,
  absoluteChange: 20,
  percentageChange: 20,
  direction: "up",
});
assert.deepEqual(compareMetricValues(0, 10), {
  currentValue: 0,
  previousValue: 10,
  absoluteChange: -10,
  percentageChange: -100,
  direction: "down",
});
assert.deepEqual(compareMetricValues(10, 0), {
  currentValue: 10,
  previousValue: 0,
  absoluteChange: 10,
  percentageChange: null,
  direction: "up",
});
assert.equal(compareMetricValues(0, 0).direction, "unchanged");
assert.equal(compareMetricValues(null, 10).direction, "unavailable");

function ads(conversions: number): NormalizedGoogleAdsSummary {
  return {
    spend: 1_000,
    impressions: 10_000,
    clicks: 1_000,
    ctr: 10,
    cpc: 1,
    conversions,
    conversionRate: conversions / 10,
    cpa: conversions === 0 ? null : 1_000 / conversions,
    conversionValue: conversions * 100,
    roas: conversions / 10,
  };
}

function summary(range: DateRange, conversions: number): MarketingPeriodSummary {
  return { dateRange: range, googleAds: ads(conversions), ga4: null };
}

const tinyComparison = comparePeriodSummaries(
  summary(utcRanges.yesterday, 2),
  summary(utcRanges.previousDay, 1),
);
assert.equal(
  detectMaterialChanges(tinyComparison, "yesterday").some(
    (change) => change.metric === "conversions",
  ),
  false,
  "A 1-to-2 conversion increase must not alert solely because it is +100%.",
);

const significantComparison = comparePeriodSummaries(
  summary(utcRanges.yesterday, 200),
  summary(utcRanges.previousDay, 100),
);
const significantConversions = detectMaterialChanges(
  significantComparison,
  "yesterday",
).find((change) => change.metric === "conversions");
assert.ok(significantConversions, "A 100-to-200 conversion increase should be surfaced.");
assert.match(significantConversions.reason, /both the 20% relative and 10 absolute thresholds/);

let capturedInput: DailyAnalysisAiInput | undefined;
let savedResult: DailyAnalysisResult | undefined;
const result = await executeDailyAnalysis(
  { now: new Date("2026-08-31T12:00:00.000Z"), timeZone: "UTC" },
  {
    async collect(ranges) {
      return {
        dataSourcesUsed: ["google_ads"],
        yesterdaySummary: summary(ranges.yesterday, 200),
        previousDaySummary: summary(ranges.previousDay, 100),
        rolling7DaySummary: summary(ranges.rolling7Day, 700),
        previous7DaySummary: summary(ranges.previous7Day, 700),
        context: {
          googleAds: {
            accountName: "Mock account",
            currency: "USD",
            campaignCount: 0,
            topCampaigns: [],
          },
        },
        warnings: [],
      };
    },
    async analyze(input) {
      capturedInput = input;
      return {
        findings: {
          status: "grounded_ai",
          summary: "Mock grounded selection.",
          findings: input.materialChanges.slice(0, 1).map((change) => ({
            materialChangeId: `${change.period}:${change.metric}`,
            observedFact: "Copied mock fact.",
            interpretation: "Copied mock interpretation.",
            recommendation: "Copied mock recommendation.",
          })),
        },
      };
    },
    async save(value) {
      savedResult = value;
    },
  },
);
assert.equal(result.analysisDate, "2026-08-30");
assert.ok(capturedInput?.materialChanges.some((change) => change.metric === "conversions"));
assert.deepEqual(savedResult, result);
assert.equal(result.aiFindings.status, "grounded_ai");

assert.ok(capturedInput);
const deterministicAnalysis = await analyzeDailyMarketingChanges(
  capturedInput,
  { NODE_ENV: "test" },
);
assert.equal(deterministicAnalysis.findings.status, "deterministic_fallback");
assert.ok(deterministicAnalysis.findings.findings.length > 0);
const stableAnalysis = await analyzeDailyMarketingChanges(
  { ...capturedInput, materialChanges: [] },
  {
    NODE_ENV: "test",
    OPENAI_API_KEY: "must-not-be-used-for-stable-data",
  },
);
assert.equal(stableAnalysis.findings.status, "stable");
assert.deepEqual(stableAnalysis.findings.findings, []);

const testDirectory = await mkdtemp(path.join(tmpdir(), "crush-daily-analysis-"));
try {
  await saveDailyAnalysis(result, testDirectory);
  assert.deepEqual(await getDailyAnalysis(result.analysisDate, testDirectory), result);
  const replacement = {
    ...result,
    generatedAt: "2026-08-31T12:01:00.000Z",
  };
  await saveDailyAnalysis(replacement, testDirectory);
  assert.deepEqual(
    await getLatestDailyAnalysis(testDirectory),
    replacement,
    "Re-running a date should replace that date atomically without adding a duplicate.",
  );
  assert.equal((await listDailyAnalyses(testDirectory)).length, 1);
} finally {
  await rm(testDirectory, { recursive: true, force: true });
}

console.log(
  "Daily Analysis verification passed: timezone-safe completed-day ranges, one 14-day Google Ads retrieval, sequential exact-period GA4 retrieval, prior-period comparisons, dual materiality thresholds, insignificant-change suppression, significant-change detection, automatic AI/fallback orchestration, and persistence round-trip.",
);
