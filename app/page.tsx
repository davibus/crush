import googleAdsData from "@/data/google-ads-sample.json";
import AiConnectionTest from "@/app/ai-connection-test";
import {
  aggregateGoogleAdsMetrics,
  getCpa,
  getCpc,
  getCtr,
  getRoas,
  type GoogleAdsSampleData,
} from "@/lib/google-ads";

export default function Home() {
  const data = googleAdsData as GoogleAdsSampleData;

  const totals = aggregateGoogleAdsMetrics(
    data.campaigns.map((campaign) => campaign.metrics),
  );

  return (
    <main className="min-h-screen bg-zinc-50 p-8 text-zinc-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Crush</h1>
          <p className="mt-2 text-zinc-600">{data.account.name}</p>
        </div>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <MetricCard
            label="Spend"
            value={`$${totals.spend.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
          />

          <MetricCard
            label="Conversions"
            value={totals.conversions.toLocaleString()}
          />

          <MetricCard
            label="CPA"
            value={`$${totals.cpa.toFixed(2)}`}
          />

          <MetricCard
            label="ROAS"
            value={`${totals.roas.toFixed(2)}x`}
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-lg font-semibold">
              Google Ads Campaigns
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 text-left">
                <tr>
                  <th className="px-6 py-3">Campaign</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Spend</th>
                  <th className="px-6 py-3">Clicks</th>
                  <th className="px-6 py-3">CTR</th>
                  <th className="px-6 py-3">CPC</th>
                  <th className="px-6 py-3">Conversions</th>
                  <th className="px-6 py-3">CPA</th>
                  <th className="px-6 py-3">ROAS</th>
                </tr>
              </thead>

              <tbody>
                {data.campaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className="border-t border-zinc-200"
                  >
                    <td className="px-6 py-4 font-medium">
                      {campaign.name}
                    </td>

                    <td className="px-6 py-4">
                      {campaign.status}
                    </td>

                    <td className="px-6 py-4">
                      ${campaign.metrics.cost.toFixed(2)}
                    </td>

                    <td className="px-6 py-4">
                      {campaign.metrics.clicks.toLocaleString()}
                    </td>

                    <td className="px-6 py-4">
                      {getCtr(campaign.metrics).toFixed(2)}%
                    </td>

                    <td className="px-6 py-4">
                      ${getCpc(campaign.metrics).toFixed(2)}
                    </td>

                    <td className="px-6 py-4">
                      {campaign.metrics.conversions}
                    </td>

                    <td className="px-6 py-4">
                      ${getCpa(campaign.metrics).toFixed(2)}
                    </td>

                    <td className="px-6 py-4">
                      {getRoas(campaign.metrics).toFixed(2)}x
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <AiConnectionTest />
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
