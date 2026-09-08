import "server-only";

import { runAccountAudit, type AccountAuditFinding } from "./account-audit.ts";
import { calculateAccountScore } from "./account-score.ts";
import type { DailyAnalysisResult } from "./daily-analysis.ts";
import {
  aggregateGoogleAdsMetrics,
  type CalculatedGoogleAdsMetrics,
} from "./google-ads.ts";
import {
  getMarketingData,
  type MarketingDataSet,
} from "./marketing-data-source.ts";
import { getLatestDailyAnalysis } from "./daily-analysis-storage.ts";
import type { Workspace } from "./tenant-repository.ts";
import type { WeeklyReport, WeeklyReportItem } from "./weekly-report.ts";
import { getLatestWeeklyReport } from "./weekly-report-storage.ts";

export type PdfReportMetrics = {
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number | null;
  cpc: number | null;
  conversions: number;
  conversionRate: number | null;
  cpa: number | null;
  conversionValue: number;
  roas: number | null;
};

export type PdfReportNarrativeItem = {
  title: string;
  summary: string;
};

export type PdfMarketingReport = {
  schemaVersion: 1;
  title: "Marketing Performance Report";
  clientName: string;
  reportingPeriod: string;
  generatedAt: string;
  currency: string;
  dataSources: Array<{
    name: "Google Ads" | "Google Analytics 4";
    status: "live" | "sample" | "fallback" | "not_connected" | "unavailable";
    detail: string;
  }>;
  googleAds: {
    metrics: PdfReportMetrics;
    accountScore: number;
    accountScoreSummary: string;
    campaignHighlights: PdfReportNarrativeItem[];
  };
  ga4: null | {
    reportingPeriod: string;
    sessions: number;
    users: number;
    engagedSessions: number;
    engagementRate: number | null;
    keyEvents: number;
    revenue: number;
  };
  dailyAnalysis: null | {
    analysisDate: string;
    status: DailyAnalysisResult["aiFindings"]["status"];
    summary: string;
    findings: PdfReportNarrativeItem[];
  };
  weeklyReport: null | {
    reportingPeriod: string;
    status: WeeklyReport["aiEnrichment"]["status"];
    executiveSummary: string;
    wins: PdfReportNarrativeItem[];
    problems: PdfReportNarrativeItem[];
  };
  recommendations: PdfReportNarrativeItem[];
  notes: string[];
};

export type PdfReportDependencies = {
  loadMarketingData?: (workspace: Workspace) => Promise<MarketingDataSet>;
  loadLatestDailyAnalysis?: (workspaceId: string) => Promise<DailyAnalysisResult | null>;
  loadLatestWeeklyReport?: (workspaceId: string) => Promise<WeeklyReport | null>;
  now?: Date;
};

function reportMetrics(metrics: CalculatedGoogleAdsMetrics): PdfReportMetrics {
  return {
    ...metrics,
    ctr: metrics.impressions === 0 ? null : metrics.ctr,
    cpc: metrics.clicks === 0 ? null : metrics.cpc,
    conversionRate: metrics.clicks === 0 ? null : metrics.conversionRate,
    cpa: metrics.conversions === 0 ? null : metrics.cpa,
    roas: metrics.spend === 0 ? null : metrics.roas,
  };
}

function auditItem(finding: AccountAuditFinding): PdfReportNarrativeItem {
  return { title: finding.title, summary: finding.description };
}

function weeklyItem(item: WeeklyReportItem): PdfReportNarrativeItem {
  return { title: item.title, summary: item.summary };
}

