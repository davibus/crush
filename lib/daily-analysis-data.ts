import "server-only";

import {
  explicitGoogleAdsDateRange,
  fetchGoogleAdsData,
  readGoogleAdsApiConfig,
  type GoogleAdsApiConfig,
  type LiveGoogleAdsData,
} from "./google-ads-api.ts";
import { calculateGoogleAdsMetric, calculateGoogleAdsMetrics, type GoogleAdsMetrics } from "./google-ads.ts";
import {
  fetchGA4Data,
  hasAnyGA4Config,
  readGA4ApiConfig,
  type GA4ApiConfig,
} from "./ga4-api.ts";
import type { GA4Data } from "./ga4.ts";
import type {
  DailyAnalysisCollection,
  DailyAnalysisRanges,
  DateRange,
  MarketingPeriodSummary,
  NormalizedGA4Summary,
  NormalizedGoogleAdsSummary,
} from "./daily-analysis.ts";

export type DailyAnalysisDataDependencies = {
  fetchGoogleAdsData(config: GoogleAdsApiConfig): Promise<LiveGoogleAdsData>;
  fetchGA4Data(config: GA4ApiConfig): Promise<GA4Data>;
};

const DEFAULT_DEPENDENCIES: DailyAnalysisDataDependencies = {
  fetchGoogleAdsData,
  fetchGA4Data,
};

function emptySummary(dateRange: DateRange): MarketingPeriodSummary {
  return { dateRange, googleAds: null, ga4: null };
}

function periodMetrics(
  rows: Array<GoogleAdsMetrics & { date: string }>,
  range: DateRange,
): GoogleAdsMetrics {
  return rows
    .filter((row) => row.date >= range.startDate && row.date <= range.endDate)
    .reduce<GoogleAdsMetrics>(
      (total, row) => ({
        impressions: total.impressions + row.impressions,
        clicks: total.clicks + row.clicks,
        cost: total.cost + row.cost,
        conversions: total.conversions + row.conversions,
        conversionValue: total.conversionValue + row.conversionValue,
      }),
      { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 },
    );
}

function calculatedOrNull(
  metrics: GoogleAdsMetrics,
  metric: "ctr" | "cpc" | "conversionRate" | "cpa" | "roas",
): number | null {
  const result = calculateGoogleAdsMetric(metrics, metric);
  return result.status === "calculated" ? result.value : null;
}

export function normalizeGoogleAdsSummary(
  metrics: GoogleAdsMetrics,
): NormalizedGoogleAdsSummary {
  return {
    spend: metrics.cost,
    impressions: metrics.impressions,
    clicks: metrics.clicks,
    ctr: calculatedOrNull(metrics, "ctr"),
    cpc: calculatedOrNull(metrics, "cpc"),
    conversions: metrics.conversions,
    conversionRate: calculatedOrNull(metrics, "conversionRate"),
    cpa: calculatedOrNull(metrics, "cpa"),
    conversionValue: metrics.conversionValue,
    roas: calculatedOrNull(metrics, "roas"),
  };
}

export function normalizeGA4Summary(data: GA4Data): NormalizedGA4Summary {
  return {
    sessions: data.summary.sessions,
    users: data.summary.totalUsers,
    newUsers: data.summary.newUsers,
    engagedSessions: data.summary.engagedSessions,
    engagementRate: Number.isFinite(data.summary.engagementRate)
      ? data.summary.engagementRate
      : null,
    keyEvents: data.summary.keyEvents,
    revenue: data.summary.totalRevenue,
  };
}

