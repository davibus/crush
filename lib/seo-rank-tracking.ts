import {
  SEARCH_CONSOLE_SOURCE,
  SEARCH_CONSOLE_SOURCE_LABEL,
  type SearchConsoleDataState,
  type SearchConsoleRankRow,
} from "./search-console.ts";

export const SEO_RANK_TRACKING_THRESHOLDS = Object.freeze({
  minimumImpressionsPerPeriod: 20,
  meaningfulPositionChange: 2,
  highImpressions: 100,
  visibilityChangeMinimum: 25,
  visibilityChangeRate: 0.2,
  lostClicksMinimum: 3,
  topBandMaximum: 3,
  topOpportunityMaximum: 10,
  pageOneOpportunityMaximum: 20,
});

export const SEO_RANK_FINDING_TYPES = [
  "meaningful_improvement",
  "meaningful_decline",
  "page_one_opportunity",
  "top_ranking_opportunity",
  "high_impression_decline",
  "improvement_with_visibility_gain",
  "decline_with_visibility_loss",
  "stable",
] as const;

export type SeoRankFindingType = (typeof SEO_RANK_FINDING_TYPES)[number];
export type SeoRankDirection = "improved" | "declined" | "stable";
export type SeoRankBand = "top_3" | "positions_4_10" | "positions_11_20" | "beyond_20";
export type SeoRankDimension = SearchConsoleRankRow["dimension"];

export type SeoRankPeriod = { startDate: string; endDate: string };

export type SeoRankMetrics = {
  averagePosition: number;
  impressions: number;
  clicks: number;
  ctr: number;
};

export type SeoRankMovement = {
  evidenceId: string;
  source: typeof SEARCH_CONSOLE_SOURCE;
  sourceLabel: typeof SEARCH_CONSOLE_SOURCE_LABEL;
  metricLabel: "Aggregated Google Search Console average position";
  dimension: SeoRankDimension;
  query?: string;
  page?: string;
  currentPeriod: SeoRankPeriod;
  previousPeriod: SeoRankPeriod;
  current: SeoRankMetrics;
  previous: SeoRankMetrics;
  positionChange: number;
  impressionChange: number;
  clickChange: number;
  direction: SeoRankDirection;
  band: SeoRankBand;
  findings: SeoRankFindingType[];
};

export type SeoRankTrackingState =
  | {
      status: "available";
      source: typeof SEARCH_CONSOLE_SOURCE;
      sourceLabel: typeof SEARCH_CONSOLE_SOURCE_LABEL;
      metricLabel: "Aggregated Google Search Console average position";
      currentPeriod: SeoRankPeriod;
      previousPeriod: SeoRankPeriod;
      movements: SeoRankMovement[];
      excludedRows: number;
    }
  | {
      status: "unconfigured" | "error" | "empty" | "insufficient_data";
      source: typeof SEARCH_CONSOLE_SOURCE;
      sourceLabel: typeof SEARCH_CONSOLE_SOURCE_LABEL;
      message: string;
    };

function isoDayNumber(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86_400_000) : null;
}

export function reportingPeriodDays(period: SeoRankPeriod): number | null {
  const start = isoDayNumber(period.startDate);
  const end = isoDayNumber(period.endDate);
  if (start == null || end == null || end < start) return null;
  return end - start + 1;
}

export function areEquivalentRankPeriods(
  current: SeoRankPeriod,
  previous: SeoRankPeriod,
): boolean {
  const currentDays = reportingPeriodDays(current);
  const previousDays = reportingPeriodDays(previous);
  const currentStart = isoDayNumber(current.startDate);
  const previousEnd = isoDayNumber(previous.endDate);
  return currentDays != null && currentDays === previousDays &&
    currentStart != null && previousEnd != null && previousEnd < currentStart;
}

function validDimension(row: SearchConsoleRankRow): boolean {
  if (row.dimension === "query") return Boolean(row.query?.trim()) && !row.page;
  if (row.dimension === "page") return Boolean(row.page?.trim()) && !row.query;
  return Boolean(row.query?.trim()) && Boolean(row.page?.trim());
}

function validMetrics(row: SearchConsoleRankRow): boolean {
  return [row.averagePosition, row.impressions, row.clicks, row.ctr].every(Number.isFinite) &&
    row.averagePosition > 0 && row.impressions >= 0 && row.clicks >= 0 && row.ctr >= 0 && row.ctr <= 1;
}

