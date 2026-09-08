export const SEARCH_CONSOLE_SOURCE = "google_search_console" as const;
export const SEARCH_CONSOLE_SOURCE_LABEL = "Google Search Console" as const;

export const SEARCH_CONSOLE_DIMENSIONS = [
  "query",
  "page",
  "country",
  "device",
] as const;

export type SearchConsoleDimension = (typeof SEARCH_CONSOLE_DIMENSIONS)[number];

export type SearchConsoleMetrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number;
};

export type SearchConsoleRow = SearchConsoleMetrics & {
  query?: string;
  page?: string;
  country?: string;
  device?: string;
};

export type SearchConsoleReport = {
  dimension: SearchConsoleDimension;
  rows: SearchConsoleRow[];
};

export type SearchConsoleRankDimension = "query" | "page" | "query_page";

export type SearchConsoleRankRow = SearchConsoleRow & {
  dimension: SearchConsoleRankDimension;
};

export type SearchConsoleRankTrackingData = {
  currentPeriod: { startDate: string; endDate: string };
  previousPeriod: { startDate: string; endDate: string };
  currentRows: SearchConsoleRankRow[];
  previousRows: SearchConsoleRankRow[];
};

export type SearchConsoleData = {
  source: typeof SEARCH_CONSOLE_SOURCE;
  sourceLabel: typeof SEARCH_CONSOLE_SOURCE_LABEL;
  propertyUrl: string;
  dateRange: { startDate: string; endDate: string };
  fetchedAt: string;
  reports: SearchConsoleReport[];
  rankTracking?: SearchConsoleRankTrackingData;
};

export type SearchConsoleDataState =
  | { status: "unconfigured" }
  | { status: "available"; data: SearchConsoleData }
  | { status: "empty"; data: SearchConsoleData }
  | { status: "error"; message: string };

export type SearchConsoleStatusProjection = {
  source: typeof SEARCH_CONSOLE_SOURCE;
  label: typeof SEARCH_CONSOLE_SOURCE_LABEL;
  status: SearchConsoleDataState["status"];
  dateRange: SearchConsoleData["dateRange"] | null;
  rowCount: number;
  dimensions: SearchConsoleDimension[];
};

export function projectSearchConsoleStatus(
  state: SearchConsoleDataState,
): SearchConsoleStatusProjection {
  if (state.status === "unconfigured" || state.status === "error") {
    return {
      source: SEARCH_CONSOLE_SOURCE,
      label: SEARCH_CONSOLE_SOURCE_LABEL,
      status: state.status,
      dateRange: null,
      rowCount: 0,
      dimensions: [],
    };
  }
  return {
    source: state.data.source,
    label: state.data.sourceLabel,
    status: state.status,
    dateRange: state.data.dateRange,
    rowCount: state.data.reports.reduce((total, report) => total + report.rows.length, 0),
    dimensions: state.data.reports.map((report) => report.dimension),
  };
}