function uniqueItems(items: readonly PdfReportNarrativeItem[], limit: number) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.title}\n${item.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function googleAdsStatus(data: MarketingDataSet): PdfMarketingReport["dataSources"][number] {
  if (data.requestedSource === "live" && data.source === "sample") {
    return {
      name: "Google Ads",
      status: "fallback",
      detail: "The live connection was unavailable, so this report uses the clearly labeled Crush demo dataset.",
    };
  }
  return {
    name: "Google Ads",
    status: data.source,
    detail: data.source === "live"
      ? "Connected read-only Google Ads performance data is included."
      : "The bundled Crush demo dataset is included; values are illustrative.",
  };
}

function ga4Status(data: MarketingDataSet): PdfMarketingReport["dataSources"][number] {
  if (data.ga4.status === "available") {
    return { name: "Google Analytics 4", status: "live", detail: "Connected GA4 site context is included." };
  }
  if (data.ga4.status === "error") {
    return { name: "Google Analytics 4", status: "unavailable", detail: "GA4 context was unavailable; Google Ads reporting is unaffected." };
  }
  return { name: "Google Analytics 4", status: "not_connected", detail: "GA4 is not connected for this workspace." };
}

export async function buildPdfMarketingReport(
  workspace: Workspace,
  dependencies: PdfReportDependencies = {},
): Promise<PdfMarketingReport> {
  const [data, dailyAnalysis, weeklyReport] = await Promise.all([
    (dependencies.loadMarketingData ?? getMarketingData)(workspace),
    (dependencies.loadLatestDailyAnalysis ?? getLatestDailyAnalysis)(workspace.id),
    (dependencies.loadLatestWeeklyReport ?? getLatestWeeklyReport)(workspace.id),
  ]);
  const auditInput = {
    campaignData: data.campaignData,
    conversions: data.conversions,
    geographies: data.geographies,
    devices: data.devices,
    keywords: data.keywords,
    searchTerms: data.searchTerms,
    landingPages: data.landingPages,
  };
  const audit = runAccountAudit(auditInput);
  const accountScore = calculateAccountScore(auditInput);
  const totals = aggregateGoogleAdsMetrics(
    data.campaignData.campaigns.map(({ metrics }) => metrics),
  );
  const campaignFindings = audit.findings
    .filter(({ category, affectedEntity }) =>
      category === "campaign_performance" || affectedEntity.type === "campaign")
    .map(auditItem);
  const fallbackCampaignHighlights = data.campaignData.campaigns.length === 0
    ? [{ title: "No campaign rows available", summary: "The selected reporting window returned no campaign performance rows." }]
    : [{
        title: "Campaign coverage",
        summary: `${data.campaignData.campaigns.length} campaign${data.campaignData.campaigns.length === 1 ? " was" : "s were"} included in the account totals. No material campaign-level audit finding was triggered.`,
      }];
  const dailyFindings = dailyAnalysis?.aiFindings.findings.map((finding) => ({
    title: finding.observedFact,
    summary: finding.interpretation,
  })) ?? [];
  const recommendations = uniqueItems([
    ...(weeklyReport?.recommendedActions.map(weeklyItem) ?? []),
    ...(dailyAnalysis?.aiFindings.findings.map((finding) => ({
      title: finding.observedFact,
      summary: finding.recommendation,
    })) ?? []),
    ...audit.findings.map((finding) => ({
      title: finding.title,
      summary: finding.recommendation,
    })),
  ], 6);
  const ga4 = data.ga4.status === "available" ? data.ga4.data : null;
  const notes = [
    ...(dailyAnalysis ? [] : ["Daily Analysis has not been run for this workspace yet."]),
    ...(weeklyReport ? [] : ["Weekly Marketing Report has not been run for this workspace yet."]),
    ...(recommendations.length ? [] : ["No data-backed recommendation is available for this reporting window."]),
  ];

  return {
    schemaVersion: 1,
    title: "Marketing Performance Report",
    clientName: workspace.name,
    reportingPeriod: data.dateRangeLabel,
    generatedAt: (dependencies.now ?? new Date()).toISOString(),
    currency: data.campaignData.account.currency || "USD",
    dataSources: [googleAdsStatus(data), ga4Status(data)],
    googleAds: {
      metrics: reportMetrics(totals),
      accountScore: accountScore.overallScore,
      accountScoreSummary: accountScore.summary,
      campaignHighlights: uniqueItems(
        campaignFindings.length ? campaignFindings : fallbackCampaignHighlights,
        5,
      ),
    },
    ga4: ga4 ? {
      reportingPeriod: `${ga4.dateRange.startDate} to ${ga4.dateRange.endDate}`,
      sessions: ga4.summary.sessions,
      users: ga4.summary.totalUsers,
      engagedSessions: ga4.summary.engagedSessions,
      engagementRate: Number.isFinite(ga4.summary.engagementRate)
        ? ga4.summary.engagementRate * 100
        : null,
      keyEvents: ga4.summary.keyEvents,
      revenue: ga4.summary.totalRevenue,
    } : null,
    dailyAnalysis: dailyAnalysis ? {
      analysisDate: dailyAnalysis.analysisDate,
      status: dailyAnalysis.aiFindings.status,
      summary: dailyAnalysis.aiFindings.summary,
      findings: uniqueItems(dailyFindings, 4),
    } : null,
    weeklyReport: weeklyReport ? {
      reportingPeriod: `${weeklyReport.reportingPeriod.startDate} to ${weeklyReport.reportingPeriod.endDate}`,
      status: weeklyReport.aiEnrichment.status,
      executiveSummary: weeklyReport.executiveSummary,
      wins: weeklyReport.biggestWins.slice(0, 3).map(weeklyItem),
      problems: weeklyReport.biggestProblems.slice(0, 3).map(weeklyItem),
    } : null,
    recommendations,
    notes,
  };
}

export function sanitizePdfFilenamePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "client";
}

export function getPdfReportFilename(report: Pick<PdfMarketingReport, "clientName" | "reportingPeriod">): string {
  return `${sanitizePdfFilenamePart(report.clientName)}-${sanitizePdfFilenamePart(report.reportingPeriod)}-marketing-report.pdf`;
}
