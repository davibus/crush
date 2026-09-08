import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createClientEnvironment } from "../lib/clients.ts";
import { loadSearchConsoleDataForWorkspace } from "../lib/marketing-data-source.ts";
import {
  fetchSearchConsoleData,
  mapSearchConsoleRows,
  readSearchConsoleApiConfig,
  SEARCH_CONSOLE_READONLY_SCOPE,
  SearchConsoleApiError,
  type SearchConsoleApiConfig,
  type SearchConsoleApiResponse,
  type SearchConsoleHttpClient,
} from "../lib/search-console-api.ts";
import {
  projectSearchConsoleStatus,
  SEARCH_CONSOLE_SOURCE,
} from "../lib/search-console.ts";
import type { Workspace } from "../lib/tenant-repository.ts";

const privateKey = "-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----\n";
const config: SearchConsoleApiConfig = {
  propertyUrl: "sc-domain:tenant-a.example",
  clientEmail: "search-console@example.iam.gserviceaccount.com",
  privateKey,
  startDate: "2026-08-01",
  endDate: "2026-08-28",
  rowLimit: 100,
};
const apiRows: Record<string, SearchConsoleApiResponse> = {
  query: { rows: [{ keys: ["crush marketing"], clicks: 25, impressions: 1000, ctr: 0.025, position: 8.4 }] },
  page: { rows: [{ keys: ["https://tenant-a.example/organic"], clicks: 40, impressions: 1500, ctr: 0.0266666667, position: 6.2 }] },
  country: { rows: [{ keys: ["usa"], clicks: 50, impressions: 2000, ctr: 0.025, position: 7.1 }] },
  device: { rows: [{ keys: ["MOBILE"], clicks: 30, impressions: 1200, ctr: 0.025, position: 7.8 }] },
};
const requests: Parameters<SearchConsoleHttpClient["request"]>[0][] = [];
const client: SearchConsoleHttpClient = {
  async request<T>(options: Parameters<SearchConsoleHttpClient["request"]>[0]) {
    requests.push(options);
    const dimension = options.data.dimensions[0]!;
    return { data: apiRows[dimension] as T };
  },
};

const mapped = mapSearchConsoleRows(apiRows.query!, ["query"]);
assert.deepEqual(mapped[0], {
  query: "crush marketing",
  clicks: 25,
  impressions: 1000,
  ctr: 0.025,
  averagePosition: 8.4,
});

const data = await fetchSearchConsoleData(config, client, new Date("2026-09-01T12:00:00Z"));
assert.equal(data.source, SEARCH_CONSOLE_SOURCE);
assert.equal(data.sourceLabel, "Google Search Console");
assert.deepEqual(data.dateRange, { startDate: "2026-08-01", endDate: "2026-08-28" });
assert.deepEqual(data.reports.map(({ dimension }) => dimension), ["query", "page", "country", "device"]);
assert.equal(data.reports.find(({ dimension }) => dimension === "query")!.rows[0]!.query, "crush marketing");
assert.equal(data.reports.find(({ dimension }) => dimension === "page")!.rows[0]!.page, "https://tenant-a.example/organic");
assert.equal(data.reports[0]!.rows[0]!.ctr, 0.025, "Search Console CTR must remain the API ratio.");
assert.equal(data.reports[0]!.rows[0]!.averagePosition, 8.4, "Average position must preserve Search Console semantics.");
assert.equal(requests.length, 4);
assert.ok(requests.every(({ data: body }) => body.startDate === config.startDate && body.endDate === config.endDate));
assert.ok(requests.every(({ url }) => url.includes(encodeURIComponent(config.propertyUrl))));
assert.equal(SEARCH_CONSOLE_READONLY_SCOPE, "https://www.googleapis.com/auth/webmasters.readonly");

const parsed = readSearchConsoleApiConfig({
  SEARCH_CONSOLE_PROPERTY_URL: config.propertyUrl,
  SEARCH_CONSOLE_CLIENT_EMAIL: config.clientEmail,
  SEARCH_CONSOLE_PRIVATE_KEY: privateKey.replaceAll("\n", "\\n"),
  SEARCH_CONSOLE_START_DATE: config.startDate,
  SEARCH_CONSOLE_END_DATE: config.endDate,
  SEARCH_CONSOLE_ROW_LIMIT: "100",
});
assert.equal(parsed.propertyUrl, config.propertyUrl);
assert.throws(
  () => readSearchConsoleApiConfig({ ...parsed as unknown as NodeJS.ProcessEnv, SEARCH_CONSOLE_START_DATE: "2026-09-02", SEARCH_CONSOLE_END_DATE: "2026-09-01" }),
  SearchConsoleApiError,
);

