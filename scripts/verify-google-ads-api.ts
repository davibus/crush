import assert from "node:assert/strict";

import {
  fetchGoogleAdsData,
  GoogleAdsApiError,
  readGoogleAdsApiConfig,
  type GoogleAdsApiConfig,
} from "../lib/google-ads-api.ts";

const config: GoogleAdsApiConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  developerToken: "developer-token",
  customerId: "1234567890",
  loginCustomerId: "9876543210",
  apiVersion: "v22",
  dateRange: "LAST_30_DAYS",
};

const baseMetrics = {
  impressions: "1000",
  clicks: "100",
  costMicros: "250000000",
  conversions: 10,
  conversionsValue: 800,
};
const campaign = { id: "101", name: "Search", status: "ENABLED", advertisingChannelType: "SEARCH" };
const requests: Array<{ url: string; init?: RequestInit; query?: string }> = [];

const fetcher: typeof fetch = async (input, init) => {
  const url = String(input);
  const request = { url, init, query: undefined as string | undefined };
  requests.push(request);

  if (url.includes("oauth2.googleapis.com")) {
    assert.match(String(init?.body), /grant_type=refresh_token/);
    return Response.json({ access_token: "short-lived-access-token" });
  }

  const payload = JSON.parse(String(init?.body)) as { query: string };
  request.query = payload.query;
  const common = { campaign, metrics: baseMetrics };
  let row: Record<string, unknown>;

  if (payload.query.includes("FROM geo_target_constant")) {
    row = {
      geoTargetConstant: {
        resourceName: "geoTargetConstants/1023191",
        name: "Lehi",
        canonicalName: "Lehi, Utah, United States",
      },
    };
  } else if (payload.query.includes("FROM keyword_view")) {
    row = {
      ...common,
      adGroup: { id: "201", name: "Core" },
      adGroupCriterion: {
        criterionId: "301",
        keyword: { text: "marketing agency", matchType: "PHRASE" },
        status: "ENABLED",
      },
    };
  } else if (payload.query.includes("FROM search_term_view")) {
    row = {
      ...common,
      adGroup: { id: "201", name: "Core" },
      searchTermView: { resourceName: "customers/123/searchTermViews/401", searchTerm: "best marketing agency" },
      segments: { keyword: { info: { text: "marketing agency", matchType: "PHRASE" } } },
    };
  } else if (payload.query.includes("FROM geographic_view")) {
    row = {
      ...common,
      geographicView: { resourceName: "customers/123/geographicViews/501" },
      segments: { geoTargetCity: "geoTargetConstants/1023191" },
    };
  } else if (payload.query.includes("segments.device")) {
    row = { ...common, segments: { device: "MOBILE" } };
  } else if (payload.query.includes("segments.conversion_action_name")) {
    row = { ...common, segments: { conversionActionName: "Qualified lead" } };
  } else if (payload.query.includes("FROM customer")) {
    row = { metrics: baseMetrics, segments: { date: "2026-08-29" } };
  } else {
    row = {
      ...common,
      customer: { id: "1234567890", descriptiveName: "Live account", currencyCode: "USD" },
      campaignBudget: { amountMicros: "50000000" },
    };
  }

  return Response.json([{ results: [row] }]);
};

const result = await fetchGoogleAdsData(config, fetcher);
assert.equal(requests.length, 9, "Expected one OAuth request and eight Google Ads requests.");
assert.equal(result.account.name, "Live account");
assert.equal(result.campaigns[0]?.dailyBudget, 50);
assert.equal(result.campaigns[0]?.metrics.cost, 250);
assert.equal(result.dailyMetrics[0]?.date, "2026-08-29");
assert.equal(result.keywords[0]?.keyword, "marketing agency");
assert.equal(result.searchTerms[0]?.searchTerm, "best marketing agency");
assert.equal(result.geographies[0]?.location, "Lehi, Utah, United States");
assert.equal(result.devices[0]?.device, "MOBILE");
assert.equal(result.conversions[0]?.conversionAction, "Qualified lead");

for (const request of requests.slice(1)) {
  const headers = request.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer short-lived-access-token");
  assert.equal(headers["developer-token"], config.developerToken);
  assert.equal(headers["login-customer-id"], config.loginCustomerId);
  assert.match(request.url, /\/v22\/customers\/1234567890\/googleAds:searchStream$/);
  if (!request.query?.includes("FROM geo_target_constant")) {
    assert.match(request.query ?? "", /segments\.date DURING LAST_30_DAYS/);
  }
  assert.doesNotMatch(request.url, /client-secret|refresh-token|developer-token/);
}

assert.deepEqual(
  readGoogleAdsApiConfig({
    GOOGLE_ADS_CLIENT_ID: "id",
    GOOGLE_ADS_CLIENT_SECRET: "secret",
    GOOGLE_ADS_REFRESH_TOKEN: "refresh",
    GOOGLE_ADS_DEVELOPER_TOKEN: "developer",
    GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: "987-654-3210",
  }),
  { ...config, clientId: "id", clientSecret: "secret", refreshToken: "refresh", developerToken: "developer" },
);
assert.throws(
  () => readGoogleAdsApiConfig({ GOOGLE_ADS_CUSTOMER_ID: "not-an-id" }),
  GoogleAdsApiError,
);
assert.throws(
  () => readGoogleAdsApiConfig({
    GOOGLE_ADS_CLIENT_ID: "id",
    GOOGLE_ADS_CLIENT_SECRET: "secret",
    GOOGLE_ADS_REFRESH_TOKEN: "refresh",
    GOOGLE_ADS_DEVELOPER_TOKEN: "developer",
    GOOGLE_ADS_CUSTOMER_ID: "1234567890",
    GOOGLE_ADS_DATE_RANGE: "LAST_999_DAYS",
  }),
  /GOOGLE_ADS_DATE_RANGE/,
);

console.log("Google Ads API verification passed: secure OAuth exchange, seven metric datasets, readable geography lookup, micros conversion, internal-model mapping, manager headers, and configuration validation.");
