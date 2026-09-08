import "server-only";

import { GoogleAuth } from "google-auth-library";

import {
  SEARCH_CONSOLE_DIMENSIONS,
  SEARCH_CONSOLE_SOURCE,
  SEARCH_CONSOLE_SOURCE_LABEL,
  type SearchConsoleData,
  type SearchConsoleDimension,
  type SearchConsoleReport,
  type SearchConsoleRow,
} from "./search-console.ts";

export const SEARCH_CONSOLE_READONLY_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";

const API_ROOT = "https://searchconsole.googleapis.com/webmasters/v3";
const DEFAULT_ROW_LIMIT = 250;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type SearchConsoleEnvironment = Record<string, string | undefined>;

export type SearchConsoleApiConfig = {
  propertyUrl: string;
  clientEmail: string;
  privateKey: string;
  startDate: string;
  endDate: string;
  rowLimit: number;
};

export type SearchConsoleApiRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export type SearchConsoleApiResponse = { rows?: SearchConsoleApiRow[] };

export type SearchConsoleHttpClient = {
  request<T>(options: {
    url: string;
    method: "POST";
    data: {
      startDate: string;
      endDate: string;
      dimensions: SearchConsoleDimension[];
      rowLimit: number;
    };
  }): Promise<{ data: T }>;
};

export class SearchConsoleApiError extends Error {
  readonly code?: string | number;

  constructor(message: string, code?: string | number) {
    super(message);
    this.name = "SearchConsoleApiError";
    this.code = code;
  }
}

function required(environment: SearchConsoleEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new SearchConsoleApiError(`Missing required ${name}.`);
  return value;
}

function normalizePrivateKey(value: string): string {
  const normalized = value.replaceAll("\\n", "\n");
  if (!normalized.includes("-----BEGIN PRIVATE KEY-----") || !normalized.includes("-----END PRIVATE KEY-----")) {
    throw new SearchConsoleApiError("SEARCH_CONSOLE_PRIVATE_KEY must be a PEM private key.");
  }
  return normalized;
}

function validateDate(value: string, name: string): string {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new SearchConsoleApiError(`${name} must be an ISO date (YYYY-MM-DD).`);
  }
  return value;
}

function dateDaysAgo(days: number, now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days))
    .toISOString()
    .slice(0, 10);
}

export function hasAnySearchConsoleConfig(
  environment: SearchConsoleEnvironment = process.env,
): boolean {
  return ["SEARCH_CONSOLE_PROPERTY_URL", "SEARCH_CONSOLE_CLIENT_EMAIL", "SEARCH_CONSOLE_PRIVATE_KEY"]
    .some((name) => Boolean(environment[name]?.trim()));
}

export function readSearchConsoleApiConfig(
  environment: SearchConsoleEnvironment = process.env,
  now = new Date(),
): SearchConsoleApiConfig {
  const startDate = validateDate(
    environment.SEARCH_CONSOLE_START_DATE?.trim() || dateDaysAgo(30, now),
    "SEARCH_CONSOLE_START_DATE",
  );
  const endDate = validateDate(
    environment.SEARCH_CONSOLE_END_DATE?.trim() || dateDaysAgo(3, now),
    "SEARCH_CONSOLE_END_DATE",
  );
  if (startDate > endDate) {
    throw new SearchConsoleApiError("SEARCH_CONSOLE_START_DATE must not be after SEARCH_CONSOLE_END_DATE.");
  }
  const rowLimitValue = Number(environment.SEARCH_CONSOLE_ROW_LIMIT?.trim() || DEFAULT_ROW_LIMIT);
  if (!Number.isInteger(rowLimitValue) || rowLimitValue < 1 || rowLimitValue > 25_000) {
    throw new SearchConsoleApiError("SEARCH_CONSOLE_ROW_LIMIT must be an integer from 1 through 25000.");
  }
  return {
    propertyUrl: required(environment, "SEARCH_CONSOLE_PROPERTY_URL"),
    clientEmail: required(environment, "SEARCH_CONSOLE_CLIENT_EMAIL"),
    privateKey: normalizePrivateKey(required(environment, "SEARCH_CONSOLE_PRIVATE_KEY")),
    startDate,
    endDate,
    rowLimit: rowLimitValue,
  };
}

function finiteMetric(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function mapSearchConsoleRows(
  response: SearchConsoleApiResponse,
  dimensions: readonly SearchConsoleDimension[],
): SearchConsoleRow[] {
  return (response.rows ?? []).map((row) => {
    const dimensionValues = Object.fromEntries(
      dimensions.map((dimension, index) => [dimension, row.keys?.[index] ?? ""]),
    );
    return {
      ...dimensionValues,
      clicks: finiteMetric(row.clicks),
      impressions: finiteMetric(row.impressions),
      ctr: finiteMetric(row.ctr),
      averagePosition: finiteMetric(row.position),
    };
  });
}

function errorCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number" ? code : undefined;
}

export async function fetchSearchConsoleData(
  config = readSearchConsoleApiConfig(),
  suppliedClient?: SearchConsoleHttpClient,
  fetchedAt = new Date(),
): Promise<SearchConsoleData> {
  try {
    const client = suppliedClient ?? await new GoogleAuth({
      credentials: { client_email: config.clientEmail, private_key: config.privateKey },
      scopes: [SEARCH_CONSOLE_READONLY_SCOPE],
    }).getClient() as SearchConsoleHttpClient;

    const reports: SearchConsoleReport[] = [];
    for (const dimension of SEARCH_CONSOLE_DIMENSIONS) {
      const response = await client.request<SearchConsoleApiResponse>({
        url: `${API_ROOT}/sites/${encodeURIComponent(config.propertyUrl)}/searchAnalytics/query`,
        method: "POST",
        data: {
          startDate: config.startDate,
          endDate: config.endDate,
          dimensions: [dimension],
          rowLimit: config.rowLimit,
        },
      });
      reports.push({ dimension, rows: mapSearchConsoleRows(response.data, [dimension]) });
    }

    return {
      source: SEARCH_CONSOLE_SOURCE,
      sourceLabel: SEARCH_CONSOLE_SOURCE_LABEL,
      propertyUrl: config.propertyUrl,
      dateRange: { startDate: config.startDate, endDate: config.endDate },
      fetchedAt: fetchedAt.toISOString(),
      reports,
    };
  } catch (error) {
    if (error instanceof SearchConsoleApiError) throw error;
    const message = error instanceof Error ? error.message : "Unknown failure";
    throw new SearchConsoleApiError(`Google Search Console API request failed: ${message}`, errorCode(error));
  }
}
