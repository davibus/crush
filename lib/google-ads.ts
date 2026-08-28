export type GoogleAdsMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionValue: number;
};

export type CalculatedGoogleAdsMetrics = {
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversionRate: number;
  cpa: number;
  conversionValue: number;
  roas: number;
};

export type GoogleAdsCampaign = {
  id: string;
  name: string;
  status: "ENABLED" | "PAUSED";
  channel: "SEARCH" | "PERFORMANCE_MAX";
  dailyBudget: number;
  metrics: GoogleAdsMetrics;
};

export type GoogleAdsAccount = {
  id: string;
  name: string;
  currency: string;
};

export type GoogleAdsSampleData = {
  account: GoogleAdsAccount;
  campaigns: GoogleAdsCampaign[];
};

export function getCtr(metrics: GoogleAdsMetrics) {
  if (metrics.impressions === 0) return 0;

  return (metrics.clicks / metrics.impressions) * 100;
}

export function getCpc(metrics: GoogleAdsMetrics) {
  if (metrics.clicks === 0) return 0;

  return metrics.cost / metrics.clicks;
}

export function getConversionRate(metrics: GoogleAdsMetrics) {
  if (metrics.clicks === 0) return 0;

  return (metrics.conversions / metrics.clicks) * 100;
}

export function getCpa(metrics: GoogleAdsMetrics) {
  if (metrics.conversions === 0) return 0;

  return metrics.cost / metrics.conversions;
}

export function getRoas(metrics: GoogleAdsMetrics) {
  if (metrics.cost === 0) return 0;

  return metrics.conversionValue / metrics.cost;
}

export function calculateGoogleAdsMetrics(
  metrics: GoogleAdsMetrics,
): CalculatedGoogleAdsMetrics {
  return {
    spend: metrics.cost,
    clicks: metrics.clicks,
    impressions: metrics.impressions,
    ctr: getCtr(metrics),
    cpc: getCpc(metrics),
    conversions: metrics.conversions,
    conversionRate: getConversionRate(metrics),
    cpa: getCpa(metrics),
    conversionValue: metrics.conversionValue,
    roas: getRoas(metrics),
  };
}

export function aggregateGoogleAdsMetrics(
  metrics: readonly GoogleAdsMetrics[],
): CalculatedGoogleAdsMetrics {
  const totals = metrics.reduce<GoogleAdsMetrics>(
    (total, current) => ({
      impressions: total.impressions + current.impressions,
      clicks: total.clicks + current.clicks,
      cost: total.cost + current.cost,
      conversions: total.conversions + current.conversions,
      conversionValue: total.conversionValue + current.conversionValue,
    }),
    {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      conversionValue: 0,
    },
  );

  return calculateGoogleAdsMetrics(totals);
}
