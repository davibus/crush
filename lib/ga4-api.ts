import "server-only";

import {
  BetaAnalyticsDataClient,
  type protos,
} from "@google-analytics/data";

import type {
  GA4Data,
  GA4GoogleAdsCampaign,
  GA4KeyEvent,
  GA4LandingPage,
  GA4Metrics,
  GA4TrafficSource,
} from "./ga4.ts";

const DEFAULT_START_DATE = "30daysAgo";
const DEFAULT_END_DATE = "yesterday";
const DEFAULT_ROW_LIMIT = 25;
const DATE_VALUE = /^(?:today|yesterday|\d+daysAgo|\d{4}-\d{2}-\d{2})$/;

type GA4Environment = Record<string, string | undefined>;
type RunReportRequest = protos.google.analytics.data.v1beta.IRunReportRequest;
type RunReportResponse = protos.google.analytics.data.v1beta.IRunReportResponse;
type BatchRunReportsRequest = protos.google.analytics.data.v1beta.IBatchRunReportsRequest;
type BatchRunReportsResponse = protos.google.analytics.data.v1beta.IBatchRunReportsResponse;

export type GA4ApiConfig = {
  propertyId: string;
  clientEmail: string;
  privateKey: string;
  startDate: string;
  endDate: string;
};

export type GA4ReportClient = {
  batchRunReports(
    request: BatchRunReportsRequest,
  ): Promise<[BatchRunReportsResponse, ...unknown[]]>;
};

export class GA4ApiError extends Error {
  readonly code?: string | number;

  constructor(message: string, code?: string | number) {
    super(message);
    this.name = "GA4ApiError";
    this.code = code;
  }
}

function required(environment: GA4Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new GA4ApiError(`Missing required ${name}.`);
  return value;
}

function dateValue(value: string, name: string): string {
  if (!DATE_VALUE.test(value)) {
    throw new GA4ApiError(
      `${name} must be today, yesterday, NdaysAgo, or YYYY-MM-DD.`,
    );
  }
  return value;
}

function normalizePrivateKey(value: string): string {
  const normalized = value.replaceAll("\\n", "\n");
  if (
    !normalized.includes("-----BEGIN PRIVATE KEY-----") ||
    !normalized.includes("-----END PRIVATE KEY-----")
  ) {
    throw new GA4ApiError("GA4_PRIVATE_KEY must be a PEM private key.");
  }
  return normalized;
}

export function hasAnyGA4Config(
  environment: GA4Environment = process.env,
): boolean {
  return ["GA4_PROPERTY_ID", "GA4_CLIENT_EMAIL", "GA4_PRIVATE_KEY"].some(
    (name) => Boolean(environment[name]?.trim()),
  );
}

export function readGA4ApiConfig(
  environment: GA4Environment = process.env,
): GA4ApiConfig {
  const propertyId = required(environment, "GA4_PROPERTY_ID");
  if (!/^\d+$/.test(propertyId)) {
    throw new GA4ApiError("GA4_PROPERTY_ID must contain digits only.");
  }

  const clientEmail = required(environment, "GA4_CLIENT_EMAIL");
  if (!clientEmail.endsWith(".iam.gserviceaccount.com")) {
    throw new GA4ApiError(
      "GA4_CLIENT_EMAIL must be a service-account email address.",
    );
  }

  return {
    propertyId,
    clientEmail,
    privateKey: normalizePrivateKey(required(environment, "GA4_PRIVATE_KEY")),
    startDate: dateValue(
      environment.GA4_START_DATE?.trim() || DEFAULT_START_DATE,
      "GA4_START_DATE",
    ),
    endDate: dateValue(
      environment.GA4_END_DATE?.trim() || DEFAULT_END_DATE,
      "GA4_END_DATE",
    ),
  };
}

function metricRequest(): NonNullable<RunReportRequest["metrics"]> {
  return [
    { name: "sessions" },
    { name: "totalUsers" },
    { name: "activeUsers" },
    { name: "keyEvents" },
    { name: "engagedSessions" },
    { name: "engagementRate" },
  ];
}