const tenantA: Workspace = { id: "tenant-a", name: "Tenant A", status: "active", dataSource: "sample", searchConsolePropertyUrl: "sc-domain:tenant-a.example" };
const tenantB: Workspace = { id: "tenant-b", name: "Tenant B", status: "active", dataSource: "sample", searchConsolePropertyUrl: "sc-domain:tenant-b.example" };
const sharedEnvironment = {
  SEARCH_CONSOLE_PROPERTY_URL: "sc-domain:browser-override.example",
  SEARCH_CONSOLE_CLIENT_EMAIL: config.clientEmail,
  SEARCH_CONSOLE_PRIVATE_KEY: privateKey,
  SEARCH_CONSOLE_START_DATE: config.startDate,
  SEARCH_CONSOLE_END_DATE: config.endDate,
} as unknown as NodeJS.ProcessEnv;
const tenantAEnvironment = createClientEnvironment(tenantA, sharedEnvironment);
const tenantBEnvironment = createClientEnvironment(tenantB, sharedEnvironment);
assert.equal(tenantAEnvironment.SEARCH_CONSOLE_PROPERTY_URL, tenantA.searchConsolePropertyUrl);
assert.equal(tenantBEnvironment.SEARCH_CONSOLE_PROPERTY_URL, tenantB.searchConsolePropertyUrl);
assert.notEqual(tenantAEnvironment.SEARCH_CONSOLE_PROPERTY_URL, tenantBEnvironment.SEARCH_CONSOLE_PROPERTY_URL);
assert.notEqual(tenantAEnvironment.SEARCH_CONSOLE_PROPERTY_URL, sharedEnvironment.SEARCH_CONSOLE_PROPERTY_URL);

const loadedProperties: string[] = [];
for (const [workspace, environment] of [[tenantA, tenantAEnvironment], [tenantB, tenantBEnvironment]] as const) {
  const loaded = await loadSearchConsoleDataForWorkspace(
    workspace,
    environment,
    async (input = config) => {
      loadedProperties.push(input.propertyUrl);
      return { ...data, propertyUrl: input.propertyUrl };
    },
  );
  assert.equal(loaded.status, "available");
  assert.equal(loaded.status === "available" && loaded.data.propertyUrl, workspace.searchConsolePropertyUrl);
}
assert.deepEqual(loadedProperties, [tenantA.searchConsolePropertyUrl, tenantB.searchConsolePropertyUrl]);

const unconfigured = await loadSearchConsoleDataForWorkspace(
  { id: "unconfigured", name: "Unconfigured", status: "active", dataSource: "sample" },
  createClientEnvironment({ id: "unconfigured", name: "Unconfigured", status: "active", dataSource: "sample" }, sharedEnvironment),
);
assert.equal(unconfigured.status, "unconfigured");

const empty = await loadSearchConsoleDataForWorkspace(
  { ...tenantA, id: "empty" },
  tenantAEnvironment,
  async (input = config) => ({ ...data, propertyUrl: input.propertyUrl, reports: data.reports.map((report) => ({ ...report, rows: [] })) }),
);
assert.equal(empty.status, "empty");
const emptyProjection = projectSearchConsoleStatus(empty);
assert.equal(emptyProjection.rowCount, 0);
assert.equal(JSON.stringify(emptyProjection).includes(config.propertyUrl), false);
assert.equal(JSON.stringify(emptyProjection).includes("PRIVATE KEY"), false);

const failed = await loadSearchConsoleDataForWorkspace(
  { ...tenantA, id: "failure" },
  tenantAEnvironment,
  async () => { throw new SearchConsoleApiError("fixture secret must not reach UI", 403); },
);
assert.equal(failed.status, "error");
assert.equal(failed.status === "error" && failed.message.includes("fixture secret"), false);

const apiRoute = await readFile("app/api/ai/route.ts", "utf8");
assert.equal(/SEARCH_CONSOLE_PROPERTY_URL|propertyUrl/.test(apiRoute), false, "Browser routes must not accept Search Console property configuration.");
const component = await readFile("app/components/search-console-context-panel.tsx", "utf8");
assert.equal(component.includes("privateKey"), false);
assert.equal(component.includes("propertyUrl"), false);

console.log("Search Console verification passed: read-only scope, response mapping, query/page/country/device metrics, date propagation, workspace isolation, safe projections, and unconfigured/empty/error states.");
