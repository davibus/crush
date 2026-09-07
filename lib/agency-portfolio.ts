import "server-only";

import { calculateAccountScore } from "./account-score.ts";
import { getLatestDailyAnalysis } from "./daily-analysis-storage.ts";
import type { DailyAnalysisResult } from "./daily-analysis.ts";
import { aggregateGoogleAdsMetrics } from "./google-ads.ts";
import {
  getMarketingData,
  type MarketingDataSet,
} from "./marketing-data-source.ts";
import {
  getTenantRepository,
  type TenantRepository,
  type Workspace,
} from "./tenant-repository.ts";
import { getLatestWeeklyReport } from "./weekly-report-storage.ts";
import type { WeeklyReport } from "./weekly-report.ts";

export type PortfolioHealth = "critical" | "needs_attention" | "healthy" | "no_data";
export type PortfolioFreshness = "current" | "stale" | "not_run" | "unavailable";
export type PortfolioDataSourceStatus =
  | "live"
  | "sample"
  | "fallback"
  | "configuration_required"
  | "unavailable";

export type AgencyWorkspaceSummary = {
  workspaceId: string;
  displayName: string;
  workspaceStatus: Workspace["status"];
  href: string;
  health: PortfolioHealth;
  dataSource: {
    status: PortfolioDataSourceStatus;
    label: string;
    reportingWindow: string | null;
  };
  integrations: {
    ga4: "connected" | "not_connected" | "connection_issue" | "unavailable";
  };
  account: {
    currency: string | null;
    score: number | null;
    spend: number | null;
    conversions: number | null;
    cpa: number | null;
    roas: number | null;
  };
  latestDailyAnalysis: {
    status: DailyAnalysisResult["aiFindings"]["status"] | "not_run" | "unavailable";
    date: string | null;
    freshness: PortfolioFreshness;
  };
  latestWeeklyReport: {
    status: WeeklyReport["aiEnrichment"]["status"] | "not_run" | "unavailable";
    date: string | null;
    freshness: PortfolioFreshness;
  };
};

export type AgencyPortfolio = {
  workspaceCount: number;
  attentionCount: number;
  workspaces: readonly AgencyWorkspaceSummary[];
};

export type AgencyPortfolioDependencies = {
  repository?: TenantRepository;
  loadMarketingData?: (workspace: Workspace) => Promise<MarketingDataSet>;
  loadLatestDailyAnalysis?: (workspaceId: string) => Promise<DailyAnalysisResult | null>;
  loadLatestWeeklyReport?: (workspaceId: string) => Promise<WeeklyReport | null>;
  now?: Date;
};

const HEALTH_PRIORITY: Record<PortfolioHealth, number> = {
  critical: 0,
  needs_attention: 1,
  no_data: 2,
  healthy: 3,
};

function utcDayNumber(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(time) ? Math.floor(time / 86_400_000) : null;
}

export function classifyFreshness(
  date: string | null,
  currentDate: Date,
  currentForDays: number,
  unavailable = false,
): PortfolioFreshness {
  if (unavailable) return "unavailable";
  if (!date) return "not_run";
  const savedDay = utcDayNumber(date);
  const today = utcDayNumber(currentDate.toISOString().slice(0, 10));
  if (savedDay === null || today === null) return "unavailable";
  return today - savedDay <= currentForDays ? "current" : "stale";
}

export function classifyPortfolioHealth(input: {
  hasData: boolean;
  dataSourceStatus: PortfolioDataSourceStatus;
  accountScore: number | null;
}): PortfolioHealth {
  if (!input.hasData || input.accountScore === null) return "no_data";
  if (input.dataSourceStatus === "fallback" || input.dataSourceStatus === "unavailable") {
    return "critical";
  }
  if (input.accountScore < 50) return "critical";
  if (input.accountScore < 75) return "needs_attention";
  return "healthy";
}

export function sortAgencyWorkspaceSummaries(
  summaries: readonly AgencyWorkspaceSummary[],
): AgencyWorkspaceSummary[] {
  return [...summaries].sort((left, right) => {
    const healthOrder = HEALTH_PRIORITY[left.health] - HEALTH_PRIORITY[right.health];
    if (healthOrder) return healthOrder;

    // Scores are compared only when both workspaces have comparable values.
    if (left.account.score !== null && right.account.score !== null) {
      const scoreOrder = left.account.score - right.account.score;
      if (scoreOrder) return scoreOrder;
    }
    const nameOrder = left.displayName.localeCompare(right.displayName);
    return nameOrder || left.workspaceId.localeCompare(right.workspaceId);
  });
}

