import assert from "node:assert/strict";

import {
  fetchGA4Data,
  GA4ApiError,
  hasAnyGA4Config,
  readGA4ApiConfig,
  type GA4ApiConfig,
  type GA4ReportClient,
} from "../lib/ga4-api.ts";
import type { GoogleAdsSampleData } from "../lib/google-ads.ts";
import { buildPaidMediaAnalyticsContext } from "../lib/paid-media-context.ts";
import { prepareCampaignPerformanceAnalysis } from "../lib/campaign-performance-analyzer.ts";

const escapedKey =
  "-----BEGIN PRIVATE KEY-----\\nTEST_KEY\\n-----END PRIVATE KEY-----\\n";
const config: GA4ApiConfig = {
  propertyId: "123456789",
  clientEmail: "crush-reader@example-project.iam.gserviceaccount.com",
  privateKey: escapedKey.replaceAll("\\n", "\n"),
  startDate: "30daysAgo",
  endDate: "yesterday",
};

function response(
  dimensions: string[],
  metrics: string[],
  values: Array<{ dimensions: string[]; metrics: string[] }>,
) {
  return {
    dimensionHeaders: dimensions.map((name) => ({ name })),
    metricHeaders: metrics.map((name) => ({ name })),
    rows: values.map((row) => ({
      dimensionValues: row.dimensions.map((value) => ({ value })),
      metricValues: row.metrics.map((value) => ({ value })),
    })),
  };
}

let capturedProperty = "";
let capturedRequests: unknown[] = [];
const client: GA4ReportClient = {
  async batchRunReports(request) {
    capturedProperty = request.property ?? "";
    capturedRequests = request.requests ?? [];
    const metricNames = [
      "sessions",
      "totalUsers",
      "newUsers",
      "activeUsers",
      "keyEvents",
      "engagedSessions",
      "engagementRate",
      "totalRevenue",
    ];
    const reports = [
      response([], metricNames, [
        { dimensions: [], metrics: ["500", "420", "300", "390", "36", "325", "0.65", "1200"] },
      ]),
      response(["eventName"], ["keyEvents", "totalUsers"], [
        { dimensions: ["generate_lead"], metrics: ["30", "28"] },
        { dimensions: ["purchase"], metrics: ["6", "6"] },
        { dimensions: ["not_a_key_event"], metrics: ["0", "50"] },
      ]),
      response(
        [
          "landingPagePlusQueryString",
          "sessionSource",
          "sessionMedium",
          "sessionDefaultChannelGroup",
        ],
        metricNames,
        [
          {
            dimensions: ["/demo", "google", "cpc", "Paid Search"],
            metrics: ["200", "180", "120", "170", "20", "150", "0.75", "800"],
          },
        ],
      ),
      response(
        [
          "sessionSource",
          "sessionMedium",
          "sessionSourceMedium",
          "sessionCampaignName",
          "sessionGoogleAdsCampaignId",
          "sessionDefaultChannelGroup",
        ],
        metricNames,
        [
          {
            dimensions: ["google", "cpc", "google / cpc", "Search", "101", "Paid Search"],
            metrics: ["200", "180", "120", "170", "20", "150", "0.75", "800"],
          },
          {
            dimensions: ["google", "cpc", "google / cpc", "Old campaign", "999", "Paid Search"],
            metrics: ["25", "20", "12", "19", "1", "10", "0.4", "50"],
          },
        ],
      ),
      response(
        ["sessionGoogleAdsCampaignId", "sessionGoogleAdsCampaignName"],
        metricNames,
        [
          {
            dimensions: ["101", "Search"],
            metrics: ["200", "175", "115", "165", "20", "150", "0.75", "800"],
          },
          {
            dimensions: ["999", "Old campaign"],
            metrics: ["25", "20", "12", "19", "1", "10", "0.4", "50"],
          },
          {
            dimensions: ["(not set)", "(not set)"],
            metrics: ["100", "90", "60", "85", "5", "50", "0.5", "100"],
          },
        ],
      ),
    ];
    return [{ reports }] as Awaited<
      ReturnType<GA4ReportClient["batchRunReports"]>
    >;
  },
};

