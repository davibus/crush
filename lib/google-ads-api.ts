import "server-only";

import type {
  GoogleAdsAccount,
  GoogleAdsCampaign,
  GoogleAdsConversion,
  GoogleAdsDailyMetric,
  GoogleAdsDevice,
  GoogleAdsGeography,
  GoogleAdsKeyword,
  GoogleAdsMetrics,
  GoogleAdsSearchTerm,
} from "./google-ads.ts";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ADS_API_ORIGIN = "https://googleads.googleapis.com";
const DEFAULT_API_VERSION = "v22";
const DEFAULT_DATE_RANGE = "LAST_30_DAYS";
const ALLOWED_DATE_RANGES = new Set([
  "TODAY",
  "YESTERDAY",
  "LAST_7_DAYS",
  "LAST_14_DAYS",
  "LAST_30_DAYS",
  "THIS_MONTH",
  "LAST_MONTH",
]);

export type GoogleAdsApiConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId?: string;
  apiVersion: string;
  dateRange: string;
};

type GoogleAdsEnvironment = Record<string, string | undefined>;

export type LiveGoogleAdsData = {
  account: GoogleAdsAccount;
  campaigns: GoogleAdsCampaign[];
  dailyMetrics: GoogleAdsDailyMetric[];
  geographies: GoogleAdsGeography[];
  devices: GoogleAdsDevice[];
  keywords: GoogleAdsKeyword[];
  searchTerms: GoogleAdsSearchTerm[];
  conversions: GoogleAdsConversion[];
};

type FetchImplementation = typeof fetch;
type GoogleAdsRow = Record<string, unknown>;

export class GoogleAdsApiError extends Error {
  readonly status?: number;

  constructor(
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "GoogleAdsApiError";
    this.status = status;
  }
}

function required(environment: GoogleAdsEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new GoogleAdsApiError(`Missing required ${name}.`);
  return value;
}

function customerId(value: string, name: string): string {
  const normalized = value.replaceAll("-", "");
  if (!/^\d{10}$/.test(normalized)) {
    throw new GoogleAdsApiError(`${name} must contain exactly 10 digits.`);
  }
  return normalized;
}

export function readGoogleAdsApiConfig(
  environment: GoogleAdsEnvironment = process.env,
): GoogleAdsApiConfig {
  const apiVersion = environment.GOOGLE_ADS_API_VERSION?.trim() || DEFAULT_API_VERSION;
  if (!/^v\d+$/.test(apiVersion)) {
    throw new GoogleAdsApiError("GOOGLE_ADS_API_VERSION must look like v22.");
  }

  const dateRange = environment.GOOGLE_ADS_DATE_RANGE?.trim() || DEFAULT_DATE_RANGE;
  if (!ALLOWED_DATE_RANGES.has(dateRange)) {
    throw new GoogleAdsApiError(
      `GOOGLE_ADS_DATE_RANGE must be one of ${[...ALLOWED_DATE_RANGES].join(", ")}.`,
    );
  }

  const loginCustomerId = environment.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();
  return {
    clientId: required(environment, "GOOGLE_ADS_CLIENT_ID"),
    clientSecret: required(environment, "GOOGLE_ADS_CLIENT_SECRET"),
    refreshToken: required(environment, "GOOGLE_ADS_REFRESH_TOKEN"),
    developerToken: required(environment, "GOOGLE_ADS_DEVELOPER_TOKEN"),
    customerId: customerId(required(environment, "GOOGLE_ADS_CUSTOMER_ID"), "GOOGLE_ADS_CUSTOMER_ID"),
    ...(loginCustomerId
      ? { loginCustomerId: customerId(loginCustomerId, "GOOGLE_ADS_LOGIN_CUSTOMER_ID") }
      : {}),
    apiVersion,
    dateRange,
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nested(row: GoogleAdsRow, key: string): Record<string, unknown> {
  return object(row[key]);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
}

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function idFromResource(value: unknown): string {
  const resource = text(value);
  return resource.split("/").at(-1) || resource;
}

function metrics(row: GoogleAdsRow): GoogleAdsMetrics {
  const values = nested(row, "metrics");
  return {
    impressions: number(values.impressions),
    clicks: number(values.clicks),
    cost: number(values.costMicros) / 1_000_000,
    conversions: number(values.conversions),
    conversionValue: number(values.conversionsValue),
  };
}

function status(value: unknown): GoogleAdsCampaign["status"] {
  const normalized = text(value).toUpperCase();
  return normalized === "ENABLED" || normalized === "PAUSED" || normalized === "REMOVED"
    ? normalized
    : "UNKNOWN";
}

function matchType(value: unknown): GoogleAdsKeyword["matchType"] {
  const normalized = text(value).toUpperCase();
  return normalized === "EXACT" || normalized === "PHRASE" || normalized === "BROAD"
    ? normalized
    : "UNKNOWN";
}

function dimensionBase(row: GoogleAdsRow, suffix: string) {
  const campaign = nested(row, "campaign");
  return {
    id: `${text(campaign.id)}-${suffix}`,
    campaignId: text(campaign.id),
    campaignName: text(campaign.name, "Unnamed campaign"),
    ...metrics(row),
  };
}

async function responseJson(response: Response, service: string): Promise<unknown> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GoogleAdsApiError(`${service} returned an unreadable response.`, response.status);
  }
  if (!response.ok) {
    const error = object(object(body).error);
    const message = text(error.message, `${service} request failed.`);
    throw new GoogleAdsApiError(message, response.status);
  }
  return body;
}

