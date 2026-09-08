import assert from "node:assert/strict";

import type { DailyAnalysisResult } from "../lib/daily-analysis.ts";
import type { MarketingDataSet } from "../lib/marketing-data-source.ts";
import { handlePdfReportRequest } from "../lib/pdf-report-handler.ts";
import {
  buildPdfMarketingReport,
  getPdfReportFilename,
  sanitizePdfFilenamePart,
} from "../lib/pdf-report.ts";
import { renderPdfMarketingReport } from "../lib/pdf-report-renderer.ts";
import { resolveWorkspaceForIdentity } from "../lib/tenant-authorization.ts";
import {
  DevelopmentTenantRepository,
  type Workspace,
} from "../lib/tenant-repository.ts";
import type { WeeklyReport } from "../lib/weekly-report.ts";

const secretValues = [
  "123-456-7890",
  "vault:alpha-secret",
  "top-secret-refresh-token",
  "postgres://private-database",
];
const alpha: Workspace = {
  id: "alpha",
  name: "Alpha / Outdoor: West",
  status: "active",
  dataSource: "sample",
  googleAdsCustomerId: secretValues[0],
  integrationSecretRef: secretValues[1],
};
const beta: Workspace = {
  id: "beta",
  name: "Beta",
  status: "active",
  dataSource: "sample",
  integrationSecretRef: "vault:beta-secret",
};
const repository = new DevelopmentTenantRepository(
  [alpha, beta],
  new Map([
    ["alpha-user", ["alpha"]],
    ["beta-user", ["beta"]],
  ]),
);

function marketingData(
  workspace: Workspace,
  metrics = { impressions: 10_000, clicks: 800, cost: 2_000, conversions: 80, conversionValue: 8_000 },
  ga4: MarketingDataSet["ga4"] = { status: "unconfigured" },
): MarketingDataSet {
  return {
    source: "sample",
    requestedSource: "sample",
    sourceLabel: "Demo Google Ads data",
    dateRangeLabel: "Aug 18-24, 2025",
    campaignData: {
      account: { id: `private-account-${workspace.id}`, name: workspace.name, currency: "USD" },
      campaigns: [{
        id: `private-campaign-${workspace.id}`,
        name: `${workspace.name} Search`,
        status: "ENABLED",
        channel: "SEARCH",
        dailyBudget: 100,
        metrics,
      }],
    },
    dailyMetrics: [],
    geographies: [],
    devices: [],
    keywords: [],
    searchTerms: [],
    conversions: [],
    landingPages: [],
    ga4,
  };
}

const daily = {
  analysisDate: "2026-09-07",
  aiFindings: {
    status: "grounded_ai",
    summary: "Efficiency held steady while conversion volume improved.",
    findings: [{
      materialChangeId: "google_ads.conversions",
      observedFact: "Conversions increased",
      interpretation: "More measured outcomes were recorded.",
      recommendation: "Review the strongest campaign and protect efficient coverage.",
    }],
  },
} as DailyAnalysisResult;
const weekly = {
  reportingPeriod: { startDate: "2026-09-01", endDate: "2026-09-07" },
  aiEnrichment: { status: "deterministic_fallback" },
  executiveSummary: "The account produced efficient conversion value during the completed week.",
  biggestWins: [{ id: "win", title: "ROAS improved", summary: "Return increased week over week.", evidenceIds: ["google_ads.roas"] }],
  biggestProblems: [],
  recommendedActions: [{ id: "action", title: "Protect efficient reach", summary: "Monitor budget coverage on the strongest campaign.", evidenceIds: ["google_ads.roas"] }],
} as unknown as WeeklyReport;

const loaded: string[] = [];
const report = await buildPdfMarketingReport(alpha, {
  now: new Date("2026-09-08T12:30:00.000Z"),
  async loadMarketingData(workspace) { loaded.push(`marketing:${workspace.id}`); return marketingData(workspace); },
  async loadLatestDailyAnalysis(workspaceId) { loaded.push(`daily:${workspaceId}`); return daily; },
  async loadLatestWeeklyReport(workspaceId) { loaded.push(`weekly:${workspaceId}`); return weekly; },
});
assert.deepEqual(loaded.sort(), ["daily:alpha", "marketing:alpha", "weekly:alpha"]);
assert.equal(report.clientName, alpha.name);
assert.equal(report.googleAds.metrics.spend, 2_000);
assert.equal(report.googleAds.metrics.conversions, 80);
assert.equal(report.googleAds.metrics.cpa, 25);
assert.equal(report.googleAds.metrics.roas, 4);
assert.equal(report.dataSources[0].status, "sample");
assert.equal(report.dailyAnalysis?.analysisDate, "2026-09-07");
assert.equal(report.weeklyReport?.reportingPeriod, "2026-09-01 to 2026-09-07");
assert.ok(report.recommendations.length > 0);

const noSavedReports = await buildPdfMarketingReport(alpha, {
  loadMarketingData: async (workspace) => marketingData(workspace),
  loadLatestDailyAnalysis: async () => null,
  loadLatestWeeklyReport: async () => null,
});
assert.equal(noSavedReports.dailyAnalysis, null);
assert.equal(noSavedReports.weeklyReport, null);
assert.ok(noSavedReports.notes.some((note) => note.includes("Daily Analysis")));
assert.ok(noSavedReports.notes.some((note) => note.includes("Weekly Marketing Report")));

