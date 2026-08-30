import {
  prepareCampaignPerformanceAnalysis,
  type CampaignAnalysisCandidate,
  type CampaignAnalysisThresholds,
} from "./campaign-performance-analyzer.ts";
import {
  aggregateGoogleAdsMetrics,
  calculateGoogleAdsMetrics,
  type CalculatedGoogleAdsMetrics,
  type GoogleAdsConversion,
  type GoogleAdsDevice,
  type GoogleAdsGeography,
  type GoogleAdsKeyword,
  type GoogleAdsLandingPage,
  type GoogleAdsMetrics,
  type GoogleAdsSampleData,
  type GoogleAdsSearchTerm,
} from "./google-ads.ts";
import type { MarketingEvidence } from "./marketing-insights.ts";

export const ACCOUNT_AUDIT_CATEGORIES = [
  "account_structure",
  "campaign_performance",
  "keyword_performance",
  "search_term_waste",
  "geographic_performance",
  "device_performance",
  "budget_allocation",
  "conversion_performance",
  "landing_page_opportunities",
] as const;

export type AccountAuditCategory = (typeof ACCOUNT_AUDIT_CATEGORIES)[number];
export type AccountAuditSeverity = "low" | "medium" | "high" | "critical";
export type AccountAuditSectionStatus =
  | "analyzed"
  | "insufficient_data"
  | "unavailable";

export const ACCOUNT_AUDIT_CATEGORY_LABELS: Record<
  AccountAuditCategory,
  string
> = {
  account_structure: "Account structure",
  campaign_performance: "Campaign performance",
  keyword_performance: "Keyword performance",
  search_term_waste: "Search-term waste",
  geographic_performance: "Geographic performance",
  device_performance: "Device performance",
  budget_allocation: "Budget allocation",
  conversion_performance: "Conversion performance",
  landing_page_opportunities: "Landing-page opportunities",
};

export const DEFAULT_ACCOUNT_AUDIT_THRESHOLDS = {
  minimumEntityClicks: 100,
  inefficientCpaToAccountRatio: 1.5,
  geographicCpaToAccountRatio: 1.4,
  deviceEfficiencyGapRatio: 1.35,
  minimumCampaignSpendShare: 0.2,
  inefficientBudgetCpaToAccountRatio: 1.25,
  minimumBroadMatchKeywordShare: 0.75,
  minimumKeywordsForMatchTypeCheck: 4,
  conversionTotalTolerance: 0.000001,
} as const;

export type AccountAuditThresholds = {
  [Key in keyof typeof DEFAULT_ACCOUNT_AUDIT_THRESHOLDS]: number;
};

export type AccountAuditInput = {
  campaignData: GoogleAdsSampleData;
  conversions?: readonly GoogleAdsConversion[];
  geographies?: readonly GoogleAdsGeography[];
  devices?: readonly GoogleAdsDevice[];
  keywords?: readonly GoogleAdsKeyword[];
  searchTerms?: readonly GoogleAdsSearchTerm[];
  landingPages?: readonly GoogleAdsLandingPage[];
};

export type AccountAuditEntity = {
  type:
    | "account"
    | "campaign"
    | "ad_group"
    | "keyword"
    | "search_term"
    | "geography"
    | "device"
    | "conversion_action"
    | "landing_page";
  id: string | null;
  name: string;
};

export type AccountAuditFinding = {
  id: string;
  category: AccountAuditCategory;
  severity: AccountAuditSeverity;
  title: string;
  description: string;
  evidence: MarketingEvidence[];
  recommendation: string;
  affectedEntity: AccountAuditEntity;
  ruleId: string;
};

export type AccountAuditSection = {
  category: AccountAuditCategory;
  label: string;
  status: AccountAuditSectionStatus;
  reason: string | null;
  findings: AccountAuditFinding[];
};

export type AccountAuditResult = {
  account: GoogleAdsSampleData["account"];
  accountMetrics: CalculatedGoogleAdsMetrics;
  thresholds: AccountAuditThresholds;
  categories: AccountAuditSection[];
  findings: AccountAuditFinding[];
  summary: {
    totalFindings: number;
    analyzedCategories: number;
    unavailableCategories: number;
    insufficientDataCategories: number;
  };
};

export type AccountAuditOptions = {
  thresholds?: Partial<AccountAuditThresholds>;
  analyzerThresholds?: Partial<CampaignAnalysisThresholds>;
};

