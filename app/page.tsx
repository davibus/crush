import googleAdsData from "@/data/google-ads-sample.json";
import dailyData from "@/data/google-ads-daily.json";
import geographyData from "@/data/google-ads-geography.json";
import KpiOverview from "@/app/components/kpi-overview";
import MarketingDataChat from "@/app/components/marketing-data-chat";
import MarketingInsightsWorkspace from "@/app/components/marketing-insights-workspace";
import MarketingPerformanceCharts from "@/app/components/marketing-performance-charts";
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
  type GoogleAdsDailyMetric,
  type GoogleAdsGeography,
  type GoogleAdsSampleData,
} from "@/lib/google-ads";

export default function Home() {
  const data = googleAdsData as GoogleAdsSampleData;

  const totals = aggregateGoogleAdsMetrics(
    data.campaigns.map((campaign) => campaign.metrics),
  );
  const timeSeries = buildTimeSeriesData(
    dailyData.dailyMetrics as GoogleAdsDailyMetric[],
  );
  const campaignComparison = buildCampaignComparisonData(data.campaigns);
  const geographicPerformance = buildGeographicPerformanceData(
    geographyData.locations as GoogleAdsGeography[],
  );

  return (
    <main className="min-h-screen bg-zinc-50 p-4 text-zinc-900 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Crush</h1>
          <p className="mt-2 text-zinc-600">{data.account.name}</p>
        </div>

        <div className="mb-8">
          <KpiOverview
            currency={data.account.currency}
            metrics={
              hasUsableDashboardData(
                data.campaigns.map((campaign) => campaign.metrics),
              )
                ? totals
                : null
            }
          />
        </div>

        <div className="mb-8">
          <MarketingPerformanceCharts
            campaigns={campaignComparison}
            currency={data.account.currency}
            geographies={geographicPerformance}
            timeSeries={timeSeries}
          />
        </div>

        <div className="mb-8">
          <MarketingDataChat currency={data.account.currency} />
        </div>

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

        <MarketingInsightsWorkspace currency={data.account.currency} />
      </div>
    </main>
  );
}