async function accessToken(config: GoogleAdsApiConfig, fetcher: FetchImplementation): Promise<string> {
  const response = await fetcher(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const body = object(await responseJson(response, "Google OAuth"));
  const token = text(body.access_token);
  if (!token) throw new GoogleAdsApiError("Google OAuth response did not include an access token.");
  return token;
}

async function search(
  config: GoogleAdsApiConfig,
  token: string,
  query: string,
  fetcher: FetchImplementation,
): Promise<GoogleAdsRow[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "developer-token": config.developerToken,
  };
  if (config.loginCustomerId) headers["login-customer-id"] = config.loginCustomerId;

  const response = await fetcher(
    `${GOOGLE_ADS_API_ORIGIN}/${config.apiVersion}/customers/${config.customerId}/googleAds:searchStream`,
    { method: "POST", headers, body: JSON.stringify({ query }), cache: "no-store" },
  );
  const body = await responseJson(response, "Google Ads API");
  if (!Array.isArray(body)) throw new GoogleAdsApiError("Google Ads API returned an unexpected response shape.");
  return body.flatMap((batch) => {
    const results = object(batch).results;
    return Array.isArray(results) ? results.map(object) : [];
  });
}

const metricFields = [
  "metrics.impressions",
  "metrics.clicks",
  "metrics.cost_micros",
  "metrics.conversions",
  "metrics.conversions_value",
].join(", ");

function query(fields: string, resource: string, dateRange: string): string {
  return `SELECT ${fields}, ${metricFields} FROM ${resource} WHERE segments.date DURING ${dateRange}`;
}