const SEVERITY_ORDER: Record<AccountAuditSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function metricEvidence(
  metric: string,
  value: number,
  unit: MarketingEvidence["unit"],
  context: string,
): MarketingEvidence {
  return { metric, value, unit, context };
}

function entityMetrics(row: GoogleAdsMetrics): CalculatedGoogleAdsMetrics {
  return calculateGoogleAdsMetrics({
    impressions: row.impressions,
    clicks: row.clicks,
    cost: row.cost,
    conversions: row.conversions,
    conversionValue: row.conversionValue,
  });
}

function finding(
  category: AccountAuditCategory,
  ruleId: string,
  severity: AccountAuditSeverity,
  affectedEntity: AccountAuditEntity,
  title: string,
  description: string,
  evidence: MarketingEvidence[],
  recommendation: string,
): AccountAuditFinding {
  return {
    id: `${category}:${ruleId}:${affectedEntity.type}:${affectedEntity.id ?? affectedEntity.name}`,
    category,
    severity,
    title,
    description,
    evidence,
    recommendation,
    affectedEntity,
    ruleId,
  };
}

function mappedAnalyzerFinding(
  category: AccountAuditCategory,
  candidate: CampaignAnalysisCandidate,
): AccountAuditFinding {
  const titles: Record<CampaignAnalysisCandidate["category"], string> = {
    high_cpa: "Campaign CPA is above the account benchmark",
    low_conversion_rate: "Campaign conversion rate is below the account benchmark",
    high_spend_low_conversions: "Campaign is spending with few conversions",
    strong_performer: "Campaign is an efficient performer",
    budget_opportunity: "Campaign may support additional budget",
    geographic_opportunity: "Geography is outperforming account benchmarks",
    device_performance_difference: "Device performance differs materially",
    search_term_waste: "Search term is consuming inefficient spend",
    negative_keyword_opportunity: "Search term is a negative-keyword candidate",
  };

  return finding(
    category,
    `analyzer-${candidate.category}`,
    candidate.severity,
    candidate.entity,
    titles[candidate.category],
    candidate.finding,
    candidate.evidence,
    candidate.actionDirection,
  );
}

function statusForOptionalRows(
  rows: readonly unknown[] | undefined,
  datasetName: string,
): Pick<AccountAuditSection, "status" | "reason"> {
  if (rows === undefined) {
    return {
      status: "unavailable",
      reason: `${datasetName} data was not provided, so this category was not evaluated.`,
    };
  }

  if (rows.length === 0) {
    return {
      status: "insufficient_data",
      reason: `${datasetName} data was provided but contains no rows.`,
    };
  }

  return { status: "analyzed", reason: null };
}

function sortFindings(findings: AccountAuditFinding[]): AccountAuditFinding[] {
  return findings.sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      left.id.localeCompare(right.id),
  );
}