function dataSourceProjection(
  workspace: Workspace,
  data: MarketingDataSet | null,
): AgencyWorkspaceSummary["dataSource"] {
  if (workspace.status === "configuration_required") {
    return { status: "configuration_required", label: "Setup required", reportingWindow: null };
  }
  if (!data) return { status: "unavailable", label: "Data unavailable", reportingWindow: null };
  if (data.requestedSource === "live" && data.source === "sample") {
    return { status: "fallback", label: "Live source issue", reportingWindow: data.dateRangeLabel };
  }
  return {
    status: data.source,
    label: data.source === "live" ? "Live Google Ads" : "Demo data",
    reportingWindow: data.dateRangeLabel,
  };
}

function ga4Projection(
  data: MarketingDataSet | null,
): AgencyWorkspaceSummary["integrations"]["ga4"] {
  if (!data) return "unavailable";
  if (data.ga4.status === "available") return "connected";
  if (data.ga4.status === "error") return "connection_issue";
  return "not_connected";
}

async function settledValue<T>(promise: Promise<T>): Promise<{ value: T | null; failed: boolean }> {
  try {
    return { value: await promise, failed: false };
  } catch {
    return { value: null, failed: true };
  }
}

async function summarizeWorkspace(
  workspace: Workspace,
  dependencies: Required<Omit<AgencyPortfolioDependencies, "repository">>,
): Promise<AgencyWorkspaceSummary> {
  const marketingPromise = workspace.status === "active"
    ? settledValue(dependencies.loadMarketingData(workspace))
    : Promise.resolve({ value: null, failed: false });
  const [marketing, daily, weekly] = await Promise.all([
    marketingPromise,
    settledValue(dependencies.loadLatestDailyAnalysis(workspace.id)),
    settledValue(dependencies.loadLatestWeeklyReport(workspace.id)),
  ]);
  const data = marketing.value;
  const campaignRows = data?.campaignData.campaigns ?? [];
  const hasData = campaignRows.length > 0;
  const totals = hasData
    ? aggregateGoogleAdsMetrics(campaignRows.map(({ metrics }) => metrics))
    : null;
  const score = data && hasData
    ? calculateAccountScore({
        campaignData: data.campaignData,
        conversions: data.conversions,
        geographies: data.geographies,
        devices: data.devices,
        keywords: data.keywords,
        searchTerms: data.searchTerms,
        landingPages: data.landingPages,
      }).overallScore
    : null;
  const source = dataSourceProjection(workspace, data);
  const dailyResult = daily.value;
  const weeklyResult = weekly.value;

  return {
    workspaceId: workspace.id,
    displayName: workspace.name,
    workspaceStatus: workspace.status,
    href: `/clients/${encodeURIComponent(workspace.id)}`,
    health: classifyPortfolioHealth({
      hasData,
      dataSourceStatus: marketing.failed ? "unavailable" : source.status,
      accountScore: score,
    }),
    dataSource: marketing.failed
      ? { status: "unavailable", label: "Data unavailable", reportingWindow: null }
      : source,
    integrations: { ga4: ga4Projection(data) },
    account: {
      currency: data?.campaignData.account.currency ?? null,
      score,
      spend: totals?.spend ?? null,
      conversions: totals?.conversions ?? null,
      cpa: totals && totals.conversions > 0 ? totals.cpa : null,
      roas: totals && totals.spend > 0 ? totals.roas : null,
    },
    latestDailyAnalysis: {
      status: daily.failed ? "unavailable" : dailyResult?.aiFindings.status ?? "not_run",
      date: dailyResult?.analysisDate ?? null,
      freshness: classifyFreshness(
        dailyResult?.analysisDate ?? null,
        dependencies.now,
        2,
        daily.failed,
      ),
    },
    latestWeeklyReport: {
      status: weekly.failed ? "unavailable" : weeklyResult?.aiEnrichment.status ?? "not_run",
      date: weeklyResult?.reportingPeriod.endDate ?? null,
      freshness: classifyFreshness(
        weeklyResult?.reportingPeriod.endDate ?? null,
        dependencies.now,
        10,
        weekly.failed,
      ),
    },
  };
}

export async function getAgencyPortfolioForUser(
  userId: string,
  dependencies: AgencyPortfolioDependencies = {},
): Promise<AgencyPortfolio> {
  const repository = dependencies.repository ?? getTenantRepository();
  const workspaces = await repository.listWorkspacesForUser(userId);
  const resolvedDependencies = {
    loadMarketingData: dependencies.loadMarketingData ?? getMarketingData,
    loadLatestDailyAnalysis: dependencies.loadLatestDailyAnalysis ?? getLatestDailyAnalysis,
    loadLatestWeeklyReport: dependencies.loadLatestWeeklyReport ?? getLatestWeeklyReport,
    now: dependencies.now ?? new Date(),
  };
  const summaries = sortAgencyWorkspaceSummaries(
    await Promise.all(
      workspaces.map((workspace) => summarizeWorkspace(workspace, resolvedDependencies)),
    ),
  );
  return {
    workspaceCount: summaries.length,
    attentionCount: summaries.filter(({ health }) =>
      health === "critical" || health === "needs_attention"
    ).length,
    workspaces: summaries,
  };
}