const zeroConversions = await buildPdfMarketingReport(alpha, {
  loadMarketingData: async (workspace) => marketingData(workspace, {
    impressions: 100,
    clicks: 10,
    cost: 50,
    conversions: 0,
    conversionValue: 0,
  }),
  loadLatestDailyAnalysis: async () => null,
  loadLatestWeeklyReport: async () => null,
});
assert.equal(zeroConversions.googleAds.metrics.conversions, 0);
assert.equal(zeroConversions.googleAds.metrics.cpa, null);

const zeroSpend = await buildPdfMarketingReport(alpha, {
  loadMarketingData: async (workspace) => marketingData(workspace, {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    conversionValue: 0,
  }),
  loadLatestDailyAnalysis: async () => null,
  loadLatestWeeklyReport: async () => null,
});
assert.equal(zeroSpend.googleAds.metrics.spend, 0);
assert.equal(zeroSpend.googleAds.metrics.ctr, null);
assert.equal(zeroSpend.googleAds.metrics.cpc, null);
assert.equal(zeroSpend.googleAds.metrics.conversionRate, null);
assert.equal(zeroSpend.googleAds.metrics.roas, null);
assert.equal(zeroSpend.ga4, null);

const withGa4 = await buildPdfMarketingReport(alpha, {
  loadMarketingData: async (workspace) => marketingData(workspace, undefined, {
    status: "available",
    data: {
      propertyId: "private-property-id",
      dateRange: { startDate: "2026-09-01", endDate: "2026-09-07" },
      summary: { sessions: 500, totalUsers: 400, newUsers: 300, activeUsers: 380, keyEvents: 42, engagedSessions: 350, engagementRate: 0.7, totalRevenue: 9_000 },
      keyEvents: [], landingPages: [], trafficSources: [], googleAdsCampaigns: [],
    },
  }),
  loadLatestDailyAnalysis: async () => null,
  loadLatestWeeklyReport: async () => null,
});
assert.equal(withGa4.ga4?.engagementRate, 70);
assert.equal(withGa4.dataSources[1].status, "live");

const dto = JSON.stringify(report);
for (const secret of [...secretValues, "private-account-alpha", "private-campaign-alpha", "private-property-id"]) {
  assert.equal(dto.includes(secret), false, `Report DTO leaked ${secret}.`);
}

assert.equal(sanitizePdfFilenamePart("../../ACME & Co. \\ Q3"), "acme-co-q3");
const filename = getPdfReportFilename(report);
assert.equal(filename, "alpha-outdoor-west-aug-18-24-2025-marketing-report.pdf");
assert.doesNotMatch(filename, /[\\/:*?"<>]/);

const pdf = await renderPdfMarketingReport(report);
assert.ok(pdf.byteLength > 2_000, "Generated PDF should be non-empty.");
assert.equal(new TextDecoder("latin1").decode(pdf.slice(0, 5)), "%PDF-");
const pdfText = new TextDecoder("latin1").decode(pdf);
for (const secret of secretValues) assert.equal(pdfText.includes(secret), false, `PDF leaked ${secret}.`);

const resolveFor = (userId: string | null) => (workspaceId: unknown) =>
  resolveWorkspaceForIdentity(userId ? { id: userId } : null, workspaceId, repository);
const unauthorized = await handlePdfReportRequest("alpha", { resolveWorkspace: resolveFor(null) });
assert.equal(unauthorized.status, 401);
const nonMember = await handlePdfReportRequest("beta", { resolveWorkspace: resolveFor("alpha-user") });
const unknown = await handlePdfReportRequest("does-not-exist", { resolveWorkspace: resolveFor("alpha-user") });
const unsafeId = await handlePdfReportRequest("../../alpha", { resolveWorkspace: resolveFor("alpha-user") });
assert.equal(nonMember.status, 404);
assert.equal(unknown.status, 404);
assert.equal(unsafeId.status, 404);
assert.equal(await nonMember.text(), await unknown.text(), "Unknown and non-member responses must be indistinguishable.");

let authorizedWorkspaceId = "";
const authorized = await handlePdfReportRequest("alpha", {
  resolveWorkspace: resolveFor("alpha-user"),
  async buildReport(workspace) { authorizedWorkspaceId = workspace.id; return report; },
  renderReport: async () => pdf,
});
assert.equal(authorizedWorkspaceId, "alpha");
assert.equal(authorized.status, 200);
assert.equal(authorized.headers.get("Content-Type"), "application/pdf");
assert.equal(authorized.headers.get("Cache-Control"), "private, no-store, max-age=0");
assert.match(authorized.headers.get("Content-Disposition") ?? "", /^attachment; filename="[a-z0-9.-]+\.pdf"$/);
assert.equal((await authorized.arrayBuffer()).byteLength, pdf.byteLength);

console.log("PDF report verification passed: authorized on-demand generation, safe tenant denials, requested-workspace-only loading, sample and missing-data states, zero denominators, GA4 context, sanitized filenames, secret-safe DTO/PDF output, and valid PDF response headers/body.");
