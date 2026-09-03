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
const CUSTOM_DATE_RANGE = /^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/;

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

export type GoogleAdsFailureDetail = {
  code?: string;
  message?: string;
  fieldPath?: string;
};

export type GoogleAdsErrorDetails = {
  codes: string[];
  requestId?: string;
  failures: GoogleAdsFailureDetail[];
};

export class GoogleAdsApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly failures?: GoogleAdsFailureDetail[];

  constructor(
    message: string,
    status?: number,
    details?: GoogleAdsErrorDetails,
  ) {
    super(message);
    this.name = "GoogleAdsApiError";
    this.status = status;
    this.code = details?.codes.join(", ") || undefined;
    this.requestId = details?.requestId;
    this.failures = details?.failures.length ? details.failures : undefined;
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

function redactSensitiveText(value: string, secrets: readonly string[]): string {
  let sanitized = value;
  for (const secret of secrets) {
    if (secret) sanitized = sanitized.replaceAll(secret, "[REDACTED]");
  }
  return sanitized
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(
      /((?:developer[-_\s]?token|access[-_\s]?token|refresh[-_\s]?token|client[-_\s]?secret|authorization)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi,
      "$1[REDACTED]",
    );
}

function googleAdsErrorCode(value: unknown): string | undefined {
  const entries = Object.entries(object(value));
  if (!entries.length) return undefined;
  return entries
    .map(([category, enumValue]) => `${category}.${text(enumValue)}`)
    .filter((value) => !value.endsWith("."))
    .join(", ") || undefined;
}

function googleAdsFieldPath(value: unknown): string | undefined {
  const elements = object(value).fieldPathElements;
  if (!Array.isArray(elements)) return undefined;
  const path = elements
    .map((element) => {
      const part = object(element);
      const fieldName = text(part.fieldName);
      const index = typeof part.index === "number" || typeof part.index === "string"
        ? `[${part.index}]`
        : "";
      return fieldName ? `${fieldName}${index}` : "";
    })
    .filter(Boolean)
    .join(".");
  return path || undefined;
}

function responseError(body: unknown): Record<string, unknown> {
  const candidates = Array.isArray(body) ? body : [body];
  for (const candidate of candidates) {
    const error = object(object(candidate).error);
    if (Object.keys(error).length) return error;
  }
  return {};
}

function googleAdsErrorDetails(
  body: unknown,
  response: Response,
  secrets: readonly string[],
): GoogleAdsErrorDetails {
  const topLevelError = responseError(body);
  const codes = new Set<string>();
  const status = redactSensitiveText(text(topLevelError.status), secrets);
  if (status) codes.add(status);

  let requestId = response.headers.get("request-id")
    || response.headers.get("x-request-id")
    || undefined;
  const failures: GoogleAdsFailureDetail[] = [];
  const details = Array.isArray(topLevelError.details) ? topLevelError.details : [];

  for (const detailValue of details) {
    const detail = object(detailValue);
    const detailRequestId = text(detail.requestId);
    if (!requestId && detailRequestId) requestId = detailRequestId;

    const reason = redactSensitiveText(text(detail.reason), secrets);
    const domain = redactSensitiveText(text(detail.domain), secrets);
    const metadata = object(detail.metadata);
    const metadataParts = [
      ["domain", domain],
      ["service", text(metadata.service)],
      ["service title", text(metadata.serviceTitle)],
      ["consumer", text(metadata.consumer)],
      ["activation URL", text(metadata.activationUrl)],
    ]
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([label, value]) => `${label}: ${redactSensitiveText(value, secrets)}`);
    if (reason) codes.add(reason);
    if (reason || metadataParts.length) {
      failures.push({
        ...(reason ? { code: reason } : {}),
        ...(metadataParts.length ? { message: metadataParts.join("; ") } : {}),
      });
    }

    const errors = Array.isArray(detail.errors) ? detail.errors : [];
    for (const failureValue of errors) {
      const failure = object(failureValue);
      const code = googleAdsErrorCode(failure.errorCode);
      if (code) codes.add(redactSensitiveText(code, secrets));
      const message = redactSensitiveText(text(failure.message), secrets) || undefined;
      const fieldPath = googleAdsFieldPath(failure.location);
      if (code || message || fieldPath) {
        failures.push({
          ...(code ? { code: redactSensitiveText(code, secrets) } : {}),
          ...(message ? { message } : {}),
          ...(fieldPath ? { fieldPath } : {}),
        });
      }
    }


    const violations = [
      ...(Array.isArray(detail.fieldViolations) ? detail.fieldViolations : []),
      ...(Array.isArray(detail.violations) ? detail.violations : []),
    ];
    for (const violationValue of violations) {
      const violation = object(violationValue);
      const code = redactSensitiveText(text(violation.type), secrets) || undefined;
      const message = redactSensitiveText(text(violation.description), secrets) || undefined;
      const fieldPath = redactSensitiveText(
        text(violation.field, text(violation.subject)),
        secrets,
      ) || undefined;
      if (code) codes.add(code);
      if (code || message || fieldPath) failures.push({ code, message, fieldPath });
    }
  }

  return {
    codes: [...codes],
    ...(requestId ? { requestId: redactSensitiveText(requestId, secrets) } : {}),
    failures,
  };
}

function googleAdsErrorMessage(
  baseMessage: string,
  details: GoogleAdsErrorDetails,
): string {
  const diagnostics: string[] = [];
  if (details.codes.length) diagnostics.push(`code: ${details.codes.join(", ")}`);
  if (details.requestId) diagnostics.push(`request ID: ${details.requestId}`);
  for (const failure of details.failures) {
    const label = [failure.code, failure.message].filter(Boolean).join(": ");
    const field = failure.fieldPath ? `field: ${failure.fieldPath}` : "";
    diagnostics.push(`failure: ${[label, field].filter(Boolean).join("; ")}`);
  }
  return diagnostics.length ? `${baseMessage} (${diagnostics.join(" | ")})` : baseMessage;
}

async function responseJson(
  response: Response,
  service: string,
  secrets: readonly string[] = [],
): Promise<unknown> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GoogleAdsApiError(`${service} returned an unreadable response.`, response.status);
  }
  if (!response.ok) {
    const error = responseError(body);
    const message = redactSensitiveText(text(error.message, `${service} request failed.`), secrets);
    if (service === "Google Ads API") {
      const details = googleAdsErrorDetails(body, response, secrets);
      throw new GoogleAdsApiError(
        googleAdsErrorMessage(message, details),
        response.status,
        details,
      );
    }
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
  const body = object(await responseJson(
    response,
    "Google OAuth",
    [config.clientSecret, config.refreshToken, config.developerToken],
  ));
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
  const body = await responseJson(
    response,
    "Google Ads API",
    [token, config.developerToken, config.refreshToken, config.clientSecret],
  );
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
const conversionMetricFields = [
  "metrics.conversions",
  "metrics.conversions_value",
].join(", ");

function query(
  fields: string,
  resource: string,
  dateRange: string,
  metrics = metricFields,
): string {
  const customRange = CUSTOM_DATE_RANGE.exec(dateRange);
  const dateFilter = customRange
    ? `segments.date BETWEEN '${customRange[1]}' AND '${customRange[2]}'`
    : `segments.date DURING ${dateRange}`;
  return `SELECT ${fields}, ${metrics} FROM ${resource} WHERE ${dateFilter}`;
}

export function explicitGoogleAdsDateRange(
  startDate: string,
  endDate: string,
): string {
  const range = `${startDate}:${endDate}`;
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!CUSTOM_DATE_RANGE.test(range) || !validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    throw new GoogleAdsApiError(
      "Google Ads custom dates must be valid YYYY-MM-DD values in chronological order.",
    );
  }
  return range;
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
      search(config, token, query("campaign.id, campaign.name, segments.conversion_action_name", "campaign", config.dateRange, conversionMetricFields), fetcher),
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