function rowKey(row: SearchConsoleRankRow): string {
  return `${row.dimension}\u0000${row.query?.trim() ?? ""}\u0000${row.page?.trim() ?? ""}`;
}

function evidenceId(row: SearchConsoleRankRow, currentPeriod: SeoRankPeriod): string {
  const identity = rowKey(row);
  let hash = 2_166_136_261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `gsc-rank:${currentPeriod.startDate}:${currentPeriod.endDate}:${row.dimension}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function rankBand(position: number): SeoRankBand {
  if (position <= SEO_RANK_TRACKING_THRESHOLDS.topBandMaximum) return "top_3";
  if (position <= SEO_RANK_TRACKING_THRESHOLDS.topOpportunityMaximum) return "positions_4_10";
  if (position <= SEO_RANK_TRACKING_THRESHOLDS.pageOneOpportunityMaximum) return "positions_11_20";
  return "beyond_20";
}

function visibilityChanged(current: number, previous: number, direction: "gain" | "loss"): boolean {
  const change = direction === "gain" ? current - previous : previous - current;
  const required = Math.max(
    SEO_RANK_TRACKING_THRESHOLDS.visibilityChangeMinimum,
    previous * SEO_RANK_TRACKING_THRESHOLDS.visibilityChangeRate,
  );
  return change >= required;
}

function classifyMovement(current: SearchConsoleRankRow, previous: SearchConsoleRankRow) {
  // Lower Search Console average-position numbers are better.
  const positionChange = previous.averagePosition - current.averagePosition;
  const meaningful = SEO_RANK_TRACKING_THRESHOLDS.meaningfulPositionChange;
  const direction: SeoRankDirection = positionChange >= meaningful
    ? "improved"
    : positionChange <= -meaningful ? "declined" : "stable";
  const findings: SeoRankFindingType[] = [];
  const highImpression = current.impressions >= SEO_RANK_TRACKING_THRESHOLDS.highImpressions ||
    previous.impressions >= SEO_RANK_TRACKING_THRESHOLDS.highImpressions;

  if (direction === "improved") findings.push("meaningful_improvement");
  if (direction === "declined") findings.push("meaningful_decline");
  if (direction === "stable") findings.push("stable");
  if (
    current.averagePosition > SEO_RANK_TRACKING_THRESHOLDS.topOpportunityMaximum &&
    current.averagePosition <= SEO_RANK_TRACKING_THRESHOLDS.pageOneOpportunityMaximum &&
    current.impressions >= SEO_RANK_TRACKING_THRESHOLDS.highImpressions
  ) findings.push("page_one_opportunity");
  if (
    current.averagePosition > SEO_RANK_TRACKING_THRESHOLDS.topBandMaximum &&
    current.averagePosition <= SEO_RANK_TRACKING_THRESHOLDS.topOpportunityMaximum &&
    current.impressions >= SEO_RANK_TRACKING_THRESHOLDS.highImpressions
  ) findings.push("top_ranking_opportunity");
  if (direction === "declined" && highImpression) findings.push("high_impression_decline");
  if (
    direction === "improved" &&
    visibilityChanged(current.impressions, previous.impressions, "gain")
  ) findings.push("improvement_with_visibility_gain");
  if (
    direction === "declined" &&
    (visibilityChanged(current.impressions, previous.impressions, "loss") ||
      previous.clicks - current.clicks >= SEO_RANK_TRACKING_THRESHOLDS.lostClicksMinimum)
  ) findings.push("decline_with_visibility_loss");

  return { positionChange, direction, findings };
}

function priority(movement: SeoRankMovement): number {
  const ordered: SeoRankFindingType[] = [
    "high_impression_decline",
    "decline_with_visibility_loss",
    "page_one_opportunity",
    "top_ranking_opportunity",
    "improvement_with_visibility_gain",
    "meaningful_decline",
    "meaningful_improvement",
    "stable",
  ];
  return Math.min(...movement.findings.map((finding) => ordered.indexOf(finding)));
}

export function compareSeoRankRows(
  currentRows: readonly SearchConsoleRankRow[],
  previousRows: readonly SearchConsoleRankRow[],
  currentPeriod: SeoRankPeriod,
  previousPeriod: SeoRankPeriod,
): { movements: SeoRankMovement[]; excludedRows: number } {
  if (!areEquivalentRankPeriods(currentPeriod, previousPeriod)) {
    return { movements: [], excludedRows: currentRows.length + previousRows.length };
  }
  const validPrevious = new Map(
    previousRows.filter((row) => validDimension(row) && validMetrics(row)).map((row) => [rowKey(row), row]),
  );
  let excludedRows = previousRows.length - validPrevious.size;
  const movements: SeoRankMovement[] = [];

  for (const current of currentRows) {
    if (!validDimension(current) || !validMetrics(current)) {
      excludedRows += 1;
      continue;
    }
    const previous = validPrevious.get(rowKey(current));
    if (!previous) {
      excludedRows += 1;
      continue;
    }
    validPrevious.delete(rowKey(current));
    if (
      current.impressions < SEO_RANK_TRACKING_THRESHOLDS.minimumImpressionsPerPeriod ||
      previous.impressions < SEO_RANK_TRACKING_THRESHOLDS.minimumImpressionsPerPeriod
    ) {
      excludedRows += 1;
      continue;
    }
    const classification = classifyMovement(current, previous);
    movements.push({
      evidenceId: evidenceId(current, currentPeriod),
      source: SEARCH_CONSOLE_SOURCE,
      sourceLabel: SEARCH_CONSOLE_SOURCE_LABEL,
      metricLabel: "Aggregated Google Search Console average position",
      dimension: current.dimension,
      ...(current.query ? { query: current.query } : {}),
      ...(current.page ? { page: current.page } : {}),
      currentPeriod,
      previousPeriod,
      current: {
        averagePosition: current.averagePosition,
        impressions: current.impressions,
        clicks: current.clicks,
        ctr: current.ctr,
      },
      previous: {
        averagePosition: previous.averagePosition,
        impressions: previous.impressions,
        clicks: previous.clicks,
        ctr: previous.ctr,
      },
      positionChange: classification.positionChange,
      impressionChange: current.impressions - previous.impressions,
      clickChange: current.clicks - previous.clicks,
      direction: classification.direction,
      band: rankBand(current.averagePosition),
      findings: classification.findings,
    });
  }
  excludedRows += validPrevious.size;

  movements.sort((left, right) =>
    priority(left) - priority(right) ||
    Math.max(right.current.impressions, right.previous.impressions) - Math.max(left.current.impressions, left.previous.impressions) ||
    Math.abs(right.positionChange) - Math.abs(left.positionChange) ||
    (left.query ?? left.page ?? "").localeCompare(right.query ?? right.page ?? ""),
  );
  return { movements, excludedRows };
}

export function buildSeoRankTracking(state: SearchConsoleDataState): SeoRankTrackingState {
  const base = { source: SEARCH_CONSOLE_SOURCE, sourceLabel: SEARCH_CONSOLE_SOURCE_LABEL } as const;
  if (state.status === "unconfigured") {
    return { ...base, status: "unconfigured", message: "Connect Google Search Console to compare historical average-position data." };
  }
  if (state.status === "error") {
    return { ...base, status: "error", message: "Google Search Console rank data is temporarily unavailable." };
  }
  if (state.status === "empty") {
    return { ...base, status: "empty", message: "Search Console returned no rows for the current reporting period." };
  }
  const comparison = state.data.rankTracking;
  if (!comparison || comparison.currentRows.length === 0 || comparison.previousRows.length === 0) {
    return { ...base, status: "insufficient_data", message: "Two populated, equivalent Search Console reporting periods are required for rank movement." };
  }
  if (!areEquivalentRankPeriods(comparison.currentPeriod, comparison.previousPeriod)) {
    return { ...base, status: "insufficient_data", message: "The Search Console periods are not equivalent and were not compared." };
  }
  const compared = compareSeoRankRows(
    comparison.currentRows,
    comparison.previousRows,
    comparison.currentPeriod,
    comparison.previousPeriod,
  );
  if (compared.movements.length === 0) {
    return { ...base, status: "insufficient_data", message: "No query or page had valid, matching data with at least 20 impressions in both periods." };
  }
  return {
    ...base,
    status: "available",
    metricLabel: "Aggregated Google Search Console average position",
    currentPeriod: comparison.currentPeriod,
    previousPeriod: comparison.previousPeriod,
    movements: compared.movements,
    excludedRows: compared.excludedRows,
  };
}
