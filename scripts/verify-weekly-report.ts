import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { MarketingPeriodSummary, NormalizedGoogleAdsSummary } from "../lib/daily-analysis.ts";
import { enrichWeeklyReport } from "../lib/weekly-report-ai.ts";
import {
  buildWeeklyReportDraft,
  executeWeeklyReport,
  getWeeklyReportRanges,
  weeklyReportSchema,
  type WeeklyReportCollection,
} from "../lib/weekly-report.ts";
import { getLatestWeeklyReport, getWeeklyReport, listWeeklyReports, saveWeeklyReport } from "../lib/weekly-report-storage.ts";

const ranges = getWeeklyReportRanges(new Date("2026-08-31T12:00:00.000Z"), "UTC");
assert.deepEqual(ranges.reportingPeriod, { startDate: "2026-08-24", endDate: "2026-08-30" });
assert.deepEqual(ranges.comparisonPeriod, { startDate: "2026-08-17", endDate: "2026-08-23" });

function ads(values: Partial<NormalizedGoogleAdsSummary> = {}): NormalizedGoogleAdsSummary {
  return {
    spend: 700,
    impressions: 7_000,
    clicks: 700,
    ctr: 10,
    cpc: 1,
    conversions: 70,
    conversionRate: 10,
    cpa: 10,
    conversionValue: 1_400,
    roas: 2,
    ...values,
  };
}

function summary(dateRange: { startDate: string; endDate: string }, googleAds: NormalizedGoogleAdsSummary | null): MarketingPeriodSummary {
  return { dateRange, googleAds, ga4: null };
}

function collection(current: NormalizedGoogleAdsSummary | null, previous: NormalizedGoogleAdsSummary | null): WeeklyReportCollection {
  return {
    currentSummary: summary(ranges.reportingPeriod, current),
    previousSummary: summary(ranges.comparisonPeriod, previous),
    context: current ? { googleAds: { accountName: "Test", currency: "USD", campaignCount: 0, topCampaigns: [] } } : {},
    dataSourceStatus: [
      { source: "google_ads", status: current ? "live" : "unavailable", included: Boolean(current), detail: current ? "Live data included." : "Live data unavailable." },
      { source: "ga4", status: "unconfigured", included: false, detail: "GA4 is not configured." },
    ],
    warnings: [],
  };
}

const changedDraft = buildWeeklyReportDraft(
  ranges,
  collection(
    ads({ spend: 0, impressions: 0, clicks: 0, ctr: null, cpc: null, conversions: 0, conversionRate: null, cpa: null, conversionValue: 0, roas: null }),
    ads({ spend: 0, impressions: 0, clicks: 0, ctr: null, cpc: null, conversions: 0, conversionRate: null, cpa: null, conversionValue: 0, roas: null }),
  ),
);
const zeroSpend = changedDraft.kpiChanges.find((change) => change.metric === "spend");
const zeroCpa = changedDraft.kpiChanges.find((change) => change.metric === "cpa");
assert.equal(zeroSpend?.percentageChange, null, "A zero baseline must never produce NaN or Infinity.");
assert.equal(zeroSpend?.direction, "unchanged");
assert.equal(zeroCpa?.direction, "unavailable");

const performanceDraft = buildWeeklyReportDraft(
  ranges,
  collection(ads({ conversions: 100, cpa: 7, conversionValue: 2_100, roas: 3 }), ads()),
);
const conversionChange = performanceDraft.kpiChanges.find((change) => change.metric === "conversions");
assert.equal(conversionChange?.percentageChange, (30 / 70) * 100);
for (const group of Object.values(performanceDraft.candidates)) {
  for (const item of group) {
    assert.ok(item.evidenceIds.length > 0);
    for (const evidenceId of item.evidenceIds) {
      assert.ok(performanceDraft.supportingEvidence.some((evidence) => evidence.id === evidenceId), `${item.id} must reference actual evidence.`);
    }
  }
}

const missingPrevious = buildWeeklyReportDraft(ranges, collection(ads(), null));
assert.ok(missingPrevious.kpiChanges.every((change) => change.direction === "unavailable"));
assert.equal(missingPrevious.candidates.biggestWins.length, 0);
assert.equal(missingPrevious.candidates.biggestProblems.length, 0);

const noAi = await enrichWeeklyReport(performanceDraft, { NODE_ENV: "test" } as NodeJS.ProcessEnv);
assert.equal(noAi.status, "deterministic_fallback");
assert.deepEqual(noAi.selectedCandidateIds, []);

let saved = false;
const report = await executeWeeklyReport(
  { now: new Date("2026-08-31T12:00:00.000Z"), timeZone: "UTC" },
  {
    async collect() { return collection(ads({ conversions: 100, cpa: 7, conversionValue: 2_100, roas: 3 }), ads()); },
    async enrich(draft) { return enrichWeeklyReport(draft, { NODE_ENV: "test" } as NodeJS.ProcessEnv); },
    async save() { saved = true; },
  },
);
assert.equal(saved, true);
assert.equal(report.aiEnrichment.status, "deterministic_fallback");
assert.ok(report.biggestWins.length > 0);
assert.ok(report.supportingEvidence.every((evidence) => evidence.statement.includes(evidence.label)));
assert.equal(weeklyReportSchema.safeParse(report).success, true);
assert.equal(
  weeklyReportSchema.safeParse({
    ...report,
    biggestWins: [{ id: "bad", title: "Ungrounded", summary: "Must fail.", evidenceIds: ["missing.evidence"] }],
  }).success,
  false,
  "The persisted schema must reject narrative items without supplied evidence.",
);

const directory = await mkdtemp(path.join(tmpdir(), "crush-weekly-report-"));
try {
  await saveWeeklyReport(report, directory);
  assert.deepEqual(await getWeeklyReport(report.reportingPeriod.endDate, directory), report);
  const replacement = { ...report, generatedAt: "2026-08-31T12:01:00.000Z" };
  await saveWeeklyReport(replacement, directory);
  assert.deepEqual(await getLatestWeeklyReport(directory), replacement);
  assert.equal((await listWeeklyReports(directory)).length, 1);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Weekly report verification passed: completed 7-day periods, KPI percentage changes, zero and missing-value handling, evidence grounding, deterministic AI fallback, schema validation, orchestration, and persistence round-trip.");
