# PDF marketing reports

Crush can generate a client-ready PDF for one authorized workspace on demand. The export combines the current Google Ads reporting window with the existing deterministic account score and audit, plus the latest saved Daily Analysis, latest saved Weekly Marketing Report, and GA4 site context when those sources are available.

## Contents

The report includes Crush branding, the workspace display name, reporting period and generation time, explicit source status, a Google Ads KPI summary, account score, campaign highlights, saved analysis and report insights, prioritized recommendations, GA4 context, and neutral missing-data notes. The KPI summary covers spend, clicks, impressions, CTR, CPC, conversions, conversion rate, CPA, conversion value, and ROAS.

Crush reuses its existing metric aggregation, account-audit, account-score, Daily Analysis, Weekly Report, and structured insight results. PDF generation does not ask an AI model to calculate or rewrite metrics. Undefined ratios caused by zero impressions, clicks, conversions, or spend are labeled unavailable; valid zero totals remain zero.

## Generate and download

1. Sign in and open an authorized workspace at `/clients/[clientId]`.
2. Go to **Reporting**.
3. Select **Download PDF report**.
4. Keep the page open while the button shows **Generating PDF...**. The browser downloads the PDF when generation finishes and displays an inline error if it fails.

The UI calls `GET /api/clients/[clientId]/reports/pdf`. The response is generated at request time with `Content-Type: application/pdf`, an attachment filename derived from the workspace name and reporting period, and private no-store caching. PDFs are not persisted.

## Authorization and isolation

The path workspace ID is request context, not proof of access. The Route Handler resolves the current Auth.js identity through the tenant authorization layer and uses only the canonical workspace returned by the membership query. No marketing source, integration identifier, or storage key is accepted from browser input. Unauthenticated requests return `401`; both unknown and non-member workspaces return the same `404` response.

Only after authorization succeeds does Crush load marketing data and workspace-keyed Daily Analysis and Weekly Report storage. The browser receives only the finished PDF. Google Ads account/customer IDs, GA4 property IDs, secret references, tokens, environment variables, and database details are excluded from the report model and PDF. Filenames contain only lowercase ASCII letters, digits, hyphens, and the fixed `.pdf` suffix.

## Sample and missing-data behavior

- Sample Google Ads mode is prominently labeled as illustrative demo data.
- If a requested live Google Ads connection falls back, the report identifies the demo fallback without exposing technical diagnostics.
- Missing or unavailable GA4 is shown as a neutral status and does not block paid-media reporting.
- Missing Daily Analysis or Weekly Report produces an explanatory note rather than fabricated insights.
- Empty campaigns, zero spend, zero conversions, and undefined ratios render neutral states without crashing.

## Current limitations

Reports are on-demand, single-workspace snapshots. Crush does not store generated PDFs, aggregate clients, provide a general report builder, schedule PDF email delivery, manage subscriptions, or expose tenant administration from this feature. The export uses standard embedded PDF typography and a fixed client-report layout rather than custom uploaded brand themes.

## Verification

Run `npm.cmd run verify:pdf-report`. It covers authorization outcomes, indistinguishable unknown/non-member responses, requested-workspace-only data loading, demo data, missing saved reports and GA4, zero conversions and spend, non-empty PDF bytes, response headers, filename sanitization, and secret-safe DTO/output checks.