export async function fetchGoogleAdsData(
  config = readGoogleAdsApiConfig(),
  fetcher: FetchImplementation = fetch,
): Promise<LiveGoogleAdsData> {
  const token = await accessToken(config, fetcher);
  const [campaignRows, dailyRows, keywordRows, searchTermRows, geographyRows, deviceRows, conversionRows] =
    await Promise.all([
      search(config, token, query("customer.id, customer.descriptive_name, customer.currency_code, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros", "campaign", config.dateRange), fetcher),
      search(config, token, query("segments.date", "customer", config.dateRange), fetcher),
      search(config, token, query("campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status", "keyword_view", config.dateRange), fetcher),
      search(config, token, query("campaign.id, campaign.name, ad_group.id, ad_group.name, search_term_view.resource_name, search_term_view.search_term, segments.keyword.info.text, segments.keyword.info.match_type", "search_term_view", config.dateRange), fetcher),
      search(config, token, query("campaign.id, campaign.name, geographic_view.resource_name, segments.geo_target_city", "geographic_view", config.dateRange), fetcher),
      search(config, token, query("campaign.id, campaign.name, segments.device", "campaign", config.dateRange), fetcher),
      search(config, token, query("campaign.id, campaign.name, segments.conversion_action_name", "campaign", config.dateRange), fetcher),
    ]);

  const geoTargetResources = [
    ...new Set(
      geographyRows
        .map((row) => text(nested(row, "segments").geoTargetCity))
        .filter((resource) => /^geoTargetConstants\/\d+$/.test(resource)),
    ),
  ];
  const geoTargetRows = geoTargetResources.length
    ? await search(
        config,
        token,
        `SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.canonical_name FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${geoTargetResources.map((resource) => `'${resource}'`).join(", ")})`,
        fetcher,
      )
    : [];
  const geoTargetNames = new Map(
    geoTargetRows.map((row) => {
      const target = nested(row, "geoTargetConstant");
      return [
        text(target.resourceName),
        text(target.canonicalName, text(target.name)),
      ];
    }),
  );

  const first = campaignRows[0] ?? {};
  const customer = nested(first, "customer");
  const account: GoogleAdsAccount = {
    id: text(customer.id, config.customerId),
    name: text(customer.descriptiveName, `Google Ads ${config.customerId}`),
    currency: text(customer.currencyCode, "USD"),
  };

  return {
    account,
    campaigns: campaignRows.map((row) => {
      const campaign = nested(row, "campaign");
      const budget = nested(row, "campaignBudget");
      return {
        id: text(campaign.id),
        name: text(campaign.name, "Unnamed campaign"),
        status: status(campaign.status),
        channel: text(campaign.advertisingChannelType, "UNKNOWN"),
        dailyBudget: number(budget.amountMicros) / 1_000_000,
        metrics: metrics(row),
      };
    }),
    dailyMetrics: dailyRows.map((row) => ({ date: text(nested(row, "segments").date), ...metrics(row) })),
    keywords: keywordRows.map((row) => {
      const adGroup = nested(row, "adGroup");
      const criterion = nested(row, "adGroupCriterion");
      const keyword = nested(criterion, "keyword");
      return {
        ...dimensionBase(row, `keyword-${text(criterion.criterionId)}`),
        adGroup: text(adGroup.name, text(adGroup.id, "Unknown ad group")),
        keyword: text(keyword.text),
        matchType: matchType(keyword.matchType),
        status: status(criterion.status),
      };
    }),
    searchTerms: searchTermRows.map((row) => {
      const adGroup = nested(row, "adGroup");
      const view = nested(row, "searchTermView");
      const keywordInfo = nested(nested(row, "segments"), "keyword");
      const info = nested(keywordInfo, "info");
      const viewId = idFromResource(view.resourceName) || text(view.searchTerm);
      return {
        ...dimensionBase(row, `search-term-${viewId}`),
        adGroup: text(adGroup.name, text(adGroup.id, "Unknown ad group")),
        searchTerm: text(view.searchTerm),
        matchedKeyword: text(info.text, "Unavailable"),
        matchType: matchType(info.matchType),
      };
    }),
    geographies: geographyRows.map((row) => {
      const view = nested(row, "geographicView");
      const city = text(nested(row, "segments").geoTargetCity);
      const geoId = idFromResource(city) || idFromResource(view.resourceName);
      return {
        ...dimensionBase(row, `geography-${geoId}`),
        location:
          geoTargetNames.get(city) ||
          (geoId ? `Geo target ${geoId}` : "Unknown location"),
      };
    }),
    devices: deviceRows.map((row) => {
      const device = text(nested(row, "segments").device, "UNKNOWN");
      return { ...dimensionBase(row, `device-${device}`), device };
    }),
    conversions: conversionRows.map((row) => {
      const campaign = nested(row, "campaign");
      const action = text(nested(row, "segments").conversionActionName, "Unknown conversion action");
      const values = metrics(row);
      return {
        id: `${text(campaign.id)}-conversion-${action}`,
        campaignId: text(campaign.id),
        campaignName: text(campaign.name, "Unnamed campaign"),
        conversionAction: action,
        conversions: values.conversions,
        conversionValue: values.conversionValue,
      };
    }),
  };
}
