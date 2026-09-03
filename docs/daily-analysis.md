# Daily Analysis

Daily Analysis collects completed live reporting periods, compares them with
equivalent prior periods, filters out routine fluctuation, runs a grounded AI
selection, and saves the result. It does not use or require a CSV upload.

## Periods and timezone

`DAILY_ANALYSIS_TIME_ZONE` is an IANA timezone such as `UTC` or
`America/Denver`. The pipeline first resolves the current calendar date in that
timezone and then uses date-only arithmetic, avoiding daylight-saving and
server-local-time shifts.

- **Yesterday:** the most recent completed calendar day.
- **Previous day:** the calendar day immediately before yesterday.
- **Rolling 7 days:** yesterday plus the six preceding completed days.
- **Previous 7 days:** the seven completed days immediately before the rolling
  window.

The default is `UTC`. Use the Google Ads account or reporting timezone when it
is known and keep that setting stable so saved analyses remain comparable. The
scheduled request time does not define the reporting dates; the configured
analysis timezone does.

## Live sources and normalized metrics

Google Ads is included when `GOOGLE_ADS_DATA_SOURCE=live` and its server-only
OAuth/developer-token settings are valid. The collector requests one explicit
14-day range and summarizes its date-segmented rows into the four periods. It
normalizes spend, impressions, clicks, CTR, CPC, conversions, conversion rate,
CPA, conversion value, and ROAS. Ratios with a zero denominator are unavailable,
not zero.

GA4 is included independently when its service-account settings are present. It
requests each exact period and normalizes sessions, users, new users, engaged
sessions, engagement rate, key events, and total revenue. A failed or
unconfigured source produces a warning without preventing the other source from
completing.

## Material changes

A non-zero change is material only when its absolute magnitude is at least the
metric's absolute threshold **and**, when the previous value is non-zero, its
relative magnitude is at least 20%. When the previous value is zero, percentage
change is mathematically unavailable and the absolute threshold is the gate.

| Metric | Absolute threshold | Relative threshold |
| --- | ---: | ---: |
| Google Ads spend | $50 | 20% |
| Impressions | 500 | 20% |
| Clicks | 50 | 20% |
| CTR | 1 percentage point | 20% |
| CPC | $0.50 | 20% |
| Conversions | 10 | 20% |
| Conversion rate | 1 percentage point | 20% |
| CPA | $10 | 20% |
| Conversion value | $100 | 20% |
| ROAS | 0.5x | 20% |
| GA4 sessions | 50 | 20% |
| Users | 50 | 20% |
| New users | 25 | 20% |
| Engaged sessions | 50 | 20% |
| Engagement rate | 5 percentage points | 20% |
| Key events | 10 | 20% |
| Revenue | $100 | 20% |

The reusable thresholds are exported as
`DEFAULT_MATERIAL_CHANGE_THRESHOLDS` from `lib/daily-analysis.ts`.

## Grounded AI behavior

The application creates deterministic candidate packets from material changes.
Each packet separately labels an observed fact, a cautious interpretation, and
a recommendation. OpenAI receives the exact ranges, current and previous
summaries, all calculated comparisons, material changes, and available source
context. It may return only candidate IDs; it cannot author or alter claims,
metrics, causes, or recommendations. Unknown or duplicate IDs are rejected.

If no change is material, the result explicitly reports relative stability. If
OpenAI is not configured or fails, the same deterministic grounded packets are
saved with a warning, so source collection and comparison still complete.

## Running and saving

- Click **Run Daily Analysis** in the workspace.
- Send `POST /api/analysis/daily` during development.
- Run `npm run daily:analysis`; the runner loads `.env.local` through Next's
  environment loader.
- Read the latest saved result with `GET /api/analysis/daily`.

Results are saved by analysis date as JSON in `runtime/daily-analyses/` by
default. The directory is gitignored because it may contain private live data.
Set `DAILY_ANALYSIS_STORAGE_DIR` to override it. On Vercel, connect a private
Vercel Blob store; the platform supplies `BLOB_READ_WRITE_TOKEN` (or its OIDC
store settings), and the same date-keyed JSON is stored privately and durably.
Storage is abstracted behind
`saveDailyAnalysis`, `getDailyAnalysis`, `listDailyAnalyses`, and
`getLatestDailyAnalysis`.

## Scheduling

`vercel.json` schedules `/api/analysis/daily/cron` at `0 8 * * *` (08:00 UTC).
The route requires `Authorization: Bearer <CRON_SECRET>` and returns no detailed
marketing data. The manual/UI endpoint remains separate. For local or non-Vercel
scheduling, invoke `npm run daily:analysis` once per day or call the protected
cron route with the same bearer header.

The core `runDailyMarketingAnalysis` function has no HTTP dependency. Local JSON
storage is durable for a persistent local filesystem. On Vercel, the adapter
uses private Vercel Blob rather than the function's ephemeral filesystem. A
deployment without a connected Blob store fails the run instead of claiming an
ephemeral result was persisted.

## Environment variables

Daily Analysis uses the existing `OPENAI_API_KEY`, `GOOGLE_ADS_*`, and `GA4_*`
server settings plus:

- `DAILY_ANALYSIS_TIME_ZONE` — IANA timezone; defaults to `UTC`.
- `DAILY_ANALYSIS_STORAGE_DIR` — optional local storage directory.
- `BLOB_READ_WRITE_TOKEN` — supplied by a connected private Vercel Blob store.
- `CRON_SECRET` — long random secret for the scheduled route.

Never use a `NEXT_PUBLIC_` prefix for any of these values.