function report(
  config: GA4ApiConfig,
  dimensions: string[],
  metrics: NonNullable<RunReportRequest["metrics"]> = metricRequest(),
): RunReportRequest {
  return {
    dateRanges: [{ startDate: config.startDate, endDate: config.endDate }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics,
    ...(dimensions.length
      ? {
          orderBys: [
            {
              metric: { metricName: metrics[0]?.name ?? "sessions" },
              desc: true,
            },
          ],
        }
      : {}),
    limit: DEFAULT_ROW_LIMIT,
  };
}

function rows(response: RunReportResponse | null | undefined) {
  const dimensionNames = (response?.dimensionHeaders ?? []).map(
    (header) => header.name ?? "",
  );
  const metricNames = (response?.metricHeaders ?? []).map(
    (header) => header.name ?? "",
  );

  return (response?.rows ?? []).map((row) => {
    const values: Record<string, string> = {};
    dimensionNames.forEach((name, index) => {
      values[name] = row.dimensionValues?.[index]?.value ?? "";
    });
    metricNames.forEach((name, index) => {
      values[name] = row.metricValues?.[index]?.value ?? "0";
    });
    return values;
  });
}

function number(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metrics(row: Record<string, string>): GA4Metrics {
  return {
    sessions: number(row.sessions),
    totalUsers: number(row.totalUsers),
    activeUsers: number(row.activeUsers),
    keyEvents: number(row.keyEvents),
    engagedSessions: number(row.engagedSessions),
    engagementRate: number(row.engagementRate),
  };
}

function meaningful(value: string | undefined, fallback: string): string {
  return value && value !== "(not set)" ? value : fallback;
}

function optionalCampaignId(value: string | undefined): string | undefined {
  return value && /^\d+$/.test(value) ? value : undefined;
}

function errorCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number" ? code : undefined;
}

export async function fetchGA4Data(
  config = readGA4ApiConfig(),
  client?: GA4ReportClient,
): Promise<GA4Data> {
  const reportClient =
    client ??
    new BetaAnalyticsDataClient({
      credentials: {
        client_email: config.clientEmail,
        private_key: config.privateKey,
      },
    });

  const requests: RunReportRequest[] = [
    report(config, []),
    report(config, ["eventName"], [
      { name: "keyEvents" },
      { name: "totalUsers" },
    ]),
    report(config, [
      "landingPagePlusQueryString",
      "sessionSource",
      "sessionMedium",
      "sessionDefaultChannelGroup",
    ]),
    report(config, [
      "sessionSource",
      "sessionMedium",
      "sessionSourceMedium",
      "sessionCampaignName",
      "sessionGoogleAdsCampaignId",
      "sessionDefaultChannelGroup",
    ]),
    report(config, [
      "sessionGoogleAdsCampaignId",
      "sessionGoogleAdsCampaignName",
    ]),
  ];

  try {
    const [batch] = await reportClient.batchRunReports({
      property: `properties/${config.propertyId}`,
      requests,
    });
    const [
      summaryResponse,
      keyEventResponse,
      landingPageResponse,
      trafficResponse,
      googleAdsCampaignResponse,
    ] = batch.reports ?? [];
    if (
      !summaryResponse ||
      !keyEventResponse ||
      !landingPageResponse ||
      !trafficResponse ||
      !googleAdsCampaignResponse
    ) {
      throw new GA4ApiError(
        "Google Analytics Data API returned an incomplete report batch.",
      );
    }

    const summary = metrics(rows(summaryResponse)[0] ?? {});
    const keyEvents: GA4KeyEvent[] = rows(keyEventResponse)
      .map((row) => ({
        eventName: meaningful(row.eventName, "Unnamed key event"),
        keyEvents: number(row.keyEvents),
        totalUsers: number(row.totalUsers),
      }))
      .filter((row) => row.keyEvents > 0)
      .sort((left, right) => right.keyEvents - left.keyEvents);
    const landingPages: GA4LandingPage[] = rows(landingPageResponse)
      .map((row) => ({
        landingPage: meaningful(row.landingPagePlusQueryString, "(not set)"),
        source: meaningful(row.sessionSource, "Unknown"),
        medium: meaningful(row.sessionMedium, "Unknown"),
        channelGroup: meaningful(row.sessionDefaultChannelGroup, "Unassigned"),
        ...metrics(row),
      }))
      .sort((left, right) => right.sessions - left.sessions);
    const trafficSources: GA4TrafficSource[] = rows(trafficResponse)
      .map((row) => ({
        source: meaningful(row.sessionSource, "Unknown"),
        medium: meaningful(row.sessionMedium, "Unknown"),
        sourceMedium: meaningful(row.sessionSourceMedium, "Unknown / Unknown"),
        campaignName: meaningful(row.sessionCampaignName, "Unassigned"),
        ...(optionalCampaignId(row.sessionGoogleAdsCampaignId)
          ? { googleAdsCampaignId: row.sessionGoogleAdsCampaignId }
          : {}),
        channelGroup: meaningful(row.sessionDefaultChannelGroup, "Unassigned"),
        ...metrics(row),
      }))
      .sort((left, right) => right.sessions - left.sessions);
    const googleAdsCampaigns: GA4GoogleAdsCampaign[] = rows(
      googleAdsCampaignResponse,
    )
      .flatMap((row): GA4GoogleAdsCampaign[] => {
        const campaignId = optionalCampaignId(row.sessionGoogleAdsCampaignId);
        if (!campaignId) return [];
        return [
          {
            campaignId,
            campaignName: meaningful(
              row.sessionGoogleAdsCampaignName,
              "Unnamed Google Ads campaign",
            ),
            ...metrics(row),
          },
        ];
      })
      .sort((left, right) => right.sessions - left.sessions);

    return {
      propertyId: config.propertyId,
      dateRange: { startDate: config.startDate, endDate: config.endDate },
      summary,
      keyEvents,
      landingPages,
      trafficSources,
      googleAdsCampaigns,
    };
  } catch (error) {
    if (error instanceof GA4ApiError) throw error;
    const message = error instanceof Error ? error.message : "Unknown failure";
    throw new GA4ApiError(
      `Google Analytics Data API request failed: ${message}`,
      errorCode(error),
    );
  }
}
