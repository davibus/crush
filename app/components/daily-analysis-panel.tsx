"use client";

import { useEffect, useState } from "react";

import type {
  DailyAnalysisResult,
  MarketingPeriodSummary,
  MaterialChange,
} from "@/lib/daily-analysis";

type DailyAnalysisResponse = DailyAnalysisResult & { error?: string };

function sourceLabel(source: DailyAnalysisResult["dataSourcesUsed"][number]) {
  return source === "google_ads" ? "Google Ads" : "GA4";
}

function formatNumber(value: number | null | undefined, options?: Intl.NumberFormatOptions) {
  return value == null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", options).format(value);
}

function Overview({
  heading,
  summary,
}: {
  heading: string;
  summary: MarketingPeriodSummary;
}) {
  const metrics = [
    ...(summary.googleAds
      ? [
          { label: "Spend", value: formatNumber(summary.googleAds.spend, { style: "currency", currency: "USD" }) },
          { label: "Clicks", value: formatNumber(summary.googleAds.clicks) },
          { label: "Conversions", value: formatNumber(summary.googleAds.conversions, { maximumFractionDigits: 2 }) },
          { label: "ROAS", value: summary.googleAds.roas == null ? "Unavailable" : `${summary.googleAds.roas.toFixed(2)}x` },
        ]
      : []),
    ...(summary.ga4
      ? [
          { label: "Sessions", value: formatNumber(summary.ga4.sessions) },
          { label: "Users", value: formatNumber(summary.ga4.users) },
          { label: "Key events", value: formatNumber(summary.ga4.keyEvents, { maximumFractionDigits: 2 }) },
          { label: "Revenue", value: formatNumber(summary.ga4.revenue, { style: "currency", currency: "USD" }) },
        ]
      : []),
  ];

  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-zinc-950">{heading}</h3>
        <span className="text-xs text-zinc-500">
          {summary.dateRange.startDate === summary.dateRange.endDate
            ? summary.dateRange.endDate
            : `${summary.dateRange.startDate} to ${summary.dateRange.endDate}`}
        </span>
      </div>
      {metrics.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map((metric) => (
            <div key={`${heading}-${metric.label}`}>
              <dt className="text-xs text-zinc-500">{metric.label}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-zinc-900">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No live source supplied metrics for this period.</p>
      )}
    </section>
  );
}

function changeValue(change: MaterialChange) {
  if (change.percentageChange == null) return "new from zero";
  const sign = change.percentageChange > 0 ? "+" : "";
  return `${sign}${change.percentageChange.toFixed(1)}%`;
}

export default function DailyAnalysisPanel() {
  const [analysis, setAnalysis] = useState<DailyAnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/analysis/daily")
      .then(async (response) => {
        const result = (await response.json()) as DailyAnalysisResponse;
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error(result.error ?? "Saved Daily Analysis could not be loaded.");
        }
        return result;
      })
      .then((result) => {
        if (active && result) setAnalysis(result);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Saved Daily Analysis could not be loaded.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function runAnalysis() {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/analysis/daily", { method: "POST" });
      const result = (await response.json()) as DailyAnalysisResponse;
      if (!response.ok) throw new Error(result.error ?? "Daily Analysis could not complete.");
      setAnalysis(result);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Daily Analysis could not complete.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section aria-labelledby="daily-analysis-heading" className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-200/40 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950" id="daily-analysis-heading">Daily Analysis</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Completed-day Google Ads and GA4 comparisons with grounded findings
          </p>
        </div>
        <button
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          onClick={runAnalysis}
          type="button"
        >
          {isLoading ? "Running…" : "Run Daily Analysis"}
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>
      ) : null}

      {!analysis && !isLoading ? (
        <p className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
          No saved analysis yet. Run Daily Analysis to collect completed live periods—no CSV upload is needed.
        </p>
      ) : null}

      {analysis ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span>Analyzed {analysis.analysisDate}</span>
            <span aria-hidden="true">·</span>
            <span>{analysis.timeZone}</span>
            {analysis.dataSourcesUsed.map((source) => (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium" key={source}>{sourceLabel(source)}</span>
            ))}
          </div>

          {analysis.warnings.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
              <p className="font-semibold">Source warnings</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Overview heading="Yesterday overview" summary={analysis.yesterdaySummary} />
            <Overview heading="Rolling 7-day overview" summary={analysis.rolling7DaySummary} />
          </div>

          <div className="mt-5">
            <h3 className="font-semibold text-zinc-950">Important changes</h3>
            {analysis.materialChanges.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {analysis.materialChanges.map((change, index) => (
                  <article className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 p-3" key={`${change.period}-${change.source}-${change.metric}-${index}`}>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{change.label} · {change.period === "yesterday" ? "Yesterday" : "Rolling 7 days"}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{change.reason}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${change.direction === "up" ? "bg-blue-50 text-blue-800" : "bg-orange-50 text-orange-800"}`}>
                      {changeValue(change)}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                No material changes. Performance was relatively stable under the configured thresholds.
              </p>
            )}
          </div>

          <div className="mt-5">
            <h3 className="font-semibold text-zinc-950">AI findings</h3>
            <p className="mt-1 text-sm text-zinc-600">{analysis.aiFindings.summary}</p>
            {analysis.aiFindings.findings.length > 0 ? (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {analysis.aiFindings.findings.map((finding) => (
                  <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4" key={finding.materialChangeId}>
                    <dl className="space-y-3 text-sm leading-6">
                      <div><dt className="font-semibold text-zinc-900">Observed fact</dt><dd className="text-zinc-600">{finding.observedFact}</dd></div>
                      <div><dt className="font-semibold text-zinc-900">Interpretation</dt><dd className="text-zinc-600">{finding.interpretation}</dd></div>
                      <div><dt className="font-semibold text-zinc-900">Recommendation</dt><dd className="text-zinc-600">{finding.recommendation}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
