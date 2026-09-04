# Weekly Marketing Report

The Weekly Marketing Report is a Version 1.0 feature that creates and persists a
consistent account-performance summary from the same normalized Google Ads and
GA4 infrastructure as Daily Analysis. It has no email or Slack delivery
dependency; future delivery adapters can consume the saved `WeeklyReport`
without changing report generation.

## Reporting periods

The report uses completed calendar days in `WEEKLY_REPORT_TIME_ZONE`, falling
back to `DAILY_ANALYSIS_TIME_ZONE` and then `UTC`:

- **Reporting period:** the seven completed days ending yesterday.
- **Comparison period:** the immediately preceding seven completed days.

The weekly cron runs on Monday, so its normal reporting period is the completed
Monday-through-Sunday week. A manual run on another day still uses the latest
seven completed days. Date-only arithmetic from Daily Analysis keeps periods
stable across daylight-saving transitions.

## Data and grounding

Google Ads metrics are spend, impressions, clicks, CTR, CPC, conversions,
conversion rate, CPA, conversion value, and ROAS. GA4 context is separately
labeled and includes sessions, users, new users, engaged sessions, engagement
rate, key events, and revenue. Derived Google Ads ratios are calculated from
source totals; a zero denominator produces an unavailable value rather than a
misleading zero, `NaN`, or infinity.

All KPI comparisons, evidence statements, wins, problems, actions, and watch
items are constructed deterministically before OpenAI is called. Every narrative
item references one or more evidence IDs, and the persisted Zod schema rejects
unknown evidence references. OpenAI can only return IDs from those prebuilt
candidates to prioritize them. It cannot write or alter metrics, claims, names,
evidence, trends, or recommendations.

When OpenAI is missing or fails, the complete deterministic report is retained
and its status is `deterministic_fallback`. Missing Google Ads or GA4 connections
are isolated and recorded in both source status and warnings. Sample mode is
also explicit. The dated sample rows are not relabeled as the current week or
used to invent a prior week.

## Generate, retrieve, and schedule

- Click **Generate Weekly Report** on the dashboard.
- Send `POST /api/reports/weekly` to generate and persist a report.
- Send `GET /api/reports/weekly` to retrieve the latest saved report.
- Run `npm run weekly:report` from a scheduler or local shell.
- Call `GET /api/reports/weekly/cron` with
  `Authorization: Bearer <CRON_SECRET>` from a cron service.

`vercel.json` schedules the protected endpoint for 09:00 UTC every Monday.
Cron responses contain only period and status metadata, not detailed marketing
data.

Local reports are saved by reporting-period end date under
`runtime/weekly-reports/`. Set `WEEKLY_REPORT_STORAGE_DIR` to override it. On
Vercel, the existing private Blob integration is used when no directory override
is set. Rerunning a period atomically replaces its prior report.

## Verification

Run `npm run verify:weekly-report`. The verification covers period selection,
percentage changes, zero values and denominators, missing prior data, evidence
references, deterministic AI fallback, schema validation, orchestration, and
persistence replacement/retrieval.
