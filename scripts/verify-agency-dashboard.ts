import assert from "node:assert/strict";

import {
  classifyFreshness,
  classifyPortfolioHealth,
  getAgencyPortfolioForUser,
  sortAgencyWorkspaceSummaries,
  type AgencyWorkspaceSummary,
} from "../lib/agency-portfolio.ts";
import { calculateAccountScore } from "../lib/account-score.ts";
import type { DailyAnalysisResult } from "../lib/daily-analysis.ts";
import type { MarketingDataSet } from "../lib/marketing-data-source.ts";
import {
  DevelopmentTenantRepository,
  type Workspace,
} from "../lib/tenant-repository.ts";
import type { WeeklyReport } from "../lib/weekly-report.ts";

const alpha: Workspace = {
  id: "alpha",
  name: "Alpha",
  status: "active",
  dataSource: "sample",
  googleAdsCustomerId: "111-111-1111",
  integrationSecretRef: "vault:alpha",
};
const beta: Workspace = {
  id: "beta",
  name: "Beta",
  status: "active",
  dataSource: "sample",
  googleAdsCustomerId: "222-222-2222",
  integrationSecretRef: "vault:beta",
};
const setupRequired: Workspace = {
  id: "setup-required",
  name: "Setup Required",
  status: "configuration_required",
  dataSource: "live",
  integrationSecretRef: "vault:setup",
};
const hidden: Workspace = {
  id: "hidden",
  name: "Hidden tenant",
  status: "active",
  dataSource: "live",
  googleAdsCustomerId: "999-999-9999",
  ga4PropertyId: "999999999",
  integrationSecretRef: "vault:hidden-secret",
};

const repository = new DevelopmentTenantRepository(
  [alpha, beta, setupRequired, hidden],
  new Map([
    ["agency-user", ["alpha", "beta", "setup-required"]],
    ["other-user", ["hidden"]],
  ]),
);

function marketingData(workspace: Workspace): MarketingDataSet {
  const multiplier = workspace.id === "alpha" ? 1 : 2;
  return {
    source: "sample",
    requestedSource: "sample",
    sourceLabel: "Fixture data",
    dateRangeLabel: "Fixture reporting window",
    campaignData: {
      account: { id: `account-${workspace.id}`, name: workspace.name, currency: "USD" },
      campaigns: [{
        id: `campaign-${workspace.id}`,
        name: `${workspace.name} campaign`,
        status: "ENABLED",
        channel: "SEARCH",
        dailyBudget: 100,
        metrics: {
          impressions: 10_000 * multiplier,
          clicks: 1_000 * multiplier,
          cost: 1_000 * multiplier,
          conversions: 100 * multiplier,
          conversionValue: 5_000 * multiplier,
        },
      }],
    },
    dailyMetrics: [],
    geographies: [],
    devices: [],
    keywords: [],
    searchTerms: [],
    conversions: [],
    landingPages: [],
    ga4: { status: "unconfigured" },
  };
}

const loadedWorkspaceIds: string[] = [];
const portfolio = await getAgencyPortfolioForUser("agency-user", {
  repository,
  now: new Date("2026-09-07T12:00:00.000Z"),
  async loadMarketingData(workspace) {
    loadedWorkspaceIds.push(workspace.id);
    return marketingData(workspace);
  },
  async loadLatestDailyAnalysis(workspaceId) {
    if (workspaceId !== "alpha") return null;
    return {
      analysisDate: "2026-09-06",
      aiFindings: { status: "stable" },
    } as DailyAnalysisResult;
  },
  async loadLatestWeeklyReport(workspaceId) {
    if (workspaceId !== "beta") return null;
    return {
      reportingPeriod: { endDate: "2026-09-05" },
      aiEnrichment: { status: "deterministic_fallback" },
    } as WeeklyReport;
  },
});

assert.equal(portfolio.workspaceCount, 3);
assert.deepEqual([...loadedWorkspaceIds].sort(), ["alpha", "beta"]);
assert.equal(portfolio.workspaces.some(({ workspaceId }) => workspaceId === "hidden"), false);
assert.equal(JSON.stringify(portfolio).includes("Hidden tenant"), false);

