import { z } from "zod";

import {
  comparePeriodSummaries,
  getDailyAnalysisRanges,
  type DailyAnalysisContext,
  type DateRange,
  type MarketingPeriodSummary,
  type MetricChange,
} from "./daily-analysis.ts";

export const weeklyReportSourceSchema = z.enum(["google_ads", "ga4"]);
export const weeklyReportUnitSchema = z.enum(["currency", "count", "percent", "ratio"]);
export const weeklyReportDirectionSchema = z.enum(["up", "down", "unchanged", "unavailable"]);

export const weeklyReportSourceStatusSchema = z.object({
  source: weeklyReportSourceSchema,
  status: z.enum(["live", "sample", "unconfigured", "unavailable"]),
  included: z.boolean(),
  detail: z.string().min(1),
}).strict();

export const weeklyReportKpiChangeSchema = z.object({
  source: weeklyReportSourceSchema,
  metric: z.string().min(1),
  label: z.string().min(1),
  unit: weeklyReportUnitSchema,
  currentValue: z.number().finite().nullable(),
  previousValue: z.number().finite().nullable(),
  absoluteChange: z.number().finite().nullable(),
  percentageChange: z.number().finite().nullable(),
  direction: weeklyReportDirectionSchema,
}).strict();

export const weeklyReportEvidenceSchema = weeklyReportKpiChangeSchema.extend({
  id: z.string().min(1),
  statement: z.string().min(1),
}).strict();

export const weeklyReportItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
}).strict();

const dateRangeSchema = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
}).strict();

const googleAdsSummarySchema = z.object({
  spend: z.number().finite(),
  impressions: z.number().finite(),
  clicks: z.number().finite(),
  ctr: z.number().finite().nullable(),
  cpc: z.number().finite().nullable(),
  conversions: z.number().finite(),
  conversionRate: z.number().finite().nullable(),
  cpa: z.number().finite().nullable(),
  conversionValue: z.number().finite(),
  roas: z.number().finite().nullable(),
}).strict();

const ga4SummarySchema = z.object({
  sessions: z.number().finite(),
  users: z.number().finite(),
  newUsers: z.number().finite(),
  engagedSessions: z.number().finite(),
  engagementRate: z.number().finite().nullable(),
  keyEvents: z.number().finite(),
  revenue: z.number().finite(),
}).strict();

const periodSummarySchema = z.object({
  dateRange: dateRangeSchema,
  googleAds: googleAdsSummarySchema.nullable(),
  ga4: ga4SummarySchema.nullable(),
}).strict();

export const weeklyReportSchema = z.object({
  schemaVersion: z.literal(1),
  reportingPeriod: dateRangeSchema,
  comparisonPeriod: dateRangeSchema,
  generatedAt: z.iso.datetime(),
  timeZone: z.string().min(1),
  currency: z.string().min(3).max(3).nullable(),
  dataSourceStatus: z.array(weeklyReportSourceStatusSchema).length(2),
  aiEnrichment: z.object({
    status: z.enum(["enriched", "deterministic_fallback", "not_needed"]),
    detail: z.string().min(1),
  }).strict(),
  currentSummary: periodSummarySchema,
  previousSummary: periodSummarySchema,
  executiveSummary: z.string().min(1),
  kpiChanges: z.array(weeklyReportKpiChangeSchema),
  biggestWins: z.array(weeklyReportItemSchema),
  biggestProblems: z.array(weeklyReportItemSchema),
  recommendedActions: z.array(weeklyReportItemSchema),
  supportingEvidence: z.array(weeklyReportEvidenceSchema),
  nextWeekWatchList: z.array(weeklyReportItemSchema),
  warnings: z.array(z.string()),
}).strict().superRefine((report, context) => {
  const evidenceIds = new Set(report.supportingEvidence.map((evidence) => evidence.id));
  if (evidenceIds.size !== report.supportingEvidence.length) {
    context.addIssue({ code: "custom", message: "Supporting evidence IDs must be unique.", path: ["supportingEvidence"] });
  }
  const sections = ["biggestWins", "biggestProblems", "recommendedActions", "nextWeekWatchList"] as const;
  for (const section of sections) {
    report[section].forEach((item, index) => {
      for (const evidenceId of item.evidenceIds) {
        if (!evidenceIds.has(evidenceId)) {
          context.addIssue({ code: "custom", message: `Unknown evidence ID: ${evidenceId}.`, path: [section, index, "evidenceIds"] });
        }
      }
    });
  }
});

