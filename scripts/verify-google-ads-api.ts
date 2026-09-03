import assert from "node:assert/strict";

import {
  fetchGoogleAdsData,
  explicitGoogleAdsDateRange,
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
    row = {
      campaign,
      metrics: {
        conversions: baseMetrics.conversions,
        conversionsValue: baseMetrics.conversionsValue,
      },
      segments: { conversionActionName: "Qualified lead" },
    };
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
assert.equal(result.conversions[0]?.conversions, 10);
assert.equal(result.conversions[0]?.conversionValue, 800);

const conversionRequest = requests.find((request) =>
  request.query?.includes("segments.conversion_action_name")
);
assert.ok(conversionRequest?.query, "Expected a conversion-action report request.");
assert.match(conversionRequest.query, /metrics\.conversions/);
assert.match(conversionRequest.query, /metrics\.conversions_value/);
assert.doesNotMatch(
  conversionRequest.query,
  /metrics\.(?:clicks|impressions|cost_micros)/,
);

const campaignRequest = requests.find((request) =>
  request.query?.includes("campaign_budget.amount_micros")
);
assert.ok(campaignRequest?.query, "Expected a campaign report request.");
assert.match(campaignRequest.query, /metrics\.clicks/);
assert.match(campaignRequest.query, /metrics\.impressions/);
assert.match(campaignRequest.query, /metrics\.cost_micros/);

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
assert.equal(
  explicitGoogleAdsDateRange("2026-08-17", "2026-08-30"),
  "2026-08-17:2026-08-30",
);
assert.throws(
  () => explicitGoogleAdsDateRange("2026-08-30", "2026-08-17"),
  /chronological order/,
);
assert.throws(
  () => explicitGoogleAdsDateRange("2026-02-30", "2026-03-01"),
  /valid YYYY-MM-DD/,
);

const requestCountBeforeCustomRange = requests.length;
await fetchGoogleAdsData(
  {
    ...config,
    dateRange: explicitGoogleAdsDateRange("2026-08-17", "2026-08-30"),
  },
  fetcher,
);
for (const request of requests.slice(requestCountBeforeCustomRange + 1)) {
  if (!request.query?.includes("FROM geo_target_constant")) {
    assert.match(
      request.query ?? "",
      /segments\.date BETWEEN '2026-08-17' AND '2026-08-30'/,
    );
  }
}
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

const sensitiveValues = [
  config.developerToken,
  config.clientSecret,
  config.refreshToken,
  "short-lived-access-token",
];
const failingFetcher: typeof fetch = async (input) => {
  if (String(input).includes("oauth2.googleapis.com")) {
    return Response.json({ access_token: "short-lived-access-token" });
  }
  return Response.json(
    [{
      error: {
        code: 403,
        message: `Google Ads API request failed. Authorization: Bearer ${sensitiveValues[3]}`,
        status: "PERMISSION_DENIED",
        details: [
          {
            "@type": "type.googleapis.com/google.ads.googleads.v22.errors.GoogleAdsFailure",
            requestId: "request-id-from-body",
            errors: [
              {
                errorCode: { authorizationError: "CUSTOMER_NOT_ENABLED" },
                message: `The customer is not enabled; developer-token=${config.developerToken}`,
                location: {
                  fieldPathElements: [
                    { fieldName: "operations", index: 0 },
                    { fieldName: "create" },
                  ],
                },
              },
            ],
          },
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "SERVICE_DISABLED",
            domain: "googleapis.com",
            metadata: {
              service: "googleads.googleapis.com",
              consumer: "projects/123456789",
              activationUrl: "https://console.example.test/enable",
              unapprovedMetadata: config.clientSecret,
            },
          },
        ],
      },
    }],
    { status: 403, headers: { "request-id": "request-id-from-header" } },
  );
};

await assert.rejects(
  fetchGoogleAdsData(config, failingFetcher),
  (error: unknown) => {
    assert.ok(error instanceof GoogleAdsApiError);
    assert.equal(error.status, 403);
    assert.equal(
      error.code,
      "PERMISSION_DENIED, authorizationError.CUSTOMER_NOT_ENABLED, SERVICE_DISABLED",
    );
    assert.equal(error.requestId, "request-id-from-header");
    assert.deepEqual(error.failures, [{
      code: "authorizationError.CUSTOMER_NOT_ENABLED",
      message: "The customer is not enabled; [REDACTED]=[REDACTED]",
      fieldPath: "operations[0].create",
    }, {
      code: "SERVICE_DISABLED",
      message: "domain: googleapis.com; service: googleads.googleapis.com; consumer: projects/123456789; activation URL: https://console.example.test/enable",
    }]);
    assert.match(error.message, /PERMISSION_DENIED/);
    assert.match(error.message, /CUSTOMER_NOT_ENABLED/);
    assert.match(error.message, /request ID: request-id-from-header/);
    assert.match(error.message, /field: operations\[0\]\.create/);
    for (const sensitiveValue of sensitiveValues) {
      assert.doesNotMatch(error.message, new RegExp(sensitiveValue));
    }
    assert.doesNotMatch(error.message, /Bearer short-lived-access-token/);
    return true;
  },
);

console.log("Google Ads API verification passed: secure OAuth exchange, seven metric datasets, readable geography lookup, micros conversion, internal-model mapping, manager headers, configuration validation, and sanitized structured errors.");
