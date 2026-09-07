# Agency dashboard

`/agency` is Crush's authenticated, read-only prioritization view for the client workspaces a user is authorized to access. It helps an agency operator decide which existing workspace to inspect first; it does not reproduce the full client dashboard and does not grant permission to change an advertising account.

## Architecture and authorization

The page is a Next.js Server Component. It requires an Auth.js session, passes the authenticated user ID to `getAgencyPortfolioForUser`, and obtains its workspace inputs exclusively from `TenantRepository.listWorkspacesForUser`. Query strings, form fields, and other browser-supplied workspace IDs do not participate in portfolio membership selection.

For each returned workspace, the server loads the existing marketing-data projection, deterministic account score, latest daily-analysis record, and latest weekly-report record. The work is keyed with the repository-returned workspace ID. The browser-safe summary contains only the workspace ID and display name, lifecycle and source states, KPI values, score, run dates/statuses, and a tenant-scoped `/clients/{workspaceId}` link. Integration account IDs, `secret_ref`, OAuth material, keys, tokens, and database settings are not part of this DTO.

The `/clients/[clientId]` route still performs its own membership check. A portfolio link is navigation, not authorization, and unknown and inaccessible workspace IDs remain indistinguishable there and in protected APIs.

## Deterministic summary rules

- Spend and conversions use the existing aggregate Google Ads calculation.
- CPA is unavailable when conversions are zero; ROAS is unavailable when spend is zero.
- The marketing account score reuses the existing deterministic account-audit and score methodology. No LLM calculates or ranks portfolio KPIs.
- A requested live source that falls back to sample data is labeled `Live source issue`; it is never presented as live performance.
- GA4 is reduced to connected, not connected, connection issue, or unavailable. Private property and credential details remain server-only.
- Daily analysis is current through two calendar days after its analysis date. A weekly report is current through ten calendar days after its period end. Never-run, stale, and storage-unavailable states are explicit.
- Failure to load one workspace's data or saved-run history becomes an unavailable state for that workspace; it does not borrow another tenant's state.

## Health and ordering

Health is deliberately simple and deterministic:

1. **No data**: there are no campaign rows or no account score can be calculated.
2. **Critical**: usable data exists and the live source failed/fell back, or the account score is below 50.
3. **Needs attention**: the score is 50–74.
4. **Healthy**: the score is 75–100 with no source failure.

The default order is Critical, Needs attention, No data, then Healthy. Within the same state, scored workspaces sort by ascending score; otherwise display name and workspace ID provide stable tie-breakers. A missing score is never compared numerically with an available score, and KPIs are not aggregated across currencies or reporting windows.

Analysis/report freshness is displayed for operational context but does not change account health. AI-authored analysis or report text is not used for classification, so the dashboard does not imply causes that its deterministic signals cannot support.

## Development fixtures

Local development continues to use the existing `demo`, `client-a`, and `client-b` fixtures only when the guarded development-login mode is enabled and PostgreSQL is absent. The fixtures can demonstrate multiple portfolio rows without onboarding real clients. Production migration behavior is unchanged: only the fictional sample `demo` workspace is seeded, and memberships still must be granted explicitly.

An authenticated user with no memberships receives a neutral empty portfolio. Invitations, workspace creation, onboarding, billing, secret management, advertising mutations, and autonomous actions remain intentionally out of scope.

## Verification

Run `npm.cmd run verify:agency-dashboard` for portfolio authorization, isolation, ordering, health, missing-data, KPI/score, safe-output, link, stored-state, and empty-state checks. Run `npm.cmd run verify:tenancy` alongside it for the underlying tenant boundary.

## Known limitations

The view uses each workspace's configured reporting window and does not normalize currencies or periods into a cross-client total. Source freshness is represented through current request state and saved daily/weekly run dates; upstream APIs do not currently provide a unified last-sync timestamp. The portfolio is intentionally view-only.
