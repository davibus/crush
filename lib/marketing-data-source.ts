import "server-only";

import conversionData from "@/data/google-ads-conversions.json";
import dailyData from "@/data/google-ads-daily.json";
import geographyData from "@/data/google-ads-geography.json";
import keywordData from "@/data/google-ads-keywords.json";
import googleAdsData from "@/data/google-ads-sample.json";
import searchTermData from "@/data/google-ads-search-terms.json";
import { fetchGoogleAdsData, GoogleAdsApiError } from "./google-ads-api.ts";
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
};

let liveCache:
  | { expiresAt: number; data: Awaited<ReturnType<typeof fetchGoogleAdsData>> }
  | undefined;

function sampleData(requestedSource: MarketingDataSource, warning?: string): MarketingDataSet {
  return {
    source: "sample",
    requestedSource,
    sourceLabel: "Sample Google Ads data",
    dateRangeLabel: "Demo reporting period",
    ...(warning ? { warning } : {}),
    campaignData: googleAdsData as GoogleAdsSampleData,
    dailyMetrics: dailyData.dailyMetrics as GoogleAdsDailyMetric[],
    geographies: geographyData.locations as GoogleAdsGeography[],
    keywords: keywordData.keywords as GoogleAdsKeyword[],
    searchTerms: searchTermData.searchTerms as GoogleAdsSearchTerm[],
    conversions: conversionData.conversions as GoogleAdsConversion[],
  };
}

function requestedSource(environment: NodeJS.ProcessEnv): MarketingDataSource {
  return environment.GOOGLE_ADS_DATA_SOURCE?.trim().toLowerCase() === "live"
    ? "live"
    : "sample";
}

async function liveData() {
  if (liveCache && liveCache.expiresAt > Date.now()) return liveCache.data;
  const data = await fetchGoogleAdsData();
  liveCache = { data, expiresAt: Date.now() + LIVE_CACHE_TTL_MS };
  return data;
}

export async function getMarketingData(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<MarketingDataSet> {
  const selected = requestedSource(environment);
  if (selected === "sample") return sampleData(selected);

  try {
    const data = await liveData();
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
    };
  } catch (error) {
    console.error("Live Google Ads data load failed; using sample data.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      status: error instanceof GoogleAdsApiError ? error.status : undefined,
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    return sampleData(
      "live",
      "Live Google Ads data could not be loaded. Crush is showing the sample dataset instead; check the server configuration and logs.",
    );
  }
}
