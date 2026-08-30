import {
  runAccountAudit,
  type AccountAuditFinding,
  type AccountAuditInput,
  type AccountAuditOptions,
  type AccountAuditResult,
  type AccountAuditSectionStatus,
} from "./account-audit.ts";
import type { MarketingEvidence } from "./marketing-insights.ts";

export const ACCOUNT_SCORE_METHODOLOGY_VERSION = "1.0.0";

export const ACCOUNT_SCORE_WEIGHTS = {
  performance: 30,
  efficiency: 25,
  waste: 20,
  growthOpportunity: 10,
  trackingDataQuality: 15,
} as const;

export type AccountScoreComponentName = keyof typeof ACCOUNT_SCORE_WEIGHTS;
export type AccountScoreComponentStatus =
  | "scored"
  | "partial"
  | "insufficient_data";

export type AccountScoreFactor = {
  id: string;
  component: AccountScoreComponentName;
  points: number;
  explanation: string;
  ruleId: string | null;
  findingId: string | null;
  evidence: MarketingEvidence[];
};

export type AccountScoreComponent = {
  score: number;
  baseScore: number;
  status: AccountScoreComponentStatus;
  explanation: string;
  deductions: AccountScoreFactor[];
  opportunities: AccountScoreFactor[];
  supportingRuleIds: string[];
};

export type AccountScoreDataAvailability = {
  conversions: AccountAuditSectionStatus;
  geographies: AccountAuditSectionStatus;
  devices: AccountAuditSectionStatus;
  keywords: AccountAuditSectionStatus;
  searchTerms: AccountAuditSectionStatus;
  landingPages: AccountAuditSectionStatus;
};

export type AccountScoreResult = {
  overallScore: number;
  components: Record<AccountScoreComponentName, AccountScoreComponent>;
  methodology: {
    name: "Crush marketing account score";
    version: string;
    weights: typeof ACCOUNT_SCORE_WEIGHTS;
    rounding: "component and overall scores are rounded to the nearest whole point";
    deterministic: true;
  };
  deductions: AccountScoreFactor[];
  opportunities: AccountScoreFactor[];
  summary: string;
};

export type AccountScoreOptions = {
  auditOptions?: AccountAuditOptions;
};

export const ACCOUNT_SCORE_RULES = {
  performance: {
    startingScore: 100,
    insufficientDataScore: 50,
    lowConversionRate: { belowOnePercent: 15, belowTwoPercent: 8 },
    lowRoas: { belowOne: 15, belowTwo: 8 },
    auditDeductions: {
      "analyzer-low_conversion_rate": 12,
      "analyzer-high_spend_low_conversions": 18,
      "account-zero-conversions": 25,
    },
  },
  efficiency: {
    startingScore: 100,
    insufficientDataScore: 50,
    auditDeductions: {
      "analyzer-high_cpa": 12,
      "analyzer-high_spend_low_conversions": 18,
      "high-cpa": 8,
      "high-cpa-location": 8,
      "low-conversion-rate-device": 6,
      "analyzer-device_performance_difference": 6,
      "concentrated-high-cpa-spend": 15,
      "material-spend-without-conversions": 25,
    },
  },
  waste: {
    startingScore: 100,
    insufficientDataScore: 50,
    auditDeductions: {
      "analyzer-search_term_waste": 12,
      "analyzer-negative_keyword_opportunity": 8,
      "spend-without-conversions": 12,
      "broad-match-concentration": 8,
      "analyzer-high_spend_low_conversions": 15,
      "material-spend-without-conversions": 20,
    },
  },
  growthOpportunity: {
    startingScore: 50,
    auditBonuses: {
      "analyzer-strong_performer": 10,
      "analyzer-budget_opportunity": 10,
      "analyzer-geographic_opportunity": 8,
      "analyzer-device_performance_difference": 4,
      "low-conversion-rate-device": 4,
      "spend-without-conversions": 5,
      "high-cpa": 5,
    },
    blockerDeductions: {
      "account-zero-conversions": 20,
      "material-spend-without-conversions": 15,
      "conversion-total-mismatch": 10,
      "analyzer-high_spend_low_conversions": 10,
    },
  },
  trackingDataQuality: {
    startingScore: 100,
    unavailableDataset: 6,
    emptyDataset: 4,
    emptyCampaignData: 30,
    conversionTotalMismatch: 20,
    zeroMeasuredConversions: 10,
    missingConversionValue: 8,
  },
} as const;

