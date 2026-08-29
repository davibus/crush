import {
  aggregateGoogleAdsMetrics,
  calculateGoogleAdsMetrics,
  type CalculatedGoogleAdsMetrics,
  type GoogleAdsConversion,
  type GoogleAdsDevice,
  type GoogleAdsGeography,
  type GoogleAdsKeyword,
  type GoogleAdsMetrics,
  type GoogleAdsSampleData,
  type GoogleAdsSearchTerm,
} from "./google-ads.ts";
import {
  validateMarketingInsights,
  type MarketingEntity,
  type MarketingEvidence,
  type MarketingInsight,
} from "./marketing-insights.ts";

export const CAMPAIGN_ANALYSIS_CATEGORIES = [
  "high_cpa",
  "low_conversion_rate",
  "high_spend_low_conversions",
  "strong_performer",
  "budget_opportunity",
  "geographic_opportunity",
  "device_performance_difference",
  "search_term_waste",
  "negative_keyword_opportunity",
] as const;

export type CampaignAnalysisCategory =
  (typeof CAMPAIGN_ANALYSIS_CATEGORIES)[number];

export const DEFAULT_CAMPAIGN_ANALYSIS_THRESHOLDS = {
  minimumCampaignClicks: 100,
  minimumCampaignConversions: 10,
  highCpaToAccountRatio: 1.5,
  lowConversionRateToAccountRatio: 0.75,
  highSpendToAverageCampaignRatio: 0.35,
  fewConversionsToAverageCampaignRatio: 0.25,
  strongCpaToAccountRatio: 0.8,
  strongRoasToAccountRatio: 1.2,
  minimumBudgetOpportunityConversions: 25,
  minimumDimensionClicks: 100,
  geographyCpaToAccountRatio: 0.9,
  geographyRoasToAccountRatio: 1.15,
  deviceConversionRateGapRatio: 1.35,
  minimumSearchTermClicks: 30,
  minimumSearchTermSpendShare: 0.05,
  searchTermCpaToCampaignRatio: 1.5,
  searchTermConversionRateToCampaignRatio: 0.5,
  maximumNegativeKeywordConversions: 1,
} as const;

export type CampaignAnalysisThresholds = {
  [Key in keyof typeof DEFAULT_CAMPAIGN_ANALYSIS_THRESHOLDS]: number;
};

export type CampaignPerformanceInput = {
  campaignData: GoogleAdsSampleData;
  conversions?: readonly GoogleAdsConversion[];
  geographies?: readonly GoogleAdsGeography[];
  devices?: readonly GoogleAdsDevice[];
  keywords?: readonly GoogleAdsKeyword[];
  searchTerms?: readonly GoogleAdsSearchTerm[];
};

type CalculatedEntity<T> = T & { metrics: CalculatedGoogleAdsMetrics };

export type CampaignAnalysisCandidate = {
  id: string;
  category: CampaignAnalysisCategory;
  severity: "low" | "medium" | "high" | "critical";
  entity: MarketingEntity;
  finding: string;
  evidence: MarketingEvidence[];
  actionDirection: string;
};

export type PreparedCampaignPerformanceAnalysis = {
  account: GoogleAdsSampleData["account"];
  accountMetrics: CalculatedGoogleAdsMetrics;
  benchmarks: {
    averageCampaignSpend: number;
    averageCampaignConversions: number;
  };
  thresholds: CampaignAnalysisThresholds;
  dimensionAvailability: {
    campaigns: true;
    conversions: boolean;
    geographies: boolean;
    devices: boolean;
    keywords: boolean;
    searchTerms: boolean;
  };
  campaigns: Array<
    CalculatedEntity<
      Omit<GoogleAdsSampleData["campaigns"][number], "metrics">
    >
  >;
  conversions: GoogleAdsConversion[];
  geographies: Array<CalculatedEntity<Omit<GoogleAdsGeography, keyof GoogleAdsMetrics>>>;
  devices: Array<CalculatedEntity<Omit<GoogleAdsDevice, keyof GoogleAdsMetrics>>>;
  keywords: Array<CalculatedEntity<Omit<GoogleAdsKeyword, keyof GoogleAdsMetrics>>>;
  searchTerms: Array<CalculatedEntity<Omit<GoogleAdsSearchTerm, keyof GoogleAdsMetrics>>>;
  candidates: CampaignAnalysisCandidate[];
};