export type WeeklyReport = z.infer<typeof weeklyReportSchema>;
export type WeeklyReportEvidence = z.infer<typeof weeklyReportEvidenceSchema>;
export type WeeklyReportItem = z.infer<typeof weeklyReportItemSchema>;
export type WeeklyReportSourceStatus = z.infer<typeof weeklyReportSourceStatusSchema>;

export type WeeklyReportRanges = {
  timeZone: string;
  reportingPeriod: DateRange;
  comparisonPeriod: DateRange;
};

export type WeeklyReportCollection = {
  currentSummary: MarketingPeriodSummary;
  previousSummary: MarketingPeriodSummary;
  context: DailyAnalysisContext;
  dataSourceStatus: WeeklyReportSourceStatus[];
  warnings: string[];
};

export type WeeklyReportDraft = Omit<
  WeeklyReport,
  "generatedAt" | "aiEnrichment" | "biggestWins" | "biggestProblems" |
  "recommendedActions" | "nextWeekWatchList"
> & {
  candidates: {
    biggestWins: WeeklyReportItem[];
    biggestProblems: WeeklyReportItem[];
    recommendedActions: WeeklyReportItem[];
    nextWeekWatchList: WeeklyReportItem[];
  };
};

export type WeeklyReportAiResult = {
  status: WeeklyReport["aiEnrichment"]["status"];
  detail: string;
  selectedCandidateIds: string[];
  warning?: string;
};

export type WeeklyReportDependencies = {
  collect(ranges: WeeklyReportRanges): Promise<WeeklyReportCollection>;
  enrich(draft: WeeklyReportDraft): Promise<WeeklyReportAiResult>;
  save(report: WeeklyReport): Promise<void>;
};

const FAVORABLE_DIRECTION: Readonly<Record<string, "up" | "down">> = {
  "google_ads.impressions": "up",
  "google_ads.clicks": "up",
  "google_ads.ctr": "up",
  "google_ads.cpc": "down",
  "google_ads.conversions": "up",
  "google_ads.conversionRate": "up",
  "google_ads.cpa": "down",
  "google_ads.conversionValue": "up",
  "google_ads.roas": "up",
  "ga4.sessions": "up",
  "ga4.users": "up",
  "ga4.newUsers": "up",
  "ga4.engagedSessions": "up",
  "ga4.engagementRate": "up",
  "ga4.keyEvents": "up",
  "ga4.revenue": "up",
};

const PRIORITY: Readonly<Record<string, number>> = {
  roas: 10, cpa: 10, conversions: 9, conversionValue: 9,
  conversionRate: 8, revenue: 8, keyEvents: 8, spend: 7,
  clicks: 6, ctr: 6, cpc: 6, engagedSessions: 5,
  engagementRate: 5, sessions: 4, users: 4, newUsers: 3, impressions: 2,
};

export function getWeeklyReportRanges(now: Date, timeZone = "UTC"): WeeklyReportRanges {
  const dailyRanges = getDailyAnalysisRanges(now, timeZone);
  return {
    timeZone: dailyRanges.timeZone,
    reportingPeriod: dailyRanges.rolling7Day,
    comparisonPeriod: dailyRanges.previous7Day,
  };
}