export async function collectDailyMarketingData(
  ranges: DailyAnalysisRanges,
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: DailyAnalysisDataDependencies = DEFAULT_DEPENDENCIES,
): Promise<DailyAnalysisCollection> {
  const summaries = {
    yesterday: emptySummary(ranges.yesterday),
    previousDay: emptySummary(ranges.previousDay),
    rolling7Day: emptySummary(ranges.rolling7Day),
    previous7Day: emptySummary(ranges.previous7Day),
  };
  const dataSourcesUsed: DailyAnalysisCollection["dataSourcesUsed"] = [];
  const warnings: string[] = [];
  const context: DailyAnalysisCollection["context"] = {};

  const googleAdsTask = (async () => {
    if (environment.GOOGLE_ADS_DATA_SOURCE?.trim().toLowerCase() !== "live") {
      warnings.push(
        "Google Ads live reporting is not enabled; set GOOGLE_ADS_DATA_SOURCE=live to include it in Daily Analysis.",
      );
      return;
    }
    try {
      const baseConfig = readGoogleAdsApiConfig(environment);
      const data = await dependencies.fetchGoogleAdsData({
        ...baseConfig,
        dateRange: explicitGoogleAdsDateRange(
          ranges.previous7Day.startDate,
          ranges.yesterday.endDate,
        ),
      });
      summaries.yesterday.googleAds = normalizeGoogleAdsSummary(
        periodMetrics(data.dailyMetrics, ranges.yesterday),
      );
      summaries.previousDay.googleAds = normalizeGoogleAdsSummary(
        periodMetrics(data.dailyMetrics, ranges.previousDay),
      );
      summaries.rolling7Day.googleAds = normalizeGoogleAdsSummary(
        periodMetrics(data.dailyMetrics, ranges.rolling7Day),
      );
      summaries.previous7Day.googleAds = normalizeGoogleAdsSummary(
        periodMetrics(data.dailyMetrics, ranges.previous7Day),
      );
      context.googleAds = {
        accountName: data.account.name,
        currency: data.account.currency,
        campaignCount: data.campaigns.length,
        topCampaigns: data.campaigns
          .toSorted((left, right) => right.metrics.cost - left.metrics.cost)
          .slice(0, 5)
          .map((campaign) => ({
            id: campaign.id,
            name: campaign.name,
            metrics: calculateGoogleAdsMetrics(campaign.metrics),
          })),
      };
      dataSourcesUsed.push("google_ads");
    } catch (error) {
      console.error("Daily Analysis could not load Google Ads.", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : "Unknown failure",
      });
      warnings.push(
        "Google Ads was unavailable for this run. GA4 results are still included when available; check the server configuration and logs.",
      );
    }
  })();

  const ga4Task = (async () => {
    if (!hasAnyGA4Config(environment)) {
      warnings.push(
        "GA4 is not configured, so Daily Analysis contains no site-analytics metrics.",
      );
      return;
    }
    try {
      const baseConfig = readGA4ApiConfig(environment);
      const load = (range: DateRange) =>
        dependencies.fetchGA4Data({
          ...baseConfig,
          startDate: range.startDate,
          endDate: range.endDate,
        });
      // Each fetch is already a five-report GA4 batch. Run the four exact-period
      // batches sequentially so one scheduled analysis does not exhaust the
      // property's concurrent-request quota.
      const yesterday = await load(ranges.yesterday);
      const previousDay = await load(ranges.previousDay);
      const rolling7Day = await load(ranges.rolling7Day);
      const previous7Day = await load(ranges.previous7Day);
      summaries.yesterday.ga4 = normalizeGA4Summary(yesterday);
      summaries.previousDay.ga4 = normalizeGA4Summary(previousDay);
      summaries.rolling7Day.ga4 = normalizeGA4Summary(rolling7Day);
      summaries.previous7Day.ga4 = normalizeGA4Summary(previous7Day);
      context.ga4 = {
        propertyId: rolling7Day.propertyId,
        topTrafficSources: rolling7Day.trafficSources.slice(0, 5).map((row) => ({
          sourceMedium: row.sourceMedium,
          sessions: row.sessions,
          keyEvents: row.keyEvents,
        })),
        topKeyEvents: rolling7Day.keyEvents.slice(0, 5).map((row) => ({
          eventName: row.eventName,
          keyEvents: row.keyEvents,
        })),
      };
      dataSourcesUsed.push("ga4");
    } catch (error) {
      console.error("Daily Analysis could not load GA4.", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : "Unknown failure",
      });
      warnings.push(
        "GA4 was unavailable for this run. Google Ads results are still included when available; check the server configuration and logs.",
      );
    }
  })();

  await Promise.all([googleAdsTask, ga4Task]);
  const sourceOrder = { google_ads: 0, ga4: 1 } as const;
  dataSourcesUsed.sort((left, right) => sourceOrder[left] - sourceOrder[right]);
  return {
    dataSourcesUsed,
    yesterdaySummary: summaries.yesterday,
    previousDaySummary: summaries.previousDay,
    rolling7DaySummary: summaries.rolling7Day,
    previous7DaySummary: summaries.previous7Day,
    context,
    warnings,
  };
}
