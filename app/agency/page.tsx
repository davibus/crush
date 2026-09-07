import type { Metadata } from "next";
import Link from "next/link";

import { signOut } from "@/auth";
import { getAgencyPortfolioForUser, type AgencyWorkspaceSummary } from "@/lib/agency-portfolio";
import { requireAuthenticatedPageUser } from "@/lib/workspace-access";

export const metadata: Metadata = {
  title: "Agency Portfolio | Crush",
  description: "Prioritize authorized client workspaces by data health and account score.",
};

const healthPresentation = {
  critical: {
    label: "Critical",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
  needs_attention: {
    label: "Needs attention",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  healthy: {
    label: "Healthy",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  no_data: {
    label: "No data",
    badge: "border-slate-200 bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
  },
} as const;

function formatCurrency(value: number | null, currency: string | null): string {
  if (value === null || !currency) return "Unavailable";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`;
  }
}

function formatNumber(value: number | null): string {
  return value === null ? "Unavailable" : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatStatus(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function Freshness({
  label,
  item,
}: {
  label: string;
  item: AgencyWorkspaceSummary["latestDailyAnalysis"] | AgencyWorkspaceSummary["latestWeeklyReport"];
}) {
  const freshnessTone = item.freshness === "current"
    ? "text-emerald-700"
    : item.freshness === "stale" || item.freshness === "unavailable"
      ? "text-amber-700"
      : "text-slate-500";
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">
        {item.date ?? "No saved run"}
      </dd>
      <dd className={`mt-0.5 text-xs ${freshnessTone}`}>
        {formatStatus(item.status)} · {formatStatus(item.freshness)}
      </dd>
    </div>
  );
}

function WorkspaceCard({ workspace }: { workspace: AgencyWorkspaceSummary }) {
  const health = healthPresentation[workspace.health];
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-slate-200/70 motion-reduce:transform-none">
      <div className="border-b border-slate-100 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Workspace</p>
            <h2 className="mt-2 truncate text-xl font-semibold tracking-tight text-slate-950">{workspace.displayName}</h2>
            <p className="mt-1 truncate font-mono text-xs text-slate-400">{workspace.workspaceId}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${health.badge}`}>
            <span aria-hidden="true" className={`size-2 rounded-full ${health.dot}`} />
            {health.label}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">{workspace.workspaceStatus === "active" ? "Active workspace" : "Workspace setup required"}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">{workspace.dataSource.label}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">GA4: {formatStatus(workspace.integrations.ga4)}</span>
          {workspace.dataSource.reportingWindow ? (
            <span className="rounded-full bg-blue-50 px-3 py-1.5 font-medium text-blue-700">{workspace.dataSource.reportingWindow}</span>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-5">
        <div className="bg-white p-4">
          <dt className="text-xs text-slate-500">Account score</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{workspace.account.score === null ? "—" : `${workspace.account.score}`}</dd>
        </div>
        <div className="bg-white p-4">
          <dt className="text-xs text-slate-500">Spend</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-950">{formatCurrency(workspace.account.spend, workspace.account.currency)}</dd>
        </div>
        <div className="bg-white p-4">
          <dt className="text-xs text-slate-500">Conversions</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-950">{formatNumber(workspace.account.conversions)}</dd>
        </div>
        <div className="bg-white p-4">
          <dt className="text-xs text-slate-500">CPA</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-950">{formatCurrency(workspace.account.cpa, workspace.account.currency)}</dd>
        </div>
        <div className="bg-white p-4">
          <dt className="text-xs text-slate-500">ROAS</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-950">{workspace.account.roas === null ? "Unavailable" : `${workspace.account.roas.toFixed(2)}x`}</dd>
        </div>
      </dl>

      <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
        <Freshness item={workspace.latestDailyAnalysis} label="Daily analysis" />
        <Freshness item={workspace.latestWeeklyReport} label="Weekly report" />
      </div>

      <div className="mt-auto border-t border-slate-100 p-4 sm:px-6">
        <Link className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2" href={workspace.href}>
          Open workspace <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export default async function AgencyPage() {
  const user = await requireAuthenticatedPageUser();
  const portfolio = await getAgencyPortfolioForUser(user.id);
  const scoredCount = portfolio.workspaces.filter(({ account }) => account.score !== null).length;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="relative overflow-hidden border-b border-slate-800 bg-slate-950 text-white">
        <div aria-hidden="true" className="absolute -right-24 -top-32 size-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div aria-hidden="true" className="absolute bottom-0 left-1/3 size-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-[90rem] px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" href="/agency">
              <span className="flex size-9 items-center justify-center rounded-xl bg-blue-500 text-base font-bold shadow-lg shadow-blue-950/40">C</span>
              <span><span className="block font-semibold leading-none">Crush</span><span className="mt-1 block text-xs text-slate-400">Agency command center</span></span>
            </Link>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/sign-in" }); }}>
              <button className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800" type="submit">Sign out</button>
            </form>
          </div>

          <div className="grid gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-end lg:py-16">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">Agency / Portfolio</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl lg:text-6xl">Know which account needs you next.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">A read-only view of performance health, source state, and reporting freshness across the workspaces you can access.</p>
            </div>
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-slate-700 bg-slate-700 shadow-2xl shadow-black/20">
              <div className="bg-slate-900 p-4"><dt className="text-xs text-slate-400">Workspaces</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{portfolio.workspaceCount}</dd></div>
              <div className="bg-slate-900 p-4"><dt className="text-xs text-slate-400">Attention</dt><dd className="mt-2 text-3xl font-semibold tabular-nums text-amber-400">{portfolio.attentionCount}</dd></div>
              <div className="bg-slate-900 p-4"><dt className="text-xs text-slate-400">Scored</dt><dd className="mt-2 text-3xl font-semibold tabular-nums text-blue-400">{scoredCount}</dd></div>
            </dl>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        {portfolio.workspaces.length === 0 ? (
          <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm sm:px-10">
            <span aria-hidden="true" className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-xl">◇</span>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">No workspace memberships yet</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">You are signed in successfully. An administrator can grant your account access to an existing workspace; no advertising data is visible until then.</p>
          </section>
        ) : (
          <section aria-labelledby="portfolio-heading">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Priority queue</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl" id="portfolio-heading">Authorized workspaces</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Critical and attention-needed accounts appear first. Missing data is kept separate from scored performance.</p></div>
              <p className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">Read-only portfolio view</p>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              {portfolio.workspaces.map((workspace) => <WorkspaceCard key={workspace.workspaceId} workspace={workspace} />)}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
