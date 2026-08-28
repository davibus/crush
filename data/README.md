\# Crush Sample Google Ads Data



These files provide mock Google Ads data for local development and testing before a live Google Ads API connection is added.



\## Files



\### google-ads-sample.json

Campaign-level account and performance data.



Fields:

\- account.id

\- account.name

\- account.currency

\- campaign id

\- campaign name

\- status

\- channel

\- daily budget

\- impressions

\- clicks

\- cost

\- conversions

\- conversion value



\### google-ads-keywords.json

Keyword-level Google Ads performance data.



Fields:

\- keyword id

\- campaign id

\- campaign name

\- ad group

\- keyword

\- match type

\- status

\- impressions

\- clicks

\- cost

\- conversions

\- conversion value



\### google-ads-search-terms.json

Search-query performance data showing what users actually searched.



Fields:

\- search term id

\- campaign id

\- campaign name

\- ad group

\- search term

\- matched keyword

\- match type

\- impressions

\- clicks

\- cost

\- conversions

\- conversion value



\### google-ads-geography.json

Geographic performance data by location.



Fields:

\- geography id

\- campaign id

\- campaign name

\- location

\- impressions

\- clicks

\- cost

\- conversions

\- conversion value



\### google-ads-conversions.json

Conversion performance broken out by conversion action.



Fields:

\- conversion id

\- campaign id

\- campaign name

\- conversion action

\- conversions

\- conversion value



\## Derived Metrics



The Crush application can calculate additional metrics from the raw sample data, including:



\- CTR = clicks / impressions

\- CPC = cost / clicks

\- CPA = cost / conversions

\- ROAS = conversion value / cost



\## Purpose



This mock data is intended to:



\- support local development

\- test dashboard components

\- test Google Ads analysis logic

\- test future recommendation and AI features

\- provide a predictable fallback before live Google Ads API integration