const OPTIONAL_CATEGORY_STATUS = {
  geographies: "geographic_performance",
  devices: "device_performance",
  keywords: "keyword_performance",
  searchTerms: "search_term_waste",
  landingPages: "landing_page_opportunities",
} as const;

const COMPONENT_LABELS: Record<AccountScoreComponentName, string> = {
  performance: "Performance",
  efficiency: "Efficiency",
  waste: "Waste control",
  growthOpportunity: "Growth opportunity",
  trackingDataQuality: "Tracking and data quality",
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sortedFactors(factors: AccountScoreFactor[]): AccountScoreFactor[] {
  return [...factors].sort((left, right) => left.id.localeCompare(right.id));
}

function findingFactor(
  component: AccountScoreComponentName,
  finding: AccountAuditFinding,
  points: number,
  explanation: string,
): AccountScoreFactor {
  return {
    id: `${component}:${finding.id}`,
    component,
    points,
    explanation,
    ruleId: finding.ruleId,
    findingId: finding.id,
    evidence: finding.evidence,
  };
}

function metricFactor(
  id: string,
  component: AccountScoreComponentName,
  points: number,
  explanation: string,
  evidence: MarketingEvidence[] = [],
): AccountScoreFactor {
  return {
    id: `${component}:${id}`,
    component,
    points,
    explanation,
    ruleId: id,
    findingId: null,
    evidence,
  };
}

function findingExplanation(finding: AccountAuditFinding, points: number): string {
  return `${points} points: ${finding.title}. ${finding.description}`;
}

function addFindingDeductions(
  component: AccountScoreComponentName,
  findings: readonly AccountAuditFinding[],
  rules: Readonly<Record<string, number>>,
): AccountScoreFactor[] {
  return findings.flatMap((finding) => {
    const points = rules[finding.ruleId];
    return points === undefined
      ? []
      : [
          findingFactor(
            component,
            finding,
            points,
            findingExplanation(finding, points),
          ),
        ];
  });
}

function component(
  name: AccountScoreComponentName,
  baseScore: number,
  status: AccountScoreComponentStatus,
  deductions: AccountScoreFactor[],
  opportunities: AccountScoreFactor[],
  detail: string,
): AccountScoreComponent {
  const orderedDeductions = sortedFactors(deductions);
  const orderedOpportunities = sortedFactors(opportunities);
  const deductionPoints = orderedDeductions.reduce(
    (total, factor) => total + factor.points,
    0,
  );
  const opportunityPoints = orderedOpportunities.reduce(
    (total, factor) => total + factor.points,
    0,
  );
  const score = clampScore(baseScore - deductionPoints + opportunityPoints);
  const supportingRuleIds = [
    ...new Set(
      [...orderedDeductions, ...orderedOpportunities]
        .map(({ ruleId }) => ruleId)
        .filter((ruleId): ruleId is string => ruleId !== null),
    ),
  ].sort();

  return {
    score,
    baseScore,
    status,
    explanation: `${COMPONENT_LABELS[name]} scored ${score}/100. ${detail} ${deductionPoints} deduction points and ${opportunityPoints} opportunity points were applied.`,
    deductions: orderedDeductions,
    opportunities: orderedOpportunities,
    supportingRuleIds,
  };
}

function sectionStatus(
  audit: AccountAuditResult,
  category: (typeof OPTIONAL_CATEGORY_STATUS)[keyof typeof OPTIONAL_CATEGORY_STATUS],
): AccountAuditSectionStatus {
  return (
    audit.categories.find((section) => section.category === category)?.status ??
    "unavailable"
  );
}

function dataAvailability(
  input: AccountAuditInput,
  audit: AccountAuditResult,
): AccountScoreDataAvailability {
  return {
    conversions:
      input.conversions === undefined
        ? "unavailable"
        : input.conversions.length === 0
          ? "insufficient_data"
          : "analyzed",
    geographies: sectionStatus(audit, OPTIONAL_CATEGORY_STATUS.geographies),
    devices: sectionStatus(audit, OPTIONAL_CATEGORY_STATUS.devices),
    keywords: sectionStatus(audit, OPTIONAL_CATEGORY_STATUS.keywords),
    searchTerms: sectionStatus(audit, OPTIONAL_CATEGORY_STATUS.searchTerms),
    landingPages: sectionStatus(audit, OPTIONAL_CATEGORY_STATUS.landingPages),
  };
}

function stableRows<T extends { id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => {
    const idOrder = left.id.localeCompare(right.id);
    return idOrder || JSON.stringify(left).localeCompare(JSON.stringify(right));
  });
}

