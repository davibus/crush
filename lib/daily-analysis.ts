import type { CalculatedGoogleAdsMetrics } from "./google-ads.ts";

export type DailyAnalysisSource = "google_ads" | "ga4";
export type DailyAnalysisPeriod = "yesterday" | "rolling7Day";

export type DateRange = {
  startDate: string;
  endDate: string;
};

export type DailyAnalysisRanges = {
  timeZone: string;
  yesterday: DateRange;
  previousDay: DateRange;
  rolling7Day: DateRange;
  previous7Day: DateRange;
};

export type NormalizedGoogleAdsSummary = {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  conversions: number;
  conversionRate: number | null;
  cpa: number | null;
  conversionValue: number;
  roas: number | null;
};

export type NormalizedGA4Summary = {
  sessions: number;
  users: number;
  newUsers: number;
  engagedSessions: number;
  engagementRate: number | null;
  keyEvents: number;
  revenue: number;
};

export type MarketingPeriodSummary = {
  dateRange: DateRange;
  googleAds: NormalizedGoogleAdsSummary | null;
  ga4: NormalizedGA4Summary | null;
};

export type MetricDirection = "up" | "down" | "unchanged" | "unavailable";
export type DailyMetricUnit = "currency" | "count" | "percent" | "ratio";

export type MetricChange = {
  source: DailyAnalysisSource;
  metric: string;
  label: string;
  unit: DailyMetricUnit;
  currentValue: number | null;
  previousValue: number | null;
  absoluteChange: number | null;
  percentageChange: number | null;
  direction: MetricDirection;
};

export type PeriodComparison = {
  currentRange: DateRange;
  previousRange: DateRange;
  changes: MetricChange[];
};

export type MaterialChangeThreshold = {
  relativePercent: number;
  absolute: number;
};

export type MaterialChange = MetricChange & {
  period: DailyAnalysisPeriod;
  threshold: MaterialChangeThreshold;
  reason: string;
};

export type DailyAnalysisContext = {
  googleAds?: {
    accountName: string;
    currency: string;
    campaignCount: number;
    topCampaigns: Array<{
      id: string;
      name: string;
      metrics: CalculatedGoogleAdsMetrics;
    }>;
  };
  ga4?: {
    propertyId: string;
    topTrafficSources: Array<{
      sourceMedium: string;
      sessions: number;
      keyEvents: number;
    }>;
    topKeyEvents: Array<{ eventName: string; keyEvents: number }>;
  };
};

export type DailyAnalysisAiInput = {
  ranges: DailyAnalysisRanges;
  yesterdaySummary: MarketingPeriodSummary;
  previousDaySummary: MarketingPeriodSummary;
  yesterdayComparison: PeriodComparison;
  rolling7DaySummary: MarketingPeriodSummary;
  previous7DaySummary: MarketingPeriodSummary;
  rolling7DayComparison: PeriodComparison;
  materialChanges: MaterialChange[];
  context: DailyAnalysisContext;
};

export type DailyFinding = {
  materialChangeId: string;
  observedFact: string;
  interpretation: string;
  recommendation: string;
};

export type DailyAiFindings = {
  status: "grounded_ai" | "deterministic_fallback" | "stable" | "unavailable";
  summary: string;
  findings: DailyFinding[];
};

export type DailyAnalysisResult = {
  generatedAt: string;
  analysisDate: string;
  timeZone: string;
  dataSourcesUsed: DailyAnalysisSource[];
  yesterdaySummary: MarketingPeriodSummary;
  previousDaySummary: MarketingPeriodSummary;
  yesterdayComparison: PeriodComparison;
  rolling7DaySummary: MarketingPeriodSummary;
  previous7DaySummary: MarketingPeriodSummary;
  rolling7DayComparison: PeriodComparison;
  materialChanges: MaterialChange[];
  aiFindings: DailyAiFindings;
  warnings: string[];
};

export type DailyAnalysisCollection = {
  dataSourcesUsed: DailyAnalysisSource[];
  yesterdaySummary: MarketingPeriodSummary;
  previousDaySummary: MarketingPeriodSummary;
  rolling7DaySummary: MarketingPeriodSummary;
  previous7DaySummary: MarketingPeriodSummary;
  context: DailyAnalysisContext;
  warnings: string[];
};

export type DailyAnalysisDependencies = {
  collect(ranges: DailyAnalysisRanges): Promise<DailyAnalysisCollection>;
  analyze(input: DailyAnalysisAiInput): Promise<{
    findings: DailyAiFindings;
    warning?: string;
  }>;
  save(result: DailyAnalysisResult): Promise<void>;
};

type MetricDefinition = {
  source: DailyAnalysisSource;
  metric: string;
  label: string;
  unit: DailyMetricUnit;
  value(summary: MarketingPeriodSummary): number | null;
};

