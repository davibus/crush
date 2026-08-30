import {
  aggregateGoogleAdsMetrics,
  calculateGoogleAdsMetrics,
  type GoogleAdsCampaign,
  type GoogleAdsDailyMetric,
  type GoogleAdsGeography,
  type GoogleAdsMetrics,
} from "./google-ads.ts";

export type TimeSeriesPoint = {
  date: string;
  label: string;
  spend: number;
  conversions: number;
  conversionValue: number;
  cpa: number | null;
  roas: number | null;
};

export type ComparisonPoint = {
  id: string;
  name: string;
  spend: number;
  conversions: number;
  conversionValue: number;
  cpa: number | null;
  roas: number | null;
};

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function emptyMetrics(): GoogleAdsMetrics {
  return {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    conversionValue: 0,
  };
}

function addMetrics(total: GoogleAdsMetrics, current: GoogleAdsMetrics) {
  total.impressions += current.impressions;
  total.clicks += current.clicks;
  total.cost += current.cost;
  total.conversions += current.conversions;
  total.conversionValue += current.conversionValue;
}

function comparisonPoint(
  id: string,
  name: string,
  metrics: GoogleAdsMetrics,
): ComparisonPoint {
  const calculated = calculateGoogleAdsMetrics(metrics);

  return {
    id,
    name,
    spend: calculated.spend,
    conversions: calculated.conversions,
    conversionValue: calculated.conversionValue,
    cpa: calculated.conversions === 0 ? null : calculated.cpa,
    roas: calculated.spend === 0 ? null : calculated.roas,
  };
}

export function buildTimeSeriesData(
  rows: readonly GoogleAdsDailyMetric[],
): TimeSeriesPoint[] {
  const metricsByDate = new Map<string, GoogleAdsMetrics>();

  for (const row of rows) {
    const metrics = metricsByDate.get(row.date) ?? emptyMetrics();
    addMetrics(metrics, row);
    metricsByDate.set(row.date, metrics);
  }

  return [...metricsByDate.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([date, metrics]) => {
      const calculated = calculateGoogleAdsMetrics(metrics);

      return {
        date,
        label: shortDateFormatter.format(new Date(`${date}T00:00:00Z`)),
        spend: calculated.spend,
        conversions: calculated.conversions,
        conversionValue: calculated.conversionValue,
        cpa: calculated.conversions === 0 ? null : calculated.cpa,
        roas: calculated.spend === 0 ? null : calculated.roas,
      };
    });
}

export function buildCampaignComparisonData(
  campaigns: readonly GoogleAdsCampaign[],
): ComparisonPoint[] {
  return campaigns
    .map((campaign) =>
      comparisonPoint(campaign.id, campaign.name, campaign.metrics),
    )
    .sort((first, second) => second.conversionValue - first.conversionValue);
}

export function buildGeographicPerformanceData(
  rows: readonly GoogleAdsGeography[],
): ComparisonPoint[] {
  const metricsByLocation = new Map<string, GoogleAdsMetrics>();

  for (const row of rows) {
    const metrics = metricsByLocation.get(row.location) ?? emptyMetrics();
    addMetrics(metrics, row);
    metricsByLocation.set(row.location, metrics);
  }

  return [...metricsByLocation.entries()]
    .map(([location, metrics]) => comparisonPoint(location, location, metrics))
    .sort((first, second) => second.conversionValue - first.conversionValue);
}

export function getTimeSeriesTotals(rows: readonly GoogleAdsDailyMetric[]) {
  return aggregateGoogleAdsMetrics(rows);
}