export type CampaignAnalysisResult =
  | { success: true; insights: MarketingInsight[] }
  | { success: false; insights: []; error: string };

type InsightGenerator = (
  prompt: string,
  analysis: PreparedCampaignPerformanceAnalysis,
) => Promise<unknown>;

function rowMetrics(row: GoogleAdsMetrics): CalculatedGoogleAdsMetrics {
  return calculateGoogleAdsMetrics({
    impressions: row.impressions,
    clicks: row.clicks,
    cost: row.cost,
    conversions: row.conversions,
    conversionValue: row.conversionValue,
  });
}

function calculateRows<T extends GoogleAdsMetrics>(
  rows: readonly T[] | undefined,
): Array<CalculatedEntity<Omit<T, keyof GoogleAdsMetrics>>> {
  return (rows ?? []).map((row) => {
    const {
      impressions,
      clicks,
      cost,
      conversions,
      conversionValue,
      ...identity
    } = row;

    return {
      ...identity,
      metrics: rowMetrics({
        impressions,
        clicks,
        cost,
        conversions,
        conversionValue,
      }),
    };
  });
}

function metricEvidence(
  metrics: CalculatedGoogleAdsMetrics,
  context: string,
  additionalEvidence: readonly MarketingEvidence[] = [],
): MarketingEvidence[] {
  const evidence: MarketingEvidence[] = [
    { metric: "Spend", value: metrics.spend, unit: "currency", context },
    {
      metric: "Conversions",
      value: metrics.conversions,
      unit: "count",
      context,
    },
  ];

  if (metrics.conversions > 0) {
    evidence.push({ metric: "CPA", value: metrics.cpa, unit: "currency", context });
  }

  evidence.push(
    {
      metric: "Conversion rate",
      value: metrics.conversionRate,
      unit: "percent",
      context,
    },
    { metric: "ROAS", value: metrics.roas, unit: "ratio", context },
    { metric: "Clicks", value: metrics.clicks, unit: "count", context },
  );

  return [...evidence, ...additionalEvidence].slice(0, 8);
}

