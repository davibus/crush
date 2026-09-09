# Crush — Version 2 foundation

**Crush Version 2 builds on an authenticated multi-client workspace foundation while preserving the completed Version 1 product.** The application turns read-only Google Ads performance, optional GA4 context, workspace-scoped Google Search Console visibility, bounded landing-page evidence, and explicitly selected public competitor evidence into explainable decisions through a dashboard, deterministic account auditing, recurring analysis, grounded AI insights, and conversational specialist workflows.

The current V2 architecture provides authenticated workspaces at `/clients/[clientId]`, durable PostgreSQL users/memberships, client-scoped caches and report storage, and an authorized-only workspace selector. The local demo remains available through an explicitly development-only identity and fixture repository. It intentionally does not include billing, invitations, tenant-management UI, or account-writing features. See [the multi-client architecture guide](docs/multi-client.md).

[Case study](docs/case-study.md) · [2–3 minute demo script](docs/demo-script.md) · [Portfolio/resume copy](docs/portfolio-entry.md) · [GitHub repository](https://github.com/davibus/crush)

**Live demo:** [crush-gamma-sage.vercel.app](https://crush-gamma-sage.vercel.app)

**Demo video:** TODO — record and publish the walkthrough using the [demo script](docs/demo-script.md).

<!-- After capture, insert: ![Crush AI Marketing Command Center dashboard](docs/screenshots/01-dashboard-overview.png) -->

## Why I built it

I built Crush as a personal learning and portfolio project to combine my hands-on digital marketing experience with AI-assisted modern application development. Marketing teams have plenty of metrics; the harder work is deciding which changes matter, keeping Google Ads and GA4 measurement boundaries clear, and turning evidence into an action a reviewer can trust.

Crush explores a deterministic-first answer: application code owns calculations, thresholds, evidence, and limitations. OpenAI is used only in bounded structured workflows where prioritization adds value, and unsupported model output is rejected.

> Crush is not presented as a client deployment. The included Northstar Outdoor Co. account is fictional, and this repository makes no claims about customers, revenue lift, cost savings, or production adoption.

## Version 1.0 capabilities

- account KPIs, daily trends, campaign comparisons, and geographic performance
- optional GA4 sessions, users, key events, traffic sources, and landing-page context
- completed-period daily analysis and evidence-linked weekly reporting
- a deterministic nine-category Google Ads account audit
- OpenAI structured-output recommendations checked against precomputed candidates
- grounded Ask Your Marketing Data calculations and bounded conversation history
- typed PPC, Analytics, CRO, SEO, and Marketing Strategist workflows
- read-only live Google Ads, GA4, and Google Search Console adapters with server-only credentials
- local JSON or private Vercel Blob persistence plus secret-protected cron routes

## Screenshot and demo

The dashboard is useful on first open without credentials. By default, it loads the included fictional **Northstar Outdoor Co.** account and visibly labels the experience as **Demo data**. Metrics, charts, the account audit, bundled landing-page analysis, Ask Your Marketing Data, and specialist workflows work without Google or OpenAI credentials.

- [View the full project case study](docs/case-study.md)
- [Follow the recording-ready 2–3 minute demo script](docs/demo-script.md)
- [Capture the eight recommended product screenshots](docs/screenshots/README.md)
- [Browse the source repository](https://github.com/davibus/crush)

For a production-like setup, a configured workspace can switch to read-only live reporting with its `*_DATA_SOURCE=live` setting, while its GA4 property connects independently. If a live Google Ads request fails, the UI identifies the fallback and continues with demo data; technical diagnostics stay in server logs. AI Insights and optional daily/weekly prioritization explain when OpenAI is unavailable instead of blocking the deterministic product.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Set `AUTH_ALLOW_DEV_LOGIN=true` and an `AUTH_SECRET` in `.env.local`, then open [http://localhost:3000](http://localhost:3000). Choose **Open local demo** to enter `/agency`, where the existing local fixtures demonstrate the portfolio before you open `/clients/demo` with bundled sample data. This development bypass is disabled whenever `NODE_ENV=production` or `DATABASE_URL` is configured.

For durable authentication, configure PostgreSQL and GitHub OAuth, then run `npm.cmd run db:migrate`. Sign in once and grant the new Auth.js user access with `npm.cmd run db:grant -- you@example.com demo`. See [the multi-client architecture guide](docs/multi-client.md) for production setup and future-client steps.

The application uses the included sample Google Ads dataset by default, so no external account is required for local development.

## Live Google Ads data

Crush can replace the sample dataset with read-only Google Ads API reporting while keeping the same dashboard, audit, chat, and insight pipelines.

1. Create a Google Cloud OAuth client, enable the Google Ads API, and obtain a refresh token authorized with the `https://www.googleapis.com/auth/adwords` scope.
2. Request or use a Google Ads developer token. If the selected account is reached through a manager account, note that manager customer ID as well.
3. Copy `.env.example` to `.env.local`, fill in the server-only values, and leave every credential without a `NEXT_PUBLIC_` prefix.
4. Set the selected workspace's data source and identifiers (for example `CLIENT_A_DATA_SOURCE=live` and `CLIENT_A_GOOGLE_ADS_CUSTOMER_ID=...`), then restart the development server.

Customer IDs may contain dashes in the environment file; Crush normalizes and validates them before sending requests. `GOOGLE_ADS_LOGIN_CUSTOMER_ID` is optional and should identify the manager account, not the client account. The reporting window defaults to `LAST_30_DAYS` and supports the values documented in `.env.example`.

`GOOGLE_ADS_API_VERSION` defaults to `v22` in this project. Google retires API versions on a schedule, so set this value to a currently supported version when upgrading. The adapter uses the REST `googleAds:searchStream` endpoint and maps campaign, daily, keyword, search-term, geography, device, conversion-action, and unexpanded final-URL landing-page rows into the existing Crush types. Geo-target constants are resolved to readable canonical location names when Google supplies a city target.

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

## Optional Google Search Console context

Crush can load read-only Search Analytics reports for query, page, country, and
device dimensions. Each report preserves Google Search Console clicks,
impressions, CTR, and average position as Search Console metrics; they are not
renamed, attributed, or merged into GA4 sessions, users, or key events. The
workspace dashboard compares query, page, and query+page average-position data
with the immediately preceding equal-length period. The resulting rank-movement
panel and SEO specialist use deterministic, evidence-linked gains, declines,
visibility changes, and opportunity bands. Average position remains an
aggregated historical Search Console metric, not an exact live SERP rank.

Search Console is configured independently per workspace and failures do not
block Google Ads or GA4. See [the Search Console setup guide](docs/search-console-setup.md)
for Google API setup, the read-only OAuth scope, service-account access,
reporting dates, tenant isolation, latency, and current limitations. See
[SEO rank tracking](docs/seo-rank-tracking.md) for comparison methodology,
thresholds, evidence behavior, specialist use, and missing-data rules.

## Landing-page analysis

Each authenticated workspace can analyze one explicitly supplied public URL or
the bundled fictional Northstar page. A server-only, SSRF-hardened retriever
collects bounded static HTML without cookies, JavaScript, form submissions, or
linked-page crawling. Deterministic code extracts page messaging, CTA/form and
navigation signals, basic HTML accessibility signals, and exact-match GA4 or
Google Ads context when it exists. Every issue and proposed experiment links to
typed evidence IDs.

The feature is labeled **Read-only analysis**. Experiments are hypotheses rather
than claims of cause or guaranteed lift. Optional OpenAI synthesis can only
reorder known issue and experiment IDs; missing, failed, or invalid model output
leaves the deterministic report intact. The current workspace's validated result
is also available briefly to the CRO specialist. See
[docs/landing-page-analysis.md](docs/landing-page-analysis.md) for security,
evidence, limitations, demo steps, and verification.

## Competitor analysis

Authenticated workspaces can compare one to three explicitly supplied public
competitor pages. Crush reuses the SSRF-hardened landing-page retriever and
deterministic HTML extraction, isolates per-source retrieval failures, and keeps
competitor evidence distinct from the workspace's recent validated page
analysis. Observable facts and cross-page patterns are separated from
evidence-linked differentiation hypotheses; no private competitor analytics or
performance is inferred.

OpenAI remains optional and may only reorder application-authored IDs. The
existing CRO specialist can answer competitor messaging and CTA questions from
the workspace-scoped result. Three visibly fictional Northstar competitor pages
provide a credential-free demo. See
[docs/competitor-analysis.md](docs/competitor-analysis.md) for retrieval security,
grounding, limitations, demo steps, and verification.

## AI ad-copy drafting

Each authorized workspace can create **DRAFT ONLY** Google responsive search ad
headlines and descriptions from a bounded evidence pack. Validated first-party
landing-page claims remain separate from paid/organic search-language themes and
external competitor inspiration. Application code validates RSA counts and
character limits, duplicate assets, evidence IDs, and detectable unsupported
claims after optional AI generation; missing or invalid AI output uses a safe
first-party template when possible and otherwise reports insufficient data.

Drafts are never uploaded or published, and Crush exposes no Google Ads mutation
action. The Paid Media specialist can discuss the latest workspace-scoped draft
without predicting performance. See [docs/ad-copy-generation.md](docs/ad-copy-generation.md)
for evidence rules, fallback behavior, security, demo steps, and verification.

## AI landing-page drafting

Each authorized workspace can submit a versioned offer, audience, conversion-goal,
and optional brand/claim brief to create one structured **DRAFT / PREVIEW ONLY**
landing-page copy artifact. The generator can use validated first-party page
language and workspace Ads, GA4, and Search Console context while keeping
competitor observations and prior generated ad copy in inspiration-only scopes.
Every visible copy block cites bounded first-party evidence, and deterministic
validation rejects unknown IDs, unsafe URLs, missing sections, unreasonable
lengths, competitor attribution, and detectable unsupported business or
performance claims.

The dashboard renders the structured fields as a readable preview and supports
browser-local editing of headlines, CTAs, and section copy. It does not accept
model HTML, save local edits, create a public page, connect to a CMS, deploy,
publish, run an experiment, or allocate traffic. The CRO specialist can discuss
only the stored preview artifact and does not treat generated copy as measured
evidence. See [docs/landing-page-generation.md](docs/landing-page-generation.md)
for schemas, grounding, fallback behavior, security boundaries, limitations,
and verification.

## Negative-keyword review proposals

Each authorized workspace can turn material, zero-conversion Google Ads search-term evidence into versioned negative-keyword proposals showing exact match type, campaign/ad-group scope, rationale, evidence IDs, confidence strength, and deterministic historical affected traffic. Brand, converted, allowlisted, intentionally targeted, conflicting, trivial, and duplicate terms are withheld. Live rolling periods use a higher evidence floor and preserve conversion-lag uncertainty.

This is **recommendation only**: no Google Ads changes are made, there is no apply/publish control, and browser-local review labels do not represent account execution. Optional AI can only reorder already-approved proposal IDs; invalid or unavailable AI leaves the deterministic result intact. Existing negative keywords are not currently loaded by the read adapter, so account-level duplicate awareness remains incomplete and is disclosed in the UI. See [docs/negative-keyword-proposals.md](docs/negative-keyword-proposals.md) for rules, safeguards, isolation, limitations, and verification.

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

## PDF marketing reports

Each authorized client workspace includes an on-demand **Download PDF report**
action in the Reporting section. The client-ready export reuses current Google
Ads KPIs, deterministic account scoring and audit findings, the latest saved
Daily Analysis and Weekly Marketing Report, and GA4 context when available.
Missing optional sources and undefined zero-denominator ratios are labeled
without blocking the export. The tenant-authorized server route generates the
PDF in memory, returns it with private no-store headers, and does not persist it.
See [docs/pdf-reports.md](docs/pdf-reports.md) for contents, security behavior,
download steps, demo behavior, limitations, and verification.

## Specialist marketing agents

Ask Your Marketing Data supports Auto routing plus PPC, Analytics, CRO, SEO, and
Marketing Strategist / CMO specialists. Each specialist returns a shared
structured, evidence-grounded analysis; broad questions use a bounded
specialists-to-strategist synthesis workflow. See
[docs/specialist-agents.md](docs/specialist-agents.md) for responsibilities,
routing, grounding safeguards, verification, and the experimental capabilities
that were deliberately deferred.

## Application architecture

Crush uses the Next.js 16 App Router: Server Components load protected agency and workspace data, interactive Client Components handle charts and user actions, and Route Handlers run AI and reporting workflows. The stack includes React 19, TypeScript, Tailwind CSS 4, Recharts, Zod, the OpenAI Responses API, Google Ads REST reporting, the official GA4 Data API library, Vercel Cron, and private Vercel Blob storage. See the [case-study architecture diagram](docs/case-study.md#architecture-and-data-flow) for the full data flow.

## Agency portfolio

Authenticated users land on `/agency`, a read-only overview built only from their server-resolved workspace memberships. It shows deterministic account scores and KPI snapshots, explicit source and saved-report freshness, and a simple health queue before linking into the existing tenant-protected client dashboard. It does not compare missing metrics, combine incompatible currencies/reporting windows, use an LLM for ranking, or grant advertising-account write access. See [docs/agency-dashboard.md](docs/agency-dashboard.md) for the authorization flow, summary and health rules, fixture behavior, limitations, and verification command.

## Future roadmap

The [post-V1 future roadmap](docs/future-roadmap.md) organizes proposed data-source, intelligence, generative, controlled-action, and agency capabilities into risk-aware phases. These items are future work, not functionality claimed to be available in Version 1.0.

## Project documentation

- [Multi-client architecture](docs/multi-client.md)
- [Agency dashboard](docs/agency-dashboard.md)
- [Project case study](docs/case-study.md)
- [Post-V1 future roadmap](docs/future-roadmap.md)
- [Demo script](docs/demo-script.md)
- [Screenshot capture checklist](docs/screenshots/README.md)
- [Portfolio and resume entry](docs/portfolio-entry.md)
- [Daily Analysis behavior](docs/daily-analysis.md)
- [Weekly Marketing Report behavior](docs/weekly-report.md)
- [PDF marketing reports](docs/pdf-reports.md)
- [Specialist agent architecture](docs/specialist-agents.md)
- [GA4 setup](docs/ga4-setup.md)
- [Google Search Console setup](docs/search-console-setup.md)
- [SEO rank tracking](docs/seo-rank-tracking.md)
- [Landing-page analysis](docs/landing-page-analysis.md)
- [Competitor analysis](docs/competitor-analysis.md)
- [AI ad-copy drafting](docs/ad-copy-generation.md)
- [AI landing-page drafting](docs/landing-page-generation.md)
- [Negative-keyword review proposals](docs/negative-keyword-proposals.md)
- [Account score methodology](docs/account-score.md)

## Deployment note

Crush requires a server-capable Next.js deployment for Route Handlers, protected integrations, and reporting workflows. `vercel.json` contains the current daily and weekly cron schedules, and the [live Vercel deployment](https://crush-gamma-sage.vercel.app) uses connected private Blob storage for durable automation history.
