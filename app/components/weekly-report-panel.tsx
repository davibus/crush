"use client";

import { useEffect, useState } from "react";

import type { WeeklyReport, WeeklyReportItem } from "@/lib/weekly-report";

type WeeklyReportResponse = WeeklyReport & { error?: string };

function sourceName(source: "google_ads" | "ga4") {
  return source === "google_ads" ? "Google Ads" : "GA4";
}

function formatValue(value: number | null, unit: WeeklyReport["kpiChanges"][number]["unit"], currency: string | null) {
  if (value == null) return "Unavailable";
  if (unit === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: currency ?? "USD", maximumFractionDigits: 2 }).format(value);
  if (unit === "percent") return `${value.toFixed(2)}%`;
  if (unit === "ratio") return `${value.toFixed(2)}x`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function ReportItems({ empty, items }: { empty: string; items: WeeklyReportItem[] }) {
  if (items.length === 0) return <p className="mt-3 text-sm text-zinc-500">{empty}</p>;
  return (
    <div className="mt-3 grid gap-3">
      {items.map((item) => (
        <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4" key={item.id}>
          <h4 className="text-sm font-semibold text-zinc-900">{item.title}</h4>
          <p className="mt-1 text-sm leading-6 text-zinc-600">{item.summary}</p>
          <p className="mt-2 text-xs text-zinc-500">Evidence: {item.evidenceIds.join(", ")}</p>
        </article>
      ))}
    </div>
  );
}

export default function WeeklyReportPanel() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/reports/weekly")
      .then(async (response) => {
        const result = (await response.json()) as WeeklyReportResponse;
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error(result.error ?? "Saved Weekly Marketing Report could not be loaded.");
        }
        return result;
      })
      .then((result) => { if (active && result) setReport(result); })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Saved Weekly Marketing Report could not be loaded.");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  async function generateReport() {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/reports/weekly", { method: "POST" });
      const result = (await response.json()) as WeeklyReportResponse;
      if (!response.ok) throw new Error(result.error ?? "Weekly Marketing Report could not complete.");
      setReport(result);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Weekly Marketing Report could not complete.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section aria-labelledby="weekly-report-heading" className="mb-8 min-w-0 break-words rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-200/40 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950" id="weekly-report-heading">Weekly Marketing Report</h2>
          <p className="mt-1 text-sm text-zinc-500">A saved account-performance summary for the latest two completed 7-day periods</p>
        </div>
        <button className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto" disabled={isLoading} onClick={generateReport} type="button">
          {isLoading ? "Generating…" : "Generate Weekly Report"}
        </button>
      </div>

      {isLoading && !report ? (
        <div aria-live="polite" className="mt-5 grid gap-3" role="status">
          <div className="h-20 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none" />
          <p className="text-sm text-zinc-500">Checking for the latest saved weekly report…</p>
        </div>
      ) : null}

      {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
      {!report && !isLoading ? (
        <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center"><h3 className="text-sm font-semibold text-zinc-800">No saved weekly report yet</h3><p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-zinc-500">Generate one from configured live sources, or let the protected weekly schedule create it automatically.</p></div>
      ) : null}

      {report ? (
        <div className="mt-5 space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span>{report.reportingPeriod.startDate} to {report.reportingPeriod.endDate}</span>
            <span aria-hidden="true">·</span>
            <span>vs. {report.comparisonPeriod.startDate} to {report.comparisonPeriod.endDate}</span>
            <span aria-hidden="true">·</span>
            <span>Generated {new Date(report.generatedAt).toLocaleString()}</span>
            <span className={`rounded-full px-2.5 py-1 font-medium ${report.aiEnrichment.status === "enriched" ? "bg-violet-50 text-violet-800" : "bg-zinc-100 text-zinc-700"}`}>
              AI: {report.aiEnrichment.status === "enriched" ? "enriched" : report.aiEnrichment.status === "not_needed" ? "not needed" : "deterministic fallback"}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {report.dataSourceStatus.map((source) => (
              <div className={`rounded-xl border p-3 text-sm ${source.included ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`} key={source.source}>
                <p className="font-semibold">{sourceName(source.source)} · {source.status}{source.included ? " · included" : " · not included"}</p>
                <p className="mt-1 text-xs leading-5">{source.detail}</p>
              </div>
            ))}
          </div>

          {report.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
              <p className="font-semibold">Generation warnings</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          ) : null}

          <section>
            <h3 className="font-semibold text-zinc-950">Executive summary</h3>
            <p className="mt-2 rounded-xl bg-zinc-900 p-4 text-sm leading-6 text-white">{report.executiveSummary}</p>
            <p className="mt-2 text-xs text-zinc-500">{report.aiEnrichment.detail}</p>
          </section>

          <section>
            <h3 className="font-semibold text-zinc-950">KPI changes</h3>
            <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-zinc-100 text-left text-xs text-zinc-600"><tr><th className="px-4 py-3">Source</th><th className="px-4 py-3">KPI</th><th className="px-4 py-3">This week</th><th className="px-4 py-3">Previous week</th><th className="px-4 py-3">Change</th></tr></thead>
                <tbody>{report.kpiChanges.map((change) => (
                  <tr className="border-t border-zinc-200" key={`${change.source}.${change.metric}`}>
                    <td className="px-4 py-3 text-xs font-medium text-zinc-500">{sourceName(change.source)}</td>
                    <td className="px-4 py-3 font-medium">{change.label}</td>
                    <td className="px-4 py-3 tabular-nums">{formatValue(change.currentValue, change.unit, report.currency)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatValue(change.previousValue, change.unit, report.currency)}</td>
                    <td className="px-4 py-3 tabular-nums">{change.percentageChange == null ? (change.direction === "unchanged" ? "0.0%" : "Unavailable") : `${change.percentageChange > 0 ? "+" : ""}${change.percentageChange.toFixed(1)}%`}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section><h3 className="font-semibold text-zinc-950">Biggest wins</h3><ReportItems empty="No favorable comparable KPI movement was identified." items={report.biggestWins} /></section>
            <section><h3 className="font-semibold text-zinc-950">Biggest problems</h3><ReportItems empty="No unfavorable comparable KPI movement was identified." items={report.biggestProblems} /></section>
            <section><h3 className="font-semibold text-zinc-950">Recommended actions</h3><ReportItems empty="Connect a live source or wait for comparable data before taking a data-driven action." items={report.recommendedActions} /></section>
            <section><h3 className="font-semibold text-zinc-950">Next-week watch list</h3><ReportItems empty="No comparable KPI movement is available to watch yet." items={report.nextWeekWatchList} /></section>
          </div>

          <section>
            <h3 className="font-semibold text-zinc-950">Supporting evidence</h3>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {report.supportingEvidence.map((evidence) => (
                <article className="rounded-xl border border-zinc-200 p-3" id={evidence.id} key={evidence.id}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{evidence.id}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-700">{evidence.statement}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
