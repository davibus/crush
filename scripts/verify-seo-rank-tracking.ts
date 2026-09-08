import assert from "node:assert/strict";

import {
  buildSeoRankTracking,
  compareSeoRankRows,
  SEO_RANK_TRACKING_THRESHOLDS,
} from "../lib/seo-rank-tracking.ts";
import {
  SEARCH_CONSOLE_SOURCE,
  SEARCH_CONSOLE_SOURCE_LABEL,
  type SearchConsoleDataState,
  type SearchConsoleRankDimension,
  type SearchConsoleRankRow,
} from "../lib/search-console.ts";

const currentPeriod = { startDate: "2026-08-15", endDate: "2026-08-28" };
const previousPeriod = { startDate: "2026-08-01", endDate: "2026-08-14" };

function row(
  dimension: SearchConsoleRankDimension,
  identity: string,
  averagePosition: number,
  impressions: number,
  clicks = 5,
): SearchConsoleRankRow {
  return {
    dimension,
    ...(dimension === "page" ? { page: identity } : { query: identity }),
    ...(dimension === "query_page" ? { page: `https://example.com/${identity.replaceAll(" ", "-")}` } : {}),
    averagePosition,
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
  };
}

const currentRows: SearchConsoleRankRow[] = [
  row("query", "improving query", 8, 140, 14),
  row("query", "declining query", 8, 150, 10),
  row("query", "stable query", 6.5, 80, 5),
  row("query", "page one opportunity", 13, 100, 8),
  row("query", "top ranking opportunity", 5, 100, 12),
  row("page", "https://example.com/gaining-page", 9, 160, 16),
  row("query", "exact movement boundary", 8, 20, 0),
  row("query", "below movement boundary", 8.001, 20, 0),
  row("query", "below volume boundary", 8, 19, 0),
  row("query", "zero impression row", 8, 0, 0),
  row("query", "invalid row", Number.POSITIVE_INFINITY, 100, 3),
  row("query", "current only", 7, 100, 4),
];

const previousRows: SearchConsoleRankRow[] = [
  row("query", "improving query", 12, 100, 8),
  row("query", "declining query", 5, 220, 18),
  row("query", "stable query", 7, 80, 5),
  row("query", "page one opportunity", 15, 100, 7),
  row("query", "top ranking opportunity", 7, 100, 10),
  row("page", "https://example.com/gaining-page", 13, 100, 10),
  row("query", "exact movement boundary", 10, 20, 0),
  row("query", "below movement boundary", 10, 20, 0),
  row("query", "below volume boundary", 10, 19, 0),
  row("query", "zero impression row", 10, 0, 0),
  row("query", "invalid row", 10, Number.NaN, 3),
  row("query", "previous only", 10, 100, 4),
];

const compared = compareSeoRankRows(currentRows, previousRows, currentPeriod, previousPeriod);
const movement = (queryOrPage: string) => compared.movements.find((item) => item.query === queryOrPage || item.page === queryOrPage)!;

assert.equal(movement("improving query").positionChange, 4, "Position change must be previous minus current.");
assert.equal(movement("improving query").direction, "improved");
assert.ok(movement("improving query").findings.includes("meaningful_improvement"));
assert.ok(movement("improving query").findings.includes("improvement_with_visibility_gain"));

assert.equal(movement("declining query").positionChange, -3);
assert.equal(movement("declining query").direction, "declined");
assert.ok(movement("declining query").findings.includes("meaningful_decline"));
assert.ok(movement("declining query").findings.includes("high_impression_decline"));
assert.ok(movement("declining query").findings.includes("decline_with_visibility_loss"));

assert.equal(movement("stable query").direction, "stable");
assert.deepEqual(movement("stable query").findings, ["stable"]);
assert.ok(movement("page one opportunity").findings.includes("page_one_opportunity"));
assert.equal(movement("page one opportunity").band, "positions_11_20");
assert.ok(movement("top ranking opportunity").findings.includes("top_ranking_opportunity"));
assert.equal(movement("top ranking opportunity").band, "positions_4_10");
assert.equal(movement("https://example.com/gaining-page").dimension, "page", "Page visibility must be comparable at page grain.");

assert.equal(movement("exact movement boundary").direction, "improved");
assert.equal(movement("below movement boundary").direction, "stable");
assert.equal(compared.movements.some((item) => item.query === "below volume boundary"), false);
assert.equal(compared.movements.some((item) => item.query === "zero impression row"), false);
assert.equal(compared.movements.some((item) => item.query === "invalid row"), false);
assert.equal(compared.movements.some((item) => item.query === "current only"), false);
assert.equal(compared.movements.some((item) => item.query === "previous only"), false);
assert.equal(movement("exact movement boundary").current.clicks, 0, "Zero clicks are valid when impression evidence is sufficient.");

assert.equal(SEO_RANK_TRACKING_THRESHOLDS.meaningfulPositionChange, 2);
assert.equal(SEO_RANK_TRACKING_THRESHOLDS.minimumImpressionsPerPeriod, 20);
assert.equal(SEO_RANK_TRACKING_THRESHOLDS.highImpressions, 100);

for (const item of compared.movements) {
  assert.equal(item.source, SEARCH_CONSOLE_SOURCE);
  assert.equal(item.sourceLabel, SEARCH_CONSOLE_SOURCE_LABEL);
  assert.match(item.metricLabel, /Aggregated Google Search Console average position/);
  assert.match(item.evidenceId, /^gsc-rank:2026-08-15:2026-08-28:/);
  assert.deepEqual(item.currentPeriod, currentPeriod);
  assert.deepEqual(item.previousPeriod, previousPeriod);
}

const availableState: SearchConsoleDataState = {
  status: "available",
  data: {
    source: SEARCH_CONSOLE_SOURCE,
    sourceLabel: SEARCH_CONSOLE_SOURCE_LABEL,
    propertyUrl: "sc-domain:example.com",
    dateRange: currentPeriod,
    fetchedAt: "2026-09-01T00:00:00.000Z",
    reports: [],
    rankTracking: { currentPeriod, previousPeriod, currentRows, previousRows },
  },
};
const built = buildSeoRankTracking(availableState);
assert.equal(built.status, "available");
assert.deepEqual(buildSeoRankTracking(availableState), built, "Rank comparison must be deterministically repeatable.");

assert.equal(buildSeoRankTracking({ status: "unconfigured" }).status, "unconfigured");
assert.equal(buildSeoRankTracking({ status: "error", message: "secret diagnostic" }).status, "error");
assert.equal(buildSeoRankTracking({ ...availableState, data: { ...availableState.data, reports: [], rankTracking: undefined } }).status, "insufficient_data");
assert.equal(buildSeoRankTracking({ ...availableState, data: { ...availableState.data, reports: [], rankTracking: { currentPeriod, previousPeriod, currentRows: [row("query", "one period", 8, 100)], previousRows: [] } } }).status, "insufficient_data");
assert.equal(
  compareSeoRankRows(currentRows, previousRows, currentPeriod, { startDate: "2026-08-01", endDate: "2026-08-13" }).movements.length,
  0,
  "Unequal periods must never produce rank evidence.",
);

console.log("SEO rank tracking verification passed: sign/direction math, improvement, decline, stability, opportunities, high-impression and visibility rules, boundaries, invalid/missing data, provenance, no invented comparisons, and repeatability.");
