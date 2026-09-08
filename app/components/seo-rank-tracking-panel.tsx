import type { SeoRankMovement, SeoRankTrackingState } from "@/lib/seo-rank-tracking";

const directionStyles = {
  improved: "bg-emerald-50 text-emerald-800",
  declined: "bg-red-50 text-red-800",
  stable: "bg-slate-100 text-slate-700",
} as const;

function periodLabel(period: { startDate: string; endDate: string }): string {
  return `${period.startDate}–${period.endDate}`;
}

function entityLabel(movement: SeoRankMovement): { primary: string; secondary?: string } {
  if (movement.query && movement.page) return { primary: movement.query, secondary: movement.page };
  return { primary: movement.query ?? movement.page ?? "Unavailable" };
}

function position(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${position(value)}`;
}

export default function SeoRankTrackingPanel({ rankTracking }: { rankTracking: SeoRankTrackingState }) {
  if (rankTracking.status !== "available") {
    return (
      <section aria-labelledby="seo-rank-tracking-heading" className="mt-4 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-950" id="seo-rank-tracking-heading">SEO rank tracking</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{rankTracking.message}</p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
            {rankTracking.status === "unconfigured" ? "Not connected" : rankTracking.status === "error" ? "Unavailable" : "Insufficient data"}
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-500">No ranking movement is inferred when a valid comparison is unavailable.</p>
      </section>
    );
  }

  const visible = rankTracking.movements.slice(0, 12);
  return (
    <section aria-labelledby="seo-rank-tracking-heading" className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-950" id="seo-rank-tracking-heading">SEO rank tracking</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Historical movement in aggregated Google Search Console average position. This is not an exact live SERP rank.
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">Read-only · Connected</span>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Current {periodLabel(rankTracking.currentPeriod)} · Previous {periodLabel(rankTracking.previousPeriod)} · Equal-length completed reporting windows
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <caption className="sr-only">Google Search Console historical average-position comparisons</caption>
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold" scope="col">Query / page</th>
              <th className="px-5 py-3 text-right font-semibold" scope="col">Current avg. position</th>
              <th className="px-5 py-3 text-right font-semibold" scope="col">Previous avg. position</th>
              <th className="px-5 py-3 text-right font-semibold" scope="col">Change</th>
              <th className="px-5 py-3 font-semibold" scope="col">Trend</th>
              <th className="px-5 py-3 text-right font-semibold" scope="col">Impressions</th>
              <th className="px-5 py-3 text-right font-semibold" scope="col">Clicks</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((movement) => {
              const entity = entityLabel(movement);
              return (
                <tr className="border-t border-slate-100 align-top" key={movement.evidenceId}>
                  <th className="max-w-sm px-5 py-4 text-left font-semibold text-slate-900" scope="row">
                    <span className="block break-words">{entity.primary}</span>
                    {entity.secondary ? <span className="mt-1 block break-all text-xs font-normal text-slate-500">{entity.secondary}</span> : null}
                    <span className="mt-1 block text-xs font-normal capitalize text-slate-400">{movement.dimension.replace("_", " + ")}</span>
                  </th>
                  <td className="px-5 py-4 text-right tabular-nums">{position(movement.current.averagePosition)}</td>
                  <td className="px-5 py-4 text-right tabular-nums text-slate-600">{position(movement.previous.averagePosition)}</td>
                  <td className={`px-5 py-4 text-right font-semibold tabular-nums ${movement.direction === "improved" ? "text-emerald-700" : movement.direction === "declined" ? "text-red-700" : "text-slate-600"}`}>
                    {signed(movement.positionChange)}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${directionStyles[movement.direction]}`}>
                      {movement.direction}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {movement.current.impressions.toLocaleString()} <span className="block text-xs text-slate-400">prev. {movement.previous.impressions.toLocaleString()}</span>
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {movement.current.clicks.toLocaleString()} <span className="block text-xs text-slate-400">prev. {movement.previous.clicks.toLocaleString()}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-200 px-5 py-3 text-xs leading-5 text-slate-500 sm:px-6">
        Showing {visible.length} of {rankTracking.movements.length} comparable rows. Positive change means improvement because lower average-position values are better. {rankTracking.excludedRows.toLocaleString()} unmatched, invalid, or low-volume rows were excluded.
      </p>
    </section>
  );
}
