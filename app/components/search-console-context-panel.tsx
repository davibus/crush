import type { SearchConsoleStatusProjection } from "@/lib/search-console";

const statusCopy: Record<SearchConsoleStatusProjection["status"], { label: string; detail: string }> = {
  available: { label: "Connected", detail: "Read-only Search Analytics rows are available." },
  empty: { label: "No rows", detail: "The property responded successfully but returned no rows for this period." },
  error: { label: "Connection issue", detail: "Search Console is unavailable; Google Ads and GA4 remain available independently." },
  unconfigured: { label: "Not connected", detail: "No Search Console property is configured for this workspace." },
};

export default function SearchConsoleContextPanel({
  searchConsole,
}: {
  searchConsole: SearchConsoleStatusProjection;
}) {
  const copy = statusCopy[searchConsole.status];
  return (
    <section aria-labelledby="search-console-heading" className="mt-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-950" id="search-console-heading">Google Search Console</h3>
          <p className="mt-1 text-sm text-slate-600">{copy.detail}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{copy.label}</span>
      </div>
      {searchConsole.dateRange ? (
        <p className="mt-3 text-xs text-slate-500">
          {searchConsole.dateRange.startDate} through {searchConsole.dateRange.endDate} · {searchConsole.rowCount.toLocaleString()} rows across {searchConsole.dimensions.join(", ")}
        </p>
      ) : null}
    </section>
  );
}
