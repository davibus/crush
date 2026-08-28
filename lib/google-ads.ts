export type GoogleAdsMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionValue: number;
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

export function getCpa(metrics: GoogleAdsMetrics) {
  if (metrics.conversions === 0) return 0;

  return metrics.cost / metrics.conversions;
}

export function getRoas(metrics: GoogleAdsMetrics) {
  if (metrics.cost === 0) return 0;

  return metrics.conversionValue / metrics.cost;
}