function candidate(
  category: CampaignAnalysisCategory,
  severity: CampaignAnalysisCandidate["severity"],
  entity: MarketingEntity,
  finding: string,
  metrics: CalculatedGoogleAdsMetrics,
  evidenceContext: string,
  actionDirection: string,
  additionalEvidence: readonly MarketingEvidence[] = [],
): CampaignAnalysisCandidate {
  return {
    id: `${category}:${entity.type}:${entity.id ?? entity.name}`,
    category,
    severity,
    entity,
    finding,
    evidence: metricEvidence(metrics, evidenceContext, additionalEvidence),
    actionDirection,
  };
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function keywordLookupKey(
  campaignId: string,
  adGroup: string,
  keyword: string,
): string {
  return `${campaignId}\u0000${adGroup}\u0000${keyword}`;
}

export function prepareCampaignPerformanceAnalysis(
  input: CampaignPerformanceInput,
  thresholdOverrides: Partial<CampaignAnalysisThresholds> = {},
): PreparedCampaignPerformanceAnalysis {
  const thresholds = {
    ...DEFAULT_CAMPAIGN_ANALYSIS_THRESHOLDS,
    ...thresholdOverrides,
  };
  const { campaignData } = input;
  const accountMetrics = aggregateGoogleAdsMetrics(
    campaignData.campaigns.map((item) => item.metrics),
  );
  const campaignCount = campaignData.campaigns.length;
  const averageCampaignSpend = campaignCount
    ? accountMetrics.spend / campaignCount
    : 0;
  const averageCampaignConversions = campaignCount
    ? accountMetrics.conversions / campaignCount
    : 0;
  const campaigns = campaignData.campaigns.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    channel: item.channel,
    dailyBudget: item.dailyBudget,
    metrics: calculateGoogleAdsMetrics(item.metrics),
  }));
  const conversions = [...(input.conversions ?? [])];
  const geographies = calculateRows(input.geographies);
  const devices = calculateRows(input.devices);
  const keywords = calculateRows(input.keywords);
  const searchTerms = calculateRows(input.searchTerms);
  const candidates: CampaignAnalysisCandidate[] = [];
  const conversionEvidenceByCampaign = new Map<string, MarketingEvidence[]>();

  for (const conversion of conversions) {
    if (!positive(conversion.conversions)) continue;

    const current = conversionEvidenceByCampaign.get(conversion.campaignId);
    if (current && current[0]?.value >= conversion.conversions) continue;

    const context = `Largest measured conversion action for ${conversion.campaignName}.`;
    conversionEvidenceByCampaign.set(conversion.campaignId, [
      {
        metric: `${conversion.conversionAction} conversions`,
        value: conversion.conversions,
        unit: "count",
        context,
      },
      {
        metric: `${conversion.conversionAction} conversion value`,
        value: conversion.conversionValue,
        unit: "currency",
        context,
      },
    ]);
  }

  for (const campaign of campaigns) {
    const entity: MarketingEntity = {
      type: "campaign",
      id: campaign.id,
      name: campaign.name,
    };
    const enoughClicks =
      campaign.metrics.clicks >= thresholds.minimumCampaignClicks;
    const enoughConversions =
      campaign.metrics.conversions >= thresholds.minimumCampaignConversions;
    const accountComparison = `Campaign metrics; account CPA is ${accountMetrics.cpa.toFixed(2)}, conversion rate is ${accountMetrics.conversionRate.toFixed(2)}%, and ROAS is ${accountMetrics.roas.toFixed(2)}.`;
    const conversionEvidence =
      conversionEvidenceByCampaign.get(campaign.id) ?? [];

    if (
      enoughConversions &&
      positive(accountMetrics.cpa) &&
      campaign.metrics.cpa >=
        accountMetrics.cpa * thresholds.highCpaToAccountRatio
    ) {
      candidates.push(
        candidate(
          "high_cpa",
          "high",
          entity,
          "CPA is materially above the account benchmark.",
          campaign.metrics,
          accountComparison,
          "Reduce inefficient targeting or bids before adding spend.",
          conversionEvidence,
        ),
      );
    }

    if (
      enoughClicks &&
      positive(accountMetrics.conversionRate) &&
      campaign.metrics.conversionRate <=
        accountMetrics.conversionRate *
          thresholds.lowConversionRateToAccountRatio
    ) {
      candidates.push(
        candidate(
          "low_conversion_rate",
          "high",
          entity,
          "Conversion rate is materially below the account benchmark.",
          campaign.metrics,
          accountComparison,
          "Review query intent, ads, and landing-page alignment.",
          conversionEvidence,
        ),
      );
    }

    if (
      enoughClicks &&
      campaign.metrics.spend > 0 &&
      campaign.metrics.spend >=
        averageCampaignSpend * thresholds.highSpendToAverageCampaignRatio &&
      campaign.metrics.conversions <=
        averageCampaignConversions *
          thresholds.fewConversionsToAverageCampaignRatio
    ) {
      candidates.push(
        candidate(
          "high_spend_low_conversions",
          campaign.metrics.conversions === 0 ? "critical" : "high",
          entity,
          "Spend is meaningful while conversion volume is low relative to other campaigns.",
          campaign.metrics,
          `Campaign metrics; average campaign spend is ${averageCampaignSpend.toFixed(2)} and average campaign conversions are ${averageCampaignConversions.toFixed(2)}.`,
          "Audit traffic quality and stop or constrain waste until conversion volume improves.",
          conversionEvidence,
        ),
      );
    }

    const strongPerformance =
      enoughConversions &&
      positive(accountMetrics.cpa) &&
      positive(accountMetrics.roas) &&
      campaign.metrics.cpa <=
        accountMetrics.cpa * thresholds.strongCpaToAccountRatio &&
      campaign.metrics.roas >=
        accountMetrics.roas * thresholds.strongRoasToAccountRatio;

    if (strongPerformance) {
      candidates.push(
        candidate(
          "strong_performer",
          "medium",
          entity,
          "CPA and ROAS both outperform account benchmarks.",
          campaign.metrics,
          accountComparison,
          "Protect this campaign and test whether its successful approach can scale.",
          conversionEvidence,
        ),
      );
    }

    if (
      strongPerformance &&
      campaign.status === "ENABLED" &&
      campaign.metrics.conversions >=
        thresholds.minimumBudgetOpportunityConversions
    ) {
      candidates.push(
        candidate(
          "budget_opportunity",
          "medium",
          entity,
          "Efficient performance and sufficient conversion volume support a controlled budget-growth test.",
          campaign.metrics,
          `${accountComparison} Daily budget is ${campaign.dailyBudget.toFixed(2)}.`,
          "Test a measured budget reallocation while monitoring marginal CPA and ROAS.",
          conversionEvidence,
        ),
      );
    }
  }

  if (positive(accountMetrics.cpa) && positive(accountMetrics.roas)) {
    for (const geography of geographies) {
      if (
        geography.metrics.clicks >= thresholds.minimumDimensionClicks &&
        geography.metrics.conversions >= thresholds.minimumCampaignConversions &&
        geography.metrics.cpa <=
          accountMetrics.cpa * thresholds.geographyCpaToAccountRatio &&
        geography.metrics.roas >=
          accountMetrics.roas * thresholds.geographyRoasToAccountRatio
      ) {
        candidates.push(
          candidate(
            "geographic_opportunity",
            "medium",
            { type: "geography", id: geography.id, name: geography.location },
            "This location combines lower CPA and higher ROAS than the account.",
            geography.metrics,
            `Location metrics for ${geography.campaignName}; account CPA is ${accountMetrics.cpa.toFixed(2)} and ROAS is ${accountMetrics.roas.toFixed(2)}.`,
            "Test additional geographic allocation without assuming unobserved market capacity.",
          ),
        );
      }
    }
  }

  const devicesByCampaign = new Map<string, typeof devices>();
  for (const device of devices) {
    const campaignDevices = devicesByCampaign.get(device.campaignId) ?? [];
    campaignDevices.push(device);
    devicesByCampaign.set(device.campaignId, campaignDevices);
  }
  for (const campaignDevices of devicesByCampaign.values()) {
    const eligible = campaignDevices.filter(
      (device) => device.metrics.clicks >= thresholds.minimumDimensionClicks,
    );
    if (eligible.length < 2) continue;

    const sorted = [...eligible].sort(
      (left, right) =>
        right.metrics.conversionRate - left.metrics.conversionRate,
    );
    const best = sorted[0];
    const worst = sorted.at(-1);
    if (
      !best ||
      !worst ||
      !positive(best.metrics.conversionRate) ||
      (positive(worst.metrics.conversionRate) &&
        best.metrics.conversionRate <
          worst.metrics.conversionRate * thresholds.deviceConversionRateGapRatio)
    ) {
      continue;
    }

    candidates.push(
      {
        id: `device_performance_difference:device:${worst.id}`,
        category: "device_performance_difference",
        severity: "medium",
        entity: { type: "device", id: worst.id, name: worst.device },
        finding: `${best.device} converts materially better than ${worst.device} in ${worst.campaignName}.`,
        evidence: [
          {
            metric: `${best.device} conversion rate`,
            value: best.metrics.conversionRate,
            unit: "percent",
            context: `${best.device} performance in ${best.campaignName}.`,
          },
          {
            metric: `${worst.device} conversion rate`,
            value: worst.metrics.conversionRate,
            unit: "percent",
            context: `${worst.device} performance in ${worst.campaignName}.`,
          },
          {
            metric: `${best.device} clicks`,
            value: best.metrics.clicks,
            unit: "count",
            context: "Sample size for the better-performing device.",
          },
          {
            metric: `${worst.device} clicks`,
            value: worst.metrics.clicks,
            unit: "count",
            context: "Sample size for the lower-performing device.",
          },
        ],
        actionDirection:
          "Review device-specific experience and test device-aware bid or creative changes.",
      },
    );
  }

  const campaignsById = new Map(campaigns.map((item) => [item.id, item]));
  const keywordsByIdentity = new Map(
    keywords.map((keyword) => [
      keywordLookupKey(
        keyword.campaignId,
        keyword.adGroup,
        keyword.keyword,
      ),
      keyword,
    ]),
  );
  for (const searchTerm of searchTerms) {
    const parent = campaignsById.get(searchTerm.campaignId);
    if (!parent || searchTerm.metrics.clicks < thresholds.minimumSearchTermClicks) {
      continue;
    }

    const meaningfulSpend =
      positive(parent.metrics.spend) &&
      searchTerm.metrics.spend >=
        parent.metrics.spend * thresholds.minimumSearchTermSpendShare;
    const zeroConversionWaste =
      searchTerm.metrics.conversions === 0 && searchTerm.metrics.spend > 0;
    const inefficientCpa =
      searchTerm.metrics.conversions > 0 &&
      positive(parent.metrics.cpa) &&
      searchTerm.metrics.cpa >=
        parent.metrics.cpa * thresholds.searchTermCpaToCampaignRatio;
    const inefficientConversionRate =
      positive(parent.metrics.conversionRate) &&
      searchTerm.metrics.conversionRate <=
        parent.metrics.conversionRate *
          thresholds.searchTermConversionRateToCampaignRatio;

    if (meaningfulSpend && (zeroConversionWaste || inefficientCpa || inefficientConversionRate)) {
      const matchedKeyword = keywordsByIdentity.get(
        keywordLookupKey(
          searchTerm.campaignId,
          searchTerm.adGroup,
          searchTerm.matchedKeyword,
        ),
      );
      const keywordContext = matchedKeyword
        ? ` Matched keyword "${matchedKeyword.keyword}" is ${matchedKeyword.status.toLowerCase()} ${matchedKeyword.matchType.toLowerCase()} match.`
        : ` Reported matched keyword is "${searchTerm.matchedKeyword}" (${searchTerm.matchType.toLowerCase()} match).`;
      const context = `Search-term metrics in ${searchTerm.campaignName}; campaign CPA is ${parent.metrics.cpa.toFixed(2)} and conversion rate is ${parent.metrics.conversionRate.toFixed(2)}%.${keywordContext}`;
      candidates.push(
        candidate(
          "search_term_waste",
          zeroConversionWaste ? "high" : "medium",
          {
            type: "search_term",
            id: searchTerm.id,
            name: searchTerm.searchTerm,
          },
          "This query consumes meaningful campaign spend with weak conversion efficiency.",
          searchTerm.metrics,
          context,
          "Review intent and exclude or isolate the query if it is not valuable.",
        ),
      );

      if (
        searchTerm.matchType !== "EXACT" &&
        (!matchedKeyword || matchedKeyword.status === "ENABLED") &&
        searchTerm.metrics.conversions <=
          thresholds.maximumNegativeKeywordConversions
      ) {
        candidates.push(
          candidate(
            "negative_keyword_opportunity",
            "high",
            {
              type: "search_term",
              id: searchTerm.id,
              name: searchTerm.searchTerm,
            },
            `A ${searchTerm.matchType.toLowerCase()}-matched query shows enough waste to review as a negative keyword.`,
            searchTerm.metrics,
            context,
            "Validate lead quality, then add an appropriately scoped negative keyword if the intent is irrelevant.",
          ),
        );
      }
    }
  }

  return {
    account: campaignData.account,
    accountMetrics,
    benchmarks: { averageCampaignSpend, averageCampaignConversions },
    thresholds,
    dimensionAvailability: {
      campaigns: true,
      conversions: conversions.length > 0,
      geographies: geographies.length > 0,
      devices: devices.length > 0,
      keywords: keywords.length > 0,
      searchTerms: searchTerms.length > 0,
    },
    campaigns,
    conversions,
    geographies,
    devices,
    keywords,
    searchTerms,
    candidates,
  };
}