const METRIC_DEFINITIONS: MetricDefinition[] = [
  { source: "google_ads", metric: "spend", label: "Spend", unit: "currency", value: (s) => s.googleAds?.spend ?? null },
  { source: "google_ads", metric: "impressions", label: "Impressions", unit: "count", value: (s) => s.googleAds?.impressions ?? null },
  { source: "google_ads", metric: "clicks", label: "Clicks", unit: "count", value: (s) => s.googleAds?.clicks ?? null },
  { source: "google_ads", metric: "ctr", label: "CTR", unit: "percent", value: (s) => s.googleAds?.ctr ?? null },
  { source: "google_ads", metric: "cpc", label: "CPC", unit: "currency", value: (s) => s.googleAds?.cpc ?? null },
  { source: "google_ads", metric: "conversions", label: "Conversions", unit: "count", value: (s) => s.googleAds?.conversions ?? null },
  { source: "google_ads", metric: "conversionRate", label: "Conversion rate", unit: "percent", value: (s) => s.googleAds?.conversionRate ?? null },
  { source: "google_ads", metric: "cpa", label: "CPA", unit: "currency", value: (s) => s.googleAds?.cpa ?? null },
  { source: "google_ads", metric: "conversionValue", label: "Conversion value", unit: "currency", value: (s) => s.googleAds?.conversionValue ?? null },
  { source: "google_ads", metric: "roas", label: "ROAS", unit: "ratio", value: (s) => s.googleAds?.roas ?? null },
  { source: "ga4", metric: "sessions", label: "Sessions", unit: "count", value: (s) => s.ga4?.sessions ?? null },
  { source: "ga4", metric: "users", label: "Users", unit: "count", value: (s) => s.ga4?.users ?? null },
  { source: "ga4", metric: "newUsers", label: "New users", unit: "count", value: (s) => s.ga4?.newUsers ?? null },
  { source: "ga4", metric: "engagedSessions", label: "Engaged sessions", unit: "count", value: (s) => s.ga4?.engagedSessions ?? null },
  { source: "ga4", metric: "engagementRate", label: "Engagement rate", unit: "percent", value: (s) => s.ga4?.engagementRate == null ? null : s.ga4.engagementRate * 100 },
  { source: "ga4", metric: "keyEvents", label: "Key events", unit: "count", value: (s) => s.ga4?.keyEvents ?? null },
  { source: "ga4", metric: "revenue", label: "Revenue", unit: "currency", value: (s) => s.ga4?.revenue ?? null },
];

export const DEFAULT_MATERIAL_CHANGE_THRESHOLDS: Readonly<Record<string, MaterialChangeThreshold>> = {
  "google_ads.spend": { relativePercent: 20, absolute: 50 },
  "google_ads.impressions": { relativePercent: 20, absolute: 500 },
  "google_ads.clicks": { relativePercent: 20, absolute: 50 },
  "google_ads.ctr": { relativePercent: 20, absolute: 1 },
  "google_ads.cpc": { relativePercent: 20, absolute: 0.5 },
  "google_ads.conversions": { relativePercent: 20, absolute: 10 },
  "google_ads.conversionRate": { relativePercent: 20, absolute: 1 },
  "google_ads.cpa": { relativePercent: 20, absolute: 10 },
  "google_ads.conversionValue": { relativePercent: 20, absolute: 100 },
  "google_ads.roas": { relativePercent: 20, absolute: 0.5 },
  "ga4.sessions": { relativePercent: 20, absolute: 50 },
  "ga4.users": { relativePercent: 20, absolute: 50 },
  "ga4.newUsers": { relativePercent: 20, absolute: 25 },
  "ga4.engagedSessions": { relativePercent: 20, absolute: 50 },
  "ga4.engagementRate": { relativePercent: 20, absolute: 5 },
  "ga4.keyEvents": { relativePercent: 20, absolute: 10 },
  "ga4.revenue": { relativePercent: 20, absolute: 100 },
};

