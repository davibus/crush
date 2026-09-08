import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createClientEnvironment } from "../lib/clients.ts";
import { getDailyAnalysisStorageKey } from "../lib/daily-analysis-storage.ts";
import {
  DevelopmentTenantRepository,
  isDevelopmentTenantMode,
  toWorkspaceSummary,
  type Workspace,
} from "../lib/tenant-repository.ts";
import { getWeeklyReportStorageKey } from "../lib/weekly-report-storage.ts";
import {
  listAuthorizedWorkspaceSummaries,
  resolveWorkspaceForIdentity,
  resolveWorkspaceMembership,
} from "../lib/tenant-authorization.ts";
import { getWorkspaceCacheKey } from "../lib/workspace-id.ts";

const demo: Workspace = {
  id: "demo",
  name: "Demo",
  status: "active",
  dataSource: "sample",
};
const clientA: Workspace = {
  id: "client-a",
  name: "Client A",
  status: "active",
  dataSource: "live",
  googleAdsCustomerId: "123-456-7890",
  googleAdsLoginCustomerId: "999-999-9999",
  ga4PropertyId: "123456789",
  searchConsolePropertyUrl: "sc-domain:client-a.example",
  integrationSecretRef: "env:CLIENT_A_INTEGRATIONS",
};
const repository = new DevelopmentTenantRepository(
  [demo, clientA],
  new Map([
    ["member", ["demo"]],
    ["other-member", ["client-a"]],
  ]),
);

assert.equal(
  isDevelopmentTenantMode({ NODE_ENV: "development", AUTH_ALLOW_DEV_LOGIN: "true" } as NodeJS.ProcessEnv),
  true,
);
assert.equal(
  isDevelopmentTenantMode({ NODE_ENV: "production", AUTH_ALLOW_DEV_LOGIN: "true" } as NodeJS.ProcessEnv),
  false,
  "The local identity must fail closed in production.",
);
assert.equal(
  isDevelopmentTenantMode({
    NODE_ENV: "development",
    AUTH_ALLOW_DEV_LOGIN: "true",
    DATABASE_URL: "postgresql://configured",
  } as NodeJS.ProcessEnv),
  false,
  "The fixture repository must not replace a configured durable database.",
);

assert.deepEqual(
  await resolveWorkspaceMembership("member", "demo", repository),
  demo,
  "An authenticated member must resolve their workspace.",
);
assert.equal(
  await resolveWorkspaceMembership("member", "client-a", repository),
  null,
  "A member must not resolve another tenant.",
);
assert.equal(
  await resolveWorkspaceMembership("member", "unknown", repository),
  null,
  "Unknown workspaces must be rejected.",
);

const authorizedApi = await resolveWorkspaceForIdentity({ id: "member" }, "demo", repository);
assert.equal(authorizedApi.ok, true);

const bypassAttempt = await resolveWorkspaceForIdentity({ id: "member" }, "client-a", repository);
assert.equal(bypassAttempt.ok, false);
assert.equal(bypassAttempt.ok ? 200 : bypassAttempt.response.status, 404);

const unknownAttempt = await resolveWorkspaceForIdentity({ id: "member" }, "unknown", repository);
assert.equal(unknownAttempt.ok, false);
assert.equal(unknownAttempt.ok ? 200 : unknownAttempt.response.status, 404);
assert.deepEqual(
  bypassAttempt.ok ? null : await bypassAttempt.response.clone().json(),
  unknownAttempt.ok ? null : await unknownAttempt.response.clone().json(),
  "Unknown and unauthorized tenant responses must not reveal whether a workspace exists.",
);

const unauthenticatedApi = await resolveWorkspaceForIdentity(null, "demo", repository);
assert.equal(unauthenticatedApi.ok, false);
assert.equal(unauthenticatedApi.ok ? 200 : unauthenticatedApi.response.status, 401);

assert.deepEqual(
  await listAuthorizedWorkspaceSummaries("member", repository),
  [toWorkspaceSummary(demo)],
  "The selector DTO must include only the signed-in user's memberships.",
);

