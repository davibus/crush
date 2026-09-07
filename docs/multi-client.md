# Multi-client foundation

Crush Version 2 replaces the process-wide account selection with a server-controlled client workspace context. This phase is an isolation foundation, not a complete multi-tenant product: it intentionally has no authentication, database, invitations, billing, or account-writing capabilities.

## Architecture

`lib/clients.ts` is the server-only registry and trust boundary. A workspace contains a stable ID, display name, status, data-source mode, and optional Google Ads customer/login-customer and GA4 property identifiers. OAuth client secrets, refresh tokens, developer tokens, service-account private keys, and OpenAI keys are never fields on a workspace.

The browser receives only the selector projection (`id`, `name`, and `status`). A request may submit a workspace ID, but the server resolves that ID through the registry and derives all integration identifiers itself. Raw Google Ads customer IDs and GA4 property IDs from requests are never accepted.

The initial registry contains:

- `demo` — the default workspace and bundled sample-data experience
- `client-a` — a human-readable placeholder for a future client
- `client-b` — a second placeholder proving isolation

Names and per-client identifiers can be changed with environment variables. A live placeholder with no account/property ID is marked as needing configuration and safely falls back to the sample Google Ads dataset while GA4 remains unconfigured.

## Shared credentials and per-client identifiers

Google Ads OAuth credentials and the developer token are shared server settings: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, and `GOOGLE_ADS_DEVELOPER_TOKEN`. API version and reporting range are also shared.

Each workspace owns its target identifiers, for example `CLIENT_A_GOOGLE_ADS_CUSTOMER_ID`, `CLIENT_A_GOOGLE_ADS_LOGIN_CUSTOMER_ID`, and `CLIENT_A_GA4_PROPERTY_ID`. GA4's `GA4_CLIENT_EMAIL` and `GA4_PRIVATE_KEY` remain shared server-only service-account credentials. The service account must have read access to each configured property.

For V1 environment compatibility, legacy `GOOGLE_ADS_DATA_SOURCE`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, and `GA4_PROPERTY_ID` values apply only to `demo` when equivalent `DEMO_*` values are absent.

## Routing and requests

Dashboard workspaces live at `/clients/[clientId]`; `/` redirects to `/clients/demo`. Unknown route IDs render the Next.js not-found result. The selector navigates among known registry entries and does not display account IDs.

AI insights and chat send the active workspace ID to `/api/ai`. Daily Analysis and Weekly Reports use a validated `clientId` query parameter. Missing client IDs on the legacy API URLs continue to resolve to `demo`, while explicitly unknown IDs return `404`. Protected cron routes iterate active registry workspaces on the server.

## Cache isolation

The live Google Ads and GA4 in-memory caches are maps keyed with the workspace ID plus the relevant account/property identity and reporting configuration. Including the workspace ID is deliberate even when two workspaces happen to use the same upstream identifier. A cached result for one workspace therefore cannot be returned under another workspace's key.

## Storage isolation

Daily and weekly JSON output uses client-scoped local paths and private Blob keys:

```text
clients/{clientId}/daily-analysis/{YYYY-MM-DD}.json
clients/{clientId}/weekly-reports/{YYYY-MM-DD}.json
```

`DAILY_ANALYSIS_STORAGE_DIR` and `WEEKLY_REPORT_STORAGE_DIR` now represent optional storage roots; the client hierarchy is always appended. Existing unscoped V1 files are left untouched and are not automatically surfaced in a workspace, because tenant isolation takes priority over ambiguous legacy data. They can be migrated manually into the `demo` hierarchy if needed.

## Adding another client

1. Add a stable ID to `CLIENT_IDS` and a registry entry in `lib/clients.ts`.
2. Add name, data-source, Google Ads customer/login-customer, and GA4 property environment variables following the existing A/B pattern.
3. Keep credentials in the shared server-only variables; never add them to the workspace object or a `NEXT_PUBLIC_*` variable.
4. Run `npm run verify:clients`, the analysis/report verifiers, lint, and a production build.

## Current limitations and future migration

The registry is code/environment-backed, so every visitor can switch among every configured workspace. It is appropriate only for this unauthenticated foundation. There is no user-to-workspace authorization, durable tenant catalog, per-client secret vault, job queue, retention policy, or administrative UI.

A future phase should introduce authentication and a durable tenant database, enforce membership before registry resolution, store encrypted integration references rather than credentials in client records, and carry the same tenant ID through jobs, logs, caches, Blob paths, and database queries. The current explicit context and scoped-key design provides the boundary for that migration without changing the deterministic/evidence-grounded analysis model or enabling Google Ads mutations.