export function buildCampaignAnalysisPrompt(
  analysis: PreparedCampaignPerformanceAnalysis,
  userRequest: string,
): string {
  return [
    `User request: ${userRequest}`,
    "Analyze the prepared Google Ads performance data below.",
    "The application has already calculated all basic metrics and applied the supplied adjustable thresholds.",
    "Only recommend opportunities represented in candidates. You may combine related candidates for the same entity.",
    "Copy evidence metric, value, unit, and context exactly from candidate evidence; do not calculate, estimate, or invent evidence.",
    "Use the candidate severity exactly and turn its finding and actionDirection into a concrete interpretation and recommendation.",
    "Do not infer device or other dimension findings when dimensionAvailability is false.",
    "Return an empty insights array if no candidate is supported. Prioritize the most actionable findings and return no more than five insights.",
    JSON.stringify(analysis),
  ].join("\n\n");
}

function evidenceMatches(
  evidence: MarketingEvidence,
  allowed: readonly MarketingEvidence[],
): boolean {
  return allowed.some(
    (item) =>
      item.metric === evidence.metric &&
      item.unit === evidence.unit &&
      item.context === evidence.context &&
      Math.abs(item.value - evidence.value) < 1e-9,
  );
}

export function validateCampaignAnalysisResponse(
  value: unknown,
  analysis: PreparedCampaignPerformanceAnalysis,
): CampaignAnalysisResult {
  const validation = validateMarketingInsights(value);
  if (!validation.success) return validation;

  for (const insight of validation.insights) {
    const matchingCandidates = analysis.candidates.filter(
      (item) =>
        item.entity.type === insight.affectedEntity.type &&
        item.entity.id === insight.affectedEntity.id &&
        item.entity.name === insight.affectedEntity.name,
    );
    const allowedEvidence = matchingCandidates.flatMap((item) => item.evidence);

    if (
      matchingCandidates.length === 0 ||
      !matchingCandidates.some(
        (candidate) => candidate.severity === insight.severity,
      ) ||
      insight.evidence.some(
        (item) => !evidenceMatches(item, allowedEvidence),
      )
    ) {
      return {
        success: false,
        insights: [],
        error:
          "The AI response included an unsupported entity, severity, or evidence value.",
      };
    }
  }

  return validation;
}

export async function analyzeCampaignPerformance(
  analysis: PreparedCampaignPerformanceAnalysis,
  userRequest: string,
  generate: InsightGenerator,
): Promise<CampaignAnalysisResult> {
  try {
    const value = await generate(
      buildCampaignAnalysisPrompt(analysis, userRequest),
      analysis,
    );
    return validateCampaignAnalysisResponse(value, analysis);
  } catch {
    return {
      success: false,
      insights: [],
      error: "The AI service could not complete the campaign analysis.",
    };
  }
}