const byId = new Map(portfolio.workspaces.map((summary) => [summary.workspaceId, summary]));
const alphaSummary = byId.get("alpha")!;
const betaSummary = byId.get("beta")!;
const setupSummary = byId.get("setup-required")!;
assert.equal(alphaSummary.account.spend, 1_000);
assert.equal(alphaSummary.account.conversions, 100);
assert.equal(alphaSummary.account.cpa, 10);
assert.equal(alphaSummary.account.roas, 5);
assert.equal(betaSummary.account.spend, 2_000);
assert.equal(betaSummary.account.cpa, 10);
assert.equal(setupSummary.health, "no_data");
assert.equal(setupSummary.dataSource.status, "configuration_required");
assert.equal(setupSummary.account.score, null);
assert.equal(setupSummary.account.spend, null);
assert.equal(setupSummary.account.cpa, null);
assert.equal(setupSummary.account.roas, null);
assert.equal(
  alphaSummary.account.score,
  calculateAccountScore({
    campaignData: marketingData(alpha).campaignData,
    conversions: [], geographies: [], devices: [], keywords: [], searchTerms: [], landingPages: [],
  }).overallScore,
  "The portfolio must reuse the account-score calculation.",
);

assert.equal(alphaSummary.latestDailyAnalysis.date, "2026-09-06");
assert.equal(alphaSummary.latestDailyAnalysis.freshness, "current");
assert.equal(alphaSummary.latestWeeklyReport.status, "not_run");
assert.equal(betaSummary.latestDailyAnalysis.status, "not_run");
assert.equal(betaSummary.latestWeeklyReport.date, "2026-09-05");
assert.equal(betaSummary.latestWeeklyReport.freshness, "current");
assert.equal(alphaSummary.href, "/clients/alpha");
assert.equal(betaSummary.href, "/clients/beta");

const browserPayload = JSON.stringify(portfolio);
for (const privateValue of [
  alpha.googleAdsCustomerId,
  beta.googleAdsCustomerId,
  hidden.googleAdsCustomerId,
  hidden.ga4PropertyId,
  alpha.integrationSecretRef,
  beta.integrationSecretRef,
  setupRequired.integrationSecretRef,
  hidden.integrationSecretRef,
]) {
  assert.equal(browserPayload.includes(privateValue!), false, `Browser output leaked ${privateValue}.`);
}

assert.equal(classifyPortfolioHealth({ hasData: false, dataSourceStatus: "sample", accountScore: null }), "no_data");
assert.equal(classifyPortfolioHealth({ hasData: true, dataSourceStatus: "fallback", accountScore: 90 }), "critical");
assert.equal(classifyPortfolioHealth({ hasData: true, dataSourceStatus: "live", accountScore: 49 }), "critical");
assert.equal(classifyPortfolioHealth({ hasData: true, dataSourceStatus: "live", accountScore: 50 }), "needs_attention");
assert.equal(classifyPortfolioHealth({ hasData: true, dataSourceStatus: "live", accountScore: 75 }), "healthy");
assert.equal(classifyFreshness("2026-09-06", new Date("2026-09-07T12:00:00Z"), 2), "current");
assert.equal(classifyFreshness("2026-08-01", new Date("2026-09-07T12:00:00Z"), 2), "stale");
assert.equal(classifyFreshness(null, new Date("2026-09-07T12:00:00Z"), 2), "not_run");
assert.equal(classifyFreshness("2026-09-06", new Date("2026-09-07T12:00:00Z"), 2, true), "unavailable");

function sortable(
  workspaceId: string,
  health: AgencyWorkspaceSummary["health"],
  score: number | null,
): AgencyWorkspaceSummary {
  return {
    ...alphaSummary,
    workspaceId,
    displayName: workspaceId,
    href: `/clients/${workspaceId}`,
    health,
    account: { ...alphaSummary.account, score },
  };
}

const ordered = sortAgencyWorkspaceSummaries([
  sortable("healthy", "healthy", 90),
  sortable("no-data-b", "no_data", null),
  sortable("attention-high", "needs_attention", 70),
  sortable("critical", "critical", 45),
  sortable("attention-low", "needs_attention", 55),
  sortable("no-data-a", "no_data", null),
]);
assert.deepEqual(
  ordered.map(({ workspaceId }) => workspaceId),
  ["critical", "attention-low", "attention-high", "no-data-a", "no-data-b", "healthy"],
  "Ordering must be stable by health, comparable score, name, and ID.",
);

const noMemberships = await getAgencyPortfolioForUser("no-memberships", {
  repository,
  loadMarketingData: async () => { throw new Error("Must not load data without membership."); },
  loadLatestDailyAnalysis: async () => { throw new Error("Must not load tenant storage without membership."); },
  loadLatestWeeklyReport: async () => { throw new Error("Must not load tenant storage without membership."); },
});
assert.deepEqual(noMemberships, { workspaceCount: 0, attentionCount: 0, workspaces: [] });

console.log(
  "Agency dashboard verification passed: membership-only aggregation, deterministic KPI/score calculations and ordering, health and missing-data rules, browser-safe DTOs, tenant-scoped links and stored-run state, and the zero-workspace result.",
);