function formatMetric(change: MetricChange, value: number | null): string {
  if (value == null) return "unavailable";
  if (change.unit === "currency") return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (change.unit === "percent") return `${value.toFixed(2)}%`;
  if (change.unit === "ratio") return `${value.toFixed(2)}x`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function sourceName(source: MetricChange["source"]): string {
  return source === "google_ads" ? "Google Ads" : "GA4";
}

function evidenceFor(change: MetricChange): WeeklyReportEvidence {
  const id = `${change.source}.${change.metric}`;
  const movement = change.direction === "unavailable"
    ? "could not be compared"
    : change.direction === "unchanged"
      ? "was unchanged"
      : `${change.direction}${change.percentageChange == null ? " from a zero baseline" : ` ${Math.abs(change.percentageChange).toFixed(1)}%`}`;
  return {
    id,
    ...change,
    statement: `${sourceName(change.source)} ${change.label} ${movement}, from ${formatMetric(change, change.previousValue)} to ${formatMetric(change, change.currentValue)}.`
  };
}

function significance(change: MetricChange): number {
  if (change.direction === "unavailable" || change.direction === "unchanged") return -1;
  const magnitude = change.percentageChange == null ? 25 : Math.min(Math.abs(change.percentageChange), 200);
  return (PRIORITY[change.metric] ?? 1) * 1000 + magnitude;
}

function item(kind: string, change: MetricChange, evidence: WeeklyReportEvidence): WeeklyReportItem {
  const positive = FAVORABLE_DIRECTION[`${change.source}.${change.metric}`] === change.direction;
  const title = kind === "win"
    ? `${change.label} improved`
    : kind === "problem"
      ? `${change.label} weakened`
      : kind === "action"
        ? `Investigate ${change.label.toLowerCase()}`
        : `Watch ${change.label.toLowerCase()}`;
  let summary: string;
  if (kind === "action") {
    summary = change.source === "google_ads"
      ? `Review Google Ads campaign, query, device, and geography breakdowns behind this ${change.label.toLowerCase()} change before adjusting bids or budgets.`
      : `Review GA4 traffic-source, landing-page, and key-event breakdowns behind this ${change.label.toLowerCase()} change before changing acquisition strategy.`;
  } else if (kind === "watch") {
    summary = `Track ${sourceName(change.source)} ${change.label.toLowerCase()} next week to confirm whether the ${change.direction} movement persists.`;
  } else {
    summary = `${evidence.statement} This is classified as ${positive ? "favorable" : "unfavorable"} using the metric's deterministic direction rule; the data does not establish a cause.`;
  }
  return { id: `${kind}:${evidence.id}`, title, summary, evidenceIds: [evidence.id] };
}

function buildExecutiveSummary(
  collection: WeeklyReportCollection,
  changes: MetricChange[],
  wins: WeeklyReportItem[],
  problems: WeeklyReportItem[],
): string {
  const included = collection.dataSourceStatus.filter((source) => source.included).map((source) => sourceName(source.source));
  if (included.length === 0) {
    return "No live marketing source was available for the completed weekly period. The report was generated and saved with source diagnostics, but account performance could not be assessed.";
  }
  const comparable = changes.filter((change) => change.direction !== "unavailable");
  if (comparable.length === 0) {
    return `${included.join(" and ")} supplied current-period data, but no prior-period values were available for a week-over-week assessment.`;
  }
  return `${included.join(" and ")} supplied ${comparable.length} comparable KPIs. The deterministic review identified ${wins.length} favorable movement${wins.length === 1 ? "" : "s"} and ${problems.length} unfavorable movement${problems.length === 1 ? "" : "s"}; see the linked evidence for exact values.`;
}

export function buildWeeklyReportDraft(
  ranges: WeeklyReportRanges,
  collection: WeeklyReportCollection,
): WeeklyReportDraft {
  const comparison = comparePeriodSummaries(collection.currentSummary, collection.previousSummary);
  const evidence = comparison.changes.map(evidenceFor);
  const ranked = comparison.changes
    .map((change, index) => ({ change, evidence: evidence[index], score: significance(change) }))
    .filter((entry) => entry.score >= 0)
    .toSorted((left, right) => right.score - left.score);
  const wins = ranked
    .filter(({ change }) => FAVORABLE_DIRECTION[`${change.source}.${change.metric}`] === change.direction)
    .slice(0, 3)
    .map(({ change, evidence: proof }) => item("win", change, proof));
  const problems = ranked
    .filter(({ change }) => {
      const favorable = FAVORABLE_DIRECTION[`${change.source}.${change.metric}`];
      return favorable && favorable !== change.direction;
    })
    .slice(0, 3)
    .map(({ change, evidence: proof }) => item("problem", change, proof));
  const actionBasis = problems.length > 0
    ? ranked.filter(({ change }) => problems.some((problem) => problem.evidenceIds.includes(`${change.source}.${change.metric}`)))
    : ranked.slice(0, 2);
  const actions = actionBasis.slice(0, 3).map(({ change, evidence: proof }) => item("action", change, proof));
  const watch = ranked.slice(0, 4).map(({ change, evidence: proof }) => item("watch", change, proof));

  return {
    schemaVersion: 1,
    reportingPeriod: ranges.reportingPeriod,
    comparisonPeriod: ranges.comparisonPeriod,
    timeZone: ranges.timeZone,
    currency: collection.context.googleAds?.currency ?? null,
    dataSourceStatus: collection.dataSourceStatus,
    currentSummary: collection.currentSummary,
    previousSummary: collection.previousSummary,
    executiveSummary: buildExecutiveSummary(collection, comparison.changes, wins, problems),
    kpiChanges: comparison.changes,
    supportingEvidence: evidence,
    warnings: collection.warnings,
    candidates: {
      biggestWins: wins,
      biggestProblems: problems,
      recommendedActions: actions,
      nextWeekWatchList: watch,
    },
  };
}

function prioritize(items: WeeklyReportItem[], selectedIds: Set<string>): WeeklyReportItem[] {
  return items.toSorted((left, right) => Number(selectedIds.has(right.id)) - Number(selectedIds.has(left.id)));
}

export async function executeWeeklyReport(
  options: { now?: Date; timeZone?: string } = {},
  dependencies: WeeklyReportDependencies,
): Promise<WeeklyReport> {
  const now = options.now ?? new Date();
  const ranges = getWeeklyReportRanges(now, options.timeZone ?? "UTC");
  const collection = await dependencies.collect(ranges);
  const draft = buildWeeklyReportDraft(ranges, collection);
  const enriched = await dependencies.enrich(draft);
  const allowedIds = new Set(Object.values(draft.candidates).flat().map((candidate) => candidate.id));
  const selectedIds = new Set(enriched.selectedCandidateIds.filter((id) => allowedIds.has(id)));
  const report = weeklyReportSchema.parse({
    schemaVersion: draft.schemaVersion,
    reportingPeriod: draft.reportingPeriod,
    comparisonPeriod: draft.comparisonPeriod,
    generatedAt: now.toISOString(),
    timeZone: draft.timeZone,
    currency: draft.currency,
    dataSourceStatus: draft.dataSourceStatus,
    aiEnrichment: { status: enriched.status, detail: enriched.detail },
    currentSummary: draft.currentSummary,
    previousSummary: draft.previousSummary,
    executiveSummary: draft.executiveSummary,
    kpiChanges: draft.kpiChanges,
    biggestWins: prioritize(draft.candidates.biggestWins, selectedIds),
    biggestProblems: prioritize(draft.candidates.biggestProblems, selectedIds),
    recommendedActions: prioritize(draft.candidates.recommendedActions, selectedIds),
    supportingEvidence: draft.supportingEvidence,
    nextWeekWatchList: prioritize(draft.candidates.nextWeekWatchList, selectedIds),
    warnings: [...draft.warnings, ...(enriched.warning ? [enriched.warning] : [])],
  });
  await dependencies.save(report);
  return report;
}