const selectorPayload = JSON.stringify(await listAuthorizedWorkspaceSummaries("other-member", repository));
for (const privateValue of [
  clientA.googleAdsCustomerId,
  clientA.googleAdsLoginCustomerId,
  clientA.ga4PropertyId,
  clientA.searchConsolePropertyUrl,
  clientA.integrationSecretRef,
]) {
  assert.equal(selectorPayload.includes(privateValue!), false);
}

assert.notEqual(
  getWorkspaceCacheKey("demo", "google-ads", ["same-account"]),
  getWorkspaceCacheKey("client-a", "google-ads", ["same-account"]),
  "Google Ads cache keys must be tenant scoped.",
);
assert.notEqual(
  getWorkspaceCacheKey("demo", "ga4", ["same-property"]),
  getWorkspaceCacheKey("client-a", "ga4", ["same-property"]),
  "GA4 cache keys must be tenant scoped.",
);
assert.notEqual(
  getWorkspaceCacheKey("demo", "search-console", ["same-property"]),
  getWorkspaceCacheKey("client-a", "search-console", ["same-property"]),
  "Search Console cache keys must be tenant scoped.",
);
assert.equal(
  getDailyAnalysisStorageKey("client-a", "2026-09-06"),
  "clients/client-a/daily-analysis/2026-09-06.json",
);
assert.notEqual(
  getDailyAnalysisStorageKey("demo", "2026-09-06"),
  getDailyAnalysisStorageKey("client-a", "2026-09-06"),
);
assert.equal(
  getWeeklyReportStorageKey("client-a", "2026-09-06"),
  "clients/client-a/weekly-reports/2026-09-06.json",
);
assert.notEqual(
  getWeeklyReportStorageKey("demo", "2026-09-06"),
  getWeeklyReportStorageKey("client-a", "2026-09-06"),
);
assert.throws(
  () => getDailyAnalysisStorageKey("../other-tenant", "2026-09-06"),
  /Invalid workspace ID/,
  "Workspace IDs must not permit storage-path traversal.",
);

const secretEnvironment = {
  NODE_ENV: "test",
  GOOGLE_ADS_CLIENT_SECRET: "google-secret-sentinel",
  GOOGLE_ADS_REFRESH_TOKEN: "refresh-token-sentinel",
  GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token-sentinel",
  GA4_PRIVATE_KEY: "private-key-sentinel",
  SEARCH_CONSOLE_CLIENT_EMAIL: "search-console@example.iam.gserviceaccount.com",
  SEARCH_CONSOLE_PRIVATE_KEY: "search-console-private-key-sentinel",
} as NodeJS.ProcessEnv;
const derivedEnvironment = createClientEnvironment(clientA, secretEnvironment);
assert.equal(derivedEnvironment.GOOGLE_ADS_CLIENT_SECRET, "google-secret-sentinel");
assert.equal(derivedEnvironment.GA4_PRIVATE_KEY, "private-key-sentinel");
assert.equal(derivedEnvironment.SEARCH_CONSOLE_PROPERTY_URL, clientA.searchConsolePropertyUrl);
assert.equal(derivedEnvironment.SEARCH_CONSOLE_PRIVATE_KEY, "search-console-private-key-sentinel");
assert.equal(selectorPayload.includes("secret-sentinel"), false);

assert.equal(demo.dataSource, "sample");

for (const route of [
  "app/api/ai/route.ts",
  "app/api/analysis/daily/route.ts",
  "app/api/reports/weekly/route.ts",
]) {
  assert.match(
    await readFile(route, "utf8"),
    /resolveApiWorkspace/,
    `${route} must authorize its browser-supplied clientId through the central DAL.`,
  );
}

console.log(
  "Tenant verification passed: page/API membership enforcement, indistinguishable missing/non-member responses, authorized selector DTOs, cache and storage isolation, secret-safe projections, path validation, and demo sample data.",
);
