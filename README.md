# Crush

Crush is an AI marketing command center that turns Google Ads performance data into deterministic metrics, account audits, grounded recommendations, and conversational answers.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
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

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