function isoDateInTimeZone(date: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
  } catch {
    throw new Error(`DAILY_ANALYSIS_TIME_ZONE must be a valid IANA time zone; received ${timeZone}.`);
  }
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function addIsoDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Invalid ISO date: ${isoDate}.`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== isoDate) {
    throw new Error(`Invalid ISO date: ${isoDate}.`);
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getDailyAnalysisRanges(
  now: Date,
  timeZone = "UTC",
): DailyAnalysisRanges {
  const today = isoDateInTimeZone(now, timeZone);
  const yesterday = addIsoDays(today, -1);
  const previousDay = addIsoDays(today, -2);
  return {
    timeZone,
    yesterday: { startDate: yesterday, endDate: yesterday },
    previousDay: { startDate: previousDay, endDate: previousDay },
    rolling7Day: { startDate: addIsoDays(yesterday, -6), endDate: yesterday },
    previous7Day: {
      startDate: addIsoDays(yesterday, -13),
      endDate: addIsoDays(yesterday, -7),
    },
  };
}

export function compareMetricValues(
  currentValue: number | null,
  previousValue: number | null,
): Pick<MetricChange, "currentValue" | "previousValue" | "absoluteChange" | "percentageChange" | "direction"> {
  if (currentValue == null || previousValue == null) {
    return { currentValue, previousValue, absoluteChange: null, percentageChange: null, direction: "unavailable" };
  }
  const absoluteChange = currentValue - previousValue;
  const direction = Math.abs(absoluteChange) <= 1e-12
    ? "unchanged"
    : absoluteChange > 0 ? "up" : "down";
  return {
    currentValue,
    previousValue,
    absoluteChange,
    percentageChange: previousValue === 0 ? null : (absoluteChange / Math.abs(previousValue)) * 100,
    direction,
  };
}

export function comparePeriodSummaries(
  current: MarketingPeriodSummary,
  previous: MarketingPeriodSummary,
): PeriodComparison {
  return {
    currentRange: current.dateRange,
    previousRange: previous.dateRange,
    changes: METRIC_DEFINITIONS.map((definition) => ({
      source: definition.source,
      metric: definition.metric,
      label: definition.label,
      unit: definition.unit,
      ...compareMetricValues(definition.value(current), definition.value(previous)),
    })),
  };
}

export function detectMaterialChanges(
  comparison: PeriodComparison,
  period: DailyAnalysisPeriod,
  thresholds: Readonly<Record<string, MaterialChangeThreshold>> = DEFAULT_MATERIAL_CHANGE_THRESHOLDS,
): MaterialChange[] {
  return comparison.changes.flatMap((change): MaterialChange[] => {
    if (change.absoluteChange == null || change.direction === "unchanged" || change.direction === "unavailable") return [];
    const threshold = thresholds[`${change.source}.${change.metric}`];
    if (!threshold || Math.abs(change.absoluteChange) < threshold.absolute) return [];
    const relativeMagnitude = change.percentageChange == null ? null : Math.abs(change.percentageChange);
    if (relativeMagnitude != null && relativeMagnitude < threshold.relativePercent) return [];
    const reason = relativeMagnitude == null
      ? `${change.label} moved from a zero baseline and the absolute change of ${Math.abs(change.absoluteChange).toFixed(2)} met the ${threshold.absolute} minimum.`
      : `${change.label} changed ${relativeMagnitude.toFixed(1)}% with an absolute change of ${Math.abs(change.absoluteChange).toFixed(2)}; both the ${threshold.relativePercent}% relative and ${threshold.absolute} absolute thresholds were met.`;
    return [{ ...change, period, threshold, reason }];
  });
}

export async function executeDailyAnalysis(
  options: { now?: Date; timeZone?: string } = {},
  dependencies: DailyAnalysisDependencies,
): Promise<DailyAnalysisResult> {
  const now = options.now ?? new Date();
  const ranges = getDailyAnalysisRanges(now, options.timeZone ?? "UTC");
  const collected = await dependencies.collect(ranges);
  const yesterdayComparison = comparePeriodSummaries(collected.yesterdaySummary, collected.previousDaySummary);
  const rolling7DayComparison = comparePeriodSummaries(collected.rolling7DaySummary, collected.previous7DaySummary);
  const materialChanges = [
    ...detectMaterialChanges(yesterdayComparison, "yesterday"),
    ...detectMaterialChanges(rolling7DayComparison, "rolling7Day"),
  ];
  const aiInput: DailyAnalysisAiInput = {
    ranges,
    yesterdaySummary: collected.yesterdaySummary,
    previousDaySummary: collected.previousDaySummary,
    yesterdayComparison,
    rolling7DaySummary: collected.rolling7DaySummary,
    previous7DaySummary: collected.previous7DaySummary,
    rolling7DayComparison,
    materialChanges,
    context: collected.context,
  };
  const analyzed = await dependencies.analyze(aiInput);
  const result: DailyAnalysisResult = {
    generatedAt: now.toISOString(),
    analysisDate: ranges.yesterday.endDate,
    timeZone: ranges.timeZone,
    dataSourcesUsed: collected.dataSourcesUsed,
    yesterdaySummary: collected.yesterdaySummary,
    previousDaySummary: collected.previousDaySummary,
    yesterdayComparison,
    rolling7DaySummary: collected.rolling7DaySummary,
    previous7DaySummary: collected.previous7DaySummary,
    rolling7DayComparison,
    materialChanges,
    aiFindings: analyzed.findings,
    warnings: [...collected.warnings, ...(analyzed.warning ? [analyzed.warning] : [])],
  };
  await dependencies.save(result);
  return result;
}
