import type { GA4DataState } from "@/lib/ga4";
import type { PaidMediaAnalyticsContext } from "@/lib/paid-media-context";

function count(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function GA4ContextPanel({
  ga4,
  paidMedia,
}: {
  ga4: GA4DataState;
  paidMedia?: PaidMediaAnalyticsContext;
}) {
  if (ga4.status === "unconfigured") {
    return (
      <section
        aria-labelledby="ga4-context-heading"
        className="mb-8 rounded-2xl border border-dashed border-zinc-300 bg-white p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold" id="ga4-context-heading">GA4 site context</h2>
          <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700">Not connected</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Paid-media reporting is ready to explore. Connect optional GA4 server
          credentials to add site sessions, users, key events, landing pages,
          and traffic sources to this view.
        </p>
      </section>
    );
  }

  if (ga4.status === "error") {
    return (
      <section
        aria-labelledby="ga4-context-heading"
        className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold" id="ga4-context-heading">GA4 site context unavailable</h2>
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900">Connection issue</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-amber-900" role="alert">
          {ga4.message}
        </p>
      </section>
    );
  }

  const { data } = ga4;
  const summaryItems = [
    ["Sessions", data.summary.sessions],
    ["Total users", data.summary.totalUsers],
    ["Active users", data.summary.activeUsers],
    ["Key events", data.summary.keyEvents],
  ] as const;

  return (
    <section aria-labelledby="ga4-context-heading" className="mb-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold" id="ga4-context-heading">
            GA4 site context
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Site outcomes alongside platform-reported paid-media performance
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">Connected</span>
          <span>{data.dateRange.startDate} to {data.dateRange.endDate}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryItems.map(([label, value]) => (
          <div
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-200/30"
            key={label}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">
              {count(value)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-3">
            <h3 className="font-semibold">Top traffic sources</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <caption className="sr-only">Top GA4 traffic sources</caption>
              <thead className="bg-zinc-50 text-left text-zinc-600">
                <tr>
                  <th className="px-5 py-2.5" scope="col">Source / medium</th>
                  <th className="px-5 py-2.5 text-right" scope="col">Sessions</th>
                  <th className="px-5 py-2.5 text-right" scope="col">Key events</th>
                </tr>
              </thead>
              <tbody>
                {data.trafficSources.slice(0, 5).map((row, index) => (
                  <tr
                    className="border-t border-zinc-100"
                    key={`${row.sourceMedium}-${row.campaignName}-${index}`}
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-zinc-900">{row.sourceMedium}</p>
                      <p className="text-xs text-zinc-500">{row.channelGroup}</p>
                    </td>
                    <td className="px-5 py-3 text-right">{count(row.sessions)}</td>
                    <td className="px-5 py-3 text-right">{count(row.keyEvents)}</td>
                  </tr>
                ))}
                {data.trafficSources.length === 0 ? (
                  <tr><td className="px-5 py-8 text-center text-zinc-500" colSpan={3}>No traffic-source rows were returned for this reporting window.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-3">
            <h3 className="font-semibold">Top landing pages</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <caption className="sr-only">Top GA4 landing pages</caption>
              <thead className="bg-zinc-50 text-left text-zinc-600">
                <tr>
                  <th className="px-5 py-2.5" scope="col">Landing page</th>
                  <th className="px-5 py-2.5 text-right" scope="col">Sessions</th>
                  <th className="px-5 py-2.5 text-right" scope="col">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {data.landingPages.slice(0, 5).map((row, index) => (
                  <tr
                    className="border-t border-zinc-100"
                    key={`${row.landingPage}-${row.source}-${index}`}
                  >
                    <td className="max-w-64 truncate px-5 py-3" title={row.landingPage}>
                      {row.landingPage}
                    </td>
                    <td className="px-5 py-3 text-right">{count(row.sessions)}</td>
                    <td className="px-5 py-3 text-right">
                      {(row.engagementRate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {data.landingPages.length === 0 ? (
                  <tr><td className="px-5 py-8 text-center text-zinc-500" colSpan={3}>No landing-page rows were returned for this reporting window.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-3">
          <h3 className="font-semibold">Google Ads + GA4 campaign context</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Exact campaign-ID matches only. These platform and site metrics are
            shown side by side, not reconciled as equivalent attribution.
          </p>
        </div>
        {paidMedia?.campaignComparisons.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <caption className="sr-only">Matched Google Ads and GA4 campaign metrics</caption>
              <thead className="bg-zinc-50 text-left text-zinc-600">
                <tr>
                  <th className="px-5 py-2.5" scope="col">Campaign</th>
                  <th className="px-5 py-2.5 text-right" scope="col">Ads clicks</th>
                  <th className="px-5 py-2.5 text-right" scope="col">Ads conversions</th>
                  <th className="px-5 py-2.5 text-right" scope="col">GA4 sessions</th>
                  <th className="px-5 py-2.5 text-right" scope="col">GA4 key events</th>
                </tr>
              </thead>
              <tbody>
                {paidMedia.campaignComparisons.map((row) => (
                  <tr className="border-t border-zinc-100" key={row.campaignId}>
                    <td className="px-5 py-3 font-medium">{row.campaignName}</td>
                    <td className="px-5 py-3 text-right">{count(row.googleAds.clicks)}</td>
                    <td className="px-5 py-3 text-right">{count(row.googleAds.conversions)}</td>
                    <td className="px-5 py-3 text-right">{count(row.ga4.sessions)}</td>
                    <td className="px-5 py-3 text-right">{count(row.ga4.keyEvents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-zinc-600">
            GA4 did not return an exact Google Ads campaign-ID match for the loaded
            campaigns. Traffic-source and landing-page context is still available.
          </p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-100/70 px-5 py-4">
        <h3 className="text-sm font-semibold">Key events</h3>
        <p className="mt-1 text-sm text-zinc-600">
          {data.keyEvents.length
            ? data.keyEvents
                .slice(0, 5)
                .map((event) => `${event.eventName}: ${count(event.keyEvents)}`)
                .join(" · ")
            : "No key events were returned for this reporting window."}
        </p>
      </div>
    </section>
  );
}
