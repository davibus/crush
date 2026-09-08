# Google Search Console read-only integration

Crush loads Search Analytics data on the server for the property assigned to the
authenticated workspace. The integration is optional and independent of Google
Ads and GA4: unconfigured, empty, or failed Search Console data produces an
explicit status and does not interrupt either existing source.

## Google API and credentials

1. Enable the Google Search Console API in a Google Cloud project.
2. Create a service account and JSON key.
3. Add the service-account email as a user of each intended Search Console
   property with permission to read its performance data.
4. Set `SEARCH_CONSOLE_CLIENT_EMAIL` and `SEARCH_CONSOLE_PRIVATE_KEY` only in
   the server environment. Never use `NEXT_PUBLIC_` variables.

The adapter uses Google OAuth 2 service-account authentication with only
`https://www.googleapis.com/auth/webmasters.readonly`. It calls only the Search
Analytics query endpoint to retrieve reports; it exposes no Search Console
mutation or property-management operation.

## Workspace property configuration

For PostgreSQL deployments, store the property URL as `external_account_id` in
the existing workspace integration table:

```sql
INSERT INTO workspace_integrations (workspace_id, provider, external_account_id)
VALUES ('demo', 'search_console', 'sc-domain:example.com')
ON CONFLICT (workspace_id, provider)
DO UPDATE SET external_account_id = EXCLUDED.external_account_id, updated_at = NOW();
```

Run `npm.cmd run db:migrate` to enable the `search_console` provider value. For
the local fixture repository, set `DEMO_SEARCH_CONSOLE_PROPERTY_URL`,
`CLIENT_A_SEARCH_CONSOLE_PROPERTY_URL`, or `CLIENT_B_SEARCH_CONSOLE_PROPERTY_URL`.
The value must exactly match the domain or URL-prefix property in Search Console.

The browser supplies a workspace ID, never a property URL. Server-side
membership resolution returns the canonical workspace, and only its configured
property reaches the adapter. Cache keys include the workspace ID and property.
Selector and Search Console status projections omit property configuration,
secret references, private keys, and credentials.

## Reports and source status

Crush requests separate query, page, country, and device reports. Every row
keeps the Search Console meanings of clicks, impressions, CTR (a ratio from 0 to
1), and average position. Average position is an aggregate Search Console
metric, not guaranteed literal rank. Search Console metrics are never converted
to or merged with GA4 sessions, users, engagement, or key events.

Set `SEARCH_CONSOLE_START_DATE` and `SEARCH_CONSOLE_END_DATE` to explicit
`YYYY-MM-DD` dates when a fixed period is required. Otherwise Crush sends
concrete dates covering 30 days ago through 3 days ago. This avoids the least
complete recent days, but Search Console can still revise data and commonly has
reporting latency. `SEARCH_CONSOLE_ROW_LIMIT` controls maximum rows per report
and defaults to 250.

Statuses are:

- `available`: the configured property returned at least one row;
- `empty`: the request succeeded but every dimension report contained no rows;
- `unconfigured`: that workspace has no complete property/credential setup; and
- `error`: authorization, configuration, quota, or API loading failed.

Technical failure details remain in server logs. Client-facing status text is
generic and does not expose secrets.

## Current limitations

Search Analytics applies Google's aggregation, anonymization, retention, quota,
and row-limit behavior. Crush does not paginate beyond the configured row limit,
request search-appearance/date dimensions, inspect URLs, crawl pages, track
literal ranks, analyze backlinks or competitors, or write to Search Console.
The SEO specialist and automated daily/weekly/PDF analyses do not consume Search
Console yet; this issue adds the isolated source adapter and status/context only.

Run `npm.cmd run verify:search-console` for deterministic adapter, provenance,
status, security, date, and workspace-isolation coverage.