function canonicalInput(input: AccountAuditInput): AccountAuditInput {
  return {
    campaignData: {
      ...input.campaignData,
      campaigns: stableRows(input.campaignData.campaigns),
    },
    ...(input.conversions === undefined
      ? {}
      : { conversions: stableRows(input.conversions) }),
    ...(input.geographies === undefined
      ? {}
      : { geographies: stableRows(input.geographies) }),
    ...(input.devices === undefined
      ? {}
      : { devices: stableRows(input.devices) }),
    ...(input.keywords === undefined
      ? {}
      : { keywords: stableRows(input.keywords) }),
    ...(input.searchTerms === undefined
      ? {}
      : { searchTerms: stableRows(input.searchTerms) }),
    ...(input.landingPages === undefined
      ? {}
      : { landingPages: stableRows(input.landingPages) }),
  };
}

function scorePerformance(audit: AccountAuditResult): AccountScoreComponent {
  const metrics = audit.accountMetrics;
  const noMeasurableActivity = metrics.clicks === 0 && metrics.conversions === 0;
  if (audit.accountMetrics.impressions === 0 || noMeasurableActivity) {
    return component(
      "performance",
      ACCOUNT_SCORE_RULES.performance.insufficientDataScore,
      "insufficient_data",
      [],
      [],
      "A neutral 50-point score is used because campaign activity is insufficient to evaluate outcomes.",
    );
  }

  const deductions = addFindingDeductions(
    "performance",
    audit.findings,
    ACCOUNT_SCORE_RULES.performance.auditDeductions,
  );
  const opportunities: AccountScoreFactor[] = [];

  if (metrics.clicks >= audit.thresholds.minimumEntityClicks) {
    const conversionRatePoints =
      metrics.conversionRate < 1
        ? ACCOUNT_SCORE_RULES.performance.lowConversionRate.belowOnePercent
        : metrics.conversionRate < 2
          ? ACCOUNT_SCORE_RULES.performance.lowConversionRate.belowTwoPercent
          : 0;
    if (conversionRatePoints > 0) {
      deductions.push(
        metricFactor(
          "PERF-CONVERSION-RATE",
          "performance",
          conversionRatePoints,
          `${conversionRatePoints} points: account conversion rate is ${metrics.conversionRate.toFixed(2)}%, below the fixed ${metrics.conversionRate < 1 ? "1%" : "2%"} threshold.`,
          [
            {
              metric: "Conversion rate",
              value: metrics.conversionRate,
              unit: "percent",
              context: "Aggregate campaign metrics.",
            },
          ],
        ),
      );
    }
  }

  if (metrics.spend > 0 && metrics.conversionValue > 0) {
    const roasPoints =
      metrics.roas < 1
        ? ACCOUNT_SCORE_RULES.performance.lowRoas.belowOne
        : metrics.roas < 2
          ? ACCOUNT_SCORE_RULES.performance.lowRoas.belowTwo
          : 0;
    if (roasPoints > 0) {
      deductions.push(
        metricFactor(
          "PERF-ROAS",
          "performance",
          roasPoints,
          `${roasPoints} points: measured ROAS is ${metrics.roas.toFixed(2)}, below the fixed ${metrics.roas < 1 ? "1.0" : "2.0"} threshold.`,
          [
            {
              metric: "ROAS",
              value: metrics.roas,
              unit: "ratio",
              context: "Aggregate campaign metrics.",
            },
          ],
        ),
      );
    }
  }

  for (const finding of audit.findings.filter(
    ({ ruleId }) => ruleId === "analyzer-strong_performer",
  )) {
    opportunities.push(
      findingFactor(
        "performance",
        finding,
        0,
        `Positive factor: ${finding.title}. ${finding.description}`,
      ),
    );
  }

  return component(
    "performance",
    ACCOUNT_SCORE_RULES.performance.startingScore,
    "scored",
    deductions,
    opportunities,
    "The score uses aggregate conversion rate and supported ROAS plus the audit's strong/weak campaign findings.",
  );
}

