import "server-only";

import { hasAnyGA4Config } from "./ga4-api.ts";
import { collectDailyMarketingData } from "./daily-analysis-data.ts";
import type { DailyAnalysisRanges } from "./daily-analysis.ts";
import type {
  WeeklyReportCollection,
  WeeklyReportRanges,
  WeeklyReportSourceStatus,
} from "./weekly-report.ts";

function statusForSources(
  dataSourcesUsed: Array<"google_ads" | "ga4">,
  environment: NodeJS.ProcessEnv,
): WeeklyReportSourceStatus[] {
  const googleAdsRequested = environment.GOOGLE_ADS_DATA_SOURCE?.trim().toLowerCase();
  const googleAdsIncluded = dataSourcesUsed.includes("google_ads");
  const ga4Configured = hasAnyGA4Config(environment);
  const ga4Included = dataSourcesUsed.includes("ga4");
  return [
    googleAdsIncluded
      ? { source: "google_ads", status: "live", included: true, detail: "Live Google Ads API data is included." }
      : googleAdsRequested === "live"
        ? { source: "google_ads", status: "unavailable", included: false, detail: "Live Google Ads was requested but unavailable." }
        : { source: "google_ads", status: "sample", included: false, detail: "Sample mode is configured. Historical sample rows are not remapped to current reporting dates, so they are not included in this report." },
    ga4Included
      ? { source: "ga4", status: "live", included: true, detail: "Live GA4 Data API context is included and reported separately from Google Ads." }
      : ga4Configured
        ? { source: "ga4", status: "unavailable", included: false, detail: "GA4 was configured but unavailable for this run." }
        : { source: "ga4", status: "unconfigured", included: false, detail: "GA4 is not configured and is not included." },
  ];
}

export async function collectWeeklyMarketingData(
  ranges: WeeklyReportRanges,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<WeeklyReportCollection> {
  // Reuse the Issue #18 collector so normalization, API error isolation, and
  // exact-period source behavior stay identical. The daily-only periods are
  // harmless context; the weekly report consumes only the two 7-day summaries.
  const dailyRanges: DailyAnalysisRanges = {
    timeZone: ranges.timeZone,
    yesterday: { startDate: ranges.reportingPeriod.endDate, endDate: ranges.reportingPeriod.endDate },
    previousDay: { startDate: ranges.comparisonPeriod.endDate, endDate: ranges.comparisonPeriod.endDate },
    rolling7Day: ranges.reportingPeriod,
    previous7Day: ranges.comparisonPeriod,
  };
  const collected = await collectDailyMarketingData(dailyRanges, environment);
  return {
    currentSummary: collected.rolling7DaySummary,
    previousSummary: collected.previous7DaySummary,
    context: collected.context,
    dataSourceStatus: statusForSources(collected.dataSourcesUsed, environment),
    warnings: collected.warnings.map((warning) => warning.replaceAll("Daily Analysis", "Weekly Marketing Report")),
  };
}
