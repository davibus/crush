import { connection } from "next/server";

import AccountAudit from "@/app/components/account-audit";
import DailyAnalysisPanel from "@/app/components/daily-analysis-panel";
import GA4ContextPanel from "@/app/components/ga4-context-panel";
import KpiOverview from "@/app/components/kpi-overview";
import MarketingDataChat from "@/app/components/marketing-data-chat";
import MarketingInsightsWorkspace from "@/app/components/marketing-insights-workspace";
import MarketingPerformanceCharts from "@/app/components/marketing-performance-charts";
import WeeklyReportPanel from "@/app/components/weekly-report-panel";
import { runAccountAudit } from "@/lib/account-audit";
import {
  buildCampaignComparisonData,
  buildGeographicPerformanceData,
  buildTimeSeriesData,
} from "@/lib/chart-data";
import { hasUsableDashboardData } from "@/lib/dashboard-kpis";
import {
  aggregateGoogleAdsMetrics,
  getCpa,
  getCpc,
  getCtr,
  getRoas,
} from "@/lib/google-ads";
import { getMarketingData } from "@/lib/marketing-data-source";
import { buildPaidMediaAnalyticsContext } from "@/lib/paid-media-context";

const navigation = [
  ["Overview", "overview"],
  ["Performance", "performance"],
  ["AI analysis", "ai-analysis"],
  ["Reporting", "reporting"],
  ["Account health", "account-health"],
  ["Ask your data", "ask-your-data"],
] as const;

function StatusDot({ tone }: { tone: "blue" | "green" | "amber" }) {
  const color = { blue: "bg-blue-500", green: "bg-emerald-500", amber: "bg-amber-500" }[tone];
  return <span aria-hidden="true" className={`size-2 rounded-full ${color}`} />;
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="mb-6 max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">{description}</p>
    </header>
  );
}