function scoreEfficiency(audit: AccountAuditResult): AccountScoreComponent {
  if (audit.accountMetrics.spend === 0) {
    return component(
      "efficiency",
      ACCOUNT_SCORE_RULES.efficiency.insufficientDataScore,
      "insufficient_data",
      [],
      [],
      "A neutral 50-point score is used because zero spend makes CPA, CPC allocation, and spend efficiency unevaluable.",
    );
  }

  const deductions = addFindingDeductions(
    "efficiency",
    audit.findings,
    ACCOUNT_SCORE_RULES.efficiency.auditDeductions,
  );
  const opportunities = audit.findings
    .filter(({ ruleId }) => ruleId === "analyzer-strong_performer")
    .map((finding) =>
      findingFactor(
        "efficiency",
        finding,
        0,
        `Positive factor: ${finding.title}. ${finding.description}`,
      ),
    );
  return component(
    "efficiency",
    ACCOUNT_SCORE_RULES.efficiency.startingScore,
    "scored",
    deductions,
    opportunities,
    "The score reuses CPA, conversion-efficiency, device, geography, and budget-allocation findings from the audit.",
  );
}

function scoreWaste(
  audit: AccountAuditResult,
  availability: AccountScoreDataAvailability,
): AccountScoreComponent {
  if (audit.accountMetrics.spend === 0) {
    return component(
      "waste",
      ACCOUNT_SCORE_RULES.waste.insufficientDataScore,
      "insufficient_data",
      [],
      [],
      "A neutral 50-point score is used because no spend exists from which to identify waste.",
    );
  }

  const deductions = addFindingDeductions(
    "waste",
    audit.findings,
    ACCOUNT_SCORE_RULES.waste.auditDeductions,
  );
  const partial =
    availability.searchTerms !== "analyzed" || availability.keywords !== "analyzed";
  return component(
    "waste",
    ACCOUNT_SCORE_RULES.waste.startingScore,
    partial ? "partial" : "scored",
    deductions,
    [],
    partial
      ? "Known campaign, keyword, landing-page, broad-match, and search-term waste findings are deducted, but keyword or search-term coverage is incomplete; that coverage gap is scored under tracking and data quality."
      : "The score deducts audit-supported non-converting spend, search-term waste, negative-keyword candidates, and broad-match concentration.",
  );
}

function scoreGrowthOpportunity(
  audit: AccountAuditResult,
  availability: AccountScoreDataAvailability,
): AccountScoreComponent {
  const deductions = addFindingDeductions(
    "growthOpportunity",
    audit.findings,
    ACCOUNT_SCORE_RULES.growthOpportunity.blockerDeductions,
  );
  const opportunities = audit.findings.flatMap((finding) => {
    const points = ACCOUNT_SCORE_RULES.growthOpportunity.auditBonuses[
      finding.ruleId as keyof typeof ACCOUNT_SCORE_RULES.growthOpportunity.auditBonuses
    ];
    if (points === undefined) return [];
    return [
      findingFactor(
        "growthOpportunity",
        finding,
        points,
        `${points} points: ${finding.title}. ${finding.recommendation}`,
      ),
    ];
  });
  const partial = [
    availability.geographies,
    availability.devices,
    availability.landingPages,
  ].some((status) => status !== "analyzed");
  return component(
    "growthOpportunity",
    ACCOUNT_SCORE_RULES.growthOpportunity.startingScore,
    partial ? "partial" : "scored",
    deductions,
    opportunities,
    "A neutral 50-point baseline rises with supported scaling or optimization opportunities and falls only for blockers that reduce readiness to act. Opportunity findings are positive evidence, not penalties.",
  );
}