const data = await fetchGA4Data(config, client);
assert.equal(capturedProperty, "properties/123456789");
assert.equal(capturedRequests.length, 5);
for (const request of capturedRequests.slice(1) as Array<{
  orderBys?: Array<{ desc?: boolean }>;
}>) {
  assert.equal(request.orderBys?.[0]?.desc, true);
}
assert.deepEqual(data.summary, {
  sessions: 500,
  totalUsers: 420,
  newUsers: 300,
  activeUsers: 390,
  keyEvents: 36,
  engagedSessions: 325,
  engagementRate: 0.65,
  totalRevenue: 1200,
});
assert.deepEqual(
  data.keyEvents.map((event) => event.eventName),
  ["generate_lead", "purchase"],
  "Zero-count events should not be presented as key events.",
);
assert.equal(data.landingPages[0]?.landingPage, "/demo");
assert.equal(data.trafficSources[0]?.googleAdsCampaignId, "101");
assert.equal(data.googleAdsCampaigns.length, 2);

const ads: GoogleAdsSampleData = {
  account: { id: "1", name: "Test", currency: "USD" },
  campaigns: [
    {
      id: "101",
      name: "Search",
      status: "ENABLED",
      channel: "SEARCH",
      dailyBudget: 50,
      metrics: {
        impressions: 1_000,
        clicks: 100,
        cost: 250,
        conversions: 10,
        conversionValue: 800,
      },
    },
  ],
};
const context = buildPaidMediaAnalyticsContext(ads, data);
assert.equal(context.campaignComparisons.length, 1);
assert.equal(context.campaignComparisons[0]?.ga4.sessions, 200);
assert.equal(context.campaignComparisons[0]?.googleAds.clicks, 100);
assert.deepEqual(context.unmatchedGoogleAdsCampaignIds, ["999"]);
const analysis = prepareCampaignPerformanceAnalysis({
  campaignData: ads,
  webAnalytics: context,
});
assert.equal(analysis.dimensionAvailability.webAnalytics, true);
assert.equal(analysis.webAnalytics?.campaignComparisons[0]?.ga4.sessions, 200);

assert.deepEqual(
  readGA4ApiConfig({
    GA4_PROPERTY_ID: "123456789",
    GA4_CLIENT_EMAIL: config.clientEmail,
    GA4_PRIVATE_KEY: escapedKey,
  }),
  config,
);
assert.equal(hasAnyGA4Config({}), false);
assert.equal(hasAnyGA4Config({ GA4_PROPERTY_ID: "123456789" }), true);
assert.throws(() => readGA4ApiConfig({}), /GA4_PROPERTY_ID/);
assert.throws(
  () =>
    readGA4ApiConfig({
      GA4_PROPERTY_ID: "G-ABC",
      GA4_CLIENT_EMAIL: config.clientEmail,
      GA4_PRIVATE_KEY: escapedKey,
    }),
  GA4ApiError,
);
assert.throws(
  () =>
    readGA4ApiConfig({
      GA4_PROPERTY_ID: config.propertyId,
      GA4_CLIENT_EMAIL: config.clientEmail,
      GA4_PRIVATE_KEY: escapedKey,
      GA4_START_DATE: "last month",
    }),
  /GA4_START_DATE/,
);

const failingClient: GA4ReportClient = {
  async batchRunReports() {
    throw Object.assign(new Error("Permission denied"), { code: 7 });
  },
};
await assert.rejects(
  () => fetchGA4Data(config, failingClient),
  (error: unknown) =>
    error instanceof GA4ApiError &&
    error.code === 7 &&
    /Permission denied/.test(error.message),
);

console.log(
  "GA4 verification passed: secure config normalization, five official API reports, typed metric mapping, key-event filtering, exact campaign-ID joining, analysis integration, unmatched-row preservation, and useful API errors.",
);
