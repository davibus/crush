# Authenticated multi-tenant architecture

Crush treats the workspace ID as tenant context, but never as proof of access. A browser may request `/clients/demo` or submit `clientId=demo`; the server resolves the signed-in user and confirms a database membership before it loads integrations, caches, analysis, chat data, or reports.

## Authentication

Crush uses Auth.js v5 rather than a custom password system. Production uses GitHub OAuth, encrypted HTTP-only Auth.js JWT sessions, and the official PostgreSQL adapter for durable users and provider accounts. The Auth.js handler is `/api/auth/[...nextauth]`; Next.js 16 `proxy.ts` performs an optimistic session check for `/agency/*` and `/clients/*`, while pages and the data-access layer repeat secure checks close to the data.

For a zero-real-client local demo, set `AUTH_ALLOW_DEV_LOGIN=true` without `DATABASE_URL`. Auth.js then exposes a one-click `development` identity and the tenant repository uses development fixtures. Both conditions are enforced in code and `NODE_ENV=production` always disables this path. This is a convenience for local development and portfolio demonstrations, not a production authentication method.

## Database model

`migrations/001_authenticated_tenants.sql` creates:

- Auth.js `users`, `accounts`, `sessions`, and `verification_token` tables.
- `workspaces`, with a stable, URL/path-safe text ID, display name, and lifecycle status.
- `workspace_memberships`, keyed by user and workspace with an extensible `owner`, `member`, or `viewer` role.
- `workspace_integrations`, keyed by workspace and provider. It stores safe upstream account/property identifiers, non-secret configuration, and an optional secret reference.

The migration seeds only the `demo` workspace with sample Google Ads configuration. `client-a` and `client-b` remain local development/test fixtures because they were V2 #1 isolation examples, not real tenants. They are deliberately not inserted into production data.

Run the migration with:

```powershell
npm.cmd run db:migrate
```

## Authorization flow

The central boundaries are:

- `lib/tenant-repository.ts`: database-independent repository interface plus PostgreSQL and development implementations.
- `lib/tenant-authorization.ts`: membership resolution and safe selector projection.
- `lib/workspace-access.ts`: Auth.js session resolution for Next.js pages and Route Handlers.
- `lib/clients.ts`: integration-environment compatibility helpers and development fixtures; it is no longer the production membership source of truth.

For a page request, the server reads the Auth.js session, queries `workspace_memberships` joined to `workspaces`, and renders only after a matching row exists. Both an unknown ID and another tenant's ID produce the same not-found result.

For `/api/ai`, `/api/analysis/daily`, and `/api/reports/weekly`, `resolveApiWorkspace` returns `401` when no valid session exists, `400` when `clientId` is missing, and the same `404` body for unknown and non-member workspaces. Only the repository-returned canonical workspace is passed downstream. Cron endpoints retain their timing-safe `CRON_SECRET` check and enumerate active workspaces directly from the tenant repository.

The selector receives only `{ id, name, status }` for the current user's memberships. Account IDs, secret references, credentials, tokens, and keys are not serialized to it.

## Integration and tenant propagation

Google Ads customer/login-customer IDs, GA4 property IDs, and Search Console property URLs are safe server-side routing configuration in `workspace_integrations`. Search Console uses the `search_console` provider row. `secret_ref` is reserved for a future environment/managed-secret resolver. Raw Google Ads OAuth credentials, developer tokens, GA4/Search Console service-account credentials, OpenAI keys, Blob tokens, Auth.js secrets, and database credentials stay in server-only environment variables. They must never use a `NEXT_PUBLIC_` prefix.

The adapters remain read-only. `createClientEnvironment` derives each adapter environment on the server. Search Console requests only `https://www.googleapis.com/auth/webmasters.readonly`; no Google Ads or Search Console mutation capability is enabled.

The repository-returned workspace ID continues through Google Ads, GA4, Search Console status/context, AI insights, specialist chat, audits, daily analysis, weekly reports, and cron runners. Process-local Google Ads, GA4, and Search Console caches include the workspace ID even when upstream identifiers match. Search Console remains separate from specialist workflows in this issue. File and private-Blob persistence remains:

```text
clients/{clientId}/daily-analysis/{YYYY-MM-DD}.json
clients/{clientId}/weekly-reports/{YYYY-MM-DD}.json
```

Workspace IDs are validated before they become cache or storage path segments.

## Production setup

1. Provision PostgreSQL and set `DATABASE_URL`. TLS verification is the default; set `DATABASE_SSL=disable` only for a trusted local database.
2. Generate `AUTH_SECRET` with `npx auth secret`. On a trusted non-Vercel reverse proxy, also set `AUTH_TRUST_HOST=true`; Vercel and the Next development server are trusted automatically.
3. Create a GitHub OAuth app and set `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`. Use `/api/auth/callback/github` on the deployed origin as the callback URL.
4. Run `npm.cmd run db:migrate`.
5. Sign in once so Auth.js creates the user, then grant membership with `npm.cmd run db:grant -- user@example.com demo`.
6. Configure the existing server-only Google Ads, GA4, Search Console, OpenAI, Blob, and cron variables as needed. See [Search Console setup](search-console-setup.md).

An authenticated user with no memberships sees a neutral empty state on the agency dashboard. Creating invitations or an admin membership UI is intentionally deferred.

## Adding a future client

Choose a stable lowercase ID containing only letters, numbers, and internal hyphens. Insert a `workspaces` row, insert safe `workspace_integrations` rows, and add explicit `workspace_memberships`. Store only an environment/secret-manager reference in `secret_ref`; do not place raw refresh tokens, private keys, or API keys in workspace configuration. Once a future secret resolver supports that reference, the existing server-side adapter environment boundary can select tenant-specific credentials without exposing them to the browser.

Do not add a client by editing the selector or accepting an ID from a browser. The selector is derived from memberships and every API independently authorizes the request.

## Intentionally deferred

Billing, subscriptions, invitations, self-service tenant administration, a full secret-management platform, additional integrations, additional real clients, Google Ads writes, and autonomous actions remain out of scope. PostgreSQL migrations are intentionally SQL-first for this small learning project; a larger migration framework can be adopted when schema churn warrants it.

## Verification

Run `npm.cmd run verify:tenancy` for focused tenant checks and `npm.cmd run verify:agency-dashboard` for membership-only portfolio aggregation, ordering, health, safe projections, and stored-state isolation. Then run the existing verification scripts, lint, build, and `git diff --check`. The tenant verification covers membership allow/deny behavior, indistinguishable unknown/non-member responses, API ID bypass attempts, selector projection, cache isolation, report path isolation, secret projection, path traversal rejection, and demo sample configuration.