function scoreTrackingDataQuality(
  audit: AccountAuditResult,
  availability: AccountScoreDataAvailability,
): AccountScoreComponent {
  const deductions: AccountScoreFactor[] = [];
  for (const dataset of Object.keys(availability).sort() as Array<
    keyof AccountScoreDataAvailability
  >) {
    const status = availability[dataset];
    if (status === "analyzed") continue;
    const points =
      status === "unavailable"
        ? ACCOUNT_SCORE_RULES.trackingDataQuality.unavailableDataset
        : ACCOUNT_SCORE_RULES.trackingDataQuality.emptyDataset;
    deductions.push(
      metricFactor(
        `TRACKING-${dataset.toUpperCase()}-${status.toUpperCase()}`,
        "trackingDataQuality",
        points,
        `${points} points: ${dataset} data is ${status === "unavailable" ? "not provided" : "empty"}, limiting the account areas that can be evaluated.`,
      ),
    );
  }

  if (audit.accountMetrics.impressions === 0) {
    const points = ACCOUNT_SCORE_RULES.trackingDataQuality.emptyCampaignData;
    deductions.push(
      metricFactor(
        "TRACKING-EMPTY-CAMPAIGNS",
        "trackingDataQuality",
        points,
        `${points} points: campaign data contains no measurable activity, so core account performance cannot be evaluated.`,
      ),
    );
  }

  for (const finding of audit.findings) {
    if (finding.ruleId === "conversion-total-mismatch") {
      const points = ACCOUNT_SCORE_RULES.trackingDataQuality.conversionTotalMismatch;
      deductions.push(
        findingFactor(
          "trackingDataQuality",
          finding,
          points,
          findingExplanation(finding, points),
        ),
      );
    } else if (finding.ruleId === "account-zero-conversions") {
      const points = ACCOUNT_SCORE_RULES.trackingDataQuality.zeroMeasuredConversions;
      deductions.push(
        findingFactor(
          "trackingDataQuality",
          finding,
          points,
          `${points} points: meaningful click volume has no measured conversions, so conversion tracking or the conversion path requires validation.`,
        ),
      );
    }
  }

  if (
    audit.accountMetrics.spend > 0 &&
    audit.accountMetrics.conversions > 0 &&
    audit.accountMetrics.conversionValue === 0
  ) {
    const points = ACCOUNT_SCORE_RULES.trackingDataQuality.missingConversionValue;
    deductions.push(
      metricFactor(
        "TRACKING-NO-CONVERSION-VALUE",
        "trackingDataQuality",
        points,
        `${points} points: conversions are present but measured conversion value is zero, so ROAS cannot support account evaluation.`,
        [
          {
            metric: "Conversions",
            value: audit.accountMetrics.conversions,
            unit: "count",
            context: "Aggregate campaign metrics.",
          },
          {
            metric: "Conversion value",
            value: audit.accountMetrics.conversionValue,
            unit: "currency",
            context: "Aggregate campaign metrics.",
          },
        ],
      ),
    );
  }

  const incomplete = Object.values(availability).some(
    (status) => status !== "analyzed",
  );
  return component(
    "trackingDataQuality",
    ACCOUNT_SCORE_RULES.trackingDataQuality.startingScore,
    incomplete ? "partial" : "scored",
    deductions,
    [],
    "The score measures dataset coverage, conversion consistency, measurable conversion output, and whether conversion value supports ROAS analysis.",
  );
}

export function scoreAccountAudit(
  audit: AccountAuditResult,
  availability: AccountScoreDataAvailability,
): AccountScoreResult {
  const components = {
    performance: scorePerformance(audit),
    efficiency: scoreEfficiency(audit),
    waste: scoreWaste(audit, availability),
    growthOpportunity: scoreGrowthOpportunity(audit, availability),
    trackingDataQuality: scoreTrackingDataQuality(audit, availability),
  } satisfies Record<AccountScoreComponentName, AccountScoreComponent>;

  const overallScore = clampScore(
    (Object.keys(ACCOUNT_SCORE_WEIGHTS) as AccountScoreComponentName[]).reduce(
      (total, name) =>
        total + components[name].score * (ACCOUNT_SCORE_WEIGHTS[name] / 100),
      0,
    ),
  );
  const deductions = sortedFactors(
    Object.values(components).flatMap((item) => item.deductions),
  );
  const opportunities = sortedFactors(
    Object.values(components).flatMap((item) => item.opportunities),
  );
  const partialComponents = (Object.keys(components) as AccountScoreComponentName[])
    .filter((name) => components[name].status !== "scored")
    .map((name) => COMPONENT_LABELS[name]);
  const coverageNote =
    partialComponents.length === 0
      ? "All components had complete supporting coverage."
      : `Limited evidence affected: ${partialComponents.join(", ")}.`;

  return {
    overallScore,
    components,
    methodology: {
      name: "Crush marketing account score",
      version: ACCOUNT_SCORE_METHODOLOGY_VERSION,
      weights: ACCOUNT_SCORE_WEIGHTS,
      rounding:
        "component and overall scores are rounded to the nearest whole point",
      deterministic: true,
    },
    deductions,
    opportunities,
    summary: `Overall marketing account score: ${overallScore}/100. ${deductions.length} deductions and ${opportunities.length} positive factors explain the result. ${coverageNote}`,
  };
}

export function calculateAccountScore(
  input: AccountAuditInput,
  options: AccountScoreOptions = {},
): AccountScoreResult {
  const normalizedInput = canonicalInput(input);
  const audit = runAccountAudit(normalizedInput, options.auditOptions);
  return scoreAccountAudit(audit, dataAvailability(normalizedInput, audit));
}
