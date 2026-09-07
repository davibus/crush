import "server-only";

import conversionData from "@/data/google-ads-conversions.json";
import dailyData from "@/data/google-ads-daily.json";
import geographyData from "@/data/google-ads-geography.json";
import keywordData from "@/data/google-ads-keywords.json";
import googleAdsData from "@/data/google-ads-sample.json";
import searchTermData from "@/data/google-ads-search-terms.json";
import {
  createClientEnvironment,
  getClientCacheKey,
  type ClientWorkspace,
} from "./clients.ts";
import {
  fetchGA4Data,
  GA4ApiError,
  hasAnyGA4Config,
  readGA4ApiConfig,
} from "./ga4-api.ts";
import {
  fetchGoogleAdsData,
  GoogleAdsApiError,
  readGoogleAdsApiConfig,
  type GoogleAdsApiConfig,
} from "./google-ads-api.ts";
import type { GA4Data, GA4DataState } from "./ga4.ts";
import type {
  GoogleAdsConversion,
  GoogleAdsDailyMetric,
  GoogleAdsDevice,
  GoogleAdsGeography,
  GoogleAdsKeyword,
  GoogleAdsLandingPage,
  GoogleAdsSampleData,
  GoogleAdsSearchTerm,
} from "./google-ads.ts";

const LIVE_CACHE_TTL_MS = 5 * 60 * 1000;

export type MarketingDataSource = "sample" | "live";

export type MarketingDataSet = {
  source: MarketingDataSource;
  requestedSource: MarketingDataSource;
  sourceLabel: string;
  dateRangeLabel: string;
  warning?: string;
  campaignData: GoogleAdsSampleData;
  dailyMetrics: GoogleAdsDailyMetric[];
  geographies: GoogleAdsGeography[];
  devices?: GoogleAdsDevice[];
  keywords: GoogleAdsKeyword[];
  searchTerms: GoogleAdsSearchTerm[];
  conversions: GoogleAdsConversion[];
  landingPages?: GoogleAdsLandingPage[];
  ga4: GA4DataState;
};

const liveCache = new Map<
  string,
  { expiresAt: number; data: Awaited<ReturnType<typeof fetchGoogleAdsData>> }
>();
const ga4Cache = new Map<string, { expiresAt: number; data: GA4Data }>();

function sampleData(requestedSource: MarketingDataSource, warning?: string): MarketingDataSet {
  return {
    source: "sample",
    requestedSource,
    sourceLabel: "Demo Google Ads data",
    dateRangeLabel: "Aug 18–24, 2025",
    ...(warning ? { warning } : {}),
    campaignData: googleAdsData as GoogleAdsSampleData,
    dailyMetrics: dailyData.dailyMetrics as GoogleAdsDailyMetric[],
    geographies: geographyData.locations as GoogleAdsGeography[],
    keywords: keywordData.keywords as GoogleAdsKeyword[],
    searchTerms: searchTermData.searchTerms as GoogleAdsSearchTerm[],
    conversions: conversionData.conversions as GoogleAdsConversion[],
    ga4: { status: "unconfigured" },
  };
}

function requestedSource(environment: NodeJS.ProcessEnv): MarketingDataSource {
  return environment.GOOGLE_ADS_DATA_SOURCE?.trim().toLowerCase() === "live"
    ? "live"
    : "sample";
}

async function liveData(client: ClientWorkspace, config: GoogleAdsApiConfig) {
  const cacheKey = getClientCacheKey(client.id, "google-ads", [
    config.customerId,
    config.loginCustomerId ?? "direct",
    config.apiVersion,
    config.dateRange,
  ]);
  const cached = liveCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await fetchGoogleAdsData(config);
  liveCache.set(cacheKey, { data, expiresAt: Date.now() + LIVE_CACHE_TTL_MS });
  return data;
}

async function ga4Data(
  client: ClientWorkspace,
  environment: NodeJS.ProcessEnv,
): Promise<GA4DataState> {
  if (!hasAnyGA4Config(environment)) return { status: "unconfigured" };

  try {
    const config = readGA4ApiConfig(environment);
    const cacheKey = getClientCacheKey(client.id, "ga4", [
      config.propertyId,
      config.clientEmail,
      config.startDate,
      config.endDate,
    ]);
    const cached = ga4Cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { status: "available", data: cached.data };
    }

    const data = await fetchGA4Data(config);
    ga4Cache.set(cacheKey, {
      data,
      expiresAt: Date.now() + LIVE_CACHE_TTL_MS,
    });
    return { status: "available", data };
  } catch (error) {
    console.error("GA4 data load failed; continuing without GA4 context.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      code: error instanceof GA4ApiError ? error.code : undefined,
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    return {
      status: "error",
      message:
        "GA4 data could not be loaded. Paid-media reporting is still available; check the GA4 server configuration and logs.",
    };
  }
}

export async function getMarketingData(
  client: ClientWorkspace,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): Promise<MarketingDataSet> {
  const environment = createClientEnvironment(client, baseEnvironment);
  const selected = requestedSource(environment);
  const ga4 = await ga4Data(client, environment);
  if (selected === "sample") return { ...sampleData(selected), ga4 };

  try {
    const config = readGoogleAdsApiConfig(environment);
    const data = await liveData(client, config);
    return {
      source: "live",
      requestedSource: "live",
      sourceLabel: "Live Google Ads data",
      dateRangeLabel: environment.GOOGLE_ADS_DATE_RANGE?.trim() || "Last 30 days",
      campaignData: { account: data.account, campaigns: data.campaigns },
      dailyMetrics: data.dailyMetrics,
      geographies: data.geographies,
      devices: data.devices,
      keywords: data.keywords,
      searchTerms: data.searchTerms,
      conversions: data.conversions,
      ga4,
    };
  } catch (error) {
    const diagnostic = error instanceof GoogleAdsApiError
      ? {
          errorName: error.name,
          status: error.status,
          code: error.code,
          requestId: error.requestId,
          failures: error.failures,
          message: error.message,
        }
      : { errorName: "UnknownError", message: "Unknown failure" };
    console.error(
      `Live Google Ads data load failed; using sample data. ${JSON.stringify(diagnostic)}`,
    );
    return {
      ...sampleData(
        "live",
        "Live Google Ads data could not be loaded. Crush is showing the sample dataset instead; check the server configuration and logs.",
      ),
      ga4,
    };
  }
}
