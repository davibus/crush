# Crush

**Crush is an AI marketing command center that turns Google Ads performance and optional GA4 context into explainable decisions.** It combines a decision-focused dashboard, deterministic account auditing, recurring analysis, grounded AI insights, and conversational specialist workflows in one Next.js application.

[Case study](docs/case-study.md) · [2–3 minute demo script](docs/demo-script.md) · [Portfolio/resume copy](docs/portfolio-entry.md) · [GitHub repository](https://github.com/davibus/crush)

**Live demo:** TODO — deploy the application and add the verified public URL.

**Demo video:** TODO — record and publish the walkthrough using the [demo script](docs/demo-script.md).

<!-- After capture, insert: ![Crush AI Marketing Command Center dashboard](docs/screenshots/01-dashboard-overview.png) -->

## Why I built it

I built Crush as a personal learning and portfolio project to combine my hands-on digital marketing experience with AI-assisted modern application development. Marketing teams have plenty of metrics; the harder work is deciding which changes matter, keeping Google Ads and GA4 measurement boundaries clear, and turning evidence into an action a reviewer can trust.

Crush explores a deterministic-first answer: application code owns calculations, thresholds, evidence, and limitations. OpenAI is used only in bounded structured workflows where prioritization adds value, and unsupported model output is rejected.

> Crush is not presented as a client deployment. The included Northstar Outdoor Co. account is fictional, and this repository makes no claims about customers, revenue lift, cost savings, or production adoption.

## Major capabilities

- account KPIs, daily trends, campaign comparisons, and geographic performance
- optional GA4 sessions, users, key events, traffic sources, and landing-page context
- completed-period daily analysis and evidence-linked weekly reporting
- a deterministic nine-category Google Ads account audit
- OpenAI structured-output recommendations checked against precomputed candidates
- grounded Ask Your Marketing Data calculations and bounded conversation history
- typed PPC, Analytics, CRO, SEO, and Marketing Strategist workflows
- read-only live Google Ads and GA4 adapters with server-only credentials
- local JSON or private Vercel Blob persistence plus secret-protected cron routes

## Screenshot and demo

The dashboard is useful on first open without credentials. By default, it loads the included fictional **Northstar Outdoor Co.** account and visibly labels the experience as **Demo data**. Metrics, charts, the account audit, Ask Your Marketing Data, and specialist workflows work without Google or OpenAI credentials.

- [View the full project case study](docs/case-study.md)
- [Follow the recording-ready 2–3 minute demo script](docs/demo-script.md)
- [Capture the eight recommended product screenshots](docs/screenshots/README.md)
- [Browse the source repository](https://github.com/davibus/crush)

For a production-like setup, Google Ads can switch to read-only live reporting with `GOOGLE_ADS_DATA_SOURCE=live`, while GA4 connects independently. If a live Google Ads request fails, the UI identifies the fallback and continues with demo data; technical diagnostics stay in server logs. AI Insights and optional daily/weekly prioritization explain when OpenAI is unavailable instead of blocking the deterministic product.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The application uses the included sample Google Ads dataset by default, so no external account is required for local development.

## Live Google Ads data

Crush can replace the sample dataset with read-only Google Ads API reporting while keeping the same dashboard, audit, chat, and insight pipelines.

1. Create a Google Cloud OAuth client, enable the Google Ads API, and obtain a refresh token authorized with the `https://www.googleapis.com/auth/adwords` scope.
2. Request or use a Google Ads developer token. If the selected account is reached through a manager account, note that manager customer ID as well.
3. Copy `.env.example` to `.env.local`, fill in the server-only values, and leave every credential without a `NEXT_PUBLIC_` prefix.
4. Set `GOOGLE_ADS_DATA_SOURCE=live`, then restart the development server.

Customer IDs may contain dashes in the environment file; Crush normalizes and validates them before sending requests. `GOOGLE_ADS_LOGIN_CUSTOMER_ID` is optional and should identify the manager account, not the client account. The reporting window defaults to `LAST_30_DAYS` and supports the values documented in `.env.example`.

`GOOGLE_ADS_API_VERSION` defaults to `v22` in this project. Google retires API versions on a schedule, so set this value to a currently supported version when upgrading. The adapter uses the REST `googleAds:searchStream` endpoint and maps campaign, daily, keyword, search-term, geography, device, and conversion-action rows into the existing Crush types. Geo-target constants are resolved to readable canonical location names when Google supplies a city target.

If live credentials or an API request fail, the dashboard displays a warning and safely falls back to the sample dataset. Server logs contain the diagnostic message, but OAuth credentials and access tokens are never returned to the browser.

## Optional GA4 context

Crush can also load GA4 sessions, users, key events, landing pages, and traffic
sources through the official Google Analytics Data API. When GA4 returns a
Google Ads campaign ID, the dashboard shows the GA4 site outcomes beside the
matching paid-media campaign without treating the two attribution systems as
equivalent.

GA4 is independent of the Google Ads data-source setting. Leave all `GA4_*`
variables empty to run without it, or follow the exact service-account and GA4
property instructions in [docs/ga4-setup.md](docs/ga4-setup.md). Invalid or
incomplete GA4 configuration is reported in the GA4 panel while all existing
paid-media features continue to load.

## Daily Analysis

The workspace can produce a saved daily performance analysis directly from the
configured live Google Ads and GA4 integrations—no CSV upload is required. It
compares yesterday with the preceding day and the rolling seven completed days
with the preceding seven days, applies both relative and absolute materiality
thresholds, and asks OpenAI only to select from grounded deterministic findings.
Missing integrations are reported without preventing an available source from
completing.

Use the **Run Daily Analysis** button, send `POST /api/analysis/daily`, or run
`npm run daily:analysis`. `GET /api/analysis/daily` returns the latest locally
saved result. The included Vercel cron calls a separate secret-protected route
at 08:00 UTC each day. Configure `DAILY_ANALYSIS_TIME_ZONE` for reporting dates,
`CRON_SECRET` for scheduling, and optionally `DAILY_ANALYSIS_STORAGE_DIR` for
local JSON storage. Vercel deployments also need a connected private Blob store
for durable saved history across cron and dashboard invocations.

See [docs/daily-analysis.md](docs/daily-analysis.md) for the exact periods,
threshold table, grounding guarantees, persistence behavior, and scheduling.

## Weekly Marketing Report

Crush also generates a saved Weekly Marketing Report for the latest completed
7-day period against the preceding 7 days. It presents an executive summary,
source-labeled KPI changes, biggest wins and problems, grounded recommended
actions, supporting evidence, and a next-week watch list. All calculations and
evidence are deterministic; optional AI enrichment may only prioritize supplied
candidates, and an AI failure leaves a complete fallback report.

Use the dashboard button, send `POST /api/reports/weekly`, or run
`npm run weekly:report`. `GET /api/reports/weekly` retrieves the latest saved
report. A separate `CRON_SECRET`-protected endpoint runs at 09:00 UTC each
Monday. Email and Slack delivery are intentionally not implemented.

See [docs/weekly-report.md](docs/weekly-report.md) for reporting-period rules,
data-source statuses, grounding guarantees, persistence, scheduling, and
verification.

## Specialist marketing agents

Ask Your Marketing Data supports Auto routing plus PPC, Analytics, CRO, SEO, and
Marketing Strategist / CMO specialists. Each specialist returns a shared
structured, evidence-grounded analysis; broad questions use a bounded
specialists-to-strategist synthesis workflow. See
[docs/specialist-agents.md](docs/specialist-agents.md) for responsibilities,
routing, grounding safeguards, verification, and the experimental capabilities
that were deliberately deferred.

## Application architecture

Crush uses the Next.js 16 App Router: the main Server Component loads protected data and calculates the initial workspace, interactive Client Components handle charts and user actions, and Route Handlers run AI and reporting workflows. The stack includes React 19, TypeScript, Tailwind CSS 4, Recharts, Zod, the OpenAI Responses API, Google Ads REST reporting, the official GA4 Data API library, Vercel Cron, and private Vercel Blob storage. See the [case-study architecture diagram](docs/case-study.md#architecture-and-data-flow) for the full data flow.

## Project documentation

- [Project case study](docs/case-study.md)
- [Demo script](docs/demo-script.md)
- [Screenshot capture checklist](docs/screenshots/README.md)
- [Portfolio and resume entry](docs/portfolio-entry.md)
- [Daily Analysis behavior](docs/daily-analysis.md)
- [Weekly Marketing Report behavior](docs/weekly-report.md)
- [Specialist agent architecture](docs/specialist-agents.md)
- [GA4 setup](docs/ga4-setup.md)
- [Account score methodology](docs/account-score.md)

## Deployment note

Crush requires a server-capable Next.js deployment for Route Handlers, protected integrations, and reporting workflows. `vercel.json` contains the current daily and weekly cron schedules; a Vercel deployment also needs private Blob storage for durable automation history. No verified production URL is stored in this repository yet.
