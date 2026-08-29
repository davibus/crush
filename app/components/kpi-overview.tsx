import type { CalculatedGoogleAdsMetrics } from "@/lib/google-ads";
import {
  buildDashboardKpis,
  type DashboardKpi,
} from "@/lib/dashboard-kpis";

type KpiOverviewProps = {
  metrics: CalculatedGoogleAdsMetrics | null;
  currency: string;
  comparisonMetrics?: CalculatedGoogleAdsMetrics;
  isLoading?: boolean;
};

function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  return (
    <div className="flex min-h-44 flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-200/40">
      <dt className="text-sm font-medium text-zinc-600">{kpi.label}</dt>
      <dd className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 tabular-nums">
        {kpi.formattedValue}
      </dd>
      <dd className="mt-auto pt-5 text-xs leading-5 text-zinc-500">
        {kpi.unavailableReason ?? kpi.comparison.label}
      </dd>
    </div>
  );
}

export function KpiOverviewSkeleton() {
  return (
    <section aria-busy="true" aria-labelledby="kpi-loading-heading">
      <div className="mb-4">
        <h2
          className="text-lg font-semibold text-zinc-950"
          id="kpi-loading-heading"
        >
          Account overview
        </h2>
        <p className="mt-1 text-sm text-zinc-500">Loading account metrics…</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="min-h-44 animate-pulse rounded-2xl border border-zinc-200 bg-white p-5 motion-reduce:animate-none"
            key={index}
          >
            <div className="h-4 w-24 rounded bg-zinc-200" />
            <div className="mt-4 h-9 w-36 rounded bg-zinc-200" />
            <div className="mt-10 h-3 w-32 rounded bg-zinc-100" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading six account KPI cards</span>
    </section>
  );
}

export default function KpiOverview({
  metrics,
  currency,
  comparisonMetrics,
  isLoading = false,
}: KpiOverviewProps) {
  if (isLoading) return <KpiOverviewSkeleton />;

  if (!metrics) {
    return (
      <section
        aria-labelledby="kpi-empty-heading"
        className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center"
      >
        <div
          aria-hidden="true"
          className="mx-auto flex size-11 items-center justify-center rounded-full bg-zinc-100 text-xl text-zinc-500"
        >
          —
        </div>
        <h2 className="mt-4 text-lg font-semibold" id="kpi-empty-heading">
          No account performance data
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">
          KPI totals will appear here when usable Google Ads campaign data is
          available.
        </p>
      </section>
    );
  }

  const kpis = buildDashboardKpis(metrics, currency, comparisonMetrics);

  return (
    <section aria-labelledby="kpi-overview-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            className="text-lg font-semibold text-zinc-950"
            id="kpi-overview-heading"
          >
            Account overview
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Performance across all campaigns in the current dataset
          </p>
        </div>
        <p className="text-xs font-medium text-zinc-500">
          {comparisonMetrics
            ? "Compared with prior period"
            : "Comparison period unavailable"}
        </p>
      </div>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </dl>
    </section>
  );
}