export function runAccountAudit(
  input: AccountAuditInput,
  options: AccountAuditOptions = {},
): AccountAuditResult {
  const thresholds = {
    ...DEFAULT_ACCOUNT_AUDIT_THRESHOLDS,
    ...options.thresholds,
  };
  const analysis = prepareCampaignPerformanceAnalysis(
    input,
    options.analyzerThresholds,
  );
  const account = input.campaignData.account;
  const accountEntity: AccountAuditEntity = {
    type: "account",
    id: account.id,
    name: account.name,
  };
  const findingsByCategory = new Map<AccountAuditCategory, AccountAuditFinding[]>(
    ACCOUNT_AUDIT_CATEGORIES.map((category) => [category, []]),
  );
  const add = (auditFinding: AccountAuditFinding) => {
    findingsByCategory.get(auditFinding.category)?.push(auditFinding);
  };

  const campaignNames = new Map<string, GoogleAdsSampleData["campaigns"]>();
  for (const campaign of input.campaignData.campaigns) {
    const normalizedName = campaign.name.trim().toLocaleLowerCase("en-US");
    campaignNames.set(normalizedName, [
      ...(campaignNames.get(normalizedName) ?? []),
      campaign,
    ]);
  }
  for (const duplicateCampaigns of campaignNames.values()) {
    if (duplicateCampaigns.length < 2) continue;
    const sortedIds = duplicateCampaigns.map(({ id }) => id).sort();
    add(
      finding(
        "account_structure",
        "duplicate-campaign-name",
        "medium",
        accountEntity,
        "Multiple campaigns share the same name",
        `${duplicateCampaigns.length} campaigns use the name \"${duplicateCampaigns[0]?.name}\", which makes reporting and management ambiguous.`,
        [
          metricEvidence(
            "Campaigns with duplicate name",
            duplicateCampaigns.length,
            "count",
            `Campaign IDs: ${sortedIds.join(", ")}.`,
          ),
        ],
        "Give each campaign a unique, descriptive name.",
      ),
    );
  }

  const enabledCampaigns = input.campaignData.campaigns.filter(
    ({ status }) => status === "ENABLED",
  );
  if (input.campaignData.campaigns.length > 0 && enabledCampaigns.length === 0) {
    add(
      finding(
        "account_structure",
        "no-enabled-campaigns",
        "high",
        accountEntity,
        "Account has no enabled campaigns",
        "Campaign data contains campaigns, but none are enabled.",
        [
          metricEvidence(
            "Enabled campaigns",
            0,
            "count",
            `${input.campaignData.campaigns.length} total campaigns were evaluated.`,
          ),
        ],
        "Confirm whether the account should be inactive; otherwise enable an approved campaign.",
      ),
    );
  }

  if (input.keywords !== undefined) {
    const enabledKeywordCampaignIds = new Set(
      input.keywords
        .filter(({ status }) => status === "ENABLED")
        .map(({ campaignId }) => campaignId),
    );
    for (const campaign of enabledCampaigns) {
      if (
        campaign.channel === "SEARCH" &&
        !enabledKeywordCampaignIds.has(campaign.id)
      ) {
        add(
          finding(
            "account_structure",
            "search-campaign-without-enabled-keywords",
            "high",
            { type: "campaign", id: campaign.id, name: campaign.name },
            "Enabled search campaign has no enabled keywords",
            "The provided keyword dataset contains no enabled keyword for this enabled search campaign.",
            [
              metricEvidence(
                "Enabled keywords",
                0,
                "count",
                `Keyword rows were checked for campaign ${campaign.id}.`,
              ),
            ],
            "Add an eligible keyword or pause the campaign until its targeting is ready.",
          ),
        );
      }
    }
  }

  const analyzerCategoryMap: Partial<
    Record<CampaignAnalysisCandidate["category"], AccountAuditCategory>
  > = {
    high_cpa: "campaign_performance",
    low_conversion_rate: "campaign_performance",
    high_spend_low_conversions: "campaign_performance",
    strong_performer: "campaign_performance",
    budget_opportunity: "budget_allocation",
    geographic_opportunity: "geographic_performance",
    device_performance_difference: "device_performance",
    search_term_waste: "search_term_waste",
    negative_keyword_opportunity: "search_term_waste",
  };
  for (const candidate of analysis.candidates) {
    const category = analyzerCategoryMap[candidate.category];
    if (category) add(mappedAnalyzerFinding(category, candidate));
  }

  for (const keyword of input.keywords ?? []) {
    const metrics = entityMetrics(keyword);
    const affectedEntity: AccountAuditEntity = {
      type: "keyword",
      id: keyword.id,
      name: keyword.keyword,
    };
    const context = `${keyword.campaignName} / ${keyword.adGroup}; ${keyword.matchType.toLowerCase()} match.`;
    if (
      metrics.clicks >= thresholds.minimumEntityClicks &&
      metrics.conversions === 0 &&
      metrics.spend > 0
    ) {
      add(
        finding(
          "keyword_performance",
          "spend-without-conversions",
          "high",
          affectedEntity,
          "Keyword is spending without conversions",
          "The keyword reached the minimum click volume and recorded spend but no conversions.",
          [
            metricEvidence("Spend", metrics.spend, "currency", context),
            metricEvidence("Clicks", metrics.clicks, "count", context),
            metricEvidence("Conversions", 0, "count", context),
          ],
          "Review query relevance and landing-page alignment, then pause or constrain the keyword if the traffic is not valuable.",
        ),
      );
    } else if (
      metrics.clicks >= thresholds.minimumEntityClicks &&
      metrics.conversions > 0 &&
      analysis.accountMetrics.cpa > 0 &&
      metrics.cpa >=
        analysis.accountMetrics.cpa * thresholds.inefficientCpaToAccountRatio
    ) {
      add(
        finding(
          "keyword_performance",
          "high-cpa",
          "medium",
          affectedEntity,
          "Keyword CPA is above the account benchmark",
          "The keyword has enough click volume for review and its measured CPA is materially above the account CPA.",
          [
            metricEvidence("CPA", metrics.cpa, "currency", context),
            metricEvidence(
              "Account CPA",
              analysis.accountMetrics.cpa,
              "currency",
              "Aggregate campaign benchmark.",
            ),
            metricEvidence("Conversions", metrics.conversions, "count", context),
          ],
          "Review its search terms and bid before continuing the same level of spend.",
        ),
      );
    }
  }

  const enabledKeywords = (input.keywords ?? []).filter(
    ({ status }) => status === "ENABLED",
  );
  if (enabledKeywords.length >= thresholds.minimumKeywordsForMatchTypeCheck) {
    const broadKeywords = enabledKeywords.filter(
      ({ matchType }) => matchType === "BROAD",
    );
    const broadShare = broadKeywords.length / enabledKeywords.length;
    if (broadShare >= thresholds.minimumBroadMatchKeywordShare) {
      add(
        finding(
          "account_structure",
          "broad-match-concentration",
          "medium",
          accountEntity,
          "Enabled keyword targeting is concentrated in broad match",
          "The share of enabled broad-match keywords meets the configured structural review threshold.",
          [
            metricEvidence(
              "Broad-match keyword share",
              broadShare * 100,
              "percent",
              `${broadKeywords.length} of ${enabledKeywords.length} enabled keywords are broad match.`,
            ),
          ],
          "Review search-term quality and confirm that negative-keyword coverage is adequate.",
        ),
      );
    }
  }

  for (const geography of input.geographies ?? []) {
    const metrics = entityMetrics(geography);
    if (
      metrics.clicks >= thresholds.minimumEntityClicks &&
      metrics.conversions > 0 &&
      analysis.accountMetrics.cpa > 0 &&
      metrics.cpa >=
        analysis.accountMetrics.cpa * thresholds.geographicCpaToAccountRatio
    ) {
      add(
        finding(
          "geographic_performance",
          "high-cpa-location",
          "medium",
          { type: "geography", id: geography.id, name: geography.location },
          "Location CPA is above the account benchmark",
          "This location has sufficient click volume and a materially higher CPA than the account.",
          [
            metricEvidence("CPA", metrics.cpa, "currency", geography.campaignName),
            metricEvidence(
              "Account CPA",
              analysis.accountMetrics.cpa,
              "currency",
              "Aggregate campaign benchmark.",
            ),
            metricEvidence("Clicks", metrics.clicks, "count", geography.campaignName),
          ],
          "Review location targeting or bid adjustments while monitoring conversion volume.",
        ),
      );
    }
  }

  if (input.devices !== undefined) {
    const devicesByCampaign = new Map<string, GoogleAdsDevice[]>();
    for (const device of input.devices) {
      devicesByCampaign.set(device.campaignId, [
        ...(devicesByCampaign.get(device.campaignId) ?? []),
        device,
      ]);
    }
    for (const campaignDevices of devicesByCampaign.values()) {
      const eligible = campaignDevices
        .map((device) => ({ device, metrics: entityMetrics(device) }))
        .filter(({ metrics }) => metrics.clicks >= thresholds.minimumEntityClicks);
      if (eligible.length < 2) continue;
      const bestRate = Math.max(...eligible.map(({ metrics }) => metrics.conversionRate));
      for (const { device, metrics } of eligible) {
        if (
          bestRate > 0 &&
          metrics.conversionRate * thresholds.deviceEfficiencyGapRatio <= bestRate
        ) {
          const duplicate = findingsByCategory
            .get("device_performance")
            ?.some((item) => item.affectedEntity.id === device.id);
          if (duplicate) continue;
          add(
            finding(
              "device_performance",
              "low-conversion-rate-device",
              "medium",
              { type: "device", id: device.id, name: device.device },
              "Device conversion rate trails its campaign peer",
              "The device segment has enough clicks for review and its conversion rate is materially below the best measured device in the same campaign.",
              [
                metricEvidence(
                  "Conversion rate",
                  metrics.conversionRate,
                  "percent",
                  device.campaignName,
                ),
                metricEvidence(
                  "Best device conversion rate",
                  bestRate,
                  "percent",
                  device.campaignName,
                ),
                metricEvidence("Clicks", metrics.clicks, "count", device.campaignName),
              ],
              "Review device-specific experience and bidding, then test a measured adjustment.",
            ),
          );
        }
      }
    }
  }

  for (const campaign of analysis.campaigns) {
    if (analysis.accountMetrics.spend <= 0 || campaign.metrics.spend <= 0) continue;
    const spendShare = campaign.metrics.spend / analysis.accountMetrics.spend;
    if (
      spendShare >= thresholds.minimumCampaignSpendShare &&
      campaign.metrics.conversions === 0
    ) {
      add(
        finding(
          "budget_allocation",
          "material-spend-without-conversions",
          "critical",
          { type: "campaign", id: campaign.id, name: campaign.name },
          "Budget is concentrated in a campaign without conversions",
          "The campaign consumes a material share of account spend and has no measured conversions.",
          [
            metricEvidence("Spend share", spendShare * 100, "percent", campaign.name),
            metricEvidence("Spend", campaign.metrics.spend, "currency", campaign.name),
            metricEvidence("Conversions", 0, "count", campaign.name),
          ],
          "Constrain additional spend until targeting, measurement, and conversion performance are validated.",
        ),
      );
    } else if (
      spendShare >= thresholds.minimumCampaignSpendShare &&
      campaign.metrics.conversions > 0 &&
      analysis.accountMetrics.cpa > 0 &&
      campaign.metrics.cpa >=
        analysis.accountMetrics.cpa * thresholds.inefficientBudgetCpaToAccountRatio
    ) {
      add(
        finding(
          "budget_allocation",
          "concentrated-high-cpa-spend",
          "high",
          { type: "campaign", id: campaign.id, name: campaign.name },
          "A large spend share is allocated to an inefficient campaign",
          "The campaign consumes a material share of account spend while CPA is above the configured account benchmark.",
          [
            metricEvidence("Spend share", spendShare * 100, "percent", campaign.name),
            metricEvidence("CPA", campaign.metrics.cpa, "currency", campaign.name),
            metricEvidence(
              "Account CPA",
              analysis.accountMetrics.cpa,
              "currency",
              "Aggregate campaign benchmark.",
            ),
          ],
          "Review marginal performance and test shifting budget toward measured efficient campaigns.",
        ),
      );
    }
  }

  if (
    analysis.accountMetrics.clicks >= thresholds.minimumEntityClicks &&
    analysis.accountMetrics.conversions === 0
  ) {
    add(
      finding(
        "conversion_performance",
        "account-zero-conversions",
        "critical",
        accountEntity,
        "Account has click volume but no measured conversions",
        "The account reached the configured click threshold without recording a conversion.",
        [
          metricEvidence(
            "Clicks",
            analysis.accountMetrics.clicks,
            "count",
            "Aggregate campaign metrics.",
          ),
          metricEvidence("Conversions", 0, "count", "Aggregate campaign metrics."),
          metricEvidence(
            "Spend",
            analysis.accountMetrics.spend,
            "currency",
            "Aggregate campaign metrics.",
          ),
        ],
        "Validate conversion tracking and the post-click path before scaling spend.",
      ),
    );
  }

  if (input.conversions !== undefined && input.conversions.length > 0) {
    const conversionActionTotal = input.conversions.reduce(
      (total, row) => total + row.conversions,
      0,
    );
    const difference = Math.abs(
      conversionActionTotal - analysis.accountMetrics.conversions,
    );
    if (difference > thresholds.conversionTotalTolerance) {
      add(
        finding(
          "conversion_performance",
          "conversion-total-mismatch",
          "high",
          accountEntity,
          "Conversion totals disagree across datasets",
          "Conversion-action totals do not match aggregate campaign conversions for the provided data.",
          [
            metricEvidence(
              "Campaign conversions",
              analysis.accountMetrics.conversions,
              "count",
              "Aggregate campaign metrics.",
            ),
            metricEvidence(
              "Conversion-action conversions",
              conversionActionTotal,
              "count",
              "Sum of provided conversion-action rows.",
            ),
            metricEvidence(
              "Conversion difference",
              difference,
              "count",
              "Absolute difference between the two source totals.",
            ),
          ],
          "Reconcile reporting scope and conversion-action configuration before relying on efficiency conclusions.",
        ),
      );
    }
  }

  for (const page of input.landingPages ?? []) {
    const metrics = entityMetrics(page);
    const context = page.campaignName;
    if (
      metrics.clicks >= thresholds.minimumEntityClicks &&
      metrics.conversions === 0 &&
      metrics.spend > 0
    ) {
      add(
        finding(
          "landing_page_opportunities",
          "spend-without-conversions",
          "high",
          { type: "landing_page", id: page.id, name: page.finalUrl },
          "Landing page receives spend without conversions",
          "The final URL has sufficient click volume and spend but no measured conversions.",
          [
            metricEvidence("Spend", metrics.spend, "currency", context),
            metricEvidence("Clicks", metrics.clicks, "count", context),
            metricEvidence("Conversions", 0, "count", context),
          ],
          "Review message match, page usability, and conversion tracking for this final URL.",
        ),
      );
    } else if (
      metrics.clicks >= thresholds.minimumEntityClicks &&
      metrics.conversions > 0 &&
      analysis.accountMetrics.cpa > 0 &&
      metrics.cpa >=
        analysis.accountMetrics.cpa * thresholds.inefficientCpaToAccountRatio
    ) {
      add(
        finding(
          "landing_page_opportunities",
          "high-cpa",
          "medium",
          { type: "landing_page", id: page.id, name: page.finalUrl },
          "Landing-page CPA is above the account benchmark",
          "The final URL has sufficient click volume and materially higher CPA than the account.",
          [
            metricEvidence("CPA", metrics.cpa, "currency", context),
            metricEvidence(
              "Account CPA",
              analysis.accountMetrics.cpa,
              "currency",
              "Aggregate campaign benchmark.",
            ),
            metricEvidence("Clicks", metrics.clicks, "count", context),
          ],
          "Test a stronger message match or conversion path for this final URL.",
        ),
      );
    }
  }

  const baseStatuses: Record<
    AccountAuditCategory,
    Pick<AccountAuditSection, "status" | "reason">
  > = {
    account_structure:
      input.campaignData.campaigns.length > 0
        ? { status: "analyzed", reason: null }
        : {
            status: "insufficient_data",
            reason: "Campaign data contains no rows, so account structure could not be evaluated.",
          },
    campaign_performance:
      input.campaignData.campaigns.length > 0
        ? { status: "analyzed", reason: null }
        : {
            status: "insufficient_data",
            reason: "Campaign data contains no rows.",
          },
    keyword_performance: statusForOptionalRows(input.keywords, "Keyword"),
    search_term_waste: statusForOptionalRows(input.searchTerms, "Search-term"),
    geographic_performance: statusForOptionalRows(input.geographies, "Geographic"),
    device_performance: statusForOptionalRows(input.devices, "Device"),
    budget_allocation:
      input.campaignData.campaigns.length > 0 && analysis.accountMetrics.spend > 0
        ? { status: "analyzed", reason: null }
        : {
            status: "insufficient_data",
            reason: "Campaign spend is required to evaluate budget allocation.",
          },
    conversion_performance:
      input.campaignData.campaigns.length > 0
        ? { status: "analyzed", reason: null }
        : {
            status: "insufficient_data",
            reason: "Campaign data contains no rows.",
          },
    landing_page_opportunities: statusForOptionalRows(
      input.landingPages,
      "Landing-page",
    ),
  };

  const categories = ACCOUNT_AUDIT_CATEGORIES.map((category) => ({
    category,
    label: ACCOUNT_AUDIT_CATEGORY_LABELS[category],
    ...baseStatuses[category],
    findings: sortFindings(findingsByCategory.get(category) ?? []),
  }));
  const allFindings = categories.flatMap(({ findings: items }) => items);

  return {
    account,
    accountMetrics: aggregateGoogleAdsMetrics(
      input.campaignData.campaigns.map(({ metrics }) => metrics),
    ),
    thresholds,
    categories,
    findings: allFindings,
    summary: {
      totalFindings: allFindings.length,
      analyzedCategories: categories.filter(({ status }) => status === "analyzed")
        .length,
      unavailableCategories: categories.filter(
        ({ status }) => status === "unavailable",
      ).length,
      insufficientDataCategories: categories.filter(
        ({ status }) => status === "insufficient_data",
      ).length,
    },
  };
}
