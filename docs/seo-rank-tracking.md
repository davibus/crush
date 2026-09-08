# SEO rank tracking

Crush provides read-only historical rank movement from Google Search Console
Search Analytics data. It does not scrape Google, call a third-party SEO vendor,
or observe an exact live search-results page. Every displayed position is the
aggregated **Google Search Console average position** for its dimensions and
reporting period.

## Reporting periods and data flow

The configured Search Console start and end dates define the current inclusive
period. Crush calculates an immediately preceding period with the same number
of inclusive calendar days. By default, the current window ends three days ago
to avoid the least-complete recent data. Explicit configured dates use the same
comparison method.

The server-only Search Console adapter requests current query, page, country,
and device reports. For rank tracking it also obtains current and previous
query, page, and query+page rows. The pure comparison layer matches rows only at
the same grain and identity. It never substitutes a query-only metric for a
query+page metric or manufactures a missing side of a comparison.

For each valid matching row, application code calculates:

```text
positionChange = previousAveragePosition - currentAveragePosition
```

Lower average-position values are better, so a positive result is improvement
and a negative result is decline. The calculation and classification occur
before specialist synthesis.

## Deterministic thresholds

All named thresholds live in `SEO_RANK_TRACKING_THRESHOLDS` in
`lib/seo-rank-tracking.ts` and are exercised by the focused verification script.

| Rule | Threshold |
| --- | --- |
| Comparable row | At least 20 impressions in both periods |
| Meaningful improvement | Position change at least +2.0 |
| Meaningful decline | Position change at most -2.0 |
| Stable | Absolute position change below 2.0 |
| High impression | At least 100 impressions in either period |
| Page-one opportunity | Current average position above 10 through 20, with at least 100 current impressions |
| Top-ranking opportunity | Current average position above 3 through 10, with at least 100 current impressions |
| Visibility gain/loss | At least the larger of 25 impressions or 20% of previous impressions |
| Click loss support | At least 3 fewer clicks |

The display bands are top 3, positions 4–10, positions 11–20, and beyond 20.
These broad bands help prioritize attention without implying exact placement.
A fractional movement below 2.0 is stable for candidate generation and does not
create a movement recommendation by itself.

The candidate layer labels meaningful gains and declines, page-one and
top-ranking opportunities, high-impression declines, improvements with increased
visibility, declines with lost clicks or impressions, and stable rows. One row
may satisfy more than one category.

## Evidence, specialist use, and UI

Every movement carries the Search Console provider ID and label, query and/or
page grain, both periods, both metric snapshots, the calculated changes, and a
deterministic evidence ID. The workspace dashboard shows the highest-priority
comparable rows with current and previous average position, signed change,
accessible trend text, impressions, clicks, periods, and source status.

The existing SEO specialist consumes these deterministic movements. It may
explain gains, losses, opportunities, and areas to investigate, but it cannot
invent positions or attribute a change to an algorithm update, competitor,
backlink loss, technical issue, or content quality without separate evidence.
Search Console metrics remain distinct from GA4 and Google Ads metrics.

## Missing data and limitations

Unconfigured, failed, or empty Search Console sources produce explicit states.
So do a missing prior period, unequal periods, no matching identities, invalid
or non-finite metrics, non-positive position, and rows below the impression
minimum. Queries or pages present in only one period are excluded; disappearance
is not converted into a fictional rank. Zero clicks are valid when impression
evidence is sufficient, while zero impressions cannot pass the comparison
minimum.

Search Console aggregation, anonymized queries, reporting latency and revisions,
property permissions, and the configured row limit all affect coverage. Crush
does not paginate, segment rank movement by country/device, store long-term
snapshots, scrape SERPs, crawl pages, analyze backlinks or competitors, or make
SEO changes. It has no Search Console write operation.

Run `npm.cmd run verify:seo-rank-tracking` for focused deterministic coverage and
`npm.cmd run verify:search-console` plus `npm.cmd run verify:specialists` for the
integration regressions.
