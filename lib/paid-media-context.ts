import type { GA4Data, GA4Metrics, GA4TrafficSource } from "./ga4.ts";
import type {
  CalculatedGoogleAdsMetrics,
  GoogleAdsSampleData,
} from "./google-ads.ts";
import { calculateGoogleAdsMetrics } from "./google-ads.ts";

export type PaidMediaCampaignContext = {
  campaignId: string;
  campaignName: string;
  googleAds: CalculatedGoogleAdsMetrics;
  ga4: GA4Metrics;
  ga4CampaignNames: string[];
  sourceMedium: string[];
};

export type PaidMediaAnalyticsContext = {
  ga4PropertyId: string;
  dateRange: GA4Data["dateRange"];
  ga4Summary: GA4Metrics;
  paidTrafficSources: GA4TrafficSource[];
  campaignComparisons: PaidMediaCampaignContext[];
  unmatchedGoogleAdsCampaignIds: string[];
  limitations: string[];
};

function isPaidTraffic(row: GA4TrafficSource): boolean {
  return (
    Boolean(row.googleAdsCampaignId) ||
    /paid|display|cross-network/i.test(row.channelGroup) ||
    /^(?:cpc|ppc|paid|display|cpm|cpv|cpa)$/i.test(row.medium)
  );
}

export function buildPaidMediaAnalyticsContext(
  campaignData: GoogleAdsSampleData,
  ga4: GA4Data,
): PaidMediaAnalyticsContext {
  const trafficByCampaign = new Map<string, GA4TrafficSource[]>();
  for (const row of ga4.trafficSources) {
    if (!row.googleAdsCampaignId) continue;
    const current = trafficByCampaign.get(row.googleAdsCampaignId) ?? [];
    current.push(row);
    trafficByCampaign.set(row.googleAdsCampaignId, current);
  }

  const campaignComparisons = campaignData.campaigns.flatMap(
    (campaign): PaidMediaCampaignContext[] => {
      const ga4Campaign = ga4.googleAdsCampaigns.find(
        (row) => row.campaignId === campaign.id,
      );
      if (!ga4Campaign) return [];
      const matchingRows = trafficByCampaign.get(campaign.id) ?? [];
      return [
        {
          campaignId: campaign.id,
          campaignName: campaign.name,
          googleAds: calculateGoogleAdsMetrics(campaign.metrics),
          ga4: ga4Campaign,
          ga4CampaignNames: [ga4Campaign.campaignName],
          sourceMedium: [
            ...new Set(matchingRows.map((row) => row.sourceMedium)),
          ],
        },
      ];
    },
  );
  const knownCampaignIds = new Set(
    campaignData.campaigns.map((campaign) => campaign.id),
  );
  const unmatchedGoogleAdsCampaignIds = [
    ...new Set(
      ga4.googleAdsCampaigns.flatMap((row) =>
        !knownCampaignIds.has(row.campaignId)
          ? [row.campaignId]
          : [],
      ),
    ),
  ];

  return {
    ga4PropertyId: ga4.propertyId,
    dateRange: ga4.dateRange,
    ga4Summary: ga4.summary,
    paidTrafficSources: ga4.trafficSources.filter(isPaidTraffic),
    campaignComparisons,
    unmatchedGoogleAdsCampaignIds,
    limitations: [
      "Google Ads clicks and conversions are platform-reported; GA4 sessions and key events are site-reported and should not be expected to match.",
      "Campaign rows are joined only when GA4 supplies an exact sessionGoogleAdsCampaignId matching a loaded Google Ads campaign ID.",
      "No cross-channel attribution or causal conclusion is inferred from this comparison.",
    ],
  };
}
