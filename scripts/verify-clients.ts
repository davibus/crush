import assert from "node:assert/strict";

import {
  createClientEnvironment,
  getClientById,
  getClientCacheKey,
  getClientSummaries,
  getClients,
  getDefaultClient,
  requireClientById,
} from "../lib/clients.ts";
import { getDailyAnalysisStorageKey } from "../lib/daily-analysis-storage.ts";
import {
  comparePeriodSummaries,
  detectMaterialChanges,
  type MarketingPeriodSummary,
} from "../lib/daily-analysis.ts";
import { getWeeklyReportStorageKey } from "../lib/weekly-report-storage.ts";

const emptyEnvironment = {} as NodeJS.ProcessEnv;
assert.equal(getClientById("unknown", emptyEnvironment), undefined);
assert.throws(() => requireClientById("unknown", emptyEnvironment), /Unknown client workspace/);

const demo = getDefaultClient(emptyEnvironment);
assert.equal(demo.id, "demo");
assert.equal(demo.dataSource, "sample");
assert.equal(demo.status, "active");

const identity = ["1234567890", "direct", "v22", "LAST_30_DAYS"];
assert.notEqual(
  getClientCacheKey("client-a", "google-ads", identity),
  getClientCacheKey("client-b", "google-ads", identity),
  "Cache keys must remain client-scoped even if two registry entries point to the same account.",
);
assert.notEqual(
  getDailyAnalysisStorageKey("client-a", "2026-09-06"),
  getDailyAnalysisStorageKey("client-b", "2026-09-06"),
);
assert.notEqual(
  getWeeklyReportStorageKey("client-a", "2026-09-06"),
  getWeeklyReportStorageKey("client-b", "2026-09-06"),
);

const secretEnvironment = {
  NODE_ENV: "test",
  GOOGLE_ADS_CLIENT_SECRET: "client-secret-sentinel",
  GOOGLE_ADS_REFRESH_TOKEN: "refresh-token-sentinel",
  GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token-sentinel",
  GA4_PRIVATE_KEY: "private-key-sentinel",
  CLIENT_A_GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
  CLIENT_A_GA4_PROPERTY_ID: "123456789",
} as NodeJS.ProcessEnv;
const serializedRegistry = JSON.stringify(getClients(secretEnvironment));
for (const secret of [
  "client-secret-sentinel",
  "refresh-token-sentinel",
  "developer-token-sentinel",
  "private-key-sentinel",
]) {
  assert.equal(serializedRegistry.includes(secret), false);
}
assert.deepEqual(
  Object.keys(getClientSummaries(secretEnvironment)[0] ?? {}).sort(),
  ["id", "name", "status"],
  "The browser-facing selector projection must not include account identifiers or credentials.",
);
const clientEnvironment = createClientEnvironment(
  requireClientById("client-a", secretEnvironment),
  secretEnvironment,
);
assert.equal(clientEnvironment.GOOGLE_ADS_CUSTOMER_ID, "123-456-7890");
assert.equal(clientEnvironment.GA4_PROPERTY_ID, "123456789");

const current: MarketingPeriodSummary = {
  dateRange: { startDate: "2026-09-06", endDate: "2026-09-06" },
  googleAds: {
    spend: 150,
    impressions: 2_000,
    clicks: 100,
    ctr: 5,
    cpc: 1.5,
    conversions: 15,
    conversionRate: 15,
    cpa: 10,
    conversionValue: 600,
    roas: 4,
  },
  ga4: null,
};
const previous: MarketingPeriodSummary = {
  ...current,
  dateRange: { startDate: "2026-09-05", endDate: "2026-09-05" },
  googleAds: { ...current.googleAds!, spend: 100, conversions: 10 },
};
const comparison = comparePeriodSummaries(current, previous);
const firstRun = detectMaterialChanges(comparison, "yesterday");
const secondRun = detectMaterialChanges(comparison, "yesterday");
assert.deepEqual(firstRun, secondRun);
assert.ok(firstRun.length > 0, "Deterministic analysis must still detect supported material changes.");

console.log(
  "Multi-client verification passed: registry validation, demo defaults, client-scoped cache and storage keys, secret-safe browser projection, server-derived identifiers, and deterministic analysis behavior.",
);