export default async function Home() {
  await connection();
  const marketingData = await getMarketingData();
  const data = marketingData.campaignData;
  const isDemo = marketingData.source === "sample";
  const paidMediaContext = marketingData.ga4.status === "available"
    ? buildPaidMediaAnalyticsContext(data, marketingData.ga4.data)
    : undefined;
  const totals = aggregateGoogleAdsMetrics(data.campaigns.map((campaign) => campaign.metrics));
  const timeSeries = buildTimeSeriesData(marketingData.dailyMetrics);
  const campaignComparison = buildCampaignComparisonData(data.campaigns);
  const geographicPerformance = buildGeographicPerformanceData(marketingData.geographies);
  const audit = runAccountAudit({
    campaignData: data,
    conversions: marketingData.conversions,
    devices: marketingData.devices,
    geographies: marketingData.geographies,
    keywords: marketingData.keywords,
    landingPages: marketingData.landingPages,
    searchTerms: marketingData.searchTerms,
  });
  const ga4Label = marketingData.ga4.status === "available"
    ? "Connected"
    : marketingData.ga4.status === "error" ? "Connection issue" : "Not connected";

  return (
    <main className="min-h-screen overflow-x-clip bg-slate-50 text-slate-900">
      <div className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto max-w-[90rem] px-4 py-5 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <a className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950" href="#dashboard-content">
              <span className="flex size-9 items-center justify-center rounded-xl bg-blue-500 text-base font-bold shadow-lg shadow-blue-950/40">C</span>
              <span>
                <span className="block text-base font-semibold leading-none">Crush</span>
                <span className="mt-1 block text-xs text-slate-400">AI Marketing Command Center</span>
              </span>
            </a>
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200">
                <StatusDot tone={isDemo ? "blue" : "green"} />
                {isDemo ? "Demo data" : "Live Google Ads"}
              </span>
              <span className="hidden rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-300 sm:inline-flex">{marketingData.dateRangeLabel}</span>
            </div>
          </header>

          <div className="grid gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:py-16">
            <div className="max-w-4xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">Unified marketing intelligence</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">AI Marketing Command Center</h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                Crush combines paid-media performance and GA4 context with evidence-grounded AI analysis, automated audits, reporting, and conversational exploration—all in one operating view.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-700 bg-slate-700 shadow-2xl shadow-black/20">
              <div className="bg-slate-900 p-4">
                <dt className="text-xs text-slate-400">Account</dt>
                <dd className="mt-1 break-words text-sm font-semibold text-white">{data.account.name}</dd>
              </div>
              <div className="bg-slate-900 p-4">
                <dt className="text-xs text-slate-400">GA4</dt>
                <dd className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <StatusDot tone={marketingData.ga4.status === "available" ? "green" : "amber"} /> {ga4Label}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <nav aria-label="Dashboard sections" className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[90rem] gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
          {navigation.map(([label, id]) => (
            <a className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" href={`#${id}`} key={id}>{label}</a>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12" id="dashboard-content">
        {marketingData.warning ? (
          <div className="mb-8 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950 sm:px-5" role="alert">
            <span aria-hidden="true" className="mt-0.5 text-amber-600">●</span>
            <div><p className="font-semibold">Demo fallback is active</p><p>{marketingData.warning}</p></div>
          </div>
        ) : null}

        <section aria-labelledby="demo-guide-heading" className="mb-14 overflow-hidden rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50 shadow-sm">
          <div className="grid lg:grid-cols-[1.05fr_1.95fr]">
            <div className="border-b border-blue-100 p-6 sm:p-8 lg:border-r lg:border-b-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">How this demo works</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950" id="demo-guide-heading">What is Crush?</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">A working analytics dashboard that turns advertising and site data into decisions a marketing team can inspect, question, and act on.</p>
              <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800">
                <StatusDot tone={isDemo ? "blue" : "green"} />
                {isDemo ? "Viewing a safe sample account" : "Viewing connected account data"}
              </span>
            </div>
            <div className="grid gap-px bg-blue-100 sm:grid-cols-3">
              <article className="bg-white/80 p-6">
                <p className="text-sm font-semibold text-slate-950">1. Connect the signals</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">Google Ads performance is the core dataset, with optional GA4 sessions, key events, traffic sources, and landing-page context.</p>
              </article>
              <article className="bg-white/80 p-6">
                <p className="text-sm font-semibold text-slate-950">2. Turn data into analysis</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">Daily analysis, weekly reports, account audits, and specialist AI agents surface evidence-backed priorities.</p>
              </article>
              <article className="bg-white/80 p-6">
                <p className="text-sm font-semibold text-slate-950">3. Explore the account</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">Review KPIs and charts, then use Ask Your Marketing Data to investigate campaigns, budgets, locations, and search terms.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="scroll-mt-20" id="overview">
          <SectionIntro description="A fast read on account outcomes and the site behavior available to put paid-media results in context." eyebrow="Overview" title="Your account at a glance" />
          <div className="mb-8">
            <KpiOverview currency={data.account.currency} metrics={hasUsableDashboardData(data.campaigns.map((campaign) => campaign.metrics)) ? totals : null} />
          </div>
          <GA4ContextPanel ga4={marketingData.ga4} paidMedia={paidMediaContext} />
        </section>

        <section className="scroll-mt-20 border-t border-slate-200 pt-14" id="performance">
          <SectionIntro description="Move from account trends to campaign and market detail without losing the source and reporting-window context." eyebrow="Performance" title="See what is driving results" />
          <div className="mb-8">
            <MarketingPerformanceCharts campaigns={campaignComparison} currency={data.account.currency} dataSourceLabel={marketingData.sourceLabel} dateRangeLabel={marketingData.dateRangeLabel} geographies={geographicPerformance} timeSeries={timeSeries} />
          </div>

          <section aria-labelledby="campaign-table-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold text-slate-950" id="campaign-table-heading">Google Ads campaigns</h2><p className="mt-1 text-sm text-slate-500">Campaign-level delivery, efficiency, and return metrics.</p></div>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">{data.campaigns.length} {data.campaigns.length === 1 ? "campaign" : "campaigns"}</span>
              </div>
            </div>
            {data.campaigns.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-sm">
                  <caption className="sr-only">Google Ads campaign performance metrics</caption>
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr>
                    {[["Campaign", "left"], ["Status", "left"], ["Spend", "right"], ["Clicks", "right"], ["CTR", "right"], ["CPC", "right"], ["Conversions", "right"], ["CPA", "right"], ["ROAS", "right"]].map(([label, align]) => <th className={`px-5 py-3 font-semibold ${align === "right" ? "text-right" : ""}`} key={label} scope="col">{label}</th>)}
                  </tr></thead>
                  <tbody>{data.campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-t border-slate-100 transition hover:bg-slate-50/80">
                      <th className="px-5 py-4 text-left font-semibold text-slate-900" scope="row">{campaign.name}</th>
                      <td className="px-5 py-4"><span className="inline-flex items-center gap-2 whitespace-nowrap text-xs font-medium text-slate-700"><StatusDot tone={campaign.status === "ENABLED" ? "green" : "amber"} />{campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase()}</span></td>
                      <td className="px-5 py-4 text-right tabular-nums">${campaign.metrics.cost.toFixed(2)}</td>
                      <td className="px-5 py-4 text-right tabular-nums">{campaign.metrics.clicks.toLocaleString()}</td>
                      <td className="px-5 py-4 text-right tabular-nums">{getCtr(campaign.metrics).toFixed(2)}%</td>
                      <td className="px-5 py-4 text-right tabular-nums">${getCpc(campaign.metrics).toFixed(2)}</td>
                      <td className="px-5 py-4 text-right tabular-nums">{campaign.metrics.conversions}</td>
                      <td className="px-5 py-4 text-right tabular-nums">${getCpa(campaign.metrics).toFixed(2)}</td>
                      <td className="px-5 py-4 text-right font-semibold tabular-nums text-slate-950">{getRoas(campaign.metrics).toFixed(2)}x</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-12 text-center"><h3 className="font-semibold text-slate-900">No campaigns to display</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">The selected data source returned no campaign rows for this reporting window. Try another date range or verify the source configuration.</p></div>
            )}
          </section>
        </section>

        <section className="scroll-mt-20 border-t border-slate-200 pt-14" id="ai-analysis">
          <SectionIntro description="Combine deterministic comparisons with structured AI interpretation to focus attention on changes that matter." eyebrow="AI analysis" title="Move from signals to next actions" />
          <DailyAnalysisPanel />
          <MarketingInsightsWorkspace currency={data.account.currency} />
        </section>

        <section className="scroll-mt-20 border-t border-slate-200 pt-14" id="reporting">
          <SectionIntro description="Create a repeatable, evidence-linked weekly narrative for stakeholders without rebuilding the analysis by hand." eyebrow="Reporting" title="Package performance for the week" />
          <WeeklyReportPanel />
        </section>

        <section className="scroll-mt-20 border-t border-slate-200 pt-14" id="account-health">
          <SectionIntro description="Inspect rule-based findings across structure, efficiency, search terms, budgets, devices, locations, and landing pages." eyebrow="Account health" title="Audit the foundations" />
          <AccountAudit audit={audit} />
        </section>

        <section className="scroll-mt-20 border-t border-slate-200 pt-14" id="ask-your-data">
          <SectionIntro description="Ask a specialist or let Crush route the question, with answers constrained to evidence in the loaded account data." eyebrow="Ask your data" title="Explore performance conversationally" />
          <MarketingDataChat currency={data.account.currency} dataSourceLabel={marketingData.sourceLabel} />
        </section>

        <footer className="mt-14 border-t border-slate-200 py-8 text-sm text-slate-500"><p>Crush · AI Marketing Command Center · Portfolio product demo</p></footer>
      </div>
    </main>
  );
}